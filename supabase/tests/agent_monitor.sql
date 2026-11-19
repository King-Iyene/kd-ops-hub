-- =============================================================================
-- Ops Agent v3 — contract tests for the always-on monitor
--
-- Run AFTER migrations 20261408000000 .. 20261410000100:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/agent_monitor.sql
-- Everything is rolled back. The clock is fixed: Wednesday 2026-11-18, 15:00 UTC = 10:00 EST.
--
-- What this proves
--   1  the team is KD Squares only, Field Agents excluded
--   2  TR01 not tracking: flags the person who has not started, not the one tracking, on leave, exempt,
--      placed, a Field Agent or NDI; closes itself when they start; severity rises; nothing on a weekend
--   3  TR05 sites: unproductive and unfamiliar sites flag on the first sighting; approved, productive, common
--      and one-off sites do not; Field Agents and NDI are never looked at
--   4  tasks: overdue by days, due date moved (not first set), no open tasks, ready for review, completed
--   5  RP01 missing report only after the deadline, closes when it arrives
--   6  running twice never duplicates; a handled item stays handled; a disabled rule does nothing
--   7  the pulse numbers; who may call what
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

-- ── 1. the team ────────────────────────────────────────────────────────────
DO $$
DECLARE v_names text;
BEGIN
  SELECT string_agg(full_name, ',' ORDER BY full_name) INTO v_names FROM public.agent_team_v;
  PERFORM public.t_eq('the team is KD Squares, no Field Agents, nobody at NDI, a title that merely mentions Field Agents counts as one',
                      v_names, 'Alice,Bob,Cara,Finn,Gus,Hana,Sue Super');
  IF EXISTS (SELECT 1 FROM agent_read.v_people WHERE full_name IN ('Dan', 'Eve', 'Ivy')) THEN RAISE EXCEPTION 'FAIL: the reader view lists a non-team person'; END IF;
  IF EXISTS (SELECT 1 FROM agent_read.v_tasks WHERE title IN ('Dan overdue', 'Eve overdue')) THEN RAISE EXCEPTION 'FAIL: the reader view lists a non-team task'; END IF;
  IF EXISTS (SELECT 1 FROM agent_read.v_activity_domains WHERE employee_id IN ('a0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000006')) THEN RAISE EXCEPTION 'FAIL: the reader view shows non-team activity'; END IF;
  PERFORM public.t_eq('time is Eastern', (SELECT timezone FROM public.agent_settings), 'America/New_York');
  RAISE NOTICE 'PASS 1: the agent sees the KD Squares team only (no Field Agents, no NDI) in every reader view; time zone is Eastern';
END $$;

