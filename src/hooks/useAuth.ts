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
  const loginAuditLogged = useRef(false);

  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;

    // A magic-link / invite-link redirect (see ResetPassword.tsx, which
    // lands SIGNED_IN users from signInWithOtp() there) carries its auth
    // tokens in the URL hash. supabase-js's detectSessionInUrl parses that
    // hash and fires SIGNED_IN as part of client construction, which can
    // happen before this effect subscribes below — the same race
    // ResetPassword.tsx guards against with its own getSession() fallback
    // (line ~67 there). When that race is lost here, the SIGNED_IN branch
    // below never runs and the login goes completely unaudited even though
    // the user is fully signed in. Captured once, synchronously, before any
    // await in this effect gets a chance to let the hash go stale.
    const hasFreshAuthRedirect = /access_token=/.test(window.location.hash);

    // Logs the login exactly once, however the session was actually
    // established (a live SIGNED_IN event, or the getSession() bootstrap
    // below catching one that already fired). Waits for the profile to
    // finish loading rather than trusting a fixed delay — a blind 800ms
    // guess is routinely too short for a first-time self-heal profile
    // fetch (activate_my_profile RPC + retries), which silently dropped
    // the audit entry for genuine, successful logins.
    const logLoginOnceProfileReady = () => {
      if (loginAuditLogged.current) return;
      loginAuditLogged.current = true;
      const alreadyLoaded = useAuthStore.getState().profile;
      if (alreadyLoaded) {
        logAudit('user_logged_in', `User ${alreadyLoaded.full_name || alreadyLoaded.email} signed in`, alreadyLoaded);
        return;
      }
      const unsubscribe = useAuthStore.subscribe((state) => {
        if (state.profile) {
          logAudit('user_logged_in', `User ${state.profile.full_name || state.profile.email} signed in`, state.profile);
          unsubscribe();
        }
      });
      // Safety cap so this never leaks a live subscription if the profile
      // fetch fails outright (fail-open path in finish() below keeps the
      // session but never sets a profile).
      window.setTimeout(unsubscribe, 15_000);
    };

    // True while a Supabase refresh token is still persisted in storage. A 429
    // on /auth/v1/token (project-level rate limit) means "retry later", not
    // "signed out" — so while this is true we must keep the user logged in and
    // let auto-refresh recover, never tearing the session down.
    const hasPersistedSession = () => {
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && /^sb-.*-auth-token$/.test(k)) {
            const v = localStorage.getItem(k);
            if (v && v.includes('refresh_token')) return true;
          }
        }
      } catch { /* localStorage blocked — fall through */ }
      return false;
    };

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
        useAuthStore.getState().setProfileFetchFailed(true);
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
      // A getSession error at load is usually a transient refresh failure
      // (e.g. 429). Do NOT signOut() — that wipes the persisted session. If a
      // refresh token is still stored, keep the user and let auto-refresh
      // recover; only fall back to /login when storage has no session at all.
      if (sessionError) {
        console.warn('[KDOps] session error:', sessionError.message);
        if (hasPersistedSession()) {
          setLoading(false);
          return;
        }
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
        // Redirect from /login when an existing session is found — without
        // this, getSession() sets the user in the store but never navigates,
        // and the subsequent SIGNED_IN event (from a fresh signInWithPassword
        // call) gets suppressed as a "same user" rehydration, deadlocking
        // the user on the login page with no error.
        finish(session.user.id, window.location.pathname === '/login');
        // The SIGNED_IN event for this session may have already fired
        // (and been missed — see hasFreshAuthRedirect above) before we got
        // here. If the URL still carries the redirect's auth tokens, this
        // is a genuine fresh login landing, not a plain page revisit with
        // a persisted session — audit it now instead of losing it silently.
        if (hasFreshAuthRedirect) {
          logLoginOnceProfileReady();
        }
      } else {
        setLoading(false);
      }
    });

    // A null session arrived from a NON-user-initiated event (a failed/raced
    // token refresh — almost always a 429 rate-limit on /auth/v1/token, which
    // is a PROJECT-level limit shared by everyone, or the GoTrue lock timing out
    // under concurrent refreshes). A 429 means "retry later", NOT "signed out".
    //
    // The decisive rule: as long as a refresh token is still persisted in
    // storage, the user is NOT logged out — we keep them in place and let the
    // SDK's auto-refresh recover once the rate-limit window clears. We only
    // redirect to /login when storage genuinely has no session (a real sign-out
    // elsewhere). And we NEVER call supabase.auth.signOut() here, which would
    // wipe the shared session and cascade the logout to every tab.
    const recoverOrLogout = async () => {
      for (let attempt = 0; attempt < 3; attempt++) {
        await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
        const { data: { session: s } } = await supabase.auth.getSession();
        if (s?.user) {
          setUser(s.user);
          finish(s.user.id, false);
          return;
        }
      }
      // Couldn't refresh (e.g. sustained 429). If the refresh token is still
      // in storage, DO NOT log out — unblock the UI and let auto-refresh retry.
      if (hasPersistedSession()) {
        console.warn('[KDOps] token refresh rate-limited (429); keeping session, will auto-recover');
        setLoading(false);
        return;
      }
      console.warn('[KDOps] no persisted session; redirecting to login');
      setUser(null);
      useAuthStore.getState().setProfile(null);
      setLoading(false);
      if (window.location.pathname !== '/login') {
        navigate('/login', { replace: true });
      }
    };

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
      // avoid running finish() (and its signOut fallback) on an active session,
      // but NOT on /login — a user explicitly submitting the login form must
      // always trigger the redirect flow even when getSession() already loaded
      // the same user.
      if (
        event === 'SIGNED_IN' &&
        session?.user &&
        useAuthStore.getState().user?.id === session.user.id &&
        window.location.pathname !== '/login'
      ) {
        return;
      }
      // Token refresh failure / rotation race — try to recover the shared
      // session before logging out (see recoverOrLogout). Never proactively
      // signOut() here; that would evict every other tab too.
      if (event === 'TOKEN_REFRESHED' && !session) {
        void recoverOrLogout();
        return;
      }
      if (session?.user) {
        setUser(session.user);
        // Wait for the profile row before releasing the UI.
        finish(session.user.id, true);
        // Login audit — only on a fresh sign-in (event === SIGNED_IN with
        // no prior user; rehydration is suppressed earlier in this branch).
        if (event === 'SIGNED_IN') {
          logLoginOnceProfileReady();
        }
      } else if (event === 'SIGNED_OUT') {
        // Explicit, user-initiated sign-out — go straight to login.
        setUser(null);
        useAuthStore.getState().setProfile(null);
        setLoading(false);
        if (window.location.pathname !== '/login') {
          navigate('/login', { replace: true });
        }
      } else {
        // Any other event arriving with no session (e.g. USER_UPDATED after a
        // raced refresh) — attempt recovery rather than an abrupt logout.
        void recoverOrLogout();
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
