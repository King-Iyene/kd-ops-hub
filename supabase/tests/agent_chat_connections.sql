-- =============================================================================
-- Ops Agent v2 — contract tests for chat data tools, secrets, API keys and inbound items
--
-- Run AFTER migrations 20261408000000 .. 20261409000000:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/agent_chat_connections.sql
-- Everything is rolled back. A failed check raises "FAIL: ..." and stops the run.
--
-- What this proves
--   1  AI is on by default; connection kind "api" is accepted and unknown kinds are not
--   2  secrets can be written and read only by the service role
--   3  API keys: only a Super Admin creates them; only the hash is stored; verify, revoke and rate limit work
--   4  an inbound call becomes an Inbox item; the same id counts another occurrence instead of a duplicate
--   5  chat tools: refused for members, every row scope-checked, own and Admin rows hidden from an Admin,
--      bad arguments never throw, the report tool finds who has and has not reported
--   6  asking the agent to change something creates a Human Action item and changes nothing
--   7  Inbox actions (handle, snooze, dismiss, reopen) work inside scope only and leave an event
-- =============================================================================

BEGIN;

CREATE FUNCTION public.t_as(p_uid uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  RESET ROLE;
  IF p_uid IS NULL THEN PERFORM set_config('request.jwt.claim.sub', '', true); RETURN; END IF;
  PERFORM set_config('request.jwt.claim.sub', p_uid::text, true);
  SET ROLE authenticated;
END $$;

CREATE FUNCTION public.t_denied(p_sql text, p_label text, p_code text DEFAULT NULL) RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_n bigint;
BEGIN
  EXECUTE p_sql;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 AND p_sql ~* '^\s*(update|delete)' THEN RETURN; END IF;
  RAISE EXCEPTION 'FAIL: % was allowed', p_label;
EXCEPTION
  WHEN insufficient_privilege THEN RETURN;
  WHEN others THEN
    IF p_code IS NOT NULL AND SQLSTATE <> p_code THEN RAISE EXCEPTION 'FAIL: % failed with % (%), expected %', p_label, SQLSTATE, SQLERRM, p_code; END IF;
    IF SQLERRM LIKE 'FAIL:%' THEN RAISE; END IF;
END $$;

CREATE FUNCTION public.t_eq(p_label text, p_got anyelement, p_want anyelement) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_got IS DISTINCT FROM p_want THEN RAISE EXCEPTION 'FAIL: % (got %, want %)', p_label, p_got, p_want; END IF;
END $$;

-- ── Fixture ────────────────────────────────────────────────────────────────
INSERT INTO auth.users (id, email) SELECT id, email FROM (VALUES
  ('a0000000-0000-0000-0000-000000000001'::uuid, 'super@t.local'), ('a0000000-0000-0000-0000-000000000002', 'admin.kd@t.local'),
  ('a0000000-0000-0000-0000-000000000003', 'admin.all@t.local'), ('a0000000-0000-0000-0000-000000000004', 'member@t.local'),
  ('a0000000-0000-0000-0000-000000000005', 'kemi@t.local'), ('a0000000-0000-0000-0000-000000000006', 'nuhu@t.local'),
  ('a0000000-0000-0000-0000-000000000007', 'fola@t.local'), ('a0000000-0000-0000-0000-000000000008', 'tola@t.local')) v(id, email)
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.companies (id, name, short_code) VALUES
  ('c0000000-0000-0000-0000-000000000001', 'KD Squares Ltd', 'KDS'), ('c0000000-0000-0000-0000-000000000002', 'NDI', 'NDI');
INSERT INTO public.pay_groups (id, name, company_id) VALUES
  ('e0000000-0000-0000-0000-000000000001', 'KDS - Staff', 'c0000000-0000-0000-0000-000000000001'),
  ('e0000000-0000-0000-0000-000000000002', 'NDI Staffs', 'c0000000-0000-0000-0000-000000000002');
INSERT INTO public.profiles (id, email, full_name, job_title, role, status, pay_group_id, reporting_manager_id) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'super@t.local', 'Sue Super', NULL, 'super_admin', 'active', 'e0000000-0000-0000-0000-000000000001', NULL),
  ('a0000000-0000-0000-0000-000000000002', 'admin.kd@t.local', 'Ada KD', NULL, 'admin', 'active', 'e0000000-0000-0000-0000-000000000001', NULL),
  ('a0000000-0000-0000-0000-000000000003', 'admin.all@t.local', 'Abel All', NULL, 'admin', 'active', 'e0000000-0000-0000-0000-000000000001', NULL),
  ('a0000000-0000-0000-0000-000000000004', 'member@t.local', 'Mia Member', NULL, 'operations', 'active', 'e0000000-0000-0000-0000-000000000001', NULL),
  ('a0000000-0000-0000-0000-000000000005', 'kemi@t.local', 'Kemi Staff', 'Ops Lead', 'operations', 'active', 'e0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002'),
  ('a0000000-0000-0000-0000-000000000006', 'nuhu@t.local', 'Nuhu Staff', NULL, 'operations', 'active', 'e0000000-0000-0000-0000-000000000002', NULL),
  ('a0000000-0000-0000-0000-000000000007', 'fola@t.local', 'Fola Field', 'Field Agent', 'field_staff', 'active', 'e0000000-0000-0000-0000-000000000001', NULL),
  ('a0000000-0000-0000-0000-000000000008', 'tola@t.local', 'Tola Staff', NULL, 'operations', 'active', 'e0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002');
