import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';

export const useAuth = () => {
  const { user, profile, loading, setUser, setLoading, fetchProfile } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user);
        fetchProfile(session.user.id).then(() => {
          setLoading(false);
        });
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        setUser(session.user);
        fetchProfile(session.user.id).then(() => {
          setLoading(false);
          const currentPath = window.location.pathname;
          if (currentPath === '/login') {
            navigate('/dashboard');
          }
        });
      } else {
        setUser(null);
        useAuthStore.getState().setProfile(null);
        setLoading(false);
        const currentPath = window.location.pathname;
        if (currentPath !== '/login') {
          navigate('/login');
        }
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  return { user, profile, loading };
};
