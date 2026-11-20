-- =============================================================================
-- S5: company_settings secret columns (20261430000200_company_settings_secret_columns.sql)
--
-- Run AFTER the migration on the local replay database:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/company_settings_secret_columns.sql
-- Everything is rolled back. Needs public.company_settings, public.profiles, public.audit_logs, auth.uid() and the
-- roles anon / authenticated / service_role.
--
-- What this proves
--   1  finance (and admin) can still read every non-secret column, and update one, with and without RETURNING it
--   2  none of the secret columns can be read by signed-in users or anon: not by name, not with select *,
--      not with to_jsonb(row)
--   3  get_company_settings() gives staff the whole non-secret row (no secret key), and nothing to anyone else
--   4  get_company_settings_secrets() is for an active super_admin only, and the read is audited
--   5  the service role and SECURITY DEFINER code still see everything
--   6  company_settings_regrant_columns() makes a newly added column readable, but not a new secret-looking one
-- =============================================================================
BEGIN;

CREATE FUNCTION public.t_as(p_uid uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  RESET ROLE;
  IF p_uid IS NULL THEN PERFORM set_config('request.jwt.claim.sub', '', true); SET ROLE anon; RETURN; END IF;
  PERFORM set_config('request.jwt.claim.sub', p_uid::text, true);
  SET ROLE authenticated;
END $$;
CREATE FUNCTION public.t_eq(p_label text, p_got anyelement, p_want anyelement) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_got IS DISTINCT FROM p_want THEN RAISE EXCEPTION 'FAIL: % (got %, want %)', p_label, p_got, p_want; END IF;
END $$;
CREATE FUNCTION public.t_denied(p_sql text, p_label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  RAISE EXCEPTION 'FAIL: % was allowed', p_label;
EXCEPTION WHEN insufficient_privilege THEN RETURN;
END $$;

-- ── Fixture ────────────────────────────────────────────────────────────────
INSERT INTO public.profiles (id, email, full_name, role, status) VALUES
  ('c0000000-0000-0000-0000-000000000001', 'sue@t.local',  'Sue Super',  'super_admin', 'active'),
  ('c0000000-0000-0000-0000-000000000002', 'ada@t.local',  'Ada Admin',  'admin',       'active'),
  ('c0000000-0000-0000-0000-000000000003', 'fin@t.local',  'Fin',        'finance',     'active'),
  ('c0000000-0000-0000-0000-000000000004', 'dan@t.local',  'Dan Driver', 'field_staff', 'active'),
  ('c0000000-0000-0000-0000-000000000005', 'old@t.local',  'Old Super',  'super_admin', 'inactive');
INSERT INTO public.company_settings (id) VALUES ('00000000-0000-0000-0000-000000000001') ON CONFLICT (id) DO NOTHING;
UPDATE public.company_settings
   SET company_name = 'KD Test', vapid_private_key = 'PRIV-KEY', resend_api_key_enc = 'RESEND-KEY',
       termii_api_key_enc = 'TERMII-KEY', smtp_password_enc = 'SMTP-PW', airtable_api_key_enc = 'AIR-KEY'
 WHERE id = '00000000-0000-0000-0000-000000000001';

-- ── 1. non-secret reads and writes still work ──────────────────────────────
DO $$
DECLARE c record; n int; v text;
BEGIN
  FOREACH n IN ARRAY ARRAY[2, 3] LOOP
    PERFORM public.t_as(('c0000000-0000-0000-0000-00000000000' || n)::uuid);
    PERFORM public.t_eq('a staff user reads a non-secret column', (SELECT company_name FROM public.company_settings WHERE id = '00000000-0000-0000-0000-000000000001'), 'KD Test');
  END LOOP;
  -- every non-secret column is readable by name
  PERFORM public.t_as('c0000000-0000-0000-0000-000000000003');
  FOR c IN SELECT a.attname::text AS col FROM pg_attribute a WHERE a.attrelid = 'public.company_settings'::regclass AND a.attnum > 0 AND NOT a.attisdropped LOOP
    IF public.company_settings_is_secret_column(c.col) THEN CONTINUE; END IF;
    EXECUTE format('SELECT %I FROM public.company_settings LIMIT 1', c.col);
  END LOOP;
  PERFORM public.t_as('c0000000-0000-0000-0000-000000000002');
  UPDATE public.company_settings SET company_name = 'KD Test 2' WHERE id = '00000000-0000-0000-0000-000000000001';
  PERFORM public.t_eq('admin can still update a non-secret column', (SELECT company_name FROM public.company_settings WHERE id = '00000000-0000-0000-0000-000000000001'), 'KD Test 2');
  UPDATE public.company_settings SET company_name = 'KD Test' WHERE id = '00000000-0000-0000-0000-000000000001' RETURNING company_name INTO v;
  PERFORM public.t_eq('update ... returning a non-secret column works', v, 'KD Test');
  RESET ROLE;
  RAISE NOTICE 'PASS 1: non-secret columns still work';
END $$;

-- ── 2. secrets are not readable ────────────────────────────────────────────
DO $$
DECLARE s text; r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['finance', 'admin', 'anon'] LOOP
    PERFORM public.t_as(CASE r WHEN 'finance' THEN 'c0000000-0000-0000-0000-000000000003'::uuid WHEN 'admin' THEN 'c0000000-0000-0000-0000-000000000002'::uuid ELSE NULL END);
    FOREACH s IN ARRAY ARRAY['vapid_private_key', 'resend_api_key_enc', 'termii_api_key_enc', 'smtp_password_enc', 'airtable_api_key_enc'] LOOP
      PERFORM public.t_denied(format('SELECT %I FROM public.company_settings', s), r || ' reading ' || s);
    END LOOP;
    PERFORM public.t_denied('SELECT * FROM public.company_settings', r || ' select *');
    PERFORM public.t_denied('SELECT to_jsonb(cs) FROM public.company_settings cs', r || ' to_jsonb(row)');
    PERFORM public.t_denied('SELECT company_name FROM public.company_settings WHERE vapid_private_key IS NOT NULL', r || ' filtering on a secret');
    PERFORM public.t_denied('UPDATE public.company_settings SET company_name = company_name RETURNING *', r || ' update returning *');
  END LOOP;
  RESET ROLE;
  RAISE NOTICE 'PASS 2: secret columns unreadable';
END $$;

-- ── 3. get_company_settings ────────────────────────────────────────────────
DO $$
DECLARE j jsonb; k text;
BEGIN
  PERFORM public.t_as('c0000000-0000-0000-0000-000000000003');
  j := public.get_company_settings();
  PERFORM public.t_eq('finance gets the row', j->>'company_name', 'KD Test');
  FOREACH k IN ARRAY ARRAY['vapid_private_key', 'resend_api_key_enc', 'termii_api_key_enc', 'smtp_password_enc', 'airtable_api_key_enc'] LOOP
    PERFORM public.t_eq('no secret key in the jsonb: ' || k, j ? k, false);
  END LOOP;
  PERFORM public.t_eq('a non-secret key is there', j ? 'currency_code', true);
  PERFORM public.t_as('c0000000-0000-0000-0000-000000000004');
  PERFORM public.t_eq('field staff get nothing', public.get_company_settings(), NULL::jsonb);
  PERFORM public.t_as('c0000000-0000-0000-0000-000000000005');
  PERFORM public.t_eq('an inactive super_admin gets nothing', public.get_company_settings(), NULL::jsonb);
  PERFORM public.t_as(NULL);
  PERFORM public.t_denied('SELECT public.get_company_settings()', 'anon calling get_company_settings');
  RESET ROLE;
  RAISE NOTICE 'PASS 3: get_company_settings';
END $$;

-- ── 4. get_company_settings_secrets ────────────────────────────────────────
DO $$
DECLARE j jsonb; u text;
BEGIN
  FOREACH u IN ARRAY ARRAY['c0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000005'] LOOP
    PERFORM public.t_as(u::uuid);
    PERFORM public.t_denied('SELECT public.get_company_settings_secrets()', 'secrets for ' || u);
  END LOOP;
  PERFORM public.t_as(NULL);
  PERFORM public.t_denied('SELECT public.get_company_settings_secrets()', 'secrets for anon');
  PERFORM public.t_as('c0000000-0000-0000-0000-000000000001');
  j := public.get_company_settings_secrets();
  PERFORM public.t_eq('super_admin reads the push private key', j->>'vapid_private_key', 'PRIV-KEY');
  PERFORM public.t_eq('and the SMTP password', j->>'smtp_password_enc', 'SMTP-PW');
  PERFORM public.t_eq('only secret keys come back', j ? 'company_name', false);
  RESET ROLE;
  PERFORM public.t_eq('the read is audited', (SELECT count(*) FROM public.audit_logs WHERE action_type = 'company_secrets_read' AND performed_by = 'c0000000-0000-0000-0000-000000000001'), 1::bigint);
  RAISE NOTICE 'PASS 4: secrets are super_admin only';
END $$;

-- ── 5. service role and definer code keep working ──────────────────────────
CREATE FUNCTION public.t_definer_reader() RETURNS text LANGUAGE sql SECURITY DEFINER AS $$ SELECT vapid_private_key FROM public.company_settings LIMIT 1 $$;
GRANT EXECUTE ON FUNCTION public.t_definer_reader() TO authenticated;
DO $$
BEGIN
  SET LOCAL ROLE service_role;
  PERFORM public.t_eq('service role reads a secret', (SELECT vapid_private_key FROM public.company_settings LIMIT 1), 'PRIV-KEY');
  RESET ROLE;
  PERFORM public.t_as('c0000000-0000-0000-0000-000000000003');
  PERFORM public.t_eq('a definer function reads a secret for its caller', public.t_definer_reader(), 'PRIV-KEY');
  RESET ROLE;
  RAISE NOTICE 'PASS 5: service role and definer code';
END $$;

-- ── 6. a column added later ────────────────────────────────────────────────
DO $$
BEGIN
  ALTER TABLE public.company_settings ADD COLUMN t_new_setting text DEFAULT 'x', ADD COLUMN t_new_api_token text DEFAULT 'tok';
  PERFORM public.t_as('c0000000-0000-0000-0000-000000000003');
  PERFORM public.t_denied('SELECT t_new_setting FROM public.company_settings', 'a new column before regrant');
  RESET ROLE;
  PERFORM public.company_settings_regrant_columns();
  PERFORM public.company_settings_regrant_columns();   -- idempotent
  PERFORM public.t_as('c0000000-0000-0000-0000-000000000003');
  PERFORM public.t_eq('after regrant the new setting is readable', (SELECT t_new_setting FROM public.company_settings LIMIT 1), 'x');
  PERFORM public.t_denied('SELECT t_new_api_token FROM public.company_settings', 'a new token-looking column');
  PERFORM public.t_eq('and it stays out of get_company_settings', public.get_company_settings() ? 't_new_api_token', false);
  RESET ROLE;
  RAISE NOTICE 'PASS 6: regrant';
END $$;

ROLLBACK;
SELECT 'ok' AS company_settings_secret_columns;