-- ── 2. TR01 not tracking ───────────────────────────────────────────────────
DO $$
DECLARE r jsonb; fl public.agent_flags;
BEGIN
  r := public.agent_run_rules('2026-11-18T15:00:00Z');
  PERFORM public.t_eq('Bob is not tracking, and neither is Sue (leadership still tracks unless exempt; only Super Admins see her flag)', (SELECT string_agg(p.full_name, ',' ORDER BY p.full_name) FROM public.agent_flags f JOIN public.profiles p ON p.id = f.person_id WHERE f.rule_code = 'TR01' AND f.status = 'open'), 'Bob,Sue Super');
  fl := public.t_flag('TR01', 'Bob');
  PERFORM public.t_eq('medium at 60 minutes', fl.severity, 'medium');
  PERFORM public.t_eq('evidence: nothing tracked', (fl.evidence ->> 'tracked_minutes_today')::int, 0);
  PERFORM public.t_eq('company and module set', fl.company_id, 'c0000000-0000-0000-0000-000000000001'::uuid);
  PERFORM public.t_eq('module', fl.module, 'track');
  PERFORM public.t_eq('period is the Eastern day', fl.period_key, '2026-11-18');
  PERFORM public.t_eq('an event records it', (SELECT count(*) FROM public.agent_flag_events WHERE flag_id = fl.id AND kind = 'created'), 1::bigint);
  IF fl.why NOT LIKE '%opened 60 minutes ago%' THEN RAISE EXCEPTION 'FAIL: why text: %', fl.why; END IF;

  -- running again changes nothing
  PERFORM public.agent_run_rules('2026-11-18T15:00:00Z');
  PERFORM public.agent_run_rules('2026-11-18T15:01:00Z');
  PERFORM public.t_eq('no duplicates after three runs', public.t_count('TR01'), 2::bigint);
  PERFORM public.t_eq('one created event only', (SELECT count(*) FROM public.agent_flag_events WHERE flag_id = fl.id), 1::bigint);

  -- Cara stopped at 09:20 EST: idle 40 min at 10:00 is fine, 70 min at 10:30 is not, 130 min is high
  PERFORM public.t_eq('Cara 40 minutes idle is not flagged', public.t_count('TR01'), 2::bigint);
  PERFORM public.agent_run_rules('2026-11-18T15:30:00Z');
  fl := public.t_flag('TR01', 'Cara');
  PERFORM public.t_eq('Cara flagged at 70 minutes idle', fl.severity, 'medium');
  IF fl.why NOT LIKE 'Stopped tracking at 9:20 AM EST%' THEN RAISE EXCEPTION 'FAIL: Cara why text (EST): %', fl.why; END IF;
  PERFORM public.agent_run_rules('2026-11-18T16:30:00Z');
  PERFORM public.t_eq('severity rises to high at 2 hours', (public.t_flag('TR01', 'Cara')).severity, 'high');
  PERFORM public.t_eq('still one flag for Cara', (SELECT count(*) FROM public.agent_flags f2 JOIN public.profiles p ON p.id = f2.person_id WHERE f2.rule_code = 'TR01' AND p.full_name = 'Cara'), 1::bigint);

  -- Bob starts a timer: the agent closes it by itself
  INSERT INTO public.time_entries (employee_id, start_time, end_time) VALUES ('a0000000-0000-0000-0000-000000000003', '2026-11-18T16:35:00Z', NULL);
  PERFORM public.agent_run_rules('2026-11-18T16:36:00Z');
  PERFORM public.t_eq('Bob closed', (public.t_flag('TR01', 'Bob')).status, 'auto_resolved');
  PERFORM public.t_eq('closing is recorded', (SELECT count(*) FROM public.agent_flag_events WHERE flag_id = (public.t_flag('TR01', 'Bob')).id AND kind = 'auto_resolved'), 1::bigint);
  -- and comes back with a new count if he stops again
  UPDATE public.time_entries SET end_time = '2026-11-18T16:40:00Z', duration_minutes = 5 WHERE employee_id = 'a0000000-0000-0000-0000-000000000003';
  PERFORM public.agent_run_rules('2026-11-18T17:30:00Z');
  PERFORM public.t_eq('Bob flagged again', (public.t_flag('TR01', 'Bob')).status, 'open');
  PERFORM public.t_eq('with a higher count', (public.t_flag('TR01', 'Bob')).occurrence_count, 2);

  -- nobody else was ever flagged
  IF EXISTS (SELECT 1 FROM public.agent_flags f JOIN public.profiles p ON p.id = f.person_id WHERE f.rule_code = 'TR01' AND p.full_name IN ('Alice', 'Dan', 'Eve', 'Finn', 'Gus', 'Hana')) THEN
    RAISE EXCEPTION 'FAIL: TR01 flagged someone who tracks, is on leave, exempt, placed, leadership, a Field Agent or at NDI'; END IF;
  RAISE NOTICE 'PASS 2: TR01 flags exactly the people who should be tracking and are not; closes itself; reopens; severity rises; times are EST';
END $$;

-- weekend and after hours: nothing new
DO $$
DECLARE v_before bigint := (SELECT count(*) FROM public.agent_flags WHERE rule_code = 'TR01');
BEGIN
  DELETE FROM public.agent_flags WHERE rule_code = 'TR01';
  PERFORM public.agent_run_rules('2026-11-21T15:00:00Z'); -- Saturday
  PERFORM public.agent_run_rules('2026-11-18T23:00:00Z'); -- 18:00 EST, after the work window
  PERFORM public.t_eq('no TR01 on a Saturday or after 17:00 EST', public.t_count('TR01'), 0::bigint);
  RAISE NOTICE 'PASS 2b: no "not tracking" flags on a weekend or outside the work window';
END $$;

-- A person who already tracked most of a full day and stopped is done, not slacking (15:00 EST, 7 hours tracked, idle 60 min);
-- someone with the same idle time but 2 hours tracked is flagged.
INSERT INTO public.profiles (id, email, full_name, role, status, pay_group_id) VALUES
  ('a0000000-0000-0000-0000-0000000000f1', 'zed@t.local', 'Zed', 'operations', 'active', 'e0000000-0000-0000-0000-000000000001'),
  ('a0000000-0000-0000-0000-0000000000f2', 'yan@t.local', 'Yan', 'operations', 'active', 'e0000000-0000-0000-0000-000000000001');
INSERT INTO public.agent_person_profile (person_id, group_name, group_source, exemptions) VALUES
  ('a0000000-0000-0000-0000-0000000000f1', 'core', 'manual', '{}'), ('a0000000-0000-0000-0000-0000000000f2', 'core', 'manual', '{}');
INSERT INTO public.time_entries (employee_id, start_time, end_time, duration_minutes) VALUES
  ('a0000000-0000-0000-0000-0000000000f1', '2026-11-18T12:00:00Z', '2026-11-18T19:00:00Z', 420),
  ('a0000000-0000-0000-0000-0000000000f2', '2026-11-18T17:00:00Z', '2026-11-18T19:00:00Z', 120);
INSERT INTO public.tm_tasks (title, status, assignee_id, due_date) VALUES
  ('Zed work', 'to_do', 'a0000000-0000-0000-0000-0000000000f1', '2026-12-30'),
  ('Yan work', 'to_do', 'a0000000-0000-0000-0000-0000000000f2', '2026-12-30');