INSERT INTO public.agent_company_scope (company_id, enabled) VALUES
  ('c0000000-0000-0000-0000-000000000001', true), ('c0000000-0000-0000-0000-000000000002', true) ON CONFLICT (company_id) DO UPDATE SET enabled = true;
INSERT INTO public.agent_admin_scope (admin_id, company_ids) VALUES ('a0000000-0000-0000-0000-000000000002', ARRAY['c0000000-0000-0000-0000-000000000001']::uuid[]);

-- tasks: Kemi (KD) one overdue, one done; Nuhu (NDI) one overdue; Ada (an admin) one overdue; unassigned one
INSERT INTO public.tm_tasks (title, status, assignee_id, due_date, completed_at) VALUES
  ('Kemi overdue', 'in_progress', 'a0000000-0000-0000-0000-000000000005', current_date - 3, NULL),
  ('Kemi finished', 'done', 'a0000000-0000-0000-0000-000000000005', current_date - 1, now()),
  ('Nuhu overdue', 'blocked', 'a0000000-0000-0000-0000-000000000006', current_date - 5, NULL),
  ('Ada own task', 'to_do', 'a0000000-0000-0000-0000-000000000002', current_date - 2, NULL),
  ('Nobody task', 'to_do', NULL, NULL, NULL);
INSERT INTO public.tm_tasks (title, status, assignee_id, due_date, parent_id)
  SELECT 'Kemi subtask', 'to_do', 'a0000000-0000-0000-0000-000000000005', current_date - 9, id FROM public.tm_tasks WHERE title = 'Kemi overdue';

-- report table: Name (person) + Report Date (date); Kemi reported today, Tola did not
INSERT INTO public.tm_folders (id, name) VALUES ('d0000000-0000-0000-0000-000000000001', 'S');
INSERT INTO public.tm_tables (id, folder_id, name) VALUES ('d0000000-0000-0000-0000-0000000000a1', 'd0000000-0000-0000-0000-000000000001', 'Report');
INSERT INTO public.tm_table_fields (id, table_id, name, type, position) VALUES
  ('f0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-0000000000a1', 'Name', 'person', 0),
  ('f0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-0000000000a1', 'Report Date', 'date', 1);
