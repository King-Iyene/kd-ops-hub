import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export interface TaskWorkspace {
  id: string;
  name: string;
  slug: string;
}

export function useTaskWorkspace() {
  return useQuery({
    queryKey: ['tk', 'workspace'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tk_workspaces')
        .select('id, name, slug')
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as TaskWorkspace | null;
    },
  });
}

export type TaskRole = 'owner' | 'admin' | 'manager' | 'member';

/** The viewer's real workspace role (owner, admin, manager, member), per
 *  tk_role_of — section 9.2. Reflects the account's actual DB permission,
 *  not the platform's super-admin "view as" simulation. */
export function useTaskRole() {
  return useQuery({
    queryKey: ['tk', 'role'],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('tk_role_of');
      if (error) throw error;
      return data as TaskRole;
    },
  });
}

export function isTaskAdmin(role: TaskRole | undefined): boolean {
  return role === 'owner' || role === 'admin';
}
