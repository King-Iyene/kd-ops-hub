// Ops Agent connections: delivery with an injected network, so nothing leaves the machine.
//   deno test --allow-env --allow-read supabase/functions/_shared/agent-deliver.test.ts
import { deliver } from './agent-deliver.ts';

const assert = (c: unknown, m: string) => { if (!c) throw new Error(`FAIL: ${m}`); };
const pub = (host: string, t: string) => Promise.resolve(t === 'A' ? ['93.184.216.34'] : []);

function net(status = 200) {
  const seen: { url: string; init: RequestInit }[] = [];
  const f = ((url: string, init: RequestInit) => { seen.push({ url: String(url), init }); return Promise.resolve(new Response('ok', { status })); }) as unknown as typeof fetch;
  return { f, seen };
}

Deno.test('deliver: slack, webhook (signed), api, email, and every refusal', async () => {
  // slack: secret URL, JSON text
  let n = net();
  let r = await deliver({ kind: 'slack', name: 's', config: {} }, { url: 'https://hooks.slack.com/services/T/B/X' }, { title: 'Hi', text: 'Body' }, { fetch: n.f, resolveDns: pub });
  assert(r.ok && n.seen[0].url.startsWith('https://hooks.slack.com/'), 'slack posted');
  assert(JSON.parse(String(n.seen[0].init.body)).text.includes('Body'), 'slack text');
  assert(n.seen[0].init.redirect === 'manual', 'redirects are not followed');

  // webhook: bearer + HMAC signature that matches the body
  n = net();
  r = await deliver({ kind: 'webhook', name: 'w', config: { url: 'https://example.com/hook' } }, { token: 'tok123' }, { text: 'T' }, { fetch: n.f, resolveDns: pub });
  const hdr = n.seen[0].init.headers as Record<string, string>;
  assert(r.ok && hdr['Authorization'] === 'Bearer tok123' && /^sha256=[0-9a-f]{64}$/.test(hdr['X-KDOps-Signature']), 'signed webhook');

  // api GET with a custom header carries the raw token
  n = net();
  r = await deliver({ kind: 'api', name: 'a', config: { url: 'https://api.example.com/ping', method: 'GET', header_name: 'X-Api-Key' } }, { token: 'k' }, { text: 't' }, { fetch: n.f, resolveDns: pub });
  assert(r.ok && n.seen[0].init.method === 'GET' && (n.seen[0].init.headers as Record<string, string>)['X-Api-Key'] === 'k' && !n.seen[0].init.body, 'api request');

  // email goes through send-email with the service key
  n = net();
  r = await deliver({ kind: 'email', name: 'e', config: { to: 'a@x.com, b@y.org' } }, {}, { title: 'Subj', text: 'a < b' }, { fetch: n.f, supabaseUrl: 'https://proj.supabase.co', serviceKey: 'SVC' });
  const em = JSON.parse(String(n.seen[0].init.body));
  assert(r.ok && n.seen[0].url === 'https://proj.supabase.co/functions/v1/send-email' && em.to === 'a@x.com,b@y.org' && em.html.includes('a &lt; b'), 'email via send-email, escaped');

  // refusals: nothing is sent
  for (const [label, conn, secrets, dns] of [
    ['http address', { kind: 'webhook', name: 'x', config: { url: 'http://example.com/h' } }, {}, pub],
    ['localhost', { kind: 'webhook', name: 'x', config: { url: 'https://localhost/h' } }, {}, pub],
    ['metadata ip', { kind: 'webhook', name: 'x', config: { url: 'https://169.254.169.254/latest' } }, {}, pub],
    ['private ip literal', { kind: 'webhook', name: 'x', config: { url: 'https://10.1.2.3/h' } }, {}, pub],
    ['host that resolves private (rebinding)', { kind: 'webhook', name: 'x', config: { url: 'https://evil.example.com/h' } }, {}, (_h: string, t: string) => Promise.resolve(t === 'A' ? ['10.0.0.5'] : [])],
    ['unknown host', { kind: 'webhook', name: 'x', config: { url: 'https://nope.example.com/h' } }, {}, () => Promise.reject(new Error('NXDOMAIN'))],
    ['slack without address', { kind: 'slack', name: 'x', config: {} }, {}, pub],
    ['bad email', { kind: 'email', name: 'x', config: { to: 'not-an-email' } }, {}, pub],
    ['forbidden header', { kind: 'api', name: 'x', config: { url: 'https://api.example.com', header_name: 'Host' } }, { token: 't' }, pub],
    ['whatsapp', { kind: 'whatsapp', name: 'x', config: {} }, {}, pub],
  ] as const) {
    const m = net();
    const res = await deliver(conn as never, secrets as never, { text: 't' }, { fetch: m.f, resolveDns: dns as never });
    assert(!res.ok && m.seen.length === 0, `${label} is refused and nothing is sent`);
  }

  // receivers that answer badly: a plain sentence, no body echoed
  n = net(401);
  r = await deliver({ kind: 'webhook', name: 'w', config: { url: 'https://example.com/hook' } }, {}, { text: 't' }, { fetch: n.f, resolveDns: pub });
  assert(!r.ok && r.error.includes('401'), '401 explained');
  n = net(302);
  r = await deliver({ kind: 'webhook', name: 'w', config: { url: 'https://example.com/hook' } }, {}, { text: 't' }, { fetch: n.f, resolveDns: pub });
  assert(!r.ok && r.error.includes('redirects'), 'a redirect is reported, not followed');
  const down = ((): Promise<Response> => Promise.reject(new TypeError('connection refused to 10.0.0.1'))) as unknown as typeof fetch;
  r = await deliver({ kind: 'webhook', name: 'w', config: { url: 'https://example.com/hook' } }, { token: 'SECRET-TOKEN' }, { text: 't' }, { fetch: down, resolveDns: pub });
  assert(!r.ok && !JSON.stringify(r).includes('SECRET-TOKEN') && !JSON.stringify(r).includes('10.0.0.1'), 'errors never echo secrets or internals');
  console.log('PASS: delivery for every kind, signing, and 10 refusals');
});
