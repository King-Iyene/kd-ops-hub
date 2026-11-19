-- =============================================================================
-- Ops Agent Phase 1 — contract tests
--
-- Run against a database AFTER migrations 20261408000000 .. 20261408000500:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/agent_foundation.sql
--
-- Everything is rolled back. A failed check raises "FAIL: ..." and stops the run.
-- Needs roles anon / authenticated / service_role and auth.uid() reading
-- request.jwt.claim.sub (a stock Supabase database has both).
--
-- What this proves
--   1  only Super Admin and Admin pass agent_can_access(); only Super Admin passes agent_can_configure()
--   2  every configure action is refused for an Admin (settings, scope, modules, people, rules, connections, keys)
--   3  an Admin limited to one company cannot see another company's flags, events, summaries or people profiles
--   4  an Admin cannot see flags about themselves, about other Admins, or about leadership (and the settings switch that)
--   5  a module that is switched off hides its flags; a sensitive module cannot be switched on
--   6  the reader role can read agent_read views and nothing else, and cannot write anywhere
--   7  activity captures reach the reader as a domain only
--   8  the AI budget guard goes ok -> warn (80%) -> off (100%)
--   9  configuration changes are audited, the audit log is Super Admin wide / Admin own, key hashes never logged or readable
--   10 memory proposals by Admins wait for a Super Admin; chat threads are private
--   11 "Fill from pay groups and placements" never overwrites a group set by hand
-- =============================================================================

BEGIN;