UPDATE public.agent_settings SET report_table_id = 'd0000000-0000-0000-0000-0000000000a1', timezone = 'UTC';
INSERT INTO public.tm_table_records (table_id, data) VALUES
  ('d0000000-0000-0000-0000-0000000000a1', jsonb_build_object('f0000000-0000-0000-0000-000000000001', jsonb_build_array('a0000000-0000-0000-0000-000000000005'), 'f0000000-0000-0000-0000-000000000002', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD'))),
  ('d0000000-0000-0000-0000-0000000000a1', jsonb_build_object('f0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000008', 'f0000000-0000-0000-0000-000000000002', to_char(now() AT TIME ZONE 'UTC' - interval '3 days', 'YYYY-MM-DD')));
-- time: Kemi tracked 2h today
INSERT INTO public.time_entries (employee_id, start_time, end_time, duration_minutes) VALUES
  ('a0000000-0000-0000-0000-000000000005', now() - interval '3 hours', now() - interval '1 hour', 120);
-- approved leave for Nuhu today
INSERT INTO public.leave_requests (employee_id, start_date, end_date, is_half_day, status) VALUES
  ('a0000000-0000-0000-0000-000000000006', current_date - 1, current_date + 1, false, 'approved'),
  ('a0000000-0000-0000-0000-000000000004', current_date - 1, current_date + 1, false, 'approved');

-- ── 1. defaults and connection kinds ───────────────────────────────────────
DO $$
BEGIN
  IF NOT (SELECT ai_enabled FROM public.agent_settings) THEN RAISE EXCEPTION 'FAIL: AI should be on by default'; END IF;
  INSERT INTO public.agent_connections (kind, name) VALUES ('api', 'Billing API');
  BEGIN
    INSERT INTO public.agent_connections (kind, name) VALUES ('carrier_pigeon', 'x');
    RAISE EXCEPTION 'FAIL: unknown connection kind was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  RAISE NOTICE 'PASS 1: AI is on by default; connection kind "api" is accepted; unknown kinds are not';
END $$;

-- ── 2. secrets: service role only ──────────────────────────────────────────
SET ROLE service_role;
DO $$
BEGIN
  PERFORM public.agent_secret_set('agent_test_secret', 'first');
  PERFORM public.t_eq('secret read back', public.agent_secret_get('agent_test_secret'), 'first');
  PERFORM public.agent_secret_set('agent_test_secret', 'second');
  PERFORM public.t_eq('secret updated', public.agent_secret_get('agent_test_secret'), 'second');
  PERFORM public.t_eq('exists', public.agent_secret_exists('agent_test_secret'), true);
  BEGIN PERFORM public.agent_secret_set('not_agent_prefixed', 'x'); RAISE EXCEPTION 'FAIL: a secret outside the agent_ namespace was accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'FAIL:%' THEN RAISE; END IF; END;
  PERFORM public.agent_secret_delete('agent_test_secret');
  PERFORM public.t_eq('deleted', public.agent_secret_exists('agent_test_secret'), false);
  PERFORM public.agent_secret_set('agent_keep', 'kept');
END $$;
SELECT public.t_as('a0000000-0000-0000-0000-000000000001');
DO $$
BEGIN
  PERFORM public.t_denied($q$SELECT public.agent_secret_get('agent_keep')$q$, 'Super Admin reading a secret', '42501');
  PERFORM public.t_denied($q$SELECT public.agent_secret_set('agent_x', 'y')$q$, 'Super Admin writing a secret', '42501');
  PERFORM public.t_denied($q$SELECT public.agent_secret_exists('agent_keep')$q$, 'Super Admin probing a secret', '42501');
  RAISE NOTICE 'PASS 2: secrets are written and read by the service role only';
END $$;

-- ── 3. API keys ────────────────────────────────────────────────────────────
SELECT public.t_as('a0000000-0000-0000-0000-000000000002');
DO $$
BEGIN
  PERFORM public.t_denied($q$SELECT public.agent_api_key_create('nope')$q$, 'Admin creating an API key', '42501');
END $$;
SELECT public.t_as('a0000000-0000-0000-0000-000000000001');
CREATE TEMP TABLE t_key AS SELECT (public.agent_api_key_create('Billing system'))::jsonb AS k;
GRANT SELECT ON t_key TO PUBLIC;
DO $$
DECLARE v_key text := (SELECT k ->> 'key' FROM t_key); v_id uuid := ((SELECT k ->> 'id' FROM t_key))::uuid;
BEGIN
  IF v_key !~ '^kdagent_[0-9a-f]{64}$' THEN RAISE EXCEPTION 'FAIL: key format %', v_key; END IF;
  RESET ROLE;
  IF EXISTS (SELECT 1 FROM public.agent_api_keys WHERE key_hash = v_key OR key_prefix = v_key) THEN RAISE EXCEPTION 'FAIL: the plain key was stored'; END IF;
  IF (SELECT key_hash FROM public.agent_api_keys WHERE id = v_id) <> encode(sha256(convert_to(v_key, 'utf8')), 'hex') THEN RAISE EXCEPTION 'FAIL: hash mismatch'; END IF;
  BEGIN PERFORM public.agent_api_key_create('bad', ARRAY['admin:everything']); RAISE EXCEPTION 'FAIL: bad scope accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'FAIL:%' THEN RAISE; END IF; END;
END $$;
SET ROLE service_role;
DO $$
DECLARE v_key text := (SELECT k ->> 'key' FROM t_key); v_id uuid := ((SELECT k ->> 'id' FROM t_key))::uuid; r jsonb;
BEGIN
  r := public.agent_api_key_verify(v_key);
  PERFORM public.t_eq('verify finds the key', (r ->> 'id')::uuid, v_id);
  PERFORM public.t_eq('scopes', r -> 'scopes', '["flags:read", "flags:write"]'::jsonb);
  IF public.agent_api_key_verify(v_key || 'x') IS NOT NULL THEN RAISE EXCEPTION 'FAIL: a wrong key verified'; END IF;
  IF public.agent_api_key_verify('') IS NOT NULL THEN RAISE EXCEPTION 'FAIL: an empty key verified'; END IF;
  RESET ROLE;
  UPDATE public.agent_api_keys SET rate_limit_per_min = 2 WHERE id = v_id;
  SET ROLE service_role;
  r := public.agent_api_key_verify(v_key);
  PERFORM public.t_eq('second call within the limit', r ->> 'limited', 'false');
  r := public.agent_api_key_verify(v_key);
  PERFORM public.t_eq('third call is rate limited', r ->> 'limited', 'true');
  RESET ROLE;
  UPDATE public.agent_api_keys SET revoked_at = now() WHERE id = v_id;
  SET ROLE service_role;
  IF public.agent_api_key_verify(v_key) IS NOT NULL THEN RAISE EXCEPTION 'FAIL: a revoked key verified'; END IF;
  RAISE NOTICE 'PASS 3: Super Admin only creates keys; only the hash is stored; verify, rate limit and revoke work';
END $$;

-- ── 4. inbound items ───────────────────────────────────────────────────────
DO $$
DECLARE r jsonb; r2 jsonb; v_flag public.agent_flags%ROWTYPE;
BEGIN
  r := public.agent_inbound_create(NULL, '{"title":"Invoice sync failed","message":"3 invoices stuck","severity":"high","id":"inv-42","person_email":"KEMI@t.local","data":{"count":3}}'::jsonb);
  r2 := public.agent_inbound_create(NULL, '{"title":"Invoice sync failed again","id":"inv-42"}'::jsonb);
  PERFORM public.t_eq('same id, same item', r ->> 'id', r2 ->> 'id');
  PERFORM public.t_eq('second call counted', (r2 ->> 'occurrences')::int, 2);
  SELECT * INTO v_flag FROM public.agent_flags WHERE id = (r ->> 'id')::uuid;
  PERFORM public.t_eq('person matched by email, case blind', v_flag.person_id, 'a0000000-0000-0000-0000-000000000005'::uuid);
  PERFORM public.t_eq('company taken from the person', v_flag.company_id, 'c0000000-0000-0000-0000-000000000001'::uuid);
  PERFORM public.t_eq('rule code', v_flag.rule_code, 'INBOUND');
  r := public.agent_inbound_create(NULL, '{"title":"x","severity":"apocalypse"}'::jsonb);
  PERFORM public.t_eq('bad severity falls back', (SELECT severity FROM public.agent_flags WHERE id = (r ->> 'id')::uuid), 'medium');
  BEGIN PERFORM public.agent_inbound_create(NULL, '{"message":"no title"}'::jsonb); RAISE EXCEPTION 'FAIL: an item without a title was accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'FAIL:%' THEN RAISE; END IF; END;
  RAISE NOTICE 'PASS 4: an inbound call becomes one Inbox item; the same id counts occurrences; person and company are resolved';
END $$;

-- ── 5. chat tools ──────────────────────────────────────────────────────────
SELECT public.t_as('a0000000-0000-0000-0000-000000000004');
DO $$ BEGIN PERFORM public.t_denied($q$SELECT public.agent_chat_tool('people')$q$, 'a member using a chat tool', '42501'); END $$;

SELECT public.t_as('a0000000-0000-0000-0000-000000000001');
DO $$
DECLARE r jsonb;
BEGIN
  r := public.agent_chat_tool('tasks', '{}');
  PERFORM public.t_eq('Super sees open KD Squares team tasks only: no NDI, no unassigned, no subtasks, no done tasks', jsonb_array_length(r -> 'tasks'), 2);
  IF (r -> 'tasks')::text LIKE '%Nuhu%' OR (r -> 'tasks')::text LIKE '%Nobody%' THEN RAISE EXCEPTION 'FAIL: a non-team task leaked: %', r -> 'tasks'; END IF;
  r := public.agent_chat_tool('tasks', '{"overdue": true, "name": "kem"}');
  PERFORM public.t_eq('overdue + name filter', (r -> 'tasks' -> 0 ->> 'title'), 'Kemi overdue');
  PERFORM public.t_eq('overdue + name filter count', jsonb_array_length(r -> 'tasks'), 1);
  r := public.agent_chat_tool('tasks', '{"status": "done"}');
  PERFORM public.t_eq('done tasks on request', r -> 'tasks' -> 0 ->> 'title', 'Kemi finished');
  r := public.agent_chat_tool('task_summary');
  PERFORM public.t_eq('summary: Kemi has 1 open, 1 overdue', (SELECT (x ->> 'overdue')::int FROM jsonb_array_elements(r -> 'by_assignee') x WHERE x ->> 'assignee' = 'Kemi Staff'), 1);
  IF (r -> 'by_assignee')::text LIKE '%Nuhu%' OR (r -> 'by_assignee')::text LIKE '%Unassigned%' THEN RAISE EXCEPTION 'FAIL: summary leaked a non-team assignee'; END IF;
  r := public.agent_chat_tool('people', '{"name": "field"}');
  PERFORM public.t_eq('a Field Agent is never listed', r -> 'people', '[]'::jsonb);
  r := public.agent_chat_tool('people', '{"name": "kem"}');
  PERFORM public.t_eq('people name filter', r -> 'people' -> 0 ->> 'name', 'Kemi Staff');
  r := public.agent_chat_tool('people', '{}');
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(r -> 'people') x WHERE x ->> 'name' IN ('Nuhu Staff', 'Fola Field')) THEN RAISE EXCEPTION 'FAIL: the team list holds an NDI person or a Field Agent: %', r -> 'people'; END IF;
  r := public.agent_chat_tool('hours', '{}');
  PERFORM public.t_eq('Kemi tracked 2 hours', ((r -> 'tracked_hours' -> 0) ->> 'hours')::numeric, 2.00);
  r := public.agent_chat_tool('leave', '{}');
  PERFORM public.t_eq('Mia (KD Squares) is on leave today; Nuhu (NDI) is not the agent''s business', r -> 'on_approved_leave' -> 0 ->> 'person', 'Mia Member');
  PERFORM public.t_eq('only one person on leave is shown', jsonb_array_length(r -> 'on_approved_leave'), 1);
  r := public.agent_chat_tool('flags', '{}');
  PERFORM public.t_eq('the inbound item is in the flags tool', r -> 'open_flags' -> 0 ->> 'rule_code', 'INBOUND');
  PERFORM public.t_eq('Super scope label', r ->> 'scope', 'all companies and modules');

  -- daily reports, no groups set: KD staff who are not Field Agents are expected (Fola is a Field Agent; NDI is not KD Squares)
  r := public.agent_chat_tool('daily_reports', '{}');
  PERFORM public.t_eq('Kemi reported today', r -> 'reported', '["Kemi Staff"]'::jsonb);
  IF NOT (r -> 'missing') @> '[{"name": "Tola Staff"}]'::jsonb THEN RAISE EXCEPTION 'FAIL: Tola should be missing, got %', r -> 'missing'; END IF;
  IF (r -> 'missing')::text LIKE '%Fola%' OR (r -> 'missing')::text LIKE '%Nuhu%' THEN RAISE EXCEPTION 'FAIL: a Field Agent or an NDI person was expected: %', r -> 'missing'; END IF;
  r := public.agent_chat_tool('daily_reports', jsonb_build_object('date', to_char(current_date - 3, 'YYYY-MM-DD')));
  PERFORM public.t_eq('the report dated 3 days ago counts for that day', r -> 'reported', '["Tola Staff"]'::jsonb);
  -- with a core group, only the core group is expected; an exemption removes a person
  RESET ROLE;
  INSERT INTO public.agent_person_profile (person_id, group_name) VALUES
    ('a0000000-0000-0000-0000-000000000005', 'core'), ('a0000000-0000-0000-0000-000000000008', 'core');
  UPDATE public.agent_person_profile SET exemptions = '{"reports": true}' WHERE person_id = 'a0000000-0000-0000-0000-000000000008';
  PERFORM public.t_as('a0000000-0000-0000-0000-000000000001');
  r := public.agent_chat_tool('daily_reports', '{}');
  PERFORM public.t_eq('core group only, exemption honoured: 1 expected', (r ->> 'expected')::int, 1);
  PERFORM public.t_eq('nobody missing', r -> 'missing', '[]'::jsonb);
  RAISE NOTICE 'PASS 5a: every tool answers for a Super Admin; tasks, hours, leave, flags and who-has-reported are correct';
END $$;

-- bad arguments never throw
DO $$
DECLARE r jsonb;
BEGIN
  PERFORM public.agent_chat_tool('tasks', '{"limit": "abc", "from": "yesterday", "to": 5, "overdue": "maybe", "status": "weird"}');
  PERFORM public.agent_chat_tool('daily_reports', '{"date": "2026-13-45"}');
  PERFORM public.agent_chat_tool('hours', '{"from": "x", "to": "y", "limit": 99999}');
  PERFORM public.agent_chat_tool('people', '"a string, not an object"');
  PERFORM public.agent_chat_tool('people', NULL);
  r := public.agent_chat_tool('tasks', '{"limit": 1}');
  PERFORM public.t_eq('limit respected', jsonb_array_length(r -> 'tasks'), 1);
  BEGIN PERFORM public.agent_chat_tool('drop_everything'); RAISE EXCEPTION 'FAIL: an unknown tool was accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'FAIL:%' THEN RAISE; END IF; END;
  RAISE NOTICE 'PASS 5b: bad arguments never throw; unknown tools are refused';
END $$;

-- an Admin limited to KD Squares: KD only, never their own rows, never NDI
SELECT public.t_as('a0000000-0000-0000-0000-000000000002');
DO $$
DECLARE r jsonb;
BEGIN
  r := public.agent_chat_tool('tasks', '{}');
  IF (r -> 'tasks')::text LIKE '%Nuhu%' THEN RAISE EXCEPTION 'FAIL: a KD-only Admin saw an NDI task'; END IF;
  IF (r -> 'tasks')::text LIKE '%Ada own%' THEN RAISE EXCEPTION 'FAIL: an Admin saw a task assigned to themselves'; END IF;
  IF (r -> 'tasks')::text NOT LIKE '%Kemi overdue%' THEN RAISE EXCEPTION 'FAIL: the Admin should see KD tasks'; END IF;
  PERFORM public.t_eq('Admin scope label', r ->> 'scope', 'limited to the companies and modules this person may see');
  r := public.agent_chat_tool('people', '{}');
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(r -> 'people') x WHERE x ->> 'name' IN ('Nuhu Staff', 'Sue Super', 'Abel All', 'Ada KD')) THEN
    RAISE EXCEPTION 'FAIL: an Admin saw NDI people, themselves or another Admin: %', r -> 'people'; END IF;
  r := public.agent_chat_tool('leave', '{}');
  IF (r -> 'on_approved_leave')::text LIKE '%Nuhu%' THEN RAISE EXCEPTION 'FAIL: NDI leave shown to a KD Admin'; END IF;
  r := public.agent_chat_tool('daily_reports', '{}');
  IF (r::text) LIKE '%Nuhu%' THEN RAISE EXCEPTION 'FAIL: NDI person in a KD Admin report view'; END IF;
  RAISE NOTICE 'PASS 5c: a KD-limited Admin sees KD only, never themselves, other Admins, or NDI';
