import { supabase } from '@/lib/supabase';
import { queryKeys } from './keys';
import { useSupabaseQuery } from './useSupabaseQuery';

interface Department {
  id: string;
  name: string;
  head_id: string | null;
  created_at: string;
}

export function useDepartments() {
  return useSupabaseQuery<Department[]>(
    queryKeys.departments.list(),
    () =>
      supabase
        .from('departments')
        .select('id, name, head_id, created_at')
        .order('name'),
    { staleTime: 60_000 },
  );
}
