import { describe, expect, it } from 'vitest';
import { buildRequest, checkOutboundUrl, describeStatus, isPrivateIp, parseRecipients, signBody } from '../../../../supabase/functions/_shared/agent-deliver-core';

describe('isPrivateIp', () => {
  it.each(['127.0.0.1', '10.0.0.1', '172.16.5.5', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '::1', '::', 'fd12:3456::1', 'fe80::1', '::ffff:127.0.0.1', '[::1]'])('%s is private', (ip) => {
    expect(isPrivateIp(ip)).toBe(true);
  });
  it.each(['8.8.8.8', '93.184.216.34', '172.15.0.1', '172.32.0.1', '2606:4700::1111', '1.1.1.1'])('%s is public', (ip) => {
    expect(isPrivateIp(ip)).toBe(false);
  });
});

describe('checkOutboundUrl', () => {
  it('accepts a normal https address', () => {
    expect(checkOutboundUrl('https://hooks.slack.com/services/T/B/X')).toMatchObject({ ok: true });
    expect(checkOutboundUrl('https://n8n.example.com:8443/webhook/abc')).toMatchObject({ ok: true });
  });
  it.each([
    ['http://example.com/x', 'https'],
    ['https://user:pw@example.com/x', 'user name'],
    ['https://example.com:8080/x', 'ports'],
    ['https://localhost/x', 'Internal'],
    ['https://printer.local/x', 'Internal'],
    ['https://db.internal/x', 'Internal'],
    ['https://127.0.0.1/x', 'Internal'],
    ['https://2130706433/x', 'Internal'],         // decimal form of 127.0.0.1
    ['https://0x7f.1/x', 'Internal'],              // hex form
    ['https://[::1]/x', 'Internal'],
    ['https://169.254.169.254/latest/meta-data', 'Internal'],
    ['https://intranet/x', 'full host name'],
    ['not a url', 'valid web address'],
    ['ftp://example.com', 'https'],
  ])('refuses %s', (url, why) => {
    const r = checkOutboundUrl(url);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain(why);
  });
});

describe('signBody', () => {
  it('matches a known HMAC-SHA256 value', async () => {
    // RFC 4231 test case 2
    expect(await signBody('what do ya want for nothing?', 'Jefe')).toBe('sha256=5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843');
  });
});

