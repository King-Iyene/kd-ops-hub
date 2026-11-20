import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Database } from '@/integrations/supabase/types';
import { useAuthStore } from '@/store/authStore';
import { SETTINGS_SINGLETON_ID } from '@/lib/transfer-safety';
import { queryKeys } from './keys';
import { useSupabaseMutation, useInvalidate } from './useSupabaseQuery';

/**
 * The secret columns of company_settings (push private key, stored email/SMS/SMTP/Airtable keys). Signed-in users
 * cannot read them (20261430000200_company_settings_secret_columns.sql revokes the column privileges), so
 * `select('*')` on the table fails for them. Never list these in a select; only a Super Admin can fetch them, via
 * the get_company_settings_secrets() RPC.
 */
export const COMPANY_SETTINGS_SECRET_COLUMNS = [
  'vapid_private_key',
  'resend_api_key_enc',
  'termii_api_key_enc',
  'smtp_password_enc',
  'airtable_api_key_enc',
  'paystack_secret_key_enc',
] as const;

type SecretColumn = (typeof COMPANY_SETTINGS_SECRET_COLUMNS)[number];
export type CompanySettings = Omit<Database['public']['Tables']['company_settings']['Row'], SecretColumn>;

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
//
// The row comes from the get_company_settings() RPC (every non-secret column, staff roles only, NULL for anyone
// else) rather than `select('*')`, which fails for a role that lacks the secret columns.
export function useCompanySettings() {
  const { profile } = useAuthStore();
  return useQuery<CompanySettings | null, Error>({
    queryKey: queryKeys.companySettings.current(),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_company_settings' as never);
      if (error) throw new Error(error.message);
      return (data ?? null) as unknown as CompanySettings | null;
    },
    enabled: !!profile,
    staleTime: 60_000,
  });
}

export function useUpdateCompanySettings() {
  const invalidate = useInvalidate();
  return useSupabaseMutation(
    (updates: Record<string, unknown>) =>
      supabase
        .from('company_settings')
        .update(updates as any)
        .eq('id', SETTINGS_SINGLETON_ID),
    {
      onSuccess: () => invalidate(queryKeys.companySettings.current()),
    },
  );
}
