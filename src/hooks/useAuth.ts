import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';

/**
 * Auth bootstrap.
 *
 * This version guarantees:
 *   • One login → one redirect. We wait for the profile row to be fetched
 *     before flipping `loading: false` and triggering navigation, so the UI
 *     never flashes twice between login and dashboard.
 *   • Deactivated accounts are signed out server-side before any UI renders.
 *   • Sign-out clears state and routes the user to /login exactly once.
 */
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
      let fetched = useAuthStore.getState().profile;

      // Fix 2 — organic signup without invite: profile row may not exist yet
      // (the auth trigger only creates one if pending_invites has a match).
      // Auto-create a field_staff profile so the user never sees Unauthorized.
      if (!fetched) {
        const user = useAuthStore.getState().user;
        const email = user?.email || '';
        const fullName =
          user?.user_metadata?.full_name ||
          user?.user_metadata?.name ||
          '';
        const { error: insertErr } = await supabase.from('profiles').upsert(
          {
            id: userId,
            email,
            full_name: fullName,
            role: 'field_staff',
            status: 'active',
          },
          { onConflict: 'id' },
        );
        if (!insertErr) {
          await fetchProfile(userId);
          fetched = useAuthStore.getState().profile;
        }
      }

      if (fetched && fetched.status === 'inactive') {
        await supabase.auth.signOut();
        useAuthStore.getState().setUser(null);
        useAuthStore.getState().setProfile(null);
        setLoading(false);
        if (window.location.pathname !== '/login') {
          navigate('/login', {
            replace: true,
            state: { inactive: true },
          });
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