describe('buildRequest', () => {
  const now = new Date('2026-11-19T12:00:00Z');
  it('slack and cliq post {text} to the secret address', async () => {
    const r = await buildRequest({ kind: 'slack', name: 's', config: {} }, { url: 'https://hooks.slack.com/x' }, { title: 'T', text: 'B' }, now);
    expect(r).toMatchObject({ type: 'http', url: 'https://hooks.slack.com/x' });
    if (r.type === 'http') expect(JSON.parse(r.init.body!)).toEqual({ text: '*T*\nB' });
  });
  it('a webhook with a token is signed over exactly the body it sends', async () => {
    const r = await buildRequest({ kind: 'webhook', name: 'w', config: { url: 'https://e.com/h' } }, { token: 'tok' }, { text: 'hi', event: 'test' }, now);
    if (r.type !== 'http') throw new Error('expected http');
    expect(r.init.headers['X-KDOps-Signature']).toBe(await signBody(r.init.body!, 'tok'));
    expect(JSON.parse(r.init.body!)).toMatchObject({ source: 'kd-ops-agent', event: 'test', text: 'hi', sent_at: '2026-11-19T12:00:00.000Z' });
  });
  it('an unsigned webhook has no auth headers', async () => {
    const r = await buildRequest({ kind: 'n8n', name: 'w', config: { url: 'https://e.com/h' } }, {}, { text: 'hi' }, now);
    if (r.type !== 'http') throw new Error('expected http');
    expect(Object.keys(r.init.headers)).toEqual(['Content-Type']);
  });
  it('an API connection uses the configured header and method', async () => {
    const get = await buildRequest({ kind: 'api', name: 'a', config: { url: 'https://a.com/p', method: 'get', header_name: 'X-Key' } }, { token: 't' }, { text: 'x' }, now);
    if (get.type !== 'http') throw new Error('expected http');
    expect(get.init).toMatchObject({ method: 'GET', headers: { 'X-Key': 't' } });
    expect(get.init.body).toBeUndefined();
    const bearer = await buildRequest({ kind: 'api', name: 'a', config: { url: 'https://a.com/p' } }, { token: 't' }, { text: 'x' }, now);
    if (bearer.type !== 'http') throw new Error('expected http');
    expect(bearer.init.headers['Authorization']).toBe('Bearer t');
  });
  it('refuses bad headers, bad emails and unsupported kinds', async () => {
    expect((await buildRequest({ kind: 'api', name: 'a', config: { url: 'https://a.com', header_name: 'Bad Header!' } }, {}, { text: 'x' })).type).toBe('error');
    expect((await buildRequest({ kind: 'api', name: 'a', config: { url: 'https://a.com', header_name: 'Content-Length' } }, {}, { text: 'x' })).type).toBe('error');
    expect((await buildRequest({ kind: 'email', name: 'e', config: { to: 'nope' } }, {}, { text: 'x' })).type).toBe('error');
    expect((await buildRequest({ kind: 'email', name: 'e', config: { to: 'a@b.co,c@d.co,e@f.co,g@h.co,i@j.co,k@l.co' } }, {}, { text: 'x' })).type).toBe('error');
    expect((await buildRequest({ kind: 'whatsapp', name: 'w', config: {} }, {}, { text: 'x' })).type).toBe('error');
  });
  it('email escapes the message', async () => {
    const r = await buildRequest({ kind: 'email', name: 'e', config: { to: 'a@b.co' } }, {}, { text: '<script>x</script>' });
    if (r.type !== 'email') throw new Error('expected email');
    expect(r.payload.html).not.toContain('<script>');
  });
});

describe('helpers', () => {
  it('splits recipients on commas, semicolons and spaces', () => expect(parseRecipients('a@b.co, c@d.co;e@f.co  g@h.co')).toHaveLength(4));
  it('explains statuses without echoing bodies', () => {
    expect(describeStatus(401)).toContain('credentials');
    expect(describeStatus(404)).toContain('does not exist');
    expect(describeStatus(302)).toContain('redirects');
    expect(describeStatus(503)).toContain('problem');
  });
});

describe('more tools', () => {
  const now = new Date('2026-11-19T12:00:00Z');
  it('discord, google chat and teams send their own payload shapes', async () => {
    const d = await buildRequest({ kind: 'discord', name: 'd', config: {} }, { url: 'https://discord.com/api/webhooks/1/x' }, { title: 'T', text: 'body' }, now);
    const g = await buildRequest({ kind: 'gchat', name: 'g', config: {} }, { url: 'https://chat.googleapis.com/v1/spaces/x' }, { title: 'T', text: 'body' }, now);
    const m = await buildRequest({ kind: 'teams', name: 'm', config: {} }, { url: 'https://x.logic.azure.com/y' }, { title: 'T', text: 'body' }, now);
    if (d.type !== 'http' || g.type !== 'http' || m.type !== 'http') throw new Error('expected http');
    expect(JSON.parse(String(d.init.body)).content).toContain('**T**');
    expect(JSON.parse(String(g.init.body)).text).toContain('*T*');
    const card = JSON.parse(String(m.init.body));
    expect(card.attachments[0].contentType).toBe('application/vnd.microsoft.card.adaptive');
    expect(card.attachments[0].content.body[1].text).toBe('body');
    expect((await buildRequest({ kind: 'discord', name: 'd', config: {} }, {}, { text: 'x' })).type).toBe('error');
  });
  it('telegram builds the bot address and checks the chat id and token', async () => {
    const token = '123456789:ABCdefGHIjklMNOpqrSTUvwxYZ_0123456789';
    const r = await buildRequest({ kind: 'telegram', name: 't', config: { chat_id: '-1001234567890' } }, { token }, { title: 'T', text: 'body' }, now);
    if (r.type !== 'http') throw new Error('expected http');
    expect(r.url).toBe(`https://api.telegram.org/bot${token}/sendMessage`);
    expect(JSON.parse(String(r.init.body))).toMatchObject({ chat_id: -1001234567890, text: 'T\n\nbody' });
    expect((await buildRequest({ kind: 'telegram', name: 't', config: { chat_id: 'nope' } }, { token }, { text: 'x' })).type).toBe('error');
    expect((await buildRequest({ kind: 'telegram', name: 't', config: { chat_id: '123' } }, { token: 'short' }, { text: 'x' })).type).toBe('error');
    expect((await buildRequest({ kind: 'telegram', name: 't', config: { chat_id: '123' } }, {}, { text: 'x' })).type).toBe('error');
  });
});

