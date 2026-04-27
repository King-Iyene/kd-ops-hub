import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import type { User } from '@supabase/supabase-js';

export type UserRole =
  | 'super_admin'
  | 'admin'
  | 'finance'
  | 'operations'
  | 'field_staff'
  | 'driver';

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  phone?: string | null;
  status?: string;
  created_at?: string;
}

/** sessionStorage key for the Super Admin role-simulation override. */
const VIEW_AS_KEY = 'kdops:viewAsRole';

const loadViewAs = (): UserRole | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(VIEW_AS_KEY);
    return raw ? (raw as UserRole) : null;
  } catch {
    return null;
  }
};

interface AuthState {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  profileLoading: boolean;
  /**
   * Super Admin role-simulation override. When set, the sidebar and
   * RoleGuard treat the user as having this role. Never persisted to the
   * database — only to sessionStorage so a refresh keeps the view.
   */
  viewAsRole: UserRole | null;
  setUser: (user: User | null) => void;
  setProfile: (profile: Profile | null) => void;
  setLoading: (loading: boolean) => void;
  setViewAsRole: (role: UserRole | null) => void;
  signOut: () => Promise<void>;
  fetchProfile: (userId: string) => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  profile: null,
  loading: true,
  profileLoading: false,
  viewAsRole: loadViewAs(),
  setUser: (user) => set({ user }),
  setProfile: (profile) => set({ profile }),
  setLoading: (loading) => set({ loading }),
  setViewAsRole: (role) => {
    // Only Super Admin can simulate — ignore calls from anyone else.
    const actualRole = get().profile?.role;
    if (actualRole !== 'super_admin' && role !== null) {
      return;
    }
    if (typeof window !== 'undefined') {
      try {
        if (role) window.sessionStorage.setItem(VIEW_AS_KEY, role);
        else window.sessionStorage.removeItem(VIEW_AS_KEY);
      } catch {
        /* ignore */
      }
    }
    set({ viewAsRole: role });
  },
  signOut: async () => {
    // Tear down realtime channels first so no late events fire after the
    // session is gone (would otherwise log "Not authenticated" warnings).
    try {
      await supabase.removeAllChannels();
    } catch {
      /* ignore */
    }
    await supabase.auth.signOut();
    if (typeof window !== 'undefined') {
      try {
        window.sessionStorage.removeItem(VIEW_AS_KEY);
      } catch {
        /* ignore */
      }
    }
    set({ user: null, profile: null, viewAsRole: null });
  },
  fetchProfile: async (userId: string) => {
    set({ profileLoading: true });
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    if (error) {
      console.error('[KDOps] fetchProfile error:', error.message, error);
    }
    if (data) {
      set({ profile: data as Profile, profileLoading: false });
    } else {
      // No profile row found — still unblock the UI.
      set({ profileLoading: false });
    }
  },
}));

/**
 * Hook returning the currently effective role for UI checks.
 * For Super Admin users this honours any active "View As" simulation.
 */
export const useEffectiveRole = (): UserRole | undefined => {
  const profile = useAuthStore((s) => s.profile);
  const viewAs = useAuthStore((s) => s.viewAsRole);
  if (profile?.role === 'super_admin' && viewAs) return viewAs;
  return profile?.role;
};
