// Ops Agent connections: send one message through one connection. The address is checked (agent-deliver-core.ts),
// resolved, and every address it resolves to must be public. No redirects are followed. Nothing about a secret is
// ever put in a result: only a short, human sentence about what happened.

import { buildRequest, checkOutboundUrl, describeStatus, isPrivateIp, type ConnectionLite, type Outgoing, type Secrets } from './agent-deliver-core.ts';

export interface DeliverDeps {
  fetch?: typeof fetch;
  resolveDns?: (host: string, type: 'A' | 'AAAA') => Promise<string[]>;
  supabaseUrl?: string;
  serviceKey?: string;
}
export type DeliverResult = { ok: true; status: number } | { ok: false; status?: number; error: string };

const isLiteral = (h: string) => /^\d{1,3}(\.\d{1,3}){3}$/.test(h) || h.includes(':');

async function hostIsPublic(host: string, resolve: NonNullable<DeliverDeps['resolveDns']>): Promise<string | null> {
  const h = host.replace(/^\[|\]$/g, '');
  if (isLiteral(h)) return isPrivateIp(h) ? 'Internal addresses are not allowed.' : null;
  const found: string[] = [];
  for (const type of ['A', 'AAAA'] as const) {
    try { found.push(...await resolve(h, type)); } catch { /* no records of this type */ }
  }
  if (found.length === 0) return 'That host name could not be found.';
  if (found.some(isPrivateIp)) return 'That host name points to an internal address, which is not allowed.';
  return null;
}

export async function deliver(conn: ConnectionLite, secrets: Secrets, msg: Outgoing, deps: DeliverDeps = {}): Promise<DeliverResult> {
  const doFetch = deps.fetch ?? fetch;
  const resolve = deps.resolveDns ?? ((h, t) => Deno.resolveDns(h, t));
  const built = await buildRequest(conn, secrets, msg);
  if (built.type === 'error') return { ok: false, error: built.error };

  try {
    if (built.type === 'email') {
      const base = deps.supabaseUrl ?? Deno.env.get('SUPABASE_URL')!;
      const key = deps.serviceKey ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const res = await doFetch(`${base}/functions/v1/send-email`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }, body: JSON.stringify(built.payload),
        signal: AbortSignal.timeout(15_000),
      });
      await res.text().catch(() => '');
      return res.ok ? { ok: true, status: res.status } : { ok: false, status: res.status, error: `The email service answered HTTP ${res.status}.` };
    }

    const checked = checkOutboundUrl(built.url);
    if (!checked.ok) return { ok: false, error: checked.error };
    const dnsProblem = await hostIsPublic(checked.url.hostname, resolve);
    if (dnsProblem) return { ok: false, error: dnsProblem };

    const res = await doFetch(checked.url.toString(), { ...built.init, redirect: 'manual', signal: AbortSignal.timeout(10_000) });
    await res.body?.cancel().catch(() => {});
    return res.status >= 200 && res.status < 300 ? { ok: true, status: res.status } : { ok: false, status: res.status, error: describeStatus(res.status) };
  } catch (e) {
    const timedOut = e instanceof DOMException && (e.name === 'TimeoutError' || e.name === 'AbortError');
    return { ok: false, error: timedOut ? 'The receiver did not answer in time.' : 'Could not connect to that address.' };
  }
}