describe('the generic API connection', () => {
  const now = new Date('2026-11-19T12:00:00Z');
  const msg = { title: 'Say "hi"', text: 'line1\nline2 & more', event: 'flag', meta: { severity: 'high', rule: 'TR01', person: 'Cara' } };
  it('fills a JSON body and escapes the values', async () => {
    const r = await buildRequest({ kind: 'api', name: 'a', config: { url: 'https://a.com/p', auth_type: 'bearer', body_template: '{"t":"{{title}}","d":"{{text}}","s":"{{severity}}","r":"{{rule}}","p":"{{person}}","x":"{{nothing}}"}' } }, { token: 'k' }, msg, now);
    if (r.type !== 'http') throw new Error('expected http');
    expect(JSON.parse(String(r.init.body))).toEqual({ t: 'Say "hi"', d: 'line1\nline2 & more', s: 'high', r: 'TR01', p: 'Cara', x: '' });
    expect(r.init.headers['Content-Type']).toBe('application/json');
    expect(r.init.headers['Authorization']).toBe('Bearer k');
  });
  it('encodes form bodies and sends basic auth', async () => {
    const r = await buildRequest({ kind: 'api', name: 'a', config: { url: 'https://api.twilio.com/m', auth_type: 'basic', content_type: 'form', body_template: 'To=%2B1555&Body={{title}}: {{text}}' } }, { token: 'sid:secret' }, msg, now);
    if (r.type !== 'http') throw new Error('expected http');
    expect(r.init.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    expect(r.init.headers['Authorization']).toBe(`Basic ${btoa('sid:secret')}`);
    expect(r.init.body).toBe('To=%2B1555&Body=Say%20%22hi%22: line1%0Aline2%20%26%20more');
  });
  it('can send the token in the address, or in a named header, plus extra headers', async () => {
    const q = await buildRequest({ kind: 'api', name: 'a', config: { url: 'https://api.trello.com/1/cards?key=K&idList=L', auth_type: 'query', query_param: 'token', body_template: '{"name":"{{title}}"}' } }, { token: 'T0K' }, msg, now);
    if (q.type !== 'http') throw new Error('expected http');
    expect(q.url).toBe('https://api.trello.com/1/cards?key=K&idList=L&token=T0K');
    expect(q.init.headers['Authorization']).toBeUndefined();
    const h = await buildRequest({ kind: 'api', name: 'a', config: { url: 'https://a.com', auth_type: 'header', header_name: 'X-Api-Key', extra_headers: { 'Notion-Version': '2022-06-28' }, body_template: '{}' } }, { token: 'abc' }, msg, now);
    if (h.type !== 'http') throw new Error('expected http');
    expect(h.init.headers).toMatchObject({ 'X-Api-Key': 'abc', 'Notion-Version': '2022-06-28' });
  });
  it('catches a JSON body that is broken after filling in, and bad extra headers', async () => {
    expect((await buildRequest({ kind: 'api', name: 'a', config: { url: 'https://a.com', body_template: '{"t": {{title}}}' } }, {}, msg, now)).type).toBe('error');
    expect((await buildRequest({ kind: 'api', name: 'a', config: { url: 'https://a.com', extra_headers: { 'Content-Length': '1' } } }, {}, msg, now)).type).toBe('error');
    expect((await buildRequest({ kind: 'api', name: 'a', config: { url: 'https://a.com', extra_headers: { 'X-A': 'a\r\nInjected: 1' } } }, {}, msg, now)).type).toBe('error');
  });
  it('without a template it still sends the standard JSON, and GET sends no body', async () => {
    const r = await buildRequest({ kind: 'api', name: 'a', config: { url: 'https://a.com' } }, {}, msg, now);
    if (r.type !== 'http') throw new Error('expected http');
    expect(JSON.parse(String(r.init.body))).toMatchObject({ source: 'kd-ops-agent', event: 'flag', severity: 'high' });
    const g = await buildRequest({ kind: 'api', name: 'a', config: { url: 'https://a.com', method: 'GET' } }, {}, msg, now);
    if (g.type !== 'http') throw new Error('expected http');
    expect(g.init.body).toBeUndefined();
  });
});

describe('emails that name the thing and link to it', () => {
  const now = new Date('2026-11-19T12:00:00Z');
  it('puts the exact link in the email as a button and a clickable address', async () => {
    const link = { url: 'https://ops.kdsquares.com/task?task=abc', label: 'Open the task' };
    const r = await buildRequest({ kind: 'email', name: 'e', config: { to: 'cara@example.com' } }, {}, { title: 'Overdue: Prepare the vendor table', text: 'Hi Cara,\nTask: "Prepare the vendor table"\nOpen it here: https://ops.kdsquares.com/task?task=abc', link }, now);
    if (r.type !== 'email') throw new Error('expected email');
    expect(r.payload.subject).toBe('Overdue: Prepare the vendor table');
    expect(r.payload.html).toContain('<a href="https://ops.kdsquares.com/task?task=abc">https://ops.kdsquares.com/task?task=abc</a>');
    expect(r.payload.html).toContain('>Open the task</a>');
    expect(r.payload.html).toContain('Task: &quot;Prepare the vendor table&quot;');
  });
  it('escapes everything and refuses unsafe links', async () => {
    const r = await buildRequest({ kind: 'email', name: 'e', config: { to: 'cara@example.com' } }, {}, { text: '<script>alert(1)</script>', link: { url: 'javascript:alert(1)', label: 'x' } }, now);
    if (r.type !== 'email') throw new Error('expected email');
    expect(r.payload.html).not.toContain('<script>');
    expect(r.payload.html).not.toContain('javascript:');
    const http = await buildRequest({ kind: 'email', name: 'e', config: { to: 'a@b.co' } }, {}, { text: 'x', link: { url: 'http://insecure.example.com', label: 'x' } }, now);
    if (http.type !== 'email') throw new Error('expected email');
    expect(http.payload.html).not.toContain('<a href="http://');
  });
  it('other tools get the link on its own line, once', async () => {
    const link = { url: 'https://ops.kdsquares.com/task?task=abc', label: 'Open the task' };
    const s = await buildRequest({ kind: 'slack', name: 's', config: {} }, { url: 'https://hooks.slack.com/services/T/B/X' }, { title: 'T', text: 'body', link }, now);
    if (s.type !== 'http') throw new Error('expected http');
    expect(JSON.parse(String(s.init.body)).text).toContain('Open the task: https://ops.kdsquares.com/task?task=abc');
    const dup = await buildRequest({ kind: 'slack', name: 's', config: {} }, { url: 'https://hooks.slack.com/services/T/B/X' }, { title: 'T', text: 'see https://ops.kdsquares.com/task?task=abc', link }, now);
    if (dup.type !== 'http') throw new Error('expected http');
    expect(String(dup.init.body).match(/task\?task=abc/g)).toHaveLength(1);
  });
});