END $$;
-- a module switched off disappears from the tools
RESET ROLE;
UPDATE public.agent_module_access SET enabled = false WHERE module_key = 'task';
SELECT public.t_as('a0000000-0000-0000-0000-000000000003');
DO $$
BEGIN
  PERFORM public.t_eq('a disabled module returns nothing to an Admin', public.agent_chat_tool('tasks', '{}') -> 'tasks', '[]'::jsonb);
  PERFORM public.t_eq('and the summary too', public.agent_chat_tool('task_summary') -> 'by_assignee', '[]'::jsonb);
  RAISE NOTICE 'PASS 5d: a module switched off in Settings cannot be read through chat';
END $$;
SELECT public.t_as('a0000000-0000-0000-0000-000000000001');
DO $$ BEGIN PERFORM public.t_eq('Super Admin still sees tasks', jsonb_array_length(public.agent_chat_tool('tasks', '{}') -> 'tasks') > 0, true); END $$;

-- ── 6. human action ────────────────────────────────────────────────────────
RESET ROLE;
UPDATE public.agent_module_access SET enabled = true WHERE module_key = 'task';
SELECT public.t_as('a0000000-0000-0000-0000-000000000002');
DO $$
DECLARE r jsonb; v_tasks_before bigint; v_tasks_after bigint;
BEGIN
  RESET ROLE; SELECT count(*) INTO v_tasks_before FROM public.tm_tasks; PERFORM public.t_as('a0000000-0000-0000-0000-000000000002');
  r := public.agent_chat_tool('request_human_action', '{"title": "Delete the task Kemi overdue", "details": "Asked in chat"}');
  PERFORM public.t_eq('created', r ->> 'created', 'true');
  RESET ROLE; SELECT count(*) INTO v_tasks_after FROM public.tm_tasks;
  PERFORM public.t_eq('no business record changed', v_tasks_after, v_tasks_before);
  PERFORM public.t_eq('an Inbox item exists, typed human_action', (SELECT item_type FROM public.agent_flags WHERE id = (r ->> 'id')::uuid), 'human_action');
  PERFORM public.t_eq('assigned to the asker', (SELECT assigned_to FROM public.agent_flags WHERE id = (r ->> 'id')::uuid), 'a0000000-0000-0000-0000-000000000002'::uuid);
  RAISE NOTICE 'PASS 6: a request to change something becomes a Human Action item and changes nothing';
