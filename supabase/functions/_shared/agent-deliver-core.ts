// Ops Agent connections, pure parts: which outbound addresses are allowed, and what request each kind of
// connection sends. No Deno APIs here, so it can be unit tested. Network access lives in agent-deliver.ts.

export type ConnectionKind = 'slack' | 'cliq' | 'discord' | 'teams' | 'gchat' | 'telegram' | 'email' | 'webhook' | 'n8n' | 'api' | 'whatsapp';

export interface ConnectionLite { kind: ConnectionKind; name: string; config: Record<string, unknown> }
/** url: a webhook address. token: a bot or API token. secret / refresh / access: the Zoho Cliq API sign-in (client secret, refresh token, saved access token). */
export interface Secrets { url?: string | null; token?: string | null; secret?: string | null; refresh?: string | null; access?: string | null }
export interface OutgoingMeta { severity?: string; rule?: string; person?: string }
import { renderMention } from './agent-mention-core.ts';
import { messagesUrl, validChannel, validDc } from './agent-cliq-core.ts';

export interface OutgoingLink { url: string; label: string }
export interface Outgoing { title?: string; text: string; event?: string; meta?: OutgoingMeta; /** The exact thing being talked about: shown as a button in email and a line elsewhere. */ link?: OutgoingLink;
  /** Who the message is about, to be tagged in Cliq or Slack when the connection allows it. */
  mention?: { name: string; id: string };
  /** Their manager, shown as a CC under the person (tagged when there is an id, the plain name when there is not). */
  cc?: { name: string; id: string };
  /**
   * A message written to the person it is about: what was noticed, a question, and (when their manager is known) a line at the bottom
   * asking the manager to follow up. Cliq and Slack lay it out with tags; other tools show `text`.
   */
  ask?: { observation: string; question: string; followUp: string } }

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

/** A web address that is safe to put in an href or a message: https only, no credentials. */
export function safeLink(l: OutgoingLink | undefined): OutgoingLink | null {
  if (!l) return null;
  try {
    const u = new URL(l.url);
    if (u.protocol !== 'https:' || u.username || u.password) return null;
    return { url: u.toString(), label: (l.label || 'Open it').slice(0, 80) };
  } catch { return null; }
}

/** Plain text to email HTML: escaped, line breaks kept, and every https address a real link. */
export function emailHtml(text: string, link: OutgoingLink | null): string {
  const body = escapeHtml(text).replace(/\n/g, '<br>').replace(/https:\/\/[^\s<]+/g, (m) => `<a href="${m}">${m}</a>`);
  const button = link
    ? `<p style="margin:20px 0 0"><a href="${escapeHtml(link.url)}" style="display:inline-block;background:#1a2733;color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:600">${escapeHtml(link.label)}</a></p>`
    : '';
  return `<p>${body}</p>${button}`;
}

export function parseRecipients(raw: unknown): string[] {
  return String(raw ?? '').split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
}

export type BuiltRequest =
  | { type: 'http'; url: string; init: { method: string; headers: Record<string, string>; body?: string }; /** Zoho takes two spellings of the sign-in header; if the first is refused the sender tries this one once. */ retryAuthorization?: string }
  | { type: 'email'; payload: { channel: 'email'; to: string; subject: string; html: string } }
  | { type: 'error'; error: string };

// ── The generic API connection ──────────────────────────────────────────────
export const API_METHODS = ['GET', 'POST', 'PUT', 'PATCH'] as const;
export const AUTH_TYPES = ['none', 'bearer', 'header', 'basic', 'query'] as const;
export const CONTENT_TYPES = { json: 'application/json', form: 'application/x-www-form-urlencoded', text: 'text/plain' } as const;
const FORBIDDEN_HEADERS = /^(host|content-length|transfer-encoding|connection|content-type|accept-encoding|upgrade|te|trailer|proxy-.*|cookie|set-cookie)$/i;
const HEADER_NAME = /^[A-Za-z0-9-]{1,60}$/;

export function validHeaderName(name: string): boolean { return HEADER_NAME.test(name) && !FORBIDDEN_HEADERS.test(name); }

/** Fills {{title}} {{text}} {{event}} {{severity}} {{rule}} {{person}} {{sent_at}} into a template, escaped for where the value lands. */
export function renderTemplate(template: string, vars: Record<string, string>, contentType: keyof typeof CONTENT_TYPES): string {
  const esc = (v: string) => contentType === 'json' ? JSON.stringify(v).slice(1, -1) : contentType === 'form' ? encodeURIComponent(v) : v;
  return template.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_m, k: string) => esc(vars[k] ?? ''));
}