DO $$
BEGIN
  DELETE FROM public.agent_flags WHERE rule_code = 'TR01';
  PERFORM public.agent_run_rules('2026-11-18T20:00:00Z');
  IF EXISTS (SELECT 1 FROM public.agent_flags f JOIN public.profiles p ON p.id = f.person_id WHERE f.rule_code = 'TR01' AND p.full_name = 'Zed') THEN
    RAISE EXCEPTION 'FAIL: Zed tracked 7 hours and was flagged for not tracking'; END IF;
  PERFORM public.t_eq('Yan tracked 2 hours and stopped an hour ago: flagged', (public.t_flag('TR01', 'Yan')).status, 'open');
  RAISE NOTICE 'PASS 2c: someone who already tracked most of a work day is not flagged for stopping';
END $$;

-- ── 3. TR05 sites ──────────────────────────────────────────────────────────
DO $$
DECLARE fl public.agent_flags; v_sites jsonb;
BEGIN
  PERFORM public.agent_run_rules('2026-11-18T15:00:00Z');
  fl := public.t_flag('TR05', 'Bob');
  PERFORM public.t_eq('Bob has a site flag', fl.status, 'open');
  v_sites := fl.evidence -> 'sites';
  PERFORM public.t_eq('two sites listed: youtube, unknownsite', jsonb_array_length(v_sites), 2);
  PERFORM public.t_eq('unproductive first', v_sites -> 0 ->> 'domain', 'youtube.com');
  PERFORM public.t_eq('youtube is unproductive', v_sites -> 0 ->> 'category', 'unproductive');
  PERFORM public.t_eq('5 captures is about 5 minutes', (v_sites -> 0 ->> 'seconds')::int, 300);
  PERFORM public.t_eq('unfamiliar site', v_sites -> 1 ->> 'category', 'unknown');
  PERFORM public.t_eq('title names the site', fl.title, 'Unproductive site: youtube.com');
  PERFORM public.t_eq('medium while under 15 minutes of unproductive', fl.severity, 'medium');
  IF v_sites::text LIKE '%github%' OR v_sites::text LIKE '%approved-listed%' OR v_sites::text LIKE '%common.io%' OR v_sites::text LIKE '%once.xyz%' THEN
    RAISE EXCEPTION 'FAIL: a productive, approved, common or one-off site was flagged: %', v_sites; END IF;
  PERFORM public.t_eq('only Bob has a site flag (not Dan or Eve, not people who only visited common.io)', public.t_count('TR05'), 1::bigint);
  IF fl.why NOT LIKE 'Today: youtube.com 5 min, unknownsite.xyz 3 min.' THEN RAISE EXCEPTION 'FAIL: why %', fl.why; END IF;

  -- immediate: a new capture shows up at the next run
  INSERT INTO public.time_activity_logs (employee_id, captured_at, app_name, url, productivity_category) VALUES
    ('a0000000-0000-0000-0000-000000000004', '2026-11-18T14:55:00Z', 'Chrome', 'https://tiktok.com/', 'unproductive');
  PERFORM public.agent_run_rules('2026-11-18T14:56:00Z');
  PERFORM public.t_eq('Cara flagged for tiktok on the first capture', (public.t_flag('TR05', 'Cara')).title, 'Unproductive site: tiktok.com');
  -- a site that becomes common (3 people) stops being unfamiliar
  INSERT INTO public.time_activity_logs (employee_id, captured_at, app_name, url, productivity_category)
  SELECT p, '2026-11-18T14:57:00Z', 'Chrome', 'https://unknownsite.xyz/', NULL FROM unnest(ARRAY['a0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000004']::uuid[]) p;
  PERFORM public.agent_run_rules('2026-11-18T15:00:00Z');
  v_sites := (public.t_flag('TR05', 'Bob')).evidence -> 'sites';
  PERFORM public.t_eq('unknownsite is now common and drops out; youtube stays', jsonb_array_length(v_sites), 1);

  -- handled stays handled
  UPDATE public.agent_flags SET status = 'handled' WHERE id = (public.t_flag('TR05', 'Bob')).id;
  PERFORM public.agent_run_rules('2026-11-18T15:02:00Z');
  PERFORM public.t_eq('a handled item is not reopened by the monitor', (public.t_flag('TR05', 'Bob')).status, 'handled');
  RAISE NOTICE 'PASS 3: unproductive and unfamiliar sites flag on the first sighting; approved, productive, common and one-off sites do not; non-team never';
END $$;