-- ── test helpers (rolled back with everything else) ──────────────────────────
CREATE FUNCTION public.t_fail(msg text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'FAIL: %', msg; END $$;
-- Runs a statement as the current role and checks it fails with the given SQLSTATE (or any error when NULL).
CREATE FUNCTION public.t_denied(sql text, label text, code text DEFAULT NULL) RETURNS void LANGUAGE plpgsql AS $$
DECLARE n bigint;
BEGIN
  EXECUTE sql;
  GET DIAGNOSTICS n = ROW_COUNT;
  -- Row level security filters an UPDATE or DELETE down to zero rows rather than raising an error.
  IF sql ~* '^\s*(update|delete)' AND n = 0 THEN RETURN; END IF;
  RAISE EXCEPTION 'FAIL: % was allowed', label;
EXCEPTION
  WHEN OTHERS THEN
    IF SQLERRM LIKE 'FAIL:%' THEN RAISE; END IF;
    IF code IS NOT NULL AND SQLSTATE <> code THEN RAISE EXCEPTION 'FAIL: % failed with % (%), expected %', label, SQLSTATE, SQLERRM, code; END IF;
END $$;
CREATE FUNCTION public.t_count(sql text) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE n integer; BEGIN EXECUTE 'SELECT count(*) FROM (' || sql || ') q' INTO n; RETURN n; END $$;
CREATE FUNCTION public.t_ids(sql text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE r text; BEGIN EXECUTE 'SELECT coalesce(string_agg(x::text, '','' ORDER BY x::text), '''') FROM (' || sql || ') q(x)' INTO r; RETURN r; END $$;
CREATE FUNCTION public.t_as(uid uuid) RETURNS void LANGUAGE sql AS $$ SELECT set_config('request.jwt.claim.sub', coalesce(uid::text, ''), false) $$;

-- ── cast ────────────────────────────────────────────────────────────────────
INSERT INTO auth.users (id, email) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'super@t.local'),
  ('a0000000-0000-0000-0000-000000000002', 'admin.kd@t.local'),
  ('a0000000-0000-0000-0000-000000000003', 'admin.all@t.local'),
  ('a0000000-0000-0000-0000-000000000004', 'ops@t.local'),
  ('a0000000-0000-0000-0000-000000000005', 'staff.kd@t.local'),
  ('a0000000-0000-0000-0000-000000000006', 'staff.ndi@t.local'),
  ('a0000000-0000-0000-0000-000000000007', 'leader.kd@t.local'),
  ('a0000000-0000-0000-0000-000000000008', 'inactive.admin@t.local'),
  ('a0000000-0000-0000-0000-000000000009', 'nogroup@t.local'),
  ('a0000000-0000-0000-0000-00000000000a', 'director@t.local')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.companies (id, name, short_code) VALUES
  ('c0000000-0000-0000-0000-000000000001', 'KD Squares Ltd', 'KDS'),
  ('c0000000-0000-0000-0000-000000000002', 'NDI', 'NDI');
INSERT INTO public.pay_groups (id, name, company_id) VALUES
  ('e0000000-0000-0000-0000-000000000001', 'KDS - Administrative (Excluding Directors)', 'c0000000-0000-0000-0000-000000000001'),
  ('e0000000-0000-0000-0000-000000000002', 'NDI Staffs', 'c0000000-0000-0000-0000-000000000002'),
  ('e0000000-0000-0000-0000-000000000003', 'KDS - Directors', 'c0000000-0000-0000-0000-000000000001');

INSERT INTO public.profiles (id, email, full_name, role, status, pay_group_id, reporting_manager_id) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'super@t.local',     'Sue Super',    'super_admin', 'active',   'e0000000-0000-0000-0000-000000000001', NULL),
  ('a0000000-0000-0000-0000-000000000002', 'admin.kd@t.local',  'Ada KD',       'admin',       'active',   'e0000000-0000-0000-0000-000000000001', NULL),
  ('a0000000-0000-0000-0000-000000000003', 'admin.all@t.local', 'Abel All',     'admin',       'active',   'e0000000-0000-0000-0000-000000000001', NULL),
  ('a0000000-0000-0000-0000-000000000004', 'ops@t.local',       'Opal Ops',     'operations',  'active',   'e0000000-0000-0000-0000-000000000001', NULL),
  ('a0000000-0000-0000-0000-000000000005', 'staff.kd@t.local',  'Kemi Staff',   'operations',  'active',   'e0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002'),
  ('a0000000-0000-0000-0000-000000000006', 'staff.ndi@t.local', 'Nuhu Staff',   'operations',  'active',   'e0000000-0000-0000-0000-000000000002', NULL),
  ('a0000000-0000-0000-0000-000000000007', 'leader.kd@t.local', 'Leo Leader',   'operations',  'active',   'e0000000-0000-0000-0000-000000000003', NULL),
  ('a0000000-0000-0000-0000-000000000008', 'inactive.admin@t.local', 'Ina Inactive', 'admin',  'inactive', 'e0000000-0000-0000-0000-000000000001', NULL),
  ('a0000000-0000-0000-0000-000000000009', 'nogroup@t.local',   'Nia Nopay',    'operations',  'active',   NULL, NULL),
  ('a0000000-0000-0000-0000-00000000000a', 'director@t.local',  'Dina Director','operations',  'active',   'e0000000-0000-0000-0000-000000000003', NULL)
ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, status = EXCLUDED.status, pay_group_id = EXCLUDED.pay_group_id,
  full_name = EXCLUDED.full_name, reporting_manager_id = EXCLUDED.reporting_manager_id;

-- Scope as the app would set it (done by the postgres owner here)
INSERT INTO public.agent_company_scope (company_id, enabled) VALUES
  ('c0000000-0000-0000-0000-000000000001', true), ('c0000000-0000-0000-0000-000000000002', true)
ON CONFLICT (company_id) DO UPDATE SET enabled = true;
INSERT INTO public.agent_admin_scope (admin_id, company_ids) VALUES
  ('a0000000-0000-0000-0000-000000000002', ARRAY['c0000000-0000-0000-0000-000000000001']::uuid[]);
INSERT INTO public.agent_person_profile (person_id, group_name, group_source) VALUES
  ('a0000000-0000-0000-0000-000000000007', 'leadership', 'manual');

-- Flags about different subjects
INSERT INTO public.agent_flags (id, company_id, module, rule_code, subject_type, subject_id, person_id, title) VALUES
  ('f0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'task', 'TK01', 'person', 'p1', 'a0000000-0000-0000-0000-000000000005', 'KD staff overdue'),
  ('f0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002', 'task', 'TK01', 'person', 'p2', 'a0000000-0000-0000-0000-000000000006', 'NDI staff overdue'),
  ('f0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001', 'task', 'TK01', 'person', 'p3', 'a0000000-0000-0000-0000-000000000003', 'about Abel (an Admin)'),
  ('f0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000001', 'task', 'TK01', 'person', 'p4', 'a0000000-0000-0000-0000-000000000007', 'about leadership'),
  ('f0000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000001', 'payroll', 'XX01', 'person', 'p5', 'a0000000-0000-0000-0000-000000000005', 'payroll module (off)'),
  ('f0000000-0000-0000-0000-000000000006', NULL, 'task', 'SY03', 'system', 'sys', NULL, 'system flag, no company');
INSERT INTO public.agent_rules (code, title) VALUES ('TK01', 'Overdue');
INSERT INTO public.agent_feature_proposals (kind, subject) VALUES ('new_table', 'x_table');
INSERT INTO public.agent_connections (kind, name) VALUES ('slack', 'Slack');
INSERT INTO public.agent_domain_list (domain, category) VALUES ('example.org', 'approved');
INSERT INTO public.agent_flag_events (flag_id, kind) VALUES
  ('f0000000-0000-0000-0000-000000000001', 'created'), ('f0000000-0000-0000-0000-000000000002', 'created');
INSERT INTO public.agent_summaries (period_kind, period_start, period_end, company_id, narrative) VALUES
  ('day', current_date, current_date, 'c0000000-0000-0000-0000-000000000001', 'KD'),
  ('day', current_date, current_date, 'c0000000-0000-0000-0000-000000000002', 'NDI');

-- The authenticated role needs the usual table privileges on the business tables used below (stock Supabase has them).
GRANT SELECT ON public.profiles, public.pay_groups, public.companies TO authenticated;

-- ═════ 1. who passes the gates ════════════════════════════════════════════
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
      ('a0000000-0000-0000-0000-000000000001'::uuid, true,  true,  'super admin'),
      ('a0000000-0000-0000-0000-000000000002'::uuid, true,  false, 'admin'),
      ('a0000000-0000-0000-0000-000000000004'::uuid, false, false, 'operations'),
      ('a0000000-0000-0000-0000-000000000008'::uuid, false, false, 'inactive admin'),
      (NULL::uuid,                                   false, false, 'nobody signed in')
    ) AS t(uid, can_access, can_configure, who)
  LOOP
    PERFORM set_config('request.jwt.claim.sub', coalesce(r.uid::text, ''), true);
    IF public.agent_can_access() IS DISTINCT FROM r.can_access THEN RAISE EXCEPTION 'FAIL: agent_can_access for %', r.who; END IF;
    IF public.agent_can_configure() IS DISTINCT FROM r.can_configure THEN RAISE EXCEPTION 'FAIL: agent_can_configure for %', r.who; END IF;
  END LOOP;
  RAISE NOTICE 'PASS 1: only Super Admin and Admin pass access; only Super Admin passes configure; inactive accounts pass nothing';
END $$;

-- ═════ 2. Operations member: nothing at all ═══════════════════════════════
SET ROLE authenticated;
SELECT public.t_as('a0000000-0000-0000-0000-000000000004');
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['agent_settings', 'agent_flags', 'agent_flag_events', 'agent_summaries', 'agent_rules', 'agent_module_access',
    'agent_company_scope', 'agent_person_profile', 'agent_memory', 'agent_connections', 'agent_ai_usage', 'agent_audit_log', 'agent_feature_proposals']
  LOOP
    IF public.t_count('SELECT 1 FROM public.' || t) <> 0 THEN RAISE EXCEPTION 'FAIL: operations member can read %', t; END IF;
  END LOOP;
  PERFORM public.t_denied('UPDATE public.agent_settings SET mode = ''enforce''', 'member updating settings') ;
  PERFORM public.t_denied($q$INSERT INTO public.agent_memory (type, content, status) VALUES ('fact', 'x', 'active')$q$, 'member writing memory', '42501');
  PERFORM public.t_denied($q$INSERT INTO public.agent_chat_threads (user_id) VALUES ('a0000000-0000-0000-0000-000000000004')$q$, 'member opening a chat', '42501');
  IF public.agent_company_of('a0000000-0000-0000-0000-000000000005') IS NOT NULL THEN RAISE EXCEPTION 'FAIL: a member can look up a person''s company'; END IF;
  PERFORM public.t_denied('SELECT public.agent_suggest_person_profiles()', 'member calling suggest', '42501');
  PERFORM public.t_denied('SELECT public.agent_seed_domains()', 'member calling seed domains', '42501');
  PERFORM public.t_denied('SELECT public.agent_ai_budget_state()', 'member reading budget state', '42501');
  PERFORM public.t_denied($q$SELECT public.agent_audit('x')$q$, 'member writing audit', '42501');
  RAISE NOTICE 'PASS 2: a member reads nothing, writes nothing and cannot call any agent function';
END $$;
RESET ROLE;
DO $$ BEGIN
  IF (SELECT mode FROM public.agent_settings) <> 'observe' THEN RAISE EXCEPTION 'FAIL: a member changed settings'; END IF;
END $$;

-- ═════ 3. Admin limited to KD Squares ═════════════════════════════════════
SET ROLE authenticated;
SELECT public.t_as('a0000000-0000-0000-0000-000000000002');
DO $$
BEGIN
  IF public.t_ids('SELECT right(id::text, 1) FROM public.agent_flags') <> '1' THEN
    RAISE EXCEPTION 'FAIL: limited admin sees flags %', public.t_ids('SELECT right(id::text, 1) FROM public.agent_flags');
  END IF;
  IF public.t_count('SELECT 1 FROM public.agent_flag_events') <> 1 THEN RAISE EXCEPTION 'FAIL: limited admin sees events of an NDI flag'; END IF;
  IF public.t_ids('SELECT narrative FROM public.agent_summaries') <> 'KD' THEN RAISE EXCEPTION 'FAIL: limited admin sees another company''s summary'; END IF;
  IF public.t_count('SELECT 1 FROM public.agent_settings') <> 1 THEN RAISE EXCEPTION 'FAIL: admin cannot read settings'; END IF;
  RAISE NOTICE 'PASS 3: an Admin limited to KD Squares sees only KD flags, events and summaries (not NDI, not company-less system flags)';
END $$;

-- 2 (continued): every configure action is refused for an Admin
DO $$
BEGIN
  PERFORM public.t_denied($q$UPDATE public.agent_settings SET mode = 'enforce'$q$, 'admin changing mode');
  PERFORM public.t_denied($q$UPDATE public.agent_settings SET ai_enabled = true$q$, 'admin enabling AI');
  PERFORM public.t_denied($q$INSERT INTO public.agent_company_scope (company_id, enabled) VALUES (gen_random_uuid(), true)$q$, 'admin adding company scope', '42501');
  PERFORM public.t_denied($q$UPDATE public.agent_module_access SET enabled = false$q$, 'admin switching a module');
  PERFORM public.t_denied($q$INSERT INTO public.agent_admin_scope (admin_id) VALUES ('a0000000-0000-0000-0000-000000000003')$q$, 'admin editing scopes', '42501');
  PERFORM public.t_denied($q$UPDATE public.agent_person_profile SET group_name = 'core'$q$, 'admin editing people');
  PERFORM public.t_denied($q$UPDATE public.agent_rules SET enabled = true$q$, 'admin editing rules');
  PERFORM public.t_denied($q$INSERT INTO public.agent_connections (kind, name) VALUES ('slack', 'x')$q$, 'admin adding a connection', '42501');
  PERFORM public.t_denied($q$INSERT INTO public.agent_identity_map (person_id) VALUES ('a0000000-0000-0000-0000-000000000005')$q$, 'admin mapping identities', '42501');
  PERFORM public.t_denied($q$INSERT INTO public.agent_domain_list (domain, category) VALUES ('x.com', 'approved')$q$, 'admin editing domains', '42501');
  PERFORM public.t_denied($q$UPDATE public.agent_feature_proposals SET status = 'ignored'$q$, 'admin deciding proposals');
  PERFORM public.t_denied('SELECT public.agent_suggest_person_profiles()', 'admin calling suggest', '42501');
  PERFORM public.t_denied('SELECT public.agent_seed_domains()', 'admin calling seed domains', '42501');
  PERFORM public.t_denied($q$INSERT INTO public.agent_flags (rule_code, subject_type, subject_id, title) VALUES ('X', 'system', 'x', 'x')$q$, 'admin creating a flag', '42501');
  PERFORM public.t_denied($q$UPDATE public.agent_flags SET status = 'handled'$q$, 'admin editing a flag directly');
  PERFORM public.t_denied($q$INSERT INTO public.agent_ai_usage (feature, model) VALUES ('x', 'x')$q$, 'admin writing usage', '42501');
  PERFORM public.t_denied($q$SELECT public.agent_log_ai_usage('x', 'm', 1, 0, 0, 1, 0.1)$q$, 'admin logging usage', '42501');
  PERFORM public.t_denied($q$SELECT public.agent_audit_write('a0000000-0000-0000-0000-000000000001', 'forged')$q$, 'admin writing an audit row as someone else', '42501');
  PERFORM public.t_denied($q$SELECT key_hash FROM public.agent_api_keys$q$, 'admin reading key hashes', '42501');
  RAISE NOTICE 'PASS 2b: every configure action and every agent-only write is refused for an Admin';
END $$;
RESET ROLE;
DO $$
BEGIN
  IF (SELECT mode FROM public.agent_settings) <> 'observe' OR (SELECT ai_enabled FROM public.agent_settings) THEN RAISE EXCEPTION 'FAIL: an admin changed settings'; END IF;
END $$;

-- ═════ 4. Admin who sees every company ═══════════════════════════════════
SET ROLE authenticated;
SELECT public.t_as('a0000000-0000-0000-0000-000000000003');
DO $$
BEGIN
  IF public.t_ids('SELECT right(id::text, 1) FROM public.agent_flags') <> '1,2,6' THEN
    RAISE EXCEPTION 'FAIL: unrestricted admin sees flags % (expected 1,2,6: not about self, not about leadership, not a switched-off module)', public.t_ids('SELECT right(id::text, 1) FROM public.agent_flags');
  END IF;
  RAISE NOTICE 'PASS 4: an Admin cannot see flags about themselves or about leadership; a switched-off module hides its flags';
END $$;
RESET ROLE;

-- The other Admin's flag about Abel (an Admin) stays Super Admin only
SET ROLE authenticated;
SELECT public.t_as('a0000000-0000-0000-0000-000000000002');
DO $$ BEGIN
  IF public.t_count('SELECT 1 FROM public.agent_flags WHERE id = ''f0000000-0000-0000-0000-000000000003''') <> 0 THEN RAISE EXCEPTION 'FAIL: an Admin sees a flag about another Admin'; END IF;
  RAISE NOTICE 'PASS 4b: flags about any Admin are Super Admin only';
END $$;

-- ═════ Super Admin sees all, and configures ═══════════════════════════════
SELECT public.t_as('a0000000-0000-0000-0000-000000000001');
DO $$
BEGIN
  IF public.t_count('SELECT 1 FROM public.agent_flags') <> 6 THEN RAISE EXCEPTION 'FAIL: super admin does not see all flags'; END IF;
  UPDATE public.agent_settings SET mode = 'remind', hide_own_flags = false;
  UPDATE public.agent_settings SET leadership_flags_super_admin_only = false;
  RAISE NOTICE 'PASS: Super Admin sees every flag and can change settings';
END $$;

-- 4 (continued): the two switches open those flags up to Admins
SELECT public.t_as('a0000000-0000-0000-0000-000000000003');
DO $$
BEGIN
  IF public.t_ids('SELECT right(id::text, 1) FROM public.agent_flags') <> '1,2,3,4,6' THEN
    RAISE EXCEPTION 'FAIL: with both switches off an admin sees % (expected 1,2,3,4,6)', public.t_ids('SELECT right(id::text, 1) FROM public.agent_flags');
  END IF;
  RAISE NOTICE 'PASS 4c: hide_own_flags and leadership_flags_super_admin_only control exactly those flags';
END $$;
SELECT public.t_as('a0000000-0000-0000-0000-000000000001');
UPDATE public.agent_settings SET hide_own_flags = true, leadership_flags_super_admin_only = true, mode = 'observe';

-- ═════ 5. modules ═════════════════════════════════════════════════════════
DO $$
BEGIN
  PERFORM public.t_denied($q$UPDATE public.agent_module_access SET enabled = true WHERE module_key = 'payroll'$q$, 'switching on a sensitive module');
  BEGIN
    UPDATE public.agent_module_access SET enabled = true WHERE module_key = 'payroll';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'module_locked' THEN RAISE EXCEPTION 'FAIL: wrong error for a locked module: %', SQLERRM; END IF;
  END;
  UPDATE public.agent_module_access SET enabled = false WHERE module_key = 'task';
END $$;
SELECT public.t_as('a0000000-0000-0000-0000-000000000003');
DO $$ BEGIN
  IF public.t_count('SELECT 1 FROM public.agent_flags WHERE module = ''task''') <> 0 THEN RAISE EXCEPTION 'FAIL: admin still sees flags of a module that was switched off'; END IF;
  RAISE NOTICE 'PASS 5: a sensitive module cannot be switched on; switching a module off hides its flags from Admins';
END $$;
SELECT public.t_as('a0000000-0000-0000-0000-000000000001');
UPDATE public.agent_module_access SET enabled = true WHERE module_key = 'task';
RESET ROLE;

-- ═════ 6 and 7. the reader role ═══════════════════════════════════════════
INSERT INTO public.time_activity_logs (employee_id, captured_at, app_name, url, window_title, productivity_category, active_seconds, window_seconds)
VALUES
  ('a0000000-0000-0000-0000-000000000005', now(), 'Chrome', 'https://www.Example.com/secret/path?token=abc', 'Private window title', 'neutral', 30, 60),
  ('a0000000-0000-0000-0000-000000000005', now(), 'Chrome', 'github.com:443/org/repo', 'Repo', 'productive', 30, 60),
  ('a0000000-0000-0000-0000-000000000005', now(), 'Notepad', NULL, 'Untitled', 'neutral', 10, 60);

INSERT INTO public.tm_folders (id, name) VALUES ('d0000000-0000-0000-0000-000000000001', 'S');
INSERT INTO public.tm_tables (id, folder_id, name) VALUES
  ('d0000000-0000-0000-0000-0000000000a1', 'd0000000-0000-0000-0000-000000000001', 'Report'),
  ('d0000000-0000-0000-0000-0000000000a2', 'd0000000-0000-0000-0000-000000000001', 'Something else');
INSERT INTO public.tm_table_records (table_id, data) VALUES
  ('d0000000-0000-0000-0000-0000000000a1', '{"x": 1}'), ('d0000000-0000-0000-0000-0000000000a2', '{"y": 2}');
UPDATE public.agent_settings SET report_table_id = 'd0000000-0000-0000-0000-0000000000a1';

SET ROLE ops_agent_reader;
DO $$
DECLARE d text;
BEGIN
  IF public.t_count('SELECT 1 FROM agent_read.v_people') < 5 THEN RAISE EXCEPTION 'FAIL: reader cannot read v_people'; END IF;
  IF public.t_count('SELECT 1 FROM agent_read.v_companies') <> 2 THEN RAISE EXCEPTION 'FAIL: reader cannot read v_companies'; END IF;
  PERFORM public.t_count('SELECT 1 FROM agent_read.v_tasks');
  PERFORM public.t_count('SELECT 1 FROM agent_read.v_leave');
  PERFORM public.t_count('SELECT 1 FROM agent_read.v_time_entries');

  -- nothing outside agent_read
  PERFORM public.t_denied('SELECT 1 FROM public.profiles', 'reader reading profiles', '42501');
  PERFORM public.t_denied('SELECT 1 FROM public.tm_tasks', 'reader reading tm_tasks', '42501');
  PERFORM public.t_denied('SELECT 1 FROM public.time_activity_logs', 'reader reading raw activity', '42501');
  PERFORM public.t_denied('SELECT 1 FROM public.agent_settings', 'reader reading agent_settings', '42501');
  PERFORM public.t_denied('SELECT 1 FROM public.agent_flags', 'reader reading agent_flags', '42501');
  PERFORM public.t_denied('SELECT 1 FROM public.agent_api_keys', 'reader reading agent_api_keys', '42501');

  -- no sensitive columns in the views
  PERFORM public.t_denied('SELECT salary_ngn FROM agent_read.v_people', 'salary in v_people', '42703');
  PERFORM public.t_denied('SELECT bank_account_number FROM agent_read.v_people', 'bank number in v_people', '42703');
  PERFORM public.t_denied('SELECT nin FROM agent_read.v_people', 'NIN in v_people', '42703');
  PERFORM public.t_denied('SELECT email FROM agent_read.v_people', 'email in v_people', '42703');
  PERFORM public.t_denied('SELECT url FROM agent_read.v_activity_domains', 'URL in v_activity_domains', '42703');
  PERFORM public.t_denied('SELECT window_title FROM agent_read.v_activity_domains', 'window title in v_activity_domains', '42703');
  PERFORM public.t_denied('SELECT notes FROM agent_read.v_time_entries', 'notes in v_time_entries', '42703');

  -- it cannot write anywhere
  PERFORM public.t_denied($q$INSERT INTO agent_read.v_companies (id, name) VALUES (gen_random_uuid(), 'x')$q$, 'reader INSERT into a view', '42501');
  PERFORM public.t_denied($q$UPDATE agent_read.v_companies SET name = 'x'$q$, 'reader UPDATE a view', '42501');
  PERFORM public.t_denied($q$DELETE FROM agent_read.v_companies$q$, 'reader DELETE from a view', '42501');
  PERFORM public.t_denied($q$INSERT INTO public.tm_tasks (list_id, title) VALUES (gen_random_uuid(), 'x')$q$, 'reader INSERT into tm_tasks', '42501');
  PERFORM public.t_denied($q$UPDATE public.tm_tasks SET title = 'x'$q$, 'reader UPDATE tm_tasks', '42501');
  PERFORM public.t_denied($q$DELETE FROM public.tm_tasks$q$, 'reader DELETE from tm_tasks', '42501');
  PERFORM public.t_denied($q$INSERT INTO public.agent_flags (rule_code, subject_type, subject_id, title) VALUES ('X', 'system', 'x', 'x')$q$, 'reader INSERT into agent_flags', '42501');
  PERFORM public.t_denied($q$DROP VIEW agent_read.v_companies$q$, 'reader DROP VIEW', '42501');
  PERFORM public.t_denied($q$CREATE TABLE public.t_reader_made (a int)$q$, 'reader CREATE TABLE', '42501');
  PERFORM public.t_denied($q$TRUNCATE public.tm_tasks$q$, 'reader TRUNCATE', '42501');
  RAISE NOTICE 'PASS 6: the reader role reads agent_read views only, sees no sensitive column, and INSERT / UPDATE / DELETE / DDL all fail';

  -- the domain only
  IF public.t_ids('SELECT domain FROM agent_read.v_activity_domains WHERE domain IS NOT NULL') <> 'example.com,github.com' THEN
    RAISE EXCEPTION 'FAIL: domains % (expected example.com,github.com)', public.t_ids('SELECT domain FROM agent_read.v_activity_domains WHERE domain IS NOT NULL');
  END IF;
  IF public.t_count('SELECT 1 FROM agent_read.v_activity_domains WHERE domain IS NULL') <> 1 THEN RAISE EXCEPTION 'FAIL: capture without url should have a null domain'; END IF;
  RAISE NOTICE 'PASS 7: activity reaches the reader as a domain only (www, path, query and port are stripped)';

  -- reports: only the chosen table
  IF public.t_count('SELECT 1 FROM agent_read.v_report_rows') <> 1 THEN RAISE EXCEPTION 'FAIL: v_report_rows should hold only the report table'; END IF;
  RAISE NOTICE 'PASS: v_report_rows holds only the report table chosen in settings';
END $$;
RESET ROLE;

-- ═════ 8. AI budget guard ═════════════════════════════════════════════════
SET ROLE authenticated;
SELECT public.t_as('a0000000-0000-0000-0000-000000000002');
DO $$ BEGIN
  IF public.agent_ai_budget_state() ->> 'level' <> 'ok' THEN RAISE EXCEPTION 'FAIL: budget should start ok'; END IF;
END $$;
RESET ROLE;
UPDATE public.agent_settings SET daily_ai_budget_usd = 1, monthly_ai_budget_usd = 100;
SELECT public.agent_log_ai_usage('test', 'claude-haiku-5-5', 1000, 0, 0, 100, 0.85);
DO $$ BEGIN
  IF public.agent_ai_budget_state() ->> 'level' <> 'warn' THEN RAISE EXCEPTION 'FAIL: 85%% of the daily budget should warn, got %', public.agent_ai_budget_state(); END IF;
END $$;
SELECT public.agent_log_ai_usage('test', 'claude-haiku-5-5', 1000, 0, 0, 100, 0.15);
DO $$ BEGIN
  IF public.agent_ai_budget_state() ->> 'level' <> 'off' THEN RAISE EXCEPTION 'FAIL: 100%% of the daily budget should switch AI off, got %', public.agent_ai_budget_state(); END IF;
END $$;
UPDATE public.agent_settings SET daily_ai_budget_usd = 1000, monthly_ai_budget_usd = 1;
DO $$ BEGIN
  IF public.agent_ai_budget_state() ->> 'level' <> 'off' THEN RAISE EXCEPTION 'FAIL: the monthly budget should switch AI off too'; END IF;
END $$;
UPDATE public.agent_settings SET daily_ai_budget_usd = 5, monthly_ai_budget_usd = 50;
DELETE FROM public.agent_ai_usage;
DO $$ BEGIN RAISE NOTICE 'PASS 8: the budget guard goes ok -> warn at 80%% -> off at 100%% (daily and monthly)'; END $$;

-- ═════ 9. audit ══════════════════════════════════════════════════════════
SELECT public.t_as(NULL); -- setup rows below are made by the database owner, not by a person
DELETE FROM public.agent_audit_log;
INSERT INTO public.agent_api_keys (id, name, key_prefix, key_hash) VALUES ('b0000000-0000-0000-0000-000000000001', 'n8n', 'kda_abcd', 'SECRETHASH');
SET ROLE authenticated;
SELECT public.t_as('a0000000-0000-0000-0000-000000000001');
UPDATE public.agent_settings SET mode = 'remind', operating_rules = repeat('long ', 500);
UPDATE public.agent_api_keys SET revoked_at = now() WHERE id = 'b0000000-0000-0000-0000-000000000001';
UPDATE public.agent_company_scope SET enabled = false WHERE company_id = 'c0000000-0000-0000-0000-000000000002';
UPDATE public.agent_company_scope SET enabled = true WHERE company_id = 'c0000000-0000-0000-0000-000000000002';
SELECT public.agent_audit('chat.tool_call', 'thread', 'abc', '{"tool":"get_tasks"}');
DO $$
DECLARE d jsonb;
BEGIN
  SELECT detail INTO d FROM public.agent_audit_log WHERE action = 'update:agent_settings' ORDER BY id DESC LIMIT 1;
  IF d IS NULL OR d -> 'mode' ->> 'to' <> 'remind' OR d -> 'mode' ->> 'from' <> 'observe' THEN RAISE EXCEPTION 'FAIL: settings change not audited with old and new value (%)', d; END IF;
  IF length(d -> 'operating_rules' ->> 'to') > 305 THEN RAISE EXCEPTION 'FAIL: long text should be shortened in the audit log'; END IF;
  IF public.t_count('SELECT 1 FROM public.agent_audit_log WHERE action = ''update:agent_company_scope''') <> 2 THEN RAISE EXCEPTION 'FAIL: scope changes not audited'; END IF;
  IF public.t_count('SELECT 1 FROM public.agent_audit_log WHERE action = ''chat.tool_call'' AND actor_id = ''a0000000-0000-0000-0000-000000000001''') <> 1 THEN RAISE EXCEPTION 'FAIL: agent_audit did not record the actor'; END IF;
  IF public.t_count('SELECT 1 FROM public.agent_audit_log WHERE detail::text LIKE ''%SECRETHASH%''') <> 0 THEN RAISE EXCEPTION 'FAIL: an API key hash was written to the audit log'; END IF;
  IF public.t_count('SELECT 1 FROM public.agent_audit_log WHERE action = ''update:agent_api_keys''') <> 1 THEN RAISE EXCEPTION 'FAIL: key revocation not audited'; END IF;
  RAISE NOTICE 'PASS 9a: settings, scope and key changes are audited with who, old and new value; long text shortened; key hash never logged';
END $$;
SELECT public.agent_audit('admin.own', 'x', 'y');
SELECT public.t_as('a0000000-0000-0000-0000-000000000002');
SELECT public.agent_audit('admin.own', 'x', 'y');
DO $$ BEGIN
  IF public.t_count('SELECT 1 FROM public.agent_audit_log') <> 1 THEN RAISE EXCEPTION 'FAIL: an Admin should see only their own audit rows, saw %', public.t_count('SELECT 1 FROM public.agent_audit_log'); END IF;
  RAISE NOTICE 'PASS 9b: Super Admin reads the whole audit log, an Admin only their own actions';
END $$;
RESET ROLE;
UPDATE public.agent_settings SET mode = 'observe', operating_rules = (SELECT operating_rules FROM public.agent_settings);

-- ═════ 10. memory and chat ════════════════════════════════════════════════
SET ROLE authenticated;
SELECT public.t_as('a0000000-0000-0000-0000-000000000002');
DO $$
BEGIN
  INSERT INTO public.agent_memory (type, content, status, proposed_by) VALUES ('exemption', 'Kemi is exempt from Track', 'proposed', 'a0000000-0000-0000-0000-000000000002');
  PERFORM public.t_denied($q$INSERT INTO public.agent_memory (type, content, status) VALUES ('fact', 'sneaky', 'active')$q$, 'admin activating memory directly', '42501');
  PERFORM public.t_denied($q$INSERT INTO public.agent_memory (type, content, status, proposed_by) VALUES ('fact', 'as someone else', 'proposed', 'a0000000-0000-0000-0000-000000000001')$q$, 'admin proposing as someone else', '42501');
  UPDATE public.agent_memory SET status = 'active';
  IF (SELECT status FROM public.agent_memory LIMIT 1) <> 'proposed' THEN RAISE EXCEPTION 'FAIL: an Admin approved a memory'; END IF;
  INSERT INTO public.agent_chat_threads (user_id, title) VALUES ('a0000000-0000-0000-0000-000000000002', 'mine');
  PERFORM public.t_denied($q$INSERT INTO public.agent_chat_threads (user_id) VALUES ('a0000000-0000-0000-0000-000000000003')$q$, 'admin opening a chat as someone else', '42501');
END $$;
SELECT public.t_as('a0000000-0000-0000-0000-000000000003');
DO $$ BEGIN
  IF public.t_count('SELECT 1 FROM public.agent_memory') <> 0 THEN RAISE EXCEPTION 'FAIL: another Admin sees a proposal that is not active'; END IF;
  IF public.t_count('SELECT 1 FROM public.agent_chat_threads') <> 0 THEN RAISE EXCEPTION 'FAIL: another Admin sees my chat'; END IF;
END $$;
SELECT public.t_as('a0000000-0000-0000-0000-000000000001');
DO $$ BEGIN
  IF public.t_count('SELECT 1 FROM public.agent_memory') <> 1 THEN RAISE EXCEPTION 'FAIL: Super Admin cannot see the proposal'; END IF;
  UPDATE public.agent_memory SET status = 'active', approved_by = 'a0000000-0000-0000-0000-000000000001';
END $$;
SELECT public.t_as('a0000000-0000-0000-0000-000000000003');
DO $$ BEGIN
  IF public.t_count('SELECT 1 FROM public.agent_memory') <> 1 THEN RAISE EXCEPTION 'FAIL: an active memory should be visible to Admins'; END IF;
  RAISE NOTICE 'PASS 10: Admin proposals wait for a Super Admin; approved memory is shared; chat threads are private';
END $$;
RESET ROLE;

-- ═════ 11. Fill from pay groups and placements ═══════════════════════════
INSERT INTO public.agent_person_profile (person_id, group_name, group_source) VALUES
  ('a0000000-0000-0000-0000-000000000006', 'placement', 'manual')
ON CONFLICT (person_id) DO UPDATE SET group_name = 'placement', group_source = 'manual';
SET ROLE authenticated;
SELECT public.t_as('a0000000-0000-0000-0000-000000000001');
DO $$
DECLARE r jsonb;
BEGIN
  r := public.agent_suggest_person_profiles();
  IF (SELECT group_name FROM public.agent_person_profile WHERE person_id = 'a0000000-0000-0000-0000-000000000006') <> 'placement' THEN
    RAISE EXCEPTION 'FAIL: a group set by hand was overwritten';
  END IF;
  IF (SELECT group_name FROM public.agent_person_profile WHERE person_id = 'a0000000-0000-0000-0000-00000000000a') <> 'leadership' THEN
    RAISE EXCEPTION 'FAIL: the Directors pay group should be leadership';
  END IF;
  IF (SELECT group_name FROM public.agent_person_profile WHERE person_id = 'a0000000-0000-0000-0000-000000000005') <> 'core' THEN
    RAISE EXCEPTION 'FAIL: a KD Squares person should be core';
  END IF;
  IF (SELECT manager_id FROM public.agent_person_profile WHERE person_id = 'a0000000-0000-0000-0000-000000000005') <> 'a0000000-0000-0000-0000-000000000002' THEN
    RAISE EXCEPTION 'FAIL: the manager should come from reporting_manager_id';
  END IF;
  IF EXISTS (SELECT 1 FROM public.agent_person_profile WHERE person_id = 'a0000000-0000-0000-0000-000000000009') THEN
    RAISE EXCEPTION 'FAIL: someone with no pay group has no company and should be skipped';
  END IF;
  IF (r ->> 'skipped_no_company')::int < 1 THEN RAISE EXCEPTION 'FAIL: skipped_no_company should count the person without a pay group'; END IF;
  IF EXISTS (SELECT 1 FROM public.agent_person_profile WHERE person_id = 'a0000000-0000-0000-0000-000000000008') THEN
    RAISE EXCEPTION 'FAIL: an inactive person should not be profiled';
  END IF;
  -- running it again changes nothing that was set by hand
  PERFORM public.agent_suggest_person_profiles();
  IF (SELECT group_name FROM public.agent_person_profile WHERE person_id = 'a0000000-0000-0000-0000-000000000006') <> 'placement' THEN
    RAISE EXCEPTION 'FAIL: a second run overwrote a manual group';
  END IF;
  RAISE NOTICE 'PASS 11: fill-from-pay-groups proposes leadership / core, takes the manager from the profile, skips people with no company, never overwrites a manual group';
END $$;
RESET ROLE;

-- ═════ misc: service role, dedupe ═════════════════════════════════════════
DO $$
BEGIN
  BEGIN
    INSERT INTO public.agent_flags (company_id, module, rule_code, subject_type, subject_id, title)
    VALUES ('c0000000-0000-0000-0000-000000000001', 'task', 'TK01', 'person', 'p1', 'duplicate');
    RAISE EXCEPTION 'FAIL: the same rule + subject + period was inserted twice';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  INSERT INTO public.agent_flags (company_id, module, rule_code, subject_type, subject_id, period_key, title)
  VALUES ('c0000000-0000-0000-0000-000000000001', 'task', 'TK01', 'person', 'p1', '2026-W47', 'next period is a new flag');
  RAISE NOTICE 'PASS: one flag per rule + subject + period';
END $$;

SET ROLE service_role;
DO $$ BEGIN
  PERFORM public.agent_log_ai_usage('test', 'claude-haiku-5-5', 10, 0, 0, 5, 0.0001);
  PERFORM public.agent_audit_write('a0000000-0000-0000-0000-000000000001', 'ai.test', 'agent_ai', 'fast', '{"ok": true}');
  RAISE NOTICE 'PASS: the service role can log AI usage and write audit rows for a person';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'NOTE: service_role here has no execute grant (stock Supabase has it)';
END $$;
RESET ROLE;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.agent_audit_log WHERE action = 'ai.test' AND actor_id = 'a0000000-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'FAIL: agent_audit_write did not record the actor';
  END IF;
END $$;

ROLLBACK;