export function buildApiRequest(cfg: Record<string, unknown>, secrets: Secrets, msg: Outgoing, title: string, text: string, now: Date): BuiltRequest {
  let url = String(cfg.url ?? '');
  if (!url) return { type: 'error', error: 'The address is missing.' };
  const method = (API_METHODS as readonly string[]).includes(String(cfg.method ?? 'POST').toUpperCase()) ? String(cfg.method ?? 'POST').toUpperCase() : 'POST';
  const hn = String(cfg.header_name ?? '').trim();
  if (hn && !validHeaderName(hn) && hn.toLowerCase() !== 'authorization') return { type: 'error', error: 'The token header name is not valid.' };
  // Connections saved before auth_type existed: a named header other than Authorization carried the raw token, Authorization carried "Bearer ...".
  const legacyAuth = hn && hn.toLowerCase() !== 'authorization' ? 'header' : 'bearer';
  const auth = (AUTH_TYPES as readonly string[]).includes(String(cfg.auth_type ?? '')) ? String(cfg.auth_type) : legacyAuth;
  const ct = (String(cfg.content_type ?? 'json') in CONTENT_TYPES ? String(cfg.content_type ?? 'json') : 'json') as keyof typeof CONTENT_TYPES;
  const headers: Record<string, string> = { Accept: 'application/json, */*;q=0.5' };

  if (secrets.token && auth !== 'none') {
    if (auth === 'bearer') headers['Authorization'] = `Bearer ${secrets.token}`;
    else if (auth === 'basic') headers['Authorization'] = `Basic ${btoa(secrets.token)}`;
    else if (auth === 'header') {
      const name = String(cfg.header_name ?? 'Authorization').trim() || 'Authorization';
      if (!validHeaderName(name) && name.toLowerCase() !== 'authorization') return { type: 'error', error: 'The token header name is not valid.' };
      headers[name] = secrets.token;
    } else if (auth === 'query') {
      const param = String(cfg.query_param ?? 'token').trim() || 'token';
      if (!/^[A-Za-z0-9_.-]{1,60}$/.test(param)) return { type: 'error', error: 'The token parameter name is not valid.' };
      try { const u = new URL(url); u.searchParams.set(param, secrets.token); url = u.toString(); } catch { return { type: 'error', error: 'That is not a valid web address.' }; }
    }
  }

  const extra = cfg.extra_headers && typeof cfg.extra_headers === 'object' ? Object.entries(cfg.extra_headers as Record<string, unknown>) : [];
  for (const [k, v] of extra.slice(0, 10)) {
    if (!validHeaderName(k)) return { type: 'error', error: `The header name "${k}" is not allowed.` };
    const val = String(v ?? '');
    if (/[\r\n]/.test(val) || val.length > 300) return { type: 'error', error: `The value of header "${k}" is not valid.` };
    headers[k] = val;
  }

  if (method === 'GET') return { type: 'http', url, init: { method, headers } };

  headers['Content-Type'] = CONTENT_TYPES[ct];
  const vars: Record<string, string> = { title, text, event: msg.event ?? 'message', severity: msg.meta?.severity ?? '', rule: msg.meta?.rule ?? '', person: msg.meta?.person ?? '', sent_at: now.toISOString() };
  const template = typeof cfg.body_template === 'string' ? cfg.body_template.trim() : '';
  let body: string;
  if (template) {
    body = renderTemplate(template, vars, ct);
    if (ct === 'json') { try { JSON.parse(body); } catch { return { type: 'error', error: 'The body is not valid JSON once the values are filled in. Check the commas and quotes.' }; } }
  } else {
    body = JSON.stringify({ source: 'kd-ops-agent', ...vars });
    headers['Content-Type'] = 'application/json';
  }
  return { type: 'http', url, init: { method, headers, body } };
}

const kindShowsLinkInline = (k: ConnectionKind) => k !== 'email';

