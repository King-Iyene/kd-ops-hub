import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';

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