-- ── 4. tasks ───────────────────────────────────────────────────────────────
DO $$
DECLARE fl public.agent_flags;
BEGIN
  PERFORM public.agent_run_rules('2026-11-18T15:00:00Z');
  PERFORM public.t_eq('two overdue tasks, only for the team (not Dan or Eve)', public.t_count('TK01'), 2::bigint);
  PERFORM public.t_eq('2 days late is low', (SELECT severity FROM public.agent_flags WHERE rule_code = 'TK01' AND subject_id = 'b1000000-0000-0000-0000-000000000001'), 'low');
  PERFORM public.t_eq('8 days late is high', (SELECT severity FROM public.agent_flags WHERE rule_code = 'TK01' AND subject_id = 'b1000000-0000-0000-0000-000000000002'), 'high');
  PERFORM public.t_eq('evidence carries the days', (SELECT (evidence ->> 'days_overdue')::int FROM public.agent_flags WHERE rule_code = 'TK01' AND subject_id = 'b1000000-0000-0000-0000-000000000002'), 8);
  UPDATE public.tm_tasks SET status = 'done' WHERE id = 'b1000000-0000-0000-0000-000000000001';
  PERFORM public.agent_run_rules('2026-11-18T15:01:00Z');
  PERFORM public.t_eq('finishing the task closes its overdue flag', (SELECT status FROM public.agent_flags WHERE rule_code = 'TK01' AND subject_id = 'b1000000-0000-0000-0000-000000000001'), 'auto_resolved');

  PERFORM public.t_eq('one due date moved (the first-ever set is not a move)', public.t_count('TK02'), 1::bigint);
  fl := public.t_flag('TK02', 'Bob');
  PERFORM public.t_eq('high', fl.severity, 'high');
  PERFORM public.t_eq('old and new date recorded', fl.evidence ->> 'from' || '>' || (fl.evidence ->> 'to'), '2026-11-20>2026-11-25');
  PERFORM public.t_eq('who moved it', fl.evidence ->> 'by_name', 'Sue Super');

  PERFORM public.t_eq('only Cara has no open tasks (not placed, leadership, on leave)', (SELECT string_agg(p.full_name, ',') FROM public.agent_flags f2 JOIN public.profiles p ON p.id = f2.person_id WHERE f2.rule_code = 'TK06' AND f2.status = 'open'), 'Cara');
  INSERT INTO public.tm_tasks (title, status, assignee_id, due_date) VALUES ('Cara gets work', 'to_do', 'a0000000-0000-0000-0000-000000000004', '2026-11-30');
  PERFORM public.agent_run_rules('2026-11-18T15:02:00Z');
  PERFORM public.t_eq('giving her a task closes the flag', public.t_count('TK06'), 0::bigint);

  fl := public.t_flag('TK13', 'Bob');
  PERFORM public.t_eq('ready for review is flagged at once', fl.title, 'Ready for review: Bob review me');
  PERFORM public.t_eq('low', fl.severity, 'low');
  PERFORM public.t_eq('completed is flagged at once', (public.t_flag('TK14', 'Bob')).title, 'Completed: Bob finished');
  PERFORM public.t_eq('completed is info', (public.t_flag('TK14', 'Bob')).severity, 'info');
  PERFORM public.t_eq('no completed flag for a Field Agent or NDI task', public.t_count('TK14'), 1::bigint);
  UPDATE public.tm_tasks SET status = 'done' WHERE id = 'b1000000-0000-0000-0000-000000000003';
  PERFORM public.agent_run_rules('2026-11-18T15:03:00Z');
  PERFORM public.t_eq('review flag closes when the task leaves In Review', (public.t_flag('TK13', 'Bob')).status, 'auto_resolved');
  PERFORM public.agent_run_rules('2026-11-19T15:30:00Z');
  PERFORM public.t_eq('completed items clear after a day', (public.t_flag('TK14', 'Bob')).status, 'auto_resolved');
  RAISE NOTICE 'PASS 4: overdue (with severity), due date moved, no open tasks, ready for review and completed, each with its own clearing rule';
END $$;

-- ── 5. RP01 missing report ─────────────────────────────────────────────────
DO $$
BEGIN
  DELETE FROM public.agent_flags WHERE rule_code = 'RP01';
  PERFORM public.agent_run_rules('2026-11-18T22:59:00Z'); -- 17:59 EST: before the deadline
  PERFORM public.t_eq('nothing before the deadline', public.t_count('RP01'), 0::bigint);
  PERFORM public.agent_run_rules('2026-11-18T23:03:00Z'); -- 18:03 EST: inside the 5 minute grace
  PERFORM public.t_eq('nothing within 5 minutes of the deadline', public.t_count('RP01'), 0::bigint);
  PERFORM public.agent_run_rules('2026-11-18T23:10:00Z'); -- 18:10 EST
  PERFORM public.t_eq('Bob, Cara, Hana, Yan and Zed have not reported; Alice has; Gus is on leave; Finn is placed; Sue is leadership; Dan and Eve are not the team',
    (SELECT string_agg(p.full_name, ',' ORDER BY p.full_name) FROM public.agent_flags f JOIN public.profiles p ON p.id = f.person_id WHERE f.rule_code = 'RP01' AND f.status = 'open'), 'Bob,Cara,Hana,Yan,Zed');
  PERFORM public.t_eq('high', (public.t_flag('RP01', 'Bob')).severity, 'high');
  IF (public.t_flag('RP01', 'Bob')).why NOT LIKE '%The deadline was 6:00 PM EST.' THEN RAISE EXCEPTION 'FAIL: why %', (public.t_flag('RP01', 'Bob')).why; END IF;
  INSERT INTO public.tm_table_records (table_id, data) VALUES
    ('d0000000-0000-0000-0000-0000000000a1', jsonb_build_object('f0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003', 'f0000000-0000-0000-0000-000000000002', '2026-11-18'));
  PERFORM public.agent_run_rules('2026-11-18T23:20:00Z');
  PERFORM public.t_eq('a late report closes the flag', (public.t_flag('RP01', 'Bob')).status, 'auto_resolved');
  PERFORM public.t_eq('the others stay open', public.t_count('RP01'), 4::bigint);
  RAISE NOTICE 'PASS 5: RP01 waits for the deadline plus 5 minutes, skips leave, placement, leadership and non-team, and closes when the report arrives';
