import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { queryKeys } from './keys';
import { useSupabaseQuery, useSupabaseMutation, useInvalidate } from './useSupabaseQuery';

export function useCompanySettings() {
  const { profile } = useAuthStore();
  return useSupabaseQuery(
    queryKeys.companySettings.current(),
    () =>
      supabase
        .from('company_settings')
        .select('*')
        .eq('company_id', profile?.company_id ?? '')
        .single(),
    {
      enabled: !!profile?.company_id,
      staleTime: 60_000,
    },
  );
}

export function useUpdateCompanySettings() {
  const { profile } = useAuthStore();
  const invalidate = useInvalidate();
  return useSupabaseMutation(
    (updates: Record<string, unknown>) =>
      supabase
        .from('company_settings')
        .update(updates)
        .eq('company_id', profile?.company_id ?? '')
        .select()
        .single(),
    {
      onSuccess: () => invalidate(queryKeys.companySettings.current()),
    },
  );
}
