/**
 * Renders a non-dismissible banner across the top of the app when:
 *   • company_settings.mfa_required_for_all_users = TRUE, AND
 *   • the signed-in user has no enrolled TOTP factor.
 *
 * Mounted in AppLayout above all routes. Hidden if the user is
 * already on /profile so they aren't shouted at while enrolling.
 *
 * Backend enforcement (e.g. blocking sensitive RPCs) is a follow-up.
 * This banner is the policy declaration's UX surface — it nudges
 * the user persistently. Front-end-only enforcement is intentional:
 * any RLS / RPC gate that depends on a user's auth.mfa_factor list
 * has Supabase-level reliability concerns we'll address separately.
 */
import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { listMfaFactors } from '@/lib/mfa';

export function MfaRequiredBanner() {
  const profile = useAuthStore((s) => s.profile);
  const location = useLocation();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!profile?.id) {
      setShow(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        // Read the policy once. Don't subscribe — toggling is rare
        // and a manual page reload picks up the new value. A real-
        // time subscription on company_settings would also fire on
        // every other field edit (currency, fiscal year, etc.) and
        // burn quota.
        const { data } = await supabase
          .from('company_settings')
          .select('mfa_required_for_all_users')
          .maybeSingle();
        const required = !!(data as any)?.mfa_required_for_all_users;
        if (!required) {
          if (!cancelled) setShow(false);
          return;
        }
        // Check enrolment status. Done in parallel with the policy
        // read on second mount (cached) but here we do them in
        // sequence on first mount so we don't fire the MFA factor
        // call when the policy is OFF.
        const factors = await listMfaFactors();
        if (!cancelled) setShow(!factors.totpEnrolled);
      } catch {
        // Best-effort. If the policy column is missing (migration
        // not applied) or the factor lookup fails, default to
        // not-show so we don't block users on infrastructure errors.
        if (!cancelled) setShow(false);
      }
    })();
    return () => { cancelled = true; };
  }, [profile?.id]);

  // Suppress on /profile so the user can enrol without being shouted at.
  const isOnProfile = location.pathname.startsWith('/profile');
  if (!show || isOnProfile) return null;

  return (
    <div
      role="alert"
      className="sticky top-0 z-50 bg-amber-500 text-amber-950 dark:bg-amber-600 dark:text-amber-50 border-b border-amber-600 px-4 py-2 flex items-center gap-3 shadow-sm"
    >
      <ShieldAlert className="h-4 w-4 shrink-0" />
      <p className="text-[13px] font-medium flex-1 min-w-0">
        <span className="font-semibold">Two-factor authentication is required.</span>{' '}
        <span className="hidden sm:inline">Your admin requires every account to enable an authenticator app. </span>
        <span className="sm:hidden">Set up your authenticator now.</span>
      </p>
      <Link
        to="/profile"
        className="text-[12.5px] font-semibold rounded-md bg-amber-950/15 hover:bg-amber-950/25 dark:bg-amber-50/15 dark:hover:bg-amber-50/25 px-2.5 py-1 kd-transition shrink-0"
      >
        Enable now
      </Link>
    </div>
  );
}
