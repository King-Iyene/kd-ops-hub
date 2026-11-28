// Ops Agent, Zoho Cliq through the API (OAuth): pure parts, no Deno APIs, so it can be unit tested.
//
// The way the owner connected Cliq in n8n: a Zoho "Self Client" gives a Client ID, a Client Secret and a one-time grant code
// (scope ZohoCliq.Webhooks.CREATE; reading for the Cliq watch also needs the READ scopes in CLIQ_SCOPE). The grant code is swapped once for a long-lived refresh token; the refresh token is swapped
// for a one-hour access token whenever one is needed. Messages then go to
//   POST https://cliq.zoho.<dc>/api/v3/channelsbyname/<channel unique name>/messages    { "text": "..." }
// Every host here comes from a fixed list of Zoho data centers, so a typed address can never point anywhere else.

export const CLIQ_DCS = ['com', 'eu', 'in', 'com.au', 'jp', 'ca', 'sa', 'com.cn'] as const;
export type CliqDc = (typeof CLIQ_DCS)[number];
/** Posting, plus the read permissions the Cliq watch needs (channels, the messages in them, and the people who wrote them). */
export const CLIQ_SCOPE = 'ZohoCliq.Webhooks.CREATE,ZohoCliq.Channels.READ,ZohoCliq.Messages.READ,ZohoCliq.Chats.READ,ZohoCliq.Users.READ';

export const validDc = (d: unknown): d is CliqDc => typeof d === 'string' && (CLIQ_DCS as readonly string[]).includes(d);
export const validChannel = (c: unknown): c is string => typeof c === 'string' && /^[a-z0-9_]{1,50}$/.test(c);
export const validClientId = (c: unknown): c is string => typeof c === 'string' && /^[A-Za-z0-9._-]{8,80}$/.test(c);
/** Zoho secrets, codes and refresh tokens are plain letters, digits, dots and dashes. Anything else is a paste mistake. */
export const validZohoValue = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9._-]{8,200}$/.test(v);

export const OAUTH_PATH = '/agent/oauth/zoho';

/** Where Zoho sends the person back to: our own page, https, no extras, on an address we know (the site address, or the one the browser called from). */
export function validRedirectUri(raw: unknown, allowedOrigins: (string | null | undefined)[]): string | null {
  if (typeof raw !== 'string') return null;
  let u: URL;
  try { u = new URL(raw); } catch { return null; }
  if (u.protocol !== 'https:' || u.username || u.password || u.search || u.hash || u.pathname !== OAUTH_PATH) return null;
  const ok = allowedOrigins.some((o) => { try { return !!o && new URL(o).origin === u.origin; } catch { return false; } });
  return ok ? u.toString() : null;
}

/** Zoho adds `accounts-server` (for example https://accounts.zoho.eu) to the way back. Only the fixed Zoho hosts count. */
export function dcFromAccountsServer(raw: unknown): CliqDc | null {
  if (typeof raw !== 'string') return null;
  const m = raw.trim().match(/^https:\/\/accounts\.zoho\.([a-z.]{2,7})\/?$/);
  return m && validDc(m[1]) ? m[1] : null;
}

export function consentUrl(p: { dc: CliqDc; clientId: string; redirectUri: string; state: string }): string {
  const q = new URLSearchParams({ scope: CLIQ_SCOPE, client_id: p.clientId, response_type: 'code', access_type: 'offline', prompt: 'consent', redirect_uri: p.redirectUri, state: p.state });
  return `https://accounts.zoho.${p.dc}/oauth/v2/auth?${q.toString()}`;
}

export const accountsUrl = (dc: CliqDc) => `https://accounts.zoho.${dc}/oauth/v2/token`;
export const messagesUrl = (dc: CliqDc, channel: string) => `https://cliq.zoho.${dc}/api/v3/channelsbyname/${encodeURIComponent(channel)}/messages`;

