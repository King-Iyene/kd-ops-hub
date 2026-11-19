// Ops Agent connections, pure parts: which outbound addresses are allowed, and what request each kind of
// connection sends. No Deno APIs here, so it can be unit tested. Network access lives in agent-deliver.ts.

export type ConnectionKind = 'slack' | 'cliq' | 'email' | 'webhook' | 'n8n' | 'api' | 'whatsapp';

export interface ConnectionLite { kind: ConnectionKind; name: string; config: Record<string, unknown> }
export interface Secrets { url?: string | null; token?: string | null }
export interface Outgoing { title?: string; text: string; event?: string }

// ── Outbound addresses ─────────────────────────────────────────────────────
// A person with Super Admin rights types these addresses, so they are still checked: HTTPS only, no credentials in
// the address, standard ports, and nothing that points back into our own network (cloud metadata, localhost, 10.x).

export function isPrivateIp(raw: string): boolean {
  const ip = raw.replace(/^\[|\]$/g, '').toLowerCase();
  const v4 = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
  }
  if (ip.includes(':')) {
    if (ip === '::' || ip === '::1') return true;
    const mapped = ip.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
    if (mapped) return isPrivateIp(mapped[1]);
    if (/^::ffff:[0-9a-f]{1,4}:[0-9a-f]{1,4}$/.test(ip)) return true; // v4-mapped in hex form: not worth decoding
    return /^f[cd]/.test(ip) || /^fe[89ab]/.test(ip) || /^ff/.test(ip);
  }
  return false;
}

const isIpLiteral = (h: string) => /^\d{1,3}(\.\d{1,3}){3}$/.test(h) || h.includes(':');

export function checkOutboundUrl(raw: string): { ok: true; url: URL } | { ok: false; error: string } {
  let url: URL;
  try { url = new URL(raw.trim()); } catch { return { ok: false, error: 'That is not a valid web address.' }; }
  if (url.protocol !== 'https:') return { ok: false, error: 'Addresses must start with https://.' };
  if (url.username || url.password) return { ok: false, error: 'Do not put a user name or password in the address.' };
  if (url.port && !['443', '8443'].includes(url.port)) return { ok: false, error: 'Only the standard HTTPS ports are allowed.' };
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!host) return { ok: false, error: 'That address has no host.' };
  if (host === 'localhost' || /\.(localhost|local|internal|localdomain|lan|home|corp)$/.test(host)) return { ok: false, error: 'Internal addresses are not allowed.' };
  if (isIpLiteral(host)) {
    if (isPrivateIp(host)) return { ok: false, error: 'Internal addresses are not allowed.' };
  } else if (!host.includes('.')) {
    return { ok: false, error: 'Use a full host name, for example hooks.example.com.' };
  }
  return { ok: true, url };
}

// ── What each kind sends ───────────────────────────────────────────────────
const enc = new TextEncoder();
const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

/** HMAC-SHA256 of the body with the shared token, so the receiver can prove the call came from us. */
export async function signBody(body: string, token: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(token), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return `sha256=${hex(await crypto.subtle.sign('HMAC', key, enc.encode(body)))}`;
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const EMAIL = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;

export function parseRecipients(raw: unknown): string[] {
  return String(raw ?? '').split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
}

export type BuiltRequest =
  | { type: 'http'; url: string; init: { method: string; headers: Record<string, string>; body?: string } }
  | { type: 'email'; payload: { channel: 'email'; to: string; subject: string; html: string } }
  | { type: 'error'; error: string };

export async function buildRequest(conn: ConnectionLite, secrets: Secrets, msg: Outgoing, now: Date = new Date()): Promise<BuiltRequest> {
  const cfg = conn.config ?? {};
  const text = msg.text.slice(0, 3000);
  const title = (msg.title ?? '').slice(0, 200);

  if (conn.kind === 'email') {
    const to = parseRecipients(cfg.to);
    if (to.length === 0) return { type: 'error', error: 'Add at least one email address to send to.' };
    if (to.length > 5) return { type: 'error', error: 'Five addresses at most.' };
    if (!to.every((a) => EMAIL.test(a))) return { type: 'error', error: 'One of the email addresses is not valid.' };
    return { type: 'email', payload: { channel: 'email', to: to.join(','), subject: title || 'Ops Agent', html: `<p>${escapeHtml(text).replace(/\n/g, '<br>')}</p>` } };
  }

  if (conn.kind === 'slack' || conn.kind === 'cliq') {
    if (!secrets.url) return { type: 'error', error: 'The webhook address is missing.' };
    const body = JSON.stringify({ text: title ? `*${title}*\n${text}` : text });
    return { type: 'http', url: secrets.url, init: { method: 'POST', headers: { 'Content-Type': 'application/json' }, body } };
  }

  if (conn.kind === 'webhook' || conn.kind === 'n8n') {
    const url = String(cfg.url ?? '');
    if (!url) return { type: 'error', error: 'The address is missing.' };
    const body = JSON.stringify({ source: 'kd-ops-agent', event: msg.event ?? 'message', title, text, sent_at: now.toISOString() });
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (secrets.token) { headers['Authorization'] = `Bearer ${secrets.token}`; headers['X-KDOps-Signature'] = await signBody(body, secrets.token); }
    return { type: 'http', url, init: { method: 'POST', headers, body } };
  }

  if (conn.kind === 'api') {
    const url = String(cfg.url ?? '');
    if (!url) return { type: 'error', error: 'The address is missing.' };
    const method = String(cfg.method ?? 'POST').toUpperCase() === 'GET' ? 'GET' : 'POST';
    const headerName = String(cfg.header_name ?? 'Authorization').trim() || 'Authorization';
    if (!/^[A-Za-z0-9-]{1,60}$/.test(headerName)) return { type: 'error', error: 'The header name is not valid.' };
    if (/^(host|content-length|transfer-encoding|connection)$/i.test(headerName)) return { type: 'error', error: 'That header name is not allowed.' };
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (secrets.token) headers[headerName] = headerName.toLowerCase() === 'authorization' ? `Bearer ${secrets.token}` : secrets.token;
    if (method === 'GET') return { type: 'http', url, init: { method, headers } };
    headers['Content-Type'] = 'application/json';
    return { type: 'http', url, init: { method, headers, body: JSON.stringify({ source: 'kd-ops-agent', event: msg.event ?? 'message', title, text, sent_at: now.toISOString() }) } };
  }

  return { type: 'error', error: 'This kind of connection is not available yet.' };
}

/** A short, safe description of a provider's answer, for the connection's status line. */
export function describeStatus(status: number): string {
  if (status === 401 || status === 403) return 'The receiver refused the credentials (HTTP ' + status + ').';
  if (status === 404) return 'The receiver says that address does not exist (HTTP 404).';
  if (status === 429) return 'The receiver is rate limiting us (HTTP 429).';
  if (status >= 300 && status < 400) return `The address redirects (HTTP ${status}). Use the final address.`;
  if (status >= 500) return `The receiver had a problem (HTTP ${status}).`;
  return `The receiver answered HTTP ${status}.`;
}
