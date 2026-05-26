import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { logAudit } from '@/lib/audit';
import { listMfaFactors, isDeviceTrusted } from '@/lib/mfa';

export const useAuth = () => {
  const { user, profile, loading, setUser, setLoading, fetchProfile } =
    useAuthStore();
  const navigate = useNavigate();
  const didInit = useRef(false);

  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;

    const finish = async (userId: string, redirectIfLogin: boolean) => {
      let result = await fetchProfile(userId);

      // Transient fetch failure (network / RLS blip): retry with backoff before
      // doing anything destructive. A failed profile fetch must NEVER sign a
      // valid user out — that was the cause of employees being bounced to
      // /login?message=invite-only on a perfectly good session.
      for (let attempt = 0; result === 'error' && attempt < 3; attempt++) {
        await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
        result = await fetchProfile(userId);
      }

      // ── MFA challenge gate ─────────────────────────────────────────────
      // If the user opted into TOTP and this device isn't trusted, block
      // the UI on a challenge. The dialog (mounted in App.tsx) clears
      // mfaPending on success. Failure → user is signed out by the dialog.
      try {
        const f = await listMfaFactors();
        if (f.totpEnrolled && f.factorId) {
          const trusted = await isDeviceTrusted();
          if (!trusted) {
            useAuthStore.getState().setMfaPending({ factorId: f.factorId });
            // Don't release the loading flag yet — MfaChallengeDialog will
            // call setMfaPending(null) + setLoading(false) on success.
            return;
          }
        }
      } catch (e) {
        // If the MFA check itself errors, fail open: log and continue. The
        // alternative is locking the user out on a transient network blip.
        console.warn('[KDOps] MFA check failed:', e);
      }

      // Profile fetch still failing after retries — fail OPEN, never closed.
      // Keep the session intact so a transient backend hiccup can't lock a
      // legitimate employee out. The realtime profile listener (and any later
      // navigation / refresh) will recover the row once the backend responds.
      if (result === 'error') {
        console.warn(
          '[KDOps] profile fetch failed repeatedly; keeping session to avoid a false logout',
        );
        setLoading(false);
        return;
      }

      // result is now 'ok' or 'not_found'. On 'ok' the store holds the row;
      // on 'not_found' this is null and we fall into the self-heal path below.
      const fetched = useAuthStore.getState().profile;

      // result === 'not_found': the query succeeded and there is genuinely no
      // profile row. Before rejecting, try the self-healing RPC which creates
      // the profile from pending_invites. This handles cases where the DB
      // trigger failed (e.g. the auth user already existed before the trigger
      // was fixed, or a race condition). The RPC raises an exception for users
      // who have no pending invite, so only legitimate invited users get through.
      if (!fetched) {
        const { error: activateErr } = await supabase.rpc('activate_my_profile');
        if (!activateErr) {
          const healed = await fetchProfile(userId);
          if (healed === 'ok' && useAuthStore.getState().profile) {
            setLoading(false);
            if (redirectIfLogin && window.location.pathname === '/login') {
              navigate('/dashboard', { replace: true });
            }
            return;
          }
        }

        await supabase.auth.signOut();
        setUser(null);
        useAuthStore.getState().setProfile(null);
        setLoading(false);
        navigate('/login?message=invite-only', { replace: true });
        return;
      }

      if (fetched.status !== 'active') {
        setLoading(false);
        if (window.location.pathname !== '/unauthorized') {
          navigate('/unauthorized', { replace: true });
        }
        return;
      }

      setLoading(false);
      if (redirectIfLogin && window.location.pathname === '/login') {
        navigate('/dashboard', { replace: true });
      }
    };

    supabase.auth.getSession().then(({ data: { session }, error: sessionError }) => {
      // Bug 2 fix — expired or invalid refresh token.
      if (sessionError) {
        console.warn('[KDOps] session error:', sessionError.message);
        supabase.auth.signOut().then(() => {
          setUser(null);
          useAuthStore.getState().setProfile(null);
          setLoading(false);
          if (window.location.pathname !== '/login') {
            navigate('/login', { replace: true });
          }
        });
        return;
      }
      if (session?.user) {
        setUser(session.user);
        finish(session.user.id, false);
      } else {
        setLoading(false);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION') {
        return;
      }
      // Silent background JWT refresh — Supabase already persisted the new
      // token; no profile re-fetch or navigation needed.
      if (event === 'TOKEN_REFRESHED' && session) {
        return;
      }
      // SIGNED_IN while the same user is already active — Supabase fires this
      // on tab focus / session rehydration in some SDK versions. Suppress it to
      // avoid running finish() (and its signOut fallback) on an active session.
      if (
        event === 'SIGNED_IN' &&
        session?.user &&
        useAuthStore.getState().user?.id === session.user.id
      ) {
        return;
      }
      // Bug 2 — token refresh failure, sign out cleanly.
      if (event === 'TOKEN_REFRESHED' && !session) {
        supabase.auth.signOut();
        setUser(null);
        useAuthStore.getState().setProfile(null);
        setLoading(false);
        if (window.location.pathname !== '/login') {
          navigate('/login', { replace: true });
        }
        return;
      }
      if (session?.user) {
        setUser(session.user);
        // Wait for the profile row before releasing the UI.
        finish(session.user.id, true);
        // Login audit — only on a fresh sign-in (event === SIGNED_IN with
        // no prior user; rehydration is suppressed earlier in this branch).
        if (event === 'SIGNED_IN') {
          (async () => {
            // Best-effort delay so the profile fetch can populate
            // performed_by_name. Never block on it.
            setTimeout(() => {
              const p = useAuthStore.getState().profile;
              if (p) {
                logAudit('user_logged_in', `User ${p.full_name || p.email} signed in`, p);
              }
            }, 800);
          })();
        }
      } else {
        setUser(null);
        useAuthStore.getState().setProfile(null);
        setLoading(false);
        if (window.location.pathname !== '/login') {
          navigate('/login', { replace: true });
        }
      }
    });

    return () => subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Realtime profile listener — when an admin updates this user's row
  // (permissions, role, status), refetch immediately so the UI reflects
  // the change without forcing a sign-out/sign-in. Without this, an
  // operator who's just been granted "payments.create" sees nothing
  // until their next session.
  const userId = user?.id;
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`profile:${userId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` },
        () => { void fetchProfile(userId); },
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [userId, fetchProfile]);

  return { user, profile, loading };
};