END $$;

-- ── 6. switches and failures ───────────────────────────────────────────────
DO $$
DECLARE v_total bigint; r jsonb;
BEGIN
  SELECT count(*) INTO v_total FROM public.agent_flags;
  PERFORM public.agent_run_rules('2026-11-18T23:20:00Z');
  PERFORM public.agent_run_rules('2026-11-18T23:21:00Z');
  PERFORM public.t_eq('idempotent: running again adds no rows', (SELECT count(*) FROM public.agent_flags), v_total);

  DELETE FROM public.agent_flags WHERE rule_code = 'TR01';
  UPDATE public.agent_rules SET enabled = false WHERE code = 'TR01';
  PERFORM public.agent_run_rules('2026-11-18T15:30:00Z');
  PERFORM public.t_eq('a disabled rule raises nothing', public.t_count('TR01'), 0::bigint);
  UPDATE public.agent_rules SET enabled = true WHERE code = 'TR01';

  -- a rule that breaks is isolated, reported, and clears once it works again
  ALTER FUNCTION public.agent_rule_tr02(timestamptz) RENAME TO agent_rule_tr02_real;
  CREATE FUNCTION public.agent_rule_tr02(p timestamptz DEFAULT now()) RETURNS jsonb LANGUAGE plpgsql AS $f$ BEGIN RAISE EXCEPTION 'boom'; END $f$;
  r := public.agent_run_rules('2026-11-18T15:31:00Z');
  PERFORM public.t_eq('the failure is reported', r -> 'errors', '["TR02"]'::jsonb);
  PERFORM public.t_eq('the other rules still ran', (SELECT count(*) FROM public.agent_flags WHERE rule_code = 'TR01' AND status = 'open') > 0, true);
  PERFORM public.t_eq('a system item says which rule failed', public.t_count('SY03'), 1::bigint);
  PERFORM public.t_eq('it is in the run log', (SELECT count(*) FROM public.agent_rule_runs WHERE rule_code = 'TR02' AND error LIKE '%boom%'), 1::bigint);
  DROP FUNCTION public.agent_rule_tr02(timestamptz);
  ALTER FUNCTION public.agent_rule_tr02_real(timestamptz) RENAME TO agent_rule_tr02;
  r := public.agent_run_rules('2026-11-18T15:32:00Z');
  PERFORM public.t_eq('no errors once it works', r -> 'errors', '[]'::jsonb);
  PERFORM public.t_eq('and the failure item clears itself', public.t_count('SY03'), 0::bigint);
  RAISE NOTICE 'PASS 6: running twice never duplicates; a disabled rule does nothing; a failing rule is isolated, reported and cleared';
END $$;

-- ── 7. pulse and permissions ───────────────────────────────────────────────
SELECT public.t_as('a0000000-0000-0000-0000-000000000001');
DO $$
DECLARE v jsonb;
BEGIN
  v := public.agent_team_pulse();
  PERFORM public.t_eq('team size', (v ->> 'team_size')::int, 9);
  PERFORM public.t_eq('only Alice has a running timer', (v ->> 'tracking_now')::int, 1);
  PERFORM public.t_eq('time zone', v ->> 'tz', 'America/New_York');
  PERFORM public.t_eq('deadline label', v ->> 'reports_due_at', '18:00');
  PERFORM public.t_eq('last run is recorded', v ->> 'last_run_at' IS NOT NULL, true);
  PERFORM public.t_eq('rules are active', (v ->> 'rules_active')::int >= 9, true);
  PERFORM public.t_eq('open flag count matches', (v ->> 'open_flags')::int, (SELECT count(*)::int FROM public.agent_flags WHERE status = 'open'));
  PERFORM public.t_eq('Super can check now', (public.agent_check_now() ->> 'errors'), '[]');
END $$;
SELECT public.t_as('a0000000-0000-0000-0000-000000000002');
DO $$
BEGIN
  PERFORM public.t_denied($q$SELECT public.agent_run_rules()$q$, 'a signed-in user running the monitor');
  PERFORM public.t_denied($q$SELECT public.agent_rule_tr01()$q$, 'a signed-in user running a rule');
  PERFORM public.t_denied($q$SELECT public.agent_raise_flag('X', NULL, NULL, 'system', 'x', '', 'low', 't', 'w', '{}')$q$, 'a signed-in user raising an item');
  PERFORM public.t_denied($q$SELECT * FROM public.agent_team_v$q$, 'a signed-in user reading the team view');
  PERFORM public.t_denied($q$SELECT * FROM public.agent_monitor_state$q$, 'a signed-in user reading monitor state');
