import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Workspace } from '../types';

export function useWorkspaces() {
  return useQuery({
    queryKey: ['nc', 'workspaces'],
    queryFn: async () => {
      const { data, error } = await supabase
        .schema('nc_meta')
        .from('workspaces')
        .select('*')
        .order('name');
      if (error) throw error;
      return data as Workspace[];
    },
  });
}
