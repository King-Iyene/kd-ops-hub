import { supabase } from '@/lib/supabase';
import { queryKeys } from './keys';
import { useSupabaseQuery } from './useSupabaseQuery';

export interface Company {
  id: string;
  name: string;
  short_code: string;
  rc_number: string | null;
  tin: string | null;
  address: string | null;
  default_state: string | null;
  pencom_employer_code: string | null;
  nhf_employer_code: string | null;
  nsitf_employer_code: string | null;
  itf_employer_code: string | null;
  color: string;
  is_active: boolean;
}

/**
 * Every real company payroll is run for through this KDOps instance (KD
 * Squares, NDI, ...). Ordered by created_at so the first-seeded company (KD
 * Squares) is always first — used as the default selection wherever a
 * company switcher needs to pick one before the user has chosen.
 */
export function useCompanies() {
  return useSupabaseQuery<Company[]>(
    queryKeys.companies.list(),
    () =>
      supabase
        .from('companies')
        .select('id, name, short_code, rc_number, tin, address, default_state, pencom_employer_code, nhf_employer_code, nsitf_employer_code, itf_employer_code, color, is_active')
        .eq('is_active', true)
        .order('created_at'),
    { staleTime: 60_000 },
  );
}