END $$;

-- ── 7. Inbox actions ───────────────────────────────────────────────────────
RESET ROLE;
INSERT INTO public.agent_flags (id, company_id, rule_code, severity, subject_type, subject_id, title, item_type) VALUES
  ('b0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'X1', 'medium', 'system', 'kd-1', 'KD item', 'flag'),
  ('b0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002', 'X1', 'medium', 'system', 'ndi-1', 'NDI item', 'flag');
SELECT public.t_as('a0000000-0000-0000-0000-000000000002');
DO $$
BEGIN
  PERFORM public.agent_flag_set_status('b0000000-0000-0000-0000-000000000001', 'handled', 'Spoke to Kemi');
  RESET ROLE;
  PERFORM public.t_eq('handled', (SELECT status FROM public.agent_flags WHERE id = 'b0000000-0000-0000-0000-000000000001'), 'handled');
  PERFORM public.t_eq('who handled it', (SELECT handled_by FROM public.agent_flags WHERE id = 'b0000000-0000-0000-0000-000000000001'), 'a0000000-0000-0000-0000-000000000002'::uuid);
  PERFORM public.t_eq('note kept', (SELECT resolution_note FROM public.agent_flags WHERE id = 'b0000000-0000-0000-0000-000000000001'), 'Spoke to Kemi');
  PERFORM public.t_eq('event recorded', (SELECT count(*) FROM public.agent_flag_events WHERE flag_id = 'b0000000-0000-0000-0000-000000000001' AND kind = 'handled'), 1::bigint);
  PERFORM public.t_as('a0000000-0000-0000-0000-000000000002');
  PERFORM public.agent_flag_set_status('b0000000-0000-0000-0000-000000000001', 'snoozed', NULL, now() + interval '2 days');
  RESET ROLE;
  PERFORM public.t_eq('snoozed clears the handled fields', (SELECT handled_by IS NULL AND snoozed_until > now() + interval '1 day' FROM public.agent_flags WHERE id = 'b0000000-0000-0000-0000-000000000001'), true);
  PERFORM public.t_as('a0000000-0000-0000-0000-000000000002');
  PERFORM public.agent_flag_set_status('b0000000-0000-0000-0000-000000000001', 'open');
  PERFORM public.t_denied($q$SELECT public.agent_flag_set_status('b0000000-0000-0000-0000-000000000002', 'dismissed')$q$, 'a KD Admin changing an NDI item', '42501');
  PERFORM public.t_denied($q$SELECT public.agent_flag_set_status('b0000000-0000-0000-0000-0000000000ff', 'dismissed')$q$, 'a missing item looks the same as an out of scope one', '42501');
  BEGIN PERFORM public.agent_flag_set_status('b0000000-0000-0000-0000-000000000001', 'deleted'); RAISE EXCEPTION 'FAIL: bad status accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'FAIL:%' THEN RAISE; END IF; END;
  PERFORM public.t_as('a0000000-0000-0000-0000-000000000004');
  PERFORM public.t_denied($q$SELECT public.agent_flag_set_status('b0000000-0000-0000-0000-000000000001', 'dismissed')$q$, 'a member changing an item', '42501');
  PERFORM public.t_as('a0000000-0000-0000-0000-000000000001');
  PERFORM public.agent_flag_set_status('b0000000-0000-0000-0000-000000000002', 'dismissed');
  RAISE NOTICE 'PASS 7: Inbox items can be handled, snoozed, dismissed and reopened inside scope only, with an event each time';
END $$;

ROLLBACK;
