import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';
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
  photo_url?: string | null;
  permissions?: Record<string, boolean> | null;
  /** The tenant this user belongs to. Defaults to the seed tenant
   *  (00000000-0000-0000-0000-000000000001) for legacy KD Squares
   *  staff; brand-new self-signup tenants get their own UUID. */
  tenant_id?: string | null;
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
  /**
   * Set when the user has signed in but still needs to satisfy an MFA
   * challenge before the app unlocks. Cleared on successful verify or
   * sign-out. The MfaChallengeDialog watches this to render itself.
   */
  mfaPending: { factorId: string } | null;
  setUser: (user: User | null) => void;
  setProfile: (profile: Profile | null) => void;
  setLoading: (loading: boolean) => void;
  setViewAsRole: (role: UserRole | null) => void;
  setMfaPending: (v: { factorId: string } | null) => void;
  signOut: () => Promise<void>;
  /**
   * Loads the profile row for `userId` and reports the outcome so callers can
   * tell apart the three very different cases:
   *   'ok'        — row loaded into state.
   *   'not_found' — query succeeded but there is genuinely no row.
   *   'error'     — the query itself failed (network / RLS / transient).
   * The distinction matters: only 'not_found' should trigger the invite-only
   * sign-out path. An 'error' must NEVER sign a valid user out.
   */
  fetchProfile: (userId: string) => Promise<'ok' | 'not_found' | 'error'>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  profile: null,
  loading: true,
  profileLoading: false,
  viewAsRole: loadViewAs(),
  mfaPending: null,
  setUser: (user) => set({ user }),
  setProfile: (profile) => set({ profile }),
  setLoading: (loading) => set({ loading }),
  setMfaPending: (v) => set({ mfaPending: v }),
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
    // Log BEFORE signOut, while we still have an authed session that can
    // write to audit_logs. Best-effort — never block sign-out on it.
    const profile = get().profile;
    if (profile?.id) {
      try {
        await logAudit('user_logged_out', `User ${profile.full_name || profile.email} signed out`, profile);
      } catch {
        /* ignore */
      }
    }
    // Tear down realtime channels so no late events fire after the
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
    // maybeSingle() returns { data: null, error: null } for zero rows (a real
    // "no profile" case) and only sets `error` on an actual query failure. With
    // single() a transient failure and a missing row both surfaced as an error,
    // so the caller couldn't tell them apart — and treated a network blip as
    // "user not invited", signing valid employees out.
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    if (error) {
      console.error('[KDOps] fetchProfile error:', error.message, error);
      set({ profileLoading: false });
      return 'error';
    }
    if (data) {
      set({ profile: data as Profile, profileLoading: false });
      return 'ok';
    }
    set({ profileLoading: false });
    return 'not_found';
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