export async function buildRequest(conn: ConnectionLite, secrets: Secrets, msg: Outgoing, now: Date = new Date()): Promise<BuiltRequest> {
  const cfg = conn.config ?? {};
  const link = safeLink(msg.link);
  // Where the message cannot show a button, the link goes on its own line at the end (unless the text already has it).
  const plain = msg.text.slice(0, 3000);
  const text = link && kindShowsLinkInline(conn.kind) && !plain.includes(link.url) ? `${plain}\n${link.label}: ${link.url}` : plain;
  const title = (msg.title ?? '').slice(0, 200);

  if (conn.kind === 'email') {
    const to = parseRecipients(cfg.to);
    if (to.length === 0) return { type: 'error', error: 'Add at least one email address to send to.' };
    if (to.length > 5) return { type: 'error', error: 'Five addresses at most.' };
    if (!to.every((a) => EMAIL.test(a))) return { type: 'error', error: 'One of the email addresses is not valid.' };
    return { type: 'email', payload: { channel: 'email', to: to.join(','), subject: title || 'Ops Agent', html: emailHtml(plain, link) } };
  }

  if (conn.kind === 'slack' || conn.kind === 'cliq') {
    const api = conn.kind === 'cliq' && cfg.mode === 'api';
    if (!api && !secrets.url) return { type: 'error', error: 'The webhook address is missing.' };
    // Tag the person this is about: a line of its own right under the title, so it notifies them and still reads well.
    // Their manager is tagged on the next line as a CC.
    const tagging = cfg.mention_people !== false;
    const ref = (n: { name: string; id: string }) => (n.id ? renderMention(conn.kind as 'cliq' | 'slack', cfg.mention_template, n.id) : '');
    const tag = tagging
      ? (msg.mention ? `For ${msg.mention.name}${ref(msg.mention) ? `: ${ref(msg.mention)}` : ''}\n` : '')
        + (msg.cc ? `CC ${msg.cc.name} (manager)${ref(msg.cc) ? `: ${ref(msg.cc)}` : ''}\n` : '')
      : '';
    // Written to the person: they are addressed and asked what is going on, and their manager is tagged at the bottom to follow up.
    let content = `${tag}${text}`;
    if (msg.ask && tagging && msg.mention) {
      const who = ref(msg.mention) || msg.mention.name;
      const lines = [`${who}, here is what we noticed: ${msg.ask.observation}`, msg.ask.question];
      if (msg.cc && msg.ask.followUp) lines.push('', `${ref(msg.cc) || msg.cc.name} ${msg.ask.followUp}`);
      content = lines.join('\n');
    }
    const body = JSON.stringify({ text: title ? `*${title}*\n${content}` : content });
    if (api) {
      if (!validDc(cfg.dc)) return { type: 'error', error: 'The Zoho data center is missing.' };
      if (!validChannel(cfg.channel)) return { type: 'error', error: 'The channel unique name is missing or not valid (lowercase letters, digits and underscores).' };
      if (!secrets.access) return { type: 'error', error: 'Cliq did not give an access token.' };
      return { type: 'http', url: messagesUrl(cfg.dc, cfg.channel), retryAuthorization: `Bearer ${secrets.access}`,
        init: { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Zoho-oauthtoken ${secrets.access}` }, body } };
    }
    return { type: 'http', url: secrets.url!, init: { method: 'POST', headers: { 'Content-Type': 'application/json' }, body } };
  }

  if (conn.kind === 'discord' || conn.kind === 'gchat' || conn.kind === 'teams') {
    if (!secrets.url) return { type: 'error', error: 'The webhook address is missing.' };
    let payload: unknown;
    if (conn.kind === 'discord') payload = { content: (title ? `**${title}**\n${text}` : text).slice(0, 1900) };
    else if (conn.kind === 'gchat') payload = { text: title ? `*${title}*\n${text}` : text };
    else payload = {
      type: 'message',
      attachments: [{ contentType: 'application/vnd.microsoft.card.adaptive', contentUrl: null, content: {
        $schema: 'http://adaptivecards.io/schemas/adaptive-card.json', type: 'AdaptiveCard', version: '1.4',
        body: [...(title ? [{ type: 'TextBlock', text: title, weight: 'Bolder', size: 'Medium', wrap: true }] : []), { type: 'TextBlock', text, wrap: true }],
      } }],
    };
    return { type: 'http', url: secrets.url, init: { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) } };
  }

  if (conn.kind === 'telegram') {
    if (!secrets.token) return { type: 'error', error: 'The bot token is missing.' };
    const chat = String(cfg.chat_id ?? '').trim();
    if (!/^(-?\d{1,20}|@[A-Za-z0-9_]{3,64})$/.test(chat)) return { type: 'error', error: 'The chat id is missing or not valid (a number such as -1001234567890, or @channelname).' };
    if (!/^\d{3,20}:[A-Za-z0-9_-]{20,100}$/.test(secrets.token)) return { type: 'error', error: 'That does not look like a Telegram bot token (123456:ABC…).' };
    const body = JSON.stringify({ chat_id: /^-?\d+$/.test(chat) ? Number(chat) : chat, text: (title ? `${title}\n\n${text}` : text).slice(0, 4000), disable_web_page_preview: true });
    return { type: 'http', url: `https://api.telegram.org/bot${secrets.token}/sendMessage`, init: { method: 'POST', headers: { 'Content-Type': 'application/json' }, body } };
  }

  if (conn.kind === 'webhook' || conn.kind === 'n8n') {
    const url = String(cfg.url ?? '');
    if (!url) return { type: 'error', error: 'The address is missing.' };
    const body = JSON.stringify({ source: 'kd-ops-agent', event: msg.event ?? 'message', title, text, ...(msg.meta ?? {}), sent_at: now.toISOString() });
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (secrets.token) { headers['Authorization'] = `Bearer ${secrets.token}`; headers['X-KDOps-Signature'] = await signBody(body, secrets.token); }
    return { type: 'http', url, init: { method: 'POST', headers, body } };
  }

  if (conn.kind === 'api') return buildApiRequest(cfg, secrets, msg, title, text, now);

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