END $$;
SELECT public.t_as('a0000000-0000-0000-0000-000000000003');
DO $$
BEGIN
  PERFORM public.t_denied($q$SELECT public.agent_team_pulse()$q$, 'a member reading the pulse');
  PERFORM public.t_denied($q$SELECT public.agent_check_now()$q$, 'a member running a check');
  RAISE NOTICE 'PASS 7: the pulse is correct; only Super Admin and Admin can read it or check now; nobody signed in can run or write the monitor directly';
END $$;

-- ── 8. the v4 rules, the switches, and the site list ───────────────────────
-- Tuesday 2026-11-24, 10:00 EST. Fixed times, so the result never depends on today's date.
SELECT public.t_as(NULL);
DELETE FROM public.agent_flags;
UPDATE public.tm_tasks SET status = 'done' WHERE id::text LIKE 'b1%';  -- the earlier groups' tasks are out of the way
INSERT INTO public.tm_tasks (id, title, description, status, assignee_id, due_date, created_at, updated_at) VALUES
  ('b2000000-0000-0000-0000-000000000001', 'Blocked 4 days',    'Waiting on a vendor to reply with the pricing the team needs.', 'blocked',     'a0000000-0000-0000-0000-000000000002', '2026-12-20', '2026-11-10T15:00:00Z', '2026-11-20T15:00:00Z'),
  ('b2000000-0000-0000-0000-000000000002', 'Blocked 1 day',     'Waiting on a vendor to reply with the pricing the team needs.', 'blocked',     'a0000000-0000-0000-0000-000000000002', '2026-12-20', '2026-11-10T15:00:00Z', '2026-11-23T15:00:00Z'),
  ('b2000000-0000-0000-0000-000000000003', 'Stalled 8 days',    'Draft the quarterly staffing report and send it to the manager.', 'in_progress', 'a0000000-0000-0000-0000-000000000003', '2026-12-20', '2026-11-10T15:00:00Z', '2026-11-16T15:00:00Z'),
  ('b2000000-0000-0000-0000-000000000004', 'Moving today',      'Draft the quarterly staffing report and send it to the manager.', 'in_progress', 'a0000000-0000-0000-0000-000000000003', '2026-12-20', '2026-11-10T15:00:00Z', '2026-11-24T14:00:00Z'),
  ('b2000000-0000-0000-0000-000000000005', 'Review 2 days',     'Check the onboarding checklist against the new policy and sign off.', 'in_review', 'a0000000-0000-0000-0000-000000000004', '2026-12-20', '2026-11-10T15:00:00Z', '2026-11-22T15:00:00Z'),
  ('b2000000-0000-0000-0000-000000000006', 'No words',          NULL,                                                            'to_do',       'a0000000-0000-0000-0000-000000000004', '2026-12-20', '2026-11-20T15:00:00Z', '2026-11-20T15:00:00Z'),
  ('b2000000-0000-0000-0000-000000000007', 'Due tomorrow',      'Prepare the vendor comparison table with three quotes and a pick.', 'to_do',       'a0000000-0000-0000-0000-000000000004', '2026-11-25', '2026-11-20T15:00:00Z', '2026-11-20T15:00:00Z'),
  ('b2000000-0000-0000-0000-000000000008', 'Due today',         'Prepare the vendor comparison table with three quotes and a pick.', 'to_do',       'a0000000-0000-0000-0000-000000000004', '2026-11-24', '2026-11-20T15:00:00Z', '2026-11-20T15:00:00Z'),
  ('b2000000-0000-0000-0000-000000000009', 'Ancient stall',     'Draft the quarterly staffing report and send it to the manager.', 'in_progress', 'a0000000-0000-0000-0000-000000000003', '2026-12-20', '2026-08-10T15:00:00Z', '2026-08-16T15:00:00Z');
