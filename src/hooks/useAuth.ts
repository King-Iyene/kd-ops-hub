import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';

export const useAuth = () => {
  const { user, profile, loading, setUser, setLoading, fetchProfile } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        setUser(session.user);
        await fetchProfile(session.user.id);
        if (location.pathname === '/login') {
          navigate('/');
        }
      } else {
        setUser(null);
        useAuthStore.getState().setProfile(null);
        if (location.pathname !== '/login') {
          navigate('/login');
        }
      }
      setLoading(false);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user);
        fetchProfile(session.user.id);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  return { user, profile, loading };
};
