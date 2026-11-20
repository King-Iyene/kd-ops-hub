-- Rollback for 20261430000200_company_settings_secret_columns.sql
-- Restores the table-level SELECT grant (so `select *` works for staff again, secret columns included, which is
-- the state this migration was written to close) and drops the helper functions.
GRANT SELECT ON public.company_settings TO anon, authenticated;
DROP FUNCTION IF EXISTS public.get_company_settings_secrets();
DROP FUNCTION IF EXISTS public.get_company_settings();
DROP FUNCTION IF EXISTS public.company_settings_regrant_columns();
DROP FUNCTION IF EXISTS public.company_settings_is_secret_column(text);
NOTIFY pgrst, 'reload schema';
