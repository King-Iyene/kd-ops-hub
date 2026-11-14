import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';

export type TimetrackCapability =
  | 'manage_projects' | 'manage_tasks' | 'track_time' | 'view_others_time'
  | 'approve_timesheets' | 'manage_rates' | 'create_invoices' | 'manage_custom_fields'
  | 'manage_clients' | 'manage_planner' | 'manage_leave_types' | 'approve_leave'
  | 'manage_overtime_rules' | 'manage_budgets' | 'track_time_for_others' | 'manage_activity_tracking'
  | 'manage_expenses';

interface TimeRoleRow {
  role_key: string;
  capabilities: Record<string, boolean>;
}

/**
 * Mirrors the DB's time_has_capability(): app-wide super_admin/admin always
 * pass; everyone else needs their time_user_roles row's capability set.
 * This is a client-side convenience for UI gating only — every write still
 * goes through an RLS policy or RPC that re-checks server-side.
 */
export function useTimetrackCapabilities() {
  const { profile } = useAuthStore();
  const isAppAdmin = profile?.role === 'super_admin' || profile?.role === 'admin';

  const { data, isLoading } = useQuery({
    queryKey: ['timetrack', 'my-role', profile?.id],
    queryFn: async () => {
      if (!profile?.id) return null;
      const { data, error } = await supabase
        .from('time_user_roles')
        .select('role_key, time_roles(role_key, capabilities)')
        .eq('employee_id', profile.id)
        .maybeSingle();
      if (error) throw error;
      return (data?.time_roles as unknown as TimeRoleRow) ?? null;
    },
    enabled: !!profile?.id && !isAppAdmin,
    staleTime: 60_000,
  });

  const has = (capability: TimetrackCapability): boolean => {
    if (isAppAdmin) return true;
    return data?.capabilities?.[capability] === true;
  };

  return { has, loading: !isAppAdmin && isLoading, roleKey: isAppAdmin ? 'time_admin' : data?.role_key ?? null };
}
