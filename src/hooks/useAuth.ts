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

      // No profile row at all → self-registered user, not invited.
      // Users with a profile row but no role yet (freshly invited) are allowed through.
      // Exception: invite/signup flows and recently-created profiles are allowed through.
      if (!fetched) {
        const url = window.location.href;
        const isInviteFlow =
          url.includes('type=invite') ||
          url.includes('type=signup') ||
          url.includes('access_token');
        const createdAt = fetched?.created_at
          ? new Date(fetched.created_at).getTime()
          : 0;
        const isNewProfile = createdAt > 0 && Date.now() - createdAt < 86_400_000;

        if (isInviteFlow || isNewProfile) {
          setLoading(false);
          return;
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
