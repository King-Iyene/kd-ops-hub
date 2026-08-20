import { supabase } from '@/lib/supabase';
import { queryKeys } from './keys';
import { useSupabaseQuery } from './useSupabaseQuery';

export function useContractors() {
  return useSupabaseQuery(
    queryKeys.contractors.list(),
    () =>
      supabase
        .from('contractors')
        .select('*')
        .order('name'),
    { staleTime: 30_000 },
  );
}

export function useContractorDetail(id: string | undefined) {
  return useSupabaseQuery(
    queryKeys.contractors.detail(id || ''),
    () =>
      supabase
        .from('contractors')
        .select('*')
        .eq('id', id!)
        .single(),
    { enabled: !!id },
  );
}
