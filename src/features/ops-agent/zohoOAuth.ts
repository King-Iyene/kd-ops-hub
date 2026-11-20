// Zoho sign-in for the Cliq API connection: the two addresses the person pastes into Zoho's API console, and small helpers shared by
// the connection dialog, the connection cards and the page Zoho sends the person back to.

import type { AgentConnection } from './agentDb';

/** The page Zoho sends the person back to after they allow access. */
export const ZOHO_REDIRECT_PATH = '/agent/oauth/zoho';

/** The site's address without a trailing slash. `appUrl` is the Agent setting; the browser's own address is the fallback. */
export function siteAddress(appUrl?: string | null): string {
  const fromSetting = (appUrl ?? '').trim().replace(/\/+$/, '');
  if (fromSetting) return fromSetting;
  return typeof window !== 'undefined' ? window.location.origin.replace(/\/+$/, '') : '';
}

/**
 * The Homepage URL and the Authorized Redirect URI for Zoho's API console. The dialog shows them and the callback page sends the
 * same redirect address back, so they must always come from this one function.
 */
export function zohoOAuthUrls(appUrl?: string | null): { homepageUrl: string; redirectUri: string } {
  const homepageUrl = siteAddress(appUrl);
  return { homepageUrl, redirectUri: `${homepageUrl}${ZOHO_REDIRECT_PATH}` };
}

/** A Cliq API connection is authorized once a refresh token is stored (the server names it ..._refresh). */
export const isZohoAuthorized = (c: Pick<AgentConnection, 'vault_secret_names'> | null | undefined) => !!c && c.vault_secret_names.some((n) => n.endsWith('_refresh'));

/** A Cliq API connection that was saved but not yet signed in to Zoho. */
export const needsZohoSignIn = (c: AgentConnection) => c.kind === 'cliq' && c.config.mode === 'api' && !isZohoAuthorized(c);

/** Sends the browser to Zoho's consent screen. Kept in one place so tests can replace it. */
export const goToZoho = (url: string) => window.location.assign(url);

/** Copies text. Falls back to the old selection way when the clipboard is not available. Resolves to whether it worked. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true; }
  } catch { /* fall through to the old way */ }
  try {
    const el = document.createElement('textarea');
    el.value = text;
    el.setAttribute('readonly', '');
    el.style.position = 'fixed';
    el.style.opacity = '0';
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(el);
    return ok;
  } catch {
    return false;
  }
}
