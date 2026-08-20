import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { SETTINGS_SINGLETON_ID } from '@/lib/transfer-safety';
import { queryKeys } from './keys';
import { useSupabaseQuery, useSupabaseMutation, useInvalidate } from './useSupabaseQuery';

// company_settings is a singleton table — one row, fixed id — same as every
// other reader in the app (Settings.tsx, Payments.tsx, DirectorDisbursements.tsx,
// etc.). There is no per-tenant filtering on this table.
export function useCompanySettings() {
  const { profile } = useAuthStore();
  return useSupabaseQuery(
    queryKeys.companySettings.current(),
    () =>
      supabase
        .from('company_settings')
        .select('*')
        .eq('id', SETTINGS_SINGLETON_ID)
        .single(),
    {
      enabled: !!profile,
      staleTime: 60_000,
    },
  );
}

export function useUpdateCompanySettings() {
  const invalidate = useInvalidate();
  return useSupabaseMutation(
    (updates: Record<string, unknown>) =>
      supabase
        .from('company_settings')
        .update(updates)
        .eq('id', SETTINGS_SINGLETON_ID)
        .select()
        .single(),
    {
      onSuccess: () => invalidate(queryKeys.companySettings.current()),
    },
  );
}
