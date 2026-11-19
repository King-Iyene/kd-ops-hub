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
