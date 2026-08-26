import { supabase } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';

/**
 * "Log in as another user" — a real, fully-authenticated session swap,
 * not the role-only "View As" simulation (see authStore.ts). Super_admin
 * only. Full read/write while impersonating: any action taken (approve,
 * submit, delete) genuinely executes as the target user's own session,
 * so it's attributed to them everywhere except the two bracketing audit
 * entries below, which are always attributed to the real admin.
 *
 * sessionStorage (not localStorage) so it never survives a browser
 * restart, and is scoped to one tab.
 */
const ORIGIN_KEY = 'kdops:impersonation:originRefreshToken';
const META_KEY = 'kdops:impersonation:meta';

export interface ImpersonationMeta {
  adminId: string;
  adminName: string;
  targetId: string;
  targetName: string;
  targetEmail: string;
  startedAt: string;
}

export function getImpersonationMeta(): ImpersonationMeta | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(META_KEY);
    return raw ? (JSON.parse(raw) as ImpersonationMeta) : null;
  } catch {
    return null;
  }
}

/**
 * Starts impersonating `targetUserId`. Throws on any failure — caller
 * should toast the error and NOT navigate/reload, since the session is
 * still the real admin's at that point.
 */
export async function startImpersonation(targetUserId: string, targetName: string): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not signed in');

  const adminId = session.user.id;
  const { data: adminProfile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', adminId)
    .single();
  const adminName = adminProfile?.full_name || session.user.email || 'Admin';

  // Log BEFORE switching sessions — this call is still authenticated as
  // the real admin, so log_audit()'s auth.uid() correctly attributes it.
  await logAudit(
    'user_impersonation_started',
    `${adminName} started impersonating ${targetName}`,
    null,
    { target_user_id: targetUserId, target_name: targetName },
  );

  const { data, error } = await supabase.functions.invoke('impersonate-user', {
    body: { target_user_id: targetUserId },
  });
  if (error || !data?.ok) {
    throw new Error(data?.error || error?.message || 'Could not start impersonation');
  }

  // Stash the admin's own refresh token + display metadata BEFORE
  // swapping the live session, so endImpersonation() can restore it.
  window.sessionStorage.setItem(ORIGIN_KEY, session.refresh_token);
  window.sessionStorage.setItem(META_KEY, JSON.stringify({
    adminId,
    adminName,
    targetId: data.target.id,
    targetName: data.target.full_name || targetName,
    targetEmail: data.target.email,
    startedAt: new Date().toISOString(),
  } satisfies ImpersonationMeta));

  const { error: verifyErr } = await supabase.auth.verifyOtp({
    type: 'magiclink',
    token_hash: data.token_hash,
  });
  if (verifyErr) {
    // Roll back the stashed state — we never actually switched.
    window.sessionStorage.removeItem(ORIGIN_KEY);
    window.sessionStorage.removeItem(META_KEY);
    throw new Error(verifyErr.message);
  }

  // Full reload so every page's loaded/cached state resets cleanly against
  // the target's session instead of a stale mix of the admin's and theirs.
  window.location.href = '/';
}

/**
 * Restores the real admin's session and logs the end of the
 * impersonation window. Reloads the page on success so every component's
 * cached/loaded state resets cleanly rather than showing a stale mix of
 * the target's and admin's data.
 */
export async function endImpersonation(): Promise<void> {
  const meta = getImpersonationMeta();
  const originRefreshToken = window.sessionStorage.getItem(ORIGIN_KEY);
  if (!meta || !originRefreshToken) {
    // Nothing to restore from — clear whatever's left and bail.
    window.sessionStorage.removeItem(ORIGIN_KEY);
    window.sessionStorage.removeItem(META_KEY);
    return;
  }

  const { error } = await supabase.auth.refreshSession({ refresh_token: originRefreshToken });
  if (error) {
    // Can't recover the admin session client-side — clear local state and
    // force a full sign-out so the admin re-authenticates from scratch
    // rather than being stuck mid-impersonation.
    window.sessionStorage.removeItem(ORIGIN_KEY);
    window.sessionStorage.removeItem(META_KEY);
    await supabase.auth.signOut();
    window.location.href = '/login';
    return;
  }

  // Now genuinely back on the admin's session — this attributes correctly.
  await logAudit(
    'user_impersonation_ended',
    `${meta.adminName} stopped impersonating ${meta.targetName}`,
    null,
    { target_user_id: meta.targetId, target_name: meta.targetName, started_at: meta.startedAt },
  );

  window.sessionStorage.removeItem(ORIGIN_KEY);
  window.sessionStorage.removeItem(META_KEY);
  window.location.href = '/';
}
