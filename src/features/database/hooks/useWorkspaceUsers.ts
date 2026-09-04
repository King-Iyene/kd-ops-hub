import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export interface WorkspaceUser {
  id: string;
  email: string;
  full_name: string;
}

export function useWorkspaceUsers() {
  return useQuery({
    queryKey: ['nc', 'workspace-users'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, email, full_name')
        .not('email', 'is', null)
        .order('full_name');
      if (error) throw error;
      return (data ?? []) as WorkspaceUser[];
    },
    staleTime: 5 * 60 * 1000,
  });
}