/** A Cliq user id (digits) or an email: the two things Zoho takes in the address of a direct message. */
export const validDmTarget = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9._@+-]{2,120}$/.test(v);
/**
 * A direct message to one person: POST https://cliq.zoho.<dc>/api/v2/buddies/<user id or email>/message  { "text": "..." }
 * Zoho's documentation lists the same ZohoCliq.Webhooks.CREATE permission as channel posting, so no new permission is asked for. The person must
 * be in the same Zoho organisation (or a mutual contact). Null when the target is not a plain id or email, or the data center is not a known one.
 */
export const dmMessageUrl = (dc: CliqDc, idOrEmail: string): string | null =>
  validDc(dc) && validDmTarget(idOrEmail) ? `https://cliq.zoho.${dc}/api/v2/buddies/${encodeURIComponent(idOrEmail)}/message` : null;

/** The form body for either swap: a grant code for a refresh token, or a refresh token for an access token. */
export function tokenForm(p: { clientId: string; clientSecret: string; code?: string; refreshToken?: string; redirectUri?: string }): string {
  const f = new URLSearchParams();
  f.set('client_id', p.clientId); f.set('client_secret', p.clientSecret);
  if (p.code) { f.set('grant_type', 'authorization_code'); f.set('code', p.code); if (p.redirectUri) f.set('redirect_uri', p.redirectUri); }
  else { f.set('grant_type', 'refresh_token'); f.set('refresh_token', p.refreshToken ?? ''); }
  return f.toString();
}

export type TokenResult = { ok: true; access: string; refresh: string | null; expiresIn: number } | { ok: false; error: string };

/** Zoho answers HTTP 200 even for a wrong code, so the body decides. Only a short, safe sentence comes out. */
export function parseTokenResponse(json: unknown, grant: 'code' | 'refresh'): TokenResult {
  const j = (json && typeof json === 'object' ? json : {}) as Record<string, unknown>;
  if (typeof j.access_token === 'string' && j.access_token.length > 10) {
    const exp = Number(j.expires_in ?? j.expires_in_sec ?? 3600);
    const refresh = typeof j.refresh_token === 'string' && j.refresh_token.length > 10 ? j.refresh_token : null;
    if (grant === 'code' && !refresh) return { ok: false, error: 'Zoho accepted the code but gave no refresh token. Generate a new code in the Self Client and try again.' };
    return { ok: true, access: j.access_token, refresh, expiresIn: Number.isFinite(exp) && exp > 0 ? Math.min(exp, 3600) : 3600 };
  }
  const err = typeof j.error === 'string' && /^[a-z_]{1,40}$/.test(j.error) ? j.error : '';
  if (err === 'invalid_code') return { ok: false, error: 'Zoho did not accept that grant code. It works once and expires after about 10 minutes. Generate a new one in the API console.' };
  if (err === 'invalid_client' || err === 'invalid_client_secret') return { ok: false, error: 'Zoho did not accept the Client ID or Client Secret. Check them, and that the data center matches your Zoho account.' };
  if (err === 'invalid_token' || err === 'invalid_grant') return { ok: false, error: grant === 'refresh' ? 'Zoho no longer accepts the saved refresh token. Edit the connection and paste a new grant code.' : 'Zoho did not accept that grant code. Generate a new one in the API console.' };
  if (err === 'Access Denied' || err === 'access_denied') return { ok: false, error: 'Zoho refused access. Check the scope and that the data center is right.' };
  return { ok: false, error: err ? `Zoho answered: ${err}.` : 'Zoho did not return a token. Check the Client ID, secret and data center.' };
}

/** A saved access token is kept as "<expiry ms>:<token>" in the vault. Null when missing, malformed or about to expire. */
export function readCachedAccess(raw: string | null | undefined, now: number): string | null {
  if (!raw) return null;
  const i = raw.indexOf(':');
  if (i < 1) return null;
  const exp = Number(raw.slice(0, i));
  const tok = raw.slice(i + 1);
  return Number.isFinite(exp) && exp - now > 120_000 && tok.length > 10 ? tok : null;
}
export const packAccess = (token: string, expiresInSec: number, now: number) => `${now + expiresInSec * 1000}:${token}`;