SELECT public.agent_run_rules('2026-11-24T15:00:00Z');
DO $$
DECLARE v_sev text;
BEGIN
  PERFORM public.t_eq('TK04: only the task blocked 2+ days', (SELECT string_agg(f.evidence ->> 'task_title', ',') FROM public.agent_flags f WHERE f.rule_code = 'TK04' AND f.status = 'open'), 'Blocked 4 days');
  PERFORM public.t_eq('TK05: only the stalled task (not the one that moved today, not the abandoned one)', (SELECT string_agg(f.evidence ->> 'task_title', ',') FROM public.agent_flags f WHERE f.rule_code = 'TK05' AND f.status = 'open'), 'Stalled 8 days');
  SELECT severity INTO v_sev FROM public.agent_flags WHERE rule_code = 'TK05' AND status = 'open';
  PERFORM public.t_eq('TK05: 8 days is medium', v_sev, 'medium');
  PERFORM public.t_eq('TK08: waiting for review', (SELECT string_agg(f.evidence ->> 'task_title', ',') FROM public.agent_flags f WHERE f.rule_code = 'TK08' AND f.status = 'open'), 'Review 2 days');
  PERFORM public.t_eq('TK07: the task without a description', (SELECT string_agg(f.evidence ->> 'task_title', ',') FROM public.agent_flags f WHERE f.rule_code = 'TK07' AND f.status = 'open' AND f.evidence ->> 'task_title' IN ('No words', 'Due today', 'Blocked 4 days')), 'No words');
  PERFORM public.t_eq('TK11: due today (medium) and tomorrow (low)', (SELECT string_agg(f.evidence ->> 'task_title' || ':' || f.severity, ',' ORDER BY f.evidence ->> 'task_title') FROM public.agent_flags f WHERE f.rule_code = 'TK11' AND f.status = 'open'), 'Due today:medium,Due tomorrow:low');
  -- the condition clears: the item closes by itself
  UPDATE public.tm_tasks SET status = 'in_progress', updated_at = '2026-11-24T15:30:00Z' WHERE id = 'b2000000-0000-0000-0000-000000000001';
  PERFORM public.agent_run_rules('2026-11-24T15:31:00Z');
  PERFORM public.t_eq('TK04 closes when the task moves', public.t_count('TK04'), 0::bigint);
  RAISE NOTICE 'PASS 8a: blocked, stalled, waiting for review, no description, due soon: each flags the right task and closes itself';
END $$;

-- Low hours: Wednesday 2026-11-25 07:00 EST looks back at Tuesday 2026-11-24. Cara tracks 20 minutes, Zed 7 hours, Yan 2 hours.
INSERT INTO public.leave_requests (employee_id, start_date, end_date, is_half_day, status) VALUES ('a0000000-0000-0000-0000-000000000008', '2026-11-24', '2026-11-24', false, 'approved');
INSERT INTO public.time_entries (employee_id, start_time, end_time, duration_minutes) VALUES
  ('a0000000-0000-0000-0000-000000000004', '2026-11-24T14:00:00Z', '2026-11-24T14:20:00Z', 20),
  ('a0000000-0000-0000-0000-0000000000f1', '2026-11-24T13:00:00Z', '2026-11-24T20:00:00Z', 420),
  ('a0000000-0000-0000-0000-0000000000f2', '2026-11-24T17:00:00Z', '2026-11-24T19:00:00Z', 120);
DELETE FROM public.agent_flags WHERE rule_code = 'TR03';  -- the run on the 24th looked back at the 23rd
SELECT public.agent_run_rules('2026-11-25T10:00:00Z');  -- 05:00 EST: too early, the night's data is still settling
DO $$ BEGIN PERFORM public.t_eq('TR03 waits until 6 AM', public.t_count('TR03'), 0::bigint); END $$;
SELECT public.agent_run_rules('2026-11-25T12:00:00Z');  -- 07:00 EST
DO $$
BEGIN
  PERFORM public.t_eq('TR03: Cara and Yan (not Zed; not on leave, exempt, placed or leadership)',
    (SELECT string_agg(p.full_name, ',' ORDER BY p.full_name) FROM public.agent_flags f JOIN public.profiles p ON p.id = f.person_id WHERE f.rule_code = 'TR03' AND f.status = 'open' AND p.full_name IN ('Cara', 'Yan', 'Zed', 'Gus', 'Hana', 'Finn', 'Sue Super')), 'Cara,Yan');
  PERFORM public.t_eq('TR03 severity: 20 minutes of 8 hours is high', (public.t_flag('TR03', 'Cara')).severity, 'high');
  PERFORM public.t_eq('TR03 severity: 2 hours of 8 is medium', (public.t_flag('TR03', 'Yan')).severity, 'medium');
  IF (public.t_flag('TR03', 'Cara')).why NOT LIKE '%tracked 20m of the expected 8h%' THEN RAISE EXCEPTION 'FAIL: TR03 wording %', (public.t_flag('TR03', 'Cara')).why; END IF;
  RAISE NOTICE 'PASS 8b: low hours yesterday flags only working people with under half the hours, and only after 6 AM';
END $$;

-- Two missed reports in a row: Wednesday 2026-11-25 at 6:10 PM EST; reports exist for nobody on the 24th or 25th
SELECT public.agent_run_rules('2026-11-25T23:10:00Z');
DO $$
BEGIN
  PERFORM public.t_eq('RP03 matches RP01 when yesterday was missed too', (SELECT string_agg(p.full_name, ',' ORDER BY p.full_name) FROM public.agent_flags f JOIN public.profiles p ON p.id = f.person_id WHERE f.rule_code = 'RP03' AND f.status = 'open'),
                                                                         (SELECT string_agg(p.full_name, ',' ORDER BY p.full_name) FROM public.agent_flags f JOIN public.profiles p ON p.id = f.person_id WHERE f.rule_code = 'RP01' AND f.status = 'open'));
  INSERT INTO public.tm_table_records (table_id, data) VALUES
    ('d0000000-0000-0000-0000-0000000000a1', jsonb_build_object('f0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000004', 'f0000000-0000-0000-0000-000000000002', '2026-11-24'));
  PERFORM public.agent_run_rules('2026-11-25T23:12:00Z');
  PERFORM public.t_eq('Cara sent the report for the day before: not RP03, still RP01 for today', (SELECT count(*) FROM public.agent_flags f JOIN public.profiles p ON p.id = f.person_id WHERE f.rule_code = 'RP03' AND f.status = 'open' AND p.full_name = 'Cara'), 0::bigint);
  PERFORM public.t_eq('Cara is still missing the one for today', (public.t_flag('RP01', 'Cara', 'open')).status, 'open');
  RAISE NOTICE 'PASS 8c: two missed reports in a row is its own, higher item, and clears when either day is covered';
