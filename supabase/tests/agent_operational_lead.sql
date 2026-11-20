-- =============================================================================
-- Ops Agent: "not tracking" builds on the Inbox card through the day (TR01), and the operational lead rules
--
-- Run AFTER migrations 20261408000000 .. 20261420000000:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/agent_operational_lead.sql
-- Everything is rolled back. The clock is fixed: Wednesday 2026-11-18, 15:00 UTC = 10:00 EST.
--
-- What this proves
--   1  the first notice reads as before, and does not change on the next minute's run
--   2  once it has been open a while the SAME card says "X still isn't tracking, and it's 10:30 AM EST. First noticed at ..."
--   3  the card's history gets a line when it becomes high priority and about once an hour after that, never one per minute
--   4  someone who tracked and stopped again reads "stopped tracking again"
--   5  a handled card is left alone; the card is closed when they track
--   6  the Operational lead rules are added once
-- =============================================================================
BEGIN;

CREATE FUNCTION public.t_as(p_uid uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  RESET ROLE;
  IF p_uid IS NULL THEN PERFORM set_config('request.jwt.claim.sub', '', true); RETURN; END IF;
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
-- flags of a rule for a named person, any status
CREATE FUNCTION public.t_flag(p_rule text, p_name text, p_status text DEFAULT NULL) RETURNS public.agent_flags LANGUAGE sql AS $$
  SELECT f.* FROM public.agent_flags f JOIN public.profiles p ON p.id = f.person_id
   WHERE f.rule_code = p_rule AND p.full_name = p_name AND (p_status IS NULL OR f.status = p_status) ORDER BY f.created_at DESC LIMIT 1
$$;
CREATE FUNCTION public.t_count(p_rule text, p_status text DEFAULT 'open') RETURNS bigint LANGUAGE sql AS $$
  SELECT count(*) FROM public.agent_flags WHERE rule_code = p_rule AND status = p_status
$$;

-- A stand-in for the Task module's forms table (the minimal replay database does not have it)
CREATE TABLE IF NOT EXISTS public.tm_forms (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), table_id uuid NOT NULL, token text NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text, '-', ''), title text NOT NULL, is_open boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.tm_forms TO authenticated;

-- ── Fixture ────────────────────────────────────────────────────────────────
INSERT INTO public.companies (id, name, short_code) VALUES
  ('c0000000-0000-0000-0000-000000000001', 'KD Squares Ltd', 'KDS'), ('c0000000-0000-0000-0000-000000000002', 'NDI', 'NDI');
INSERT INTO public.pay_groups (id, name, company_id) VALUES
  ('e0000000-0000-0000-0000-000000000001', 'KDS - Staff', 'c0000000-0000-0000-0000-000000000001'),
  ('e0000000-0000-0000-0000-000000000002', 'NDI Staffs', 'c0000000-0000-0000-0000-000000000002');
INSERT INTO public.profiles (id, email, full_name, job_title, role, status, pay_group_id) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'sue@t.local',  'Sue Super',  NULL,          'super_admin', 'active', 'e0000000-0000-0000-0000-000000000001'),
  ('a0000000-0000-0000-0000-000000000002', 'alice@t.local','Alice',      'Ops Lead',    'operations',  'active', 'e0000000-0000-0000-0000-000000000001'),
  ('a0000000-0000-0000-0000-000000000003', 'bob@t.local',  'Bob',        'Analyst',     'operations',  'active', 'e0000000-0000-0000-0000-000000000001'),
  ('a0000000-0000-0000-0000-000000000004', 'cara@t.local', 'Cara',       'Analyst',     'operations',  'active', 'e0000000-0000-0000-0000-000000000001'),
  ('a0000000-0000-0000-0000-000000000005', 'dan@t.local',  'Dan',        'Field Agent', 'field_staff', 'active', 'e0000000-0000-0000-0000-000000000001'),
  ('a0000000-0000-0000-0000-000000000006', 'eve@t.local',  'Eve',        NULL,          'operations',  'active', 'e0000000-0000-0000-0000-000000000002'),
  ('a0000000-0000-0000-0000-000000000007', 'finn@t.local', 'Finn',       NULL,          'operations',  'active', 'e0000000-0000-0000-0000-000000000001'),
  ('a0000000-0000-0000-0000-000000000008', 'gus@t.local',  'Gus',        NULL,          'operations',  'active', 'e0000000-0000-0000-0000-000000000001'),
  ('a0000000-0000-0000-0000-000000000009', 'hana@t.local', 'Hana',       NULL,          'operations',  'active', 'e0000000-0000-0000-0000-000000000001'),
  ('a0000000-0000-0000-0000-00000000000a', 'ivy@t.local',  'Ivy',        'Field Agents lead', 'operations', 'active', 'e0000000-0000-0000-0000-000000000001');
