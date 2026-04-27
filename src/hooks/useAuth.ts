import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { logAudit } from '@/lib/audit';

export const useAuth = () => {
  const { user, profile, loading, setUser, setLoading, fetchProfile } =
    useAuthStore();
  const navigate = useNavigate();
  const didInit = useRef(false);

  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;

    const finish = async (userId: string, redirectIfLogin: boolean) => {
      await fetchProfile(userId);
      const fetched = useAuthStore.getState().profile;

      // No profile row found. Before rejecting, try the self-healing RPC which
      // creates the profile from pending_invites. This handles cases where the
      // DB trigger failed (e.g. the auth user already existed before the trigger
      // was fixed, or a race condition). The RPC raises an exception for users
      // who have no pending invite, so only legitimate invited users get through.
      if (!fetched) {
        const { error: activateErr } = await supabase.rpc('activate_my_profile');
        if (!activateErr) {
          await fetchProfile(userId);
          const healed = useAuthStore.getState().profile;
          if (healed) {
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

  return { user, profile, loading };
};
