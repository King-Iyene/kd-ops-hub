-- =============================================================================
-- S5: only a Super Admin (or the service role) can read the secret columns of company_settings
--
-- company_settings is one row of company-wide settings. Its RLS policy (company_settings_read_staff,
-- 20260730000004) lets super_admin, admin and finance read the whole row, and the table-level SELECT grant on
-- authenticated covers every column. So finance could read, with a plain `select *`:
--   vapid_private_key     the web-push signing key
--   resend_api_key_enc    email provider key
--   termii_api_key_enc    SMS provider key
--   smtp_password_enc     SMTP password
--   airtable_api_key_enc  Airtable key
-- (paystack_secret_key_enc was dropped in 20261123000002.) Nothing in the app reads these from the browser: the
-- push key is read by the send-push edge function and written by vapid-keys, both with the service role.
--
-- Fix, in three parts:
--   1. Column privileges. SELECT on the whole table is revoked from anon and authenticated and granted back
--      for every column EXCEPT the secret ones. The service role, the table owner and SECURITY DEFINER
--      functions are unaffected (edge functions and RPCs keep working). A secret column is recognised by
--      name: the explicit list below, or a suffix _enc / _private_key / _password / _secret_key / _token.
--   2. public.get_company_settings(): the whole non-secret row as jsonb, for staff (super_admin, admin,
--      finance, the same people the RLS policy lets in). The app uses it instead of `select *`, which now
--      fails for roles that lack some column.
--   3. public.get_company_settings_secrets(): the secret columns, for an active super_admin only, written to
--      audit_logs on every call.
--
-- WHEN A COLUMN IS ADDED TO company_settings: a new column has no grant, so signed-in users cannot read it
-- until public.company_settings_regrant_columns() is called. Call it at the end of any migration that adds a
-- column (a vitest test fails the build if a later migration forgets).
--
-- Rollback: supabase/rollbacks/20261430_company_settings_secret_columns_down.sql
-- =============================================================================

-- The one place that decides what is secret. IMMUTABLE so the planner can fold it.
CREATE OR REPLACE FUNCTION public.company_settings_is_secret_column(p_column text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT p_column = ANY (ARRAY[
           'vapid_private_key', 'resend_api_key_enc', 'termii_api_key_enc',
           'smtp_password_enc', 'airtable_api_key_enc', 'paystack_secret_key_enc'
         ])
      OR p_column ~ '(_enc|_private_key|_password|_secret_key|_token)$';
$$;

-- Grants SELECT on every non-secret column to anon + authenticated (RLS still decides which rows), and none on
-- the secret ones. Idempotent: safe to call again after a column is added.
CREATE OR REPLACE FUNCTION public.company_settings_regrant_columns()
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_cols text;
BEGIN
  SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY a.attnum)
    INTO v_cols
    FROM pg_attribute a
   WHERE a.attrelid = 'public.company_settings'::regclass
     AND a.attnum > 0
     AND NOT a.attisdropped
     AND NOT public.company_settings_is_secret_column(a.attname::text);

  -- Revoking the table-level privilege also removes every column-level one.
  EXECUTE 'REVOKE SELECT ON public.company_settings FROM PUBLIC, anon, authenticated';
  EXECUTE format('GRANT SELECT (%s) ON public.company_settings TO anon, authenticated', v_cols);
  NOTIFY pgrst, 'reload schema';
END;
$$;

REVOKE ALL ON FUNCTION public.company_settings_regrant_columns() FROM PUBLIC, anon, authenticated;

SELECT public.company_settings_regrant_columns();

-- The non-secret row, for staff. Mirrors company_settings_read_staff: super_admin / admin / finance, and the
-- caller must be active. Anyone else gets NULL (the same "no row" a blocked select gave).
CREATE OR REPLACE FUNCTION public.get_company_settings()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_row jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
       SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid() AND p.status = 'active' AND p.role IN ('super_admin', 'admin', 'finance')
     ) THEN
    RETURN NULL;
  END IF;

  SELECT coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
    INTO v_row
    FROM public.company_settings cs,
         LATERAL jsonb_each(to_jsonb(cs)) e
   WHERE cs.id = '00000000-0000-0000-0000-000000000001'
     AND NOT public.company_settings_is_secret_column(e.key);

  RETURN CASE WHEN v_row = '{}'::jsonb THEN NULL ELSE v_row END;
END;
$$;

REVOKE ALL ON FUNCTION public.get_company_settings() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_company_settings() TO authenticated;

-- The secret columns, for an active super_admin only. Every call is audited.
CREATE OR REPLACE FUNCTION public.get_company_settings_secrets()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_name text;
  v_row  jsonb;
BEGIN
  SELECT p.full_name INTO v_name
    FROM public.profiles p
   WHERE p.id = auth.uid() AND p.status = 'active' AND p.role = 'super_admin';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Only a Super Admin can read company secrets' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
    INTO v_row
    FROM public.company_settings cs,
         LATERAL jsonb_each(to_jsonb(cs)) e
   WHERE cs.id = '00000000-0000-0000-0000-000000000001'
     AND public.company_settings_is_secret_column(e.key);

  INSERT INTO public.audit_logs (action_type, description, performed_by, performed_by_name)
  VALUES ('company_secrets_read', 'Company settings secret columns were read', auth.uid(), v_name);

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.get_company_settings_secrets() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_company_settings_secrets() TO authenticated;