INSERT INTO public.agent_person_profile (person_id, group_name, group_source, exemptions) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'leadership', 'manual', '{}'),
  ('a0000000-0000-0000-0000-000000000002', 'core', 'manual', '{}'),
  ('a0000000-0000-0000-0000-000000000003', 'core', 'manual', '{}'),
  ('a0000000-0000-0000-0000-000000000004', 'core', 'manual', '{}'),
  ('a0000000-0000-0000-0000-000000000007', 'placement', 'manual', '{}'),
  ('a0000000-0000-0000-0000-000000000008', 'core', 'manual', '{}'),
  ('a0000000-0000-0000-0000-000000000009', 'core', 'manual', '{"time": true}');
INSERT INTO public.agent_company_scope (company_id, enabled) VALUES
  ('c0000000-0000-0000-0000-000000000001', true), ('c0000000-0000-0000-0000-000000000002', true) ON CONFLICT (company_id) DO UPDATE SET enabled = true;
INSERT INTO public.leave_requests (employee_id, start_date, end_date, is_half_day, status) VALUES
  ('a0000000-0000-0000-0000-000000000008', '2026-11-17', '2026-11-19', false, 'approved');

-- Time entries: Alice is tracking now; Cara tracked 09:00 to 09:20 EST and stopped; Dan and Eve are tracking nothing.
INSERT INTO public.time_entries (employee_id, start_time, end_time, duration_minutes) VALUES
  ('a0000000-0000-0000-0000-000000000002', '2026-11-18T14:00:00Z', NULL, NULL),
  ('a0000000-0000-0000-0000-000000000004', '2026-11-18T14:00:00Z', '2026-11-18T14:20:00Z', 20);

-- Tasks: everyone has one except Cara (no open tasks). Alice has two overdue.
INSERT INTO public.tm_tasks (id, title, status, assignee_id, due_date) VALUES
  ('b1000000-0000-0000-0000-000000000001', 'Alice overdue 2 days', 'in_progress', 'a0000000-0000-0000-0000-000000000002', '2026-11-16'),
  ('b1000000-0000-0000-0000-000000000002', 'Alice overdue 8 days', 'to_do',       'a0000000-0000-0000-0000-000000000002', '2026-11-10'),
  ('b1000000-0000-0000-0000-000000000003', 'Bob review me',        'in_review',   'a0000000-0000-0000-0000-000000000003', '2026-11-25'),
  ('b1000000-0000-0000-0000-000000000004', 'Bob finished',         'done',        'a0000000-0000-0000-0000-000000000003', '2026-11-25'),
  ('b1000000-0000-0000-0000-000000000005', 'Bob moved date',       'in_progress', 'a0000000-0000-0000-0000-000000000003', '2026-11-25'),
  ('b1000000-0000-0000-0000-000000000006', 'Hana work',            'in_progress', 'a0000000-0000-0000-0000-000000000009', '2026-11-30'),
  ('b1000000-0000-0000-0000-000000000007', 'Dan overdue',          'in_progress', 'a0000000-0000-0000-0000-000000000005', '2026-11-01'),
  ('b1000000-0000-0000-0000-000000000008', 'Eve overdue',          'in_progress', 'a0000000-0000-0000-0000-000000000006', '2026-11-01'),
  ('b1000000-0000-0000-0000-000000000009', 'Finn work',            'in_progress', 'a0000000-0000-0000-0000-000000000007', '2026-11-30'),
  ('b1000000-0000-0000-0000-00000000000a', 'Sue work',             'in_progress', 'a0000000-0000-0000-0000-000000000001', '2026-11-30');