END $$;

-- The switches. A rule that is off raises nothing and its open items close; a module that is off stops its rules.
DO $$
DECLARE v_n bigint;
BEGIN
  UPDATE public.agent_rules SET enabled = false WHERE code = 'TK08';
  PERFORM public.agent_run_rules('2026-11-25T23:13:00Z');
  PERFORM public.t_eq('rule off: its open items close', public.t_count('TK08'), 0::bigint);
  PERFORM public.t_eq('rule off: nothing is raised', public.agent_raise_flag('TK08', 'task', NULL, 'system', 'x', '', 'low', 't', 'w', '{}'), false);
  UPDATE public.agent_rules SET enabled = true WHERE code = 'TK08';
  PERFORM public.agent_run_rules('2026-11-25T23:14:00Z');
  PERFORM public.t_eq('rule back on: it raises again', public.t_count('TK08'), 1::bigint);

  UPDATE public.agent_module_access SET enabled = false WHERE module_key = 'reports';
  DELETE FROM public.agent_flags WHERE rule_code IN ('RP01', 'RP03');
  PERFORM public.agent_run_rules('2026-11-25T23:15:00Z');
  PERFORM public.t_eq('module off: its rules do not run', (SELECT count(*) FROM public.agent_flags WHERE rule_code IN ('RP01', 'RP03')), 0::bigint);
  UPDATE public.agent_module_access SET enabled = true WHERE module_key = 'reports';
  PERFORM public.agent_run_rules('2026-11-25T23:16:00Z');
  PERFORM public.t_eq('module on: they run again', public.t_count('RP01') > 0, true);

  -- a rule with a function but no row, or a row with no function, is skipped quietly
  INSERT INTO public.agent_rules (code, title, enabled, status) VALUES ('ZZ99', 'No function', true, 'ready');
  PERFORM public.agent_run_rules('2026-11-25T23:17:00Z');
  PERFORM public.t_eq('a rule with no function raises no error item', public.t_count('SY03'), 0::bigint);
  RAISE NOTICE 'PASS 8d: a rule or module that is switched off stops raising; switching it back on resumes';
END $$;

-- The site list, written the way the Inbox does it
INSERT INTO public.time_activity_logs (employee_id, captured_at, app_name, url, productivity_category) VALUES
  ('a0000000-0000-0000-0000-000000000002', '2026-11-26T14:00:00Z', 'Chrome', 'https://newtool.dev/a', NULL),
  ('a0000000-0000-0000-0000-000000000002', '2026-11-26T14:01:00Z', 'Chrome', 'https://newtool.dev/b', NULL);
SELECT public.agent_run_rules('2026-11-26T14:05:00Z');
DO $$ BEGIN
  PERFORM public.t_eq('a new site is flagged on the first sighting', (SELECT count(*) FROM public.agent_flags WHERE rule_code = 'TR05' AND status = 'open' AND evidence::text LIKE '%newtool.dev%'), 1::bigint);
END $$;
SELECT public.t_as('a0000000-0000-0000-0000-000000000001');
DO $$ BEGIN
  PERFORM public.t_eq('domain is cleaned', public.agent_domain_set('https://www.NewTool.dev/some/path?x=1', 'approved', 'manual', '2026-11-26T14:06:00Z') ->> 'domain', 'newtool.dev');
END $$;
DO $$ BEGIN
  BEGIN PERFORM public.agent_domain_set('not a domain', 'approved'); RAISE EXCEPTION 'FAIL: a bad domain was accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END $$;
RESET ROLE;
DO $$ BEGIN
  PERFORM public.t_eq('approving the site closes its open item right away', (SELECT count(*) FROM public.agent_flags WHERE rule_code = 'TR05' AND status = 'open' AND evidence::text LIKE '%newtool.dev%'), 0::bigint);
  PERFORM public.t_eq('and it is on the approved list', (SELECT category FROM public.agent_domain_list WHERE domain = 'newtool.dev'), 'approved');
  RAISE NOTICE 'PASS 8e: approving a site from the Inbox closes its item at once; the list is written by a Super Admin only';
END $$;
SELECT public.t_as('a0000000-0000-0000-0000-000000000002');
DO $$ BEGIN PERFORM public.t_denied($q$SELECT public.agent_domain_set('example.org', 'approved')$q$, 'an Admin editing the site list'); END $$;
RESET ROLE;


ROLLBACK;
