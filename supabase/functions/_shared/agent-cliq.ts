// Ops Agent, Zoho Cliq through the API: the two network calls (swap a grant code, get an access token). See agent-cliq-core.ts.
// Only the fixed Zoho hosts are ever called. A secret is never put in a result.

import { CLIQ_DCS, accountsUrl, packAccess, parseTokenResponse, readCachedAccess, tokenForm, validDc, type CliqDc, type TokenResult } from './agent-cliq-core.ts';
import type { Secrets } from './agent-deliver-core.ts';

type Fetch = typeof fetch;

async function swap(dc: CliqDc, form: string, grant: 'code' | 'refresh', doFetch: Fetch): Promise<TokenResult> {
  try {
    const res = await doFetch(accountsUrl(dc), {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }, body: form,
      redirect: 'manual', signal: AbortSignal.timeout(10_000),
    });
    const json = await res.json().catch(() => ({}));
    return parseTokenResponse(json, grant);
  } catch {
    return { ok: false, error: 'Could not reach Zoho to sign in. Try again in a moment.' };
  }
}

/** The one-time grant code from a Zoho Self Client becomes a refresh token (which the caller stores in the vault). */
export function exchangeGrantCode(dc: CliqDc, clientId: string, clientSecret: string, code: string, doFetch: Fetch = fetch): Promise<TokenResult> {
  return swap(dc, tokenForm({ clientId, clientSecret, code }), 'code', doFetch);
}

/**
 * A usable access token for this connection: the saved one while it is still good, otherwise a fresh one from the refresh token.
 * Zoho limits how many access tokens one refresh token may mint (about 10 every 10 minutes), so a fresh token is saved and reused.
 */
export async function cliqAccessToken(
  cfg: Record<string, unknown>, secrets: Secrets, saveAccess: ((packed: string) => Promise<void>) | undefined, doFetch: Fetch = fetch, now = Date.now(),
): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  const cached = readCachedAccess(secrets.access, now);
  if (cached) return { ok: true, token: cached };
  const dc = cfg.dc;
  if (!validDc(dc)) return { ok: false, error: `Pick the Zoho data center (${CLIQ_DCS.join(', ')}).` };
  const clientId = String(cfg.client_id ?? '');
  if (!clientId || !secrets.secret) return { ok: false, error: 'The Client ID or Client Secret is missing.' };
  if (!secrets.refresh) return { ok: false, error: 'There is no refresh token yet. Edit the connection and paste a new grant code.' };
  const r = await swap(dc, tokenForm({ clientId, clientSecret: secrets.secret, refreshToken: secrets.refresh }), 'refresh', doFetch);
  if (!r.ok) return r;
  if (saveAccess) { try { await saveAccess(packAccess(r.access, r.expiresIn, now)); } catch { /* it only saves a call next time */ } }
  return { ok: true, token: r.access };
}