INSERT INTO public.tm_task_activity (task_id, actor_id, kind, detail, created_at) VALUES
  ('b1000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000003', 'status', '{"from":"in_progress","to":"in_review"}', '2026-11-18T14:50:00Z'),
  ('b1000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'status', '{"from":"in_review","to":"done"}',        '2026-11-18T14:40:00Z'),
  ('b1000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001', 'due_date', '{"from":"2026-11-20","to":"2026-11-25"}', '2026-11-18T14:30:00Z'),
  ('b1000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000001', 'due_date', '{"from":null,"to":"2026-11-30"}',        '2026-11-18T14:31:00Z'),
  ('b1000000-0000-0000-0000-000000000008', 'a0000000-0000-0000-0000-000000000001', 'status', '{"from":"in_progress","to":"done"}',      '2026-11-18T14:45:00Z');

-- Sites. Bob: youtube (rules say unproductive), an unfamiliar site 3 times, github (productive), a listed approved site,
-- a site three people use, a one-off. Dan (Field Agent) and Eve (NDI) visit facebook.
INSERT INTO public.agent_domain_list (domain, category, source) VALUES ('approved-listed.com', 'approved', 'manual'), ('facebook.com', 'unproductive', 'manual');
INSERT INTO public.time_activity_logs (employee_id, captured_at, app_name, url, productivity_category)
SELECT 'a0000000-0000-0000-0000-000000000003', ts, 'Chrome', url, cat FROM (VALUES
  ('2026-11-18T14:10:00Z'::timestamptz, 'https://www.youtube.com/watch?v=1', 'unproductive'), ('2026-11-18T14:11:00Z', 'https://www.youtube.com/watch?v=1', 'unproductive'),
  ('2026-11-18T14:12:00Z', 'https://www.youtube.com/watch?v=2', 'unproductive'), ('2026-11-18T14:13:00Z', 'https://youtube.com/', 'unproductive'),
  ('2026-11-18T14:14:00Z', 'https://youtube.com/', 'unproductive'),
  ('2026-11-18T14:15:00Z', 'https://unknownsite.xyz/a', NULL), ('2026-11-18T14:16:00Z', 'https://unknownsite.xyz/b', NULL), ('2026-11-18T14:17:00Z', 'https://unknownsite.xyz/c', NULL),
  ('2026-11-18T14:18:00Z', 'https://github.com/x', 'productive'), ('2026-11-18T14:19:00Z', 'https://github.com/y', 'productive'),
  ('2026-11-18T14:20:00Z', 'https://approved-listed.com/', NULL), ('2026-11-18T14:21:00Z', 'https://approved-listed.com/z', NULL),
  ('2026-11-18T14:22:00Z', 'https://common.io/', NULL), ('2026-11-18T14:23:00Z', 'https://common.io/', NULL), ('2026-11-18T14:24:00Z', 'https://once.xyz/', NULL)
) v(ts, url, cat);
INSERT INTO public.time_activity_logs (employee_id, captured_at, app_name, url, productivity_category) VALUES
  ('a0000000-0000-0000-0000-000000000002', '2026-11-18T14:30:00Z', 'Chrome', 'https://common.io/', NULL), ('a0000000-0000-0000-0000-000000000002', '2026-11-18T14:31:00Z', 'Chrome', 'https://common.io/', NULL),
  ('a0000000-0000-0000-0000-000000000004', '2026-11-18T14:32:00Z', 'Chrome', 'https://common.io/', NULL), ('a0000000-0000-0000-0000-000000000004', '2026-11-18T14:33:00Z', 'Chrome', 'https://common.io/', NULL),
  ('a0000000-0000-0000-0000-000000000005', '2026-11-18T14:30:00Z', 'Chrome', 'https://facebook.com/', 'unproductive'),
  ('a0000000-0000-0000-0000-000000000006', '2026-11-18T14:30:00Z', 'Chrome', 'https://facebook.com/', 'unproductive');

-- The report table: Name (person) and Report Date (date).
INSERT INTO public.tm_folders (id, name) VALUES ('d0000000-0000-0000-0000-000000000001', 'S');
INSERT INTO public.tm_tables (id, folder_id, name) VALUES ('d0000000-0000-0000-0000-0000000000a1', 'd0000000-0000-0000-0000-000000000001', 'Report');
INSERT INTO public.tm_table_fields (id, table_id, name, type, position) VALUES
  ('f0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-0000000000a1', 'Name', 'person', 0),
  ('f0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-0000000000a1', 'Report Date', 'date', 1);
UPDATE public.agent_settings SET report_table_id = 'd0000000-0000-0000-0000-0000000000a1';
INSERT INTO public.tm_table_records (table_id, data) VALUES
  ('d0000000-0000-0000-0000-0000000000a1', jsonb_build_object('f0000000-0000-0000-0000-000000000001', jsonb_build_array('a0000000-0000-0000-0000-000000000002'), 'f0000000-0000-0000-0000-000000000002', '2026-11-18'));


CREATE FUNCTION public.t_why(p_name text) RETURNS text LANGUAGE sql AS $$ SELECT (public.t_flag('TR01', p_name)).why $$;
CREATE FUNCTION public.t_events(p_name text, p_kind text) RETURNS bigint LANGUAGE sql AS $$
  SELECT count(*) FROM public.agent_flag_events WHERE flag_id = (public.t_flag('TR01', p_name)).id AND kind = p_kind
$$;
CREATE FUNCTION public.t_like(p_label text, p_got text, p_pat text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF p_got NOT LIKE p_pat THEN RAISE EXCEPTION 'FAIL: % (got "%", want like "%")', p_label, p_got, p_pat; END IF; END $$;

-- ── 1. the first notice ────────────────────────────────────────────────────
DO $$
BEGIN
  PERFORM public.agent_run_rules('2026-11-18T15:00:00Z');
  PERFORM public.t_eq('first title', (public.t_flag('TR01', 'Bob')).title, 'Not tracking time');
  PERFORM public.t_eq('first notice wording', public.t_why('Bob'), 'Their work day started at 9:00 AM EST and nothing has been tracked 60 minutes in.');
  PERFORM public.agent_run_rules('2026-11-18T15:05:00Z');   -- Cara (stopped at 9:20 AM EST) reaches 45 minutes
  -- the events are stamped with the fixed clock so the hourly spacing below is deterministic
  UPDATE public.agent_flag_events e SET created_at = f.first_seen_at FROM public.agent_flags f WHERE f.id = e.flag_id AND e.kind = 'created';
  PERFORM public.t_like('Cara first notice', public.t_why('Cara'), 'Stopped tracking at 9:20 AM EST, 45 minutes ago. 20 minutes tracked today.');
  PERFORM public.t_like('five minutes later it still reads as the first notice', public.t_why('Bob'), 'Their work day started at 9:00 AM EST and nothing has been tracked 65 minutes in.');
  PERFORM public.t_eq('and no history line', public.t_events('Bob', 'repeated'), 0::bigint);
  RAISE NOTICE 'PASS 1: first notice unchanged, and not rewritten a few minutes later';
END $$;

-- ── 2. built on ────────────────────────────────────────────────────────────
DO $$
DECLARE n bigint;
BEGIN
  PERFORM public.agent_run_rules('2026-11-18T15:30:00Z');
  PERFORM public.t_eq('title builds on', (public.t_flag('TR01', 'Bob')).title, 'Still not tracking time');
  PERFORM public.t_like('Bob: still not tracking at 10:30', public.t_why('Bob'),
    'Bob still isn''t tracking, and it''s 10:30 AM EST. Their work day started at 9:00 AM EST and nothing has been tracked yet. First noticed at 10:00 AM EST, 30 min ago.');
  SELECT count(*) INTO n FROM public.agent_flags f JOIN public.profiles p ON p.id = f.person_id WHERE f.rule_code = 'TR01' AND p.full_name = 'Bob';
  PERFORM public.t_eq('still ONE card for Bob', n, 1::bigint);
  PERFORM public.t_eq('first noticed is kept in the evidence', (public.t_flag('TR01', 'Bob')).evidence ->> 'first_noticed_at', '2026-11-18T15:00:00+00:00');
  PERFORM public.t_eq('Bob has no history line yet (30 minutes)', public.t_events('Bob', 'repeated'), 0::bigint);
  PERFORM public.t_like('Cara built on', public.t_why('Cara'),
    'Cara still isn''t tracking, and it''s 10:30 AM EST. Last tracked at 9:20 AM EST (1 h 10 min ago), 20 minutes tracked today. First noticed at 10:05 AM EST, 25 min ago.');
  RAISE NOTICE 'PASS 2: the same card says who still is not tracking and what time it is';
END $$;

-- ── 3. the history ─────────────────────────────────────────────────────────
DO $$
BEGIN
  PERFORM public.agent_run_rules('2026-11-18T16:05:00Z');   -- Bob: 125 minutes, becomes high
  PERFORM public.t_eq('high priority', (public.t_flag('TR01', 'Bob')).severity, 'high');
  PERFORM public.t_eq('one escalated line', public.t_events('Bob', 'escalated'), 1::bigint);
  PERFORM public.agent_run_rules('2026-11-18T16:06:00Z');
  PERFORM public.t_eq('not one per minute', public.t_events('Bob', 'escalated'), 1::bigint);
  PERFORM public.t_eq('and no hourly line yet', public.t_events('Bob', 'repeated'), 0::bigint);
  PERFORM public.agent_run_rules('2026-11-18T17:10:00Z');
  PERFORM public.t_eq('an hour later: one "checked again" line', public.t_events('Bob', 'repeated'), 1::bigint);
  PERFORM public.t_like('with the time', (SELECT detail ->> 'note' FROM public.agent_flag_events WHERE flag_id = (public.t_flag('TR01', 'Bob')).id AND kind = 'repeated'),
    'Still not tracking at 12:10 PM EST (2 h 10 min since first noticed).');
  PERFORM public.agent_run_rules('2026-11-18T17:11:00Z');
  PERFORM public.t_eq('still one', public.t_events('Bob', 'repeated'), 1::bigint);
  RAISE NOTICE 'PASS 3: history lines on escalation and about hourly, never per minute';
END $$;

-- ── 4. tracked, then stopped again ─────────────────────────────────────────
DO $$
BEGIN
  INSERT INTO public.time_entries (employee_id, start_time, end_time, duration_minutes) VALUES ('a0000000-0000-0000-0000-000000000003', '2026-11-18T17:15:00Z', '2026-11-18T17:20:00Z', 5);
  PERFORM public.agent_run_rules('2026-11-18T17:21:00Z');
  PERFORM public.t_eq('Bob tracked: closed by the agent', (public.t_flag('TR01', 'Bob')).status, 'auto_resolved');
  PERFORM public.agent_run_rules('2026-11-18T18:10:00Z');   -- 50 minutes after he stopped
  PERFORM public.t_eq('Bob not tracking again: the same card reopens', (public.t_flag('TR01', 'Bob')).status, 'open');
  PERFORM public.t_like('and says he stopped again', public.t_why('Bob'),
    'Bob stopped tracking again, and it''s 1:10 PM EST. Last tracked at 12:20 PM EST (50 min ago), 5 minutes tracked today.%');
  RAISE NOTICE 'PASS 4: stopped tracking again';
END $$;

-- ── 5. handled cards are left alone ────────────────────────────────────────
DO $$
DECLARE v_before bigint;
BEGIN
  UPDATE public.agent_flags SET status = 'handled' WHERE id = (public.t_flag('TR01', 'Cara')).id;
  v_before := (SELECT count(*) FROM public.agent_flag_events WHERE flag_id = (public.t_flag('TR01', 'Cara')).id);
  PERFORM public.agent_run_rules('2026-11-18T19:30:00Z');
  PERFORM public.t_eq('a handled card gets no new history', (SELECT count(*) FROM public.agent_flag_events WHERE flag_id = (public.t_flag('TR01', 'Cara')).id), v_before);
  PERFORM public.t_eq('and stays handled', (public.t_flag('TR01', 'Cara')).status, 'handled');
  RAISE NOTICE 'PASS 5: handled stays handled';
END $$;

-- ── 6. the rules ───────────────────────────────────────────────────────────
DO $$
DECLARE r text;
BEGIN
  SELECT operating_rules INTO r FROM public.agent_settings WHERE id;
  PERFORM public.t_eq('the Operational lead section is in the rules, once', (length(r) - length(replace(r, '## Operational lead', ''))) / length('## Operational lead'), 1);
  PERFORM public.t_eq('the rest of the rules are kept', position('## Escalation' IN r) > 0, true);
  RAISE NOTICE 'PASS 6: operating rules';
END $$;

ROLLBACK;
SELECT 'ok' AS agent_operational_lead;
