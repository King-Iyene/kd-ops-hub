import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { SETTINGS_SINGLETON_ID } from '@/lib/transfer-safety';
import { queryKeys } from './keys';
import { useSupabaseQuery, useSupabaseMutation, useInvalidate } from './useSupabaseQuery';

// company_settings is a singleton table — one row, fixed id — same as every
// other reader in the app (Settings.tsx, Payments.tsx, DirectorDisbursements.tsx,
// etc.). There is no per-tenant filtering on this table.
//
// RLS restricts SELECT on this table to admin/finance/super_admin (see
// 20260730000004_security_hardening_pre_launch.sql — it used to leak to
// every authenticated role). This hook, though, is called from components
// mounted for every role (FuelTab's price benchmark, MfaRequiredBanner,
// etc.), so for operations/field_staff the query legitimately returns zero
// rows. .single() treats zero rows as an error (PostgREST 406) — for a
// non-privileged viewer that fired on every mount, flooding the console.
// .maybeSingle() returns null instead, which every caller already handles
// via `?? null` / optional chaining.
export function useCompanySettings() {
  const { profile } = useAuthStore();
  return useSupabaseQuery(
    queryKeys.companySettings.current(),
    () =>
      supabase
        .from('company_settings')
        .select('*')
        .eq('id', SETTINGS_SINGLETON_ID)
        .maybeSingle(),
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
        .update(updates as any)
        .eq('id', SETTINGS_SINGLETON_ID)
        .select()
        .single(),
    {
      onSuccess: () => invalidate(queryKeys.companySettings.current()),
    },
  );
}
