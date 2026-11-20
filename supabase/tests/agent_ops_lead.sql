-- =============================================================================
-- Ops Agent: setup gaps (SU01), follow-through (FT01), the morning briefing (BR01) and the weekly scorecard (SC01)
--
-- Run AFTER migrations 20261408000000 .. 20261423000000:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/agent_ops_lead.sql
-- Everything is rolled back. The clock is fixed: Wednesday 2026-11-18, 15:00 UTC = 10:00 EST.
--
-- What this proves
--   1  SU01: people without a manager or a team group are listed once, the item closes itself when fixed, leadership and placement are not
--      asked for a manager, and one item says how many people have no Cliq ID (only while a Cliq connection exists)
--   2  FT01: 24 hours after a message, a still-open item is followed up once, then 24 hours later the manager is asked, each stage once;
--      nothing outside working hours, for handled items, low items, or items nobody was told about
--   3  (the morning briefing was removed; see 20261426)
--   4  SC01: on the first working day of the week the last week is written up per manager, with the three-weeks-down mark
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


CREATE FUNCTION public.t_like(p_label text, p_got text, p_pat text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF p_got IS NULL OR p_got NOT LIKE p_pat THEN RAISE EXCEPTION 'FAIL: % (got "%", want like "%")', p_label, p_got, p_pat; END IF; END $$;
CREATE FUNCTION public.t_su(p_subject text) RETURNS public.agent_flags LANGUAGE sql AS $$
  SELECT f.* FROM public.agent_flags f WHERE f.rule_code = 'SU01' AND f.subject_id = p_subject ORDER BY f.created_at DESC LIMIT 1
$$;

-- ── 1. setup gaps ──────────────────────────────────────────────────────────
DO $$
DECLARE r jsonb;
BEGIN
  r := public.agent_run_rules('2026-11-18T15:00:00Z');
  PERFORM public.t_eq('Bob has no manager: listed', (public.t_su('a0000000-0000-0000-0000-000000000003')).status, 'open');
  PERFORM public.t_like('and the reason says so', (public.t_su('a0000000-0000-0000-0000-000000000003')).why, 'Bob is not fully set up: no manager is set%');
  PERFORM public.t_eq('it is low priority', (public.t_su('a0000000-0000-0000-0000-000000000003')).severity, 'low');
  IF public.t_su('a0000000-0000-0000-0000-000000000001') IS NOT NULL AND (public.t_su('a0000000-0000-0000-0000-000000000001')).id IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL: leadership (Sue) is not asked for a manager'; END IF;
  IF (public.t_su('a0000000-0000-0000-0000-000000000007')).id IS NOT NULL THEN RAISE EXCEPTION 'FAIL: placed staff (Finn) are not asked for a manager'; END IF;
  IF (public.t_su('a0000000-0000-0000-0000-000000000005')).id IS NOT NULL OR (public.t_su('a0000000-0000-0000-0000-000000000006')).id IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL: field staff and NDI are not part of the team'; END IF;
  -- running again never duplicates
  PERFORM public.agent_run_rules('2026-11-18T15:01:00Z');
  PERFORM public.t_eq('one item for Bob', (SELECT count(*) FROM public.agent_flags WHERE rule_code = 'SU01' AND subject_id = 'a0000000-0000-0000-0000-000000000003'), 1::bigint);
  -- fix it: the item closes itself
  UPDATE public.profiles SET reporting_manager_id = 'a0000000-0000-0000-0000-000000000002' WHERE id = 'a0000000-0000-0000-0000-000000000003';
  PERFORM public.agent_run_rules('2026-11-18T15:02:00Z');
  PERFORM public.t_eq('fixed: closed', (public.t_su('a0000000-0000-0000-0000-000000000003')).status, 'auto_resolved');
  -- someone in no team group
  INSERT INTO public.profiles (id, email, full_name, job_title, role, status, pay_group_id) VALUES
    ('a0000000-0000-0000-0000-0000000000a1', 'kai@t.local', 'Kai', 'Analyst', 'operations', 'active', 'e0000000-0000-0000-0000-000000000001');
  PERFORM public.agent_run_rules('2026-11-18T15:03:00Z');
  PERFORM public.t_like('no group is noticed', (public.t_su('a0000000-0000-0000-0000-0000000000a1')).why, 'Kai is not fully set up: they are not in a team group%');
  -- Cliq IDs: nothing without a Cliq connection, one item with it
  PERFORM public.t_eq('no Cliq connection: no Cliq item', (SELECT count(*) FROM public.agent_flags WHERE rule_code = 'SU01' AND subject_id = 'cliq_ids'), 0::bigint);
  INSERT INTO public.agent_connections (id, kind, name, config) VALUES ('c1000000-0000-0000-0000-0000000000c1', 'cliq', 'Cliq', '{"events": []}');
  PERFORM public.agent_run_rules('2026-11-18T15:04:00Z');
  PERFORM public.t_like('Cliq IDs: one item', (public.t_su('cliq_ids')).why, '% of % people have no Cliq ID saved%');
  DELETE FROM public.agent_connections WHERE id = 'c1000000-0000-0000-0000-0000000000c1';
  PERFORM public.agent_run_rules('2026-11-18T15:05:00Z');
  PERFORM public.t_eq('no Cliq connection: the item closes', (public.t_su('cliq_ids')).status, 'auto_resolved');
  RAISE NOTICE 'PASS 1: setup gaps';
END $$;

-- ── 2. follow-through ──────────────────────────────────────────────────────
DO $$
DECLARE v_flag uuid; v_low uuid; v_done uuid; v_untold uuid; n bigint;
BEGIN
  INSERT INTO public.agent_connections (id, kind, name, config) VALUES ('c1000000-0000-0000-0000-0000000000c2', 'cliq', 'Alerts', '{"events": ["flag_high"]}'),
    ('c1000000-0000-0000-0000-0000000000c3', 'slack', 'Other', '{"events": ["flag_followup"]}');
  INSERT INTO public.agent_flags (id, rule_code, severity, subject_type, subject_id, person_id, title, why, item_type, status) VALUES
    ('f2000000-0000-0000-0000-000000000001', 'TK01', 'medium', 'person', 'x1', 'a0000000-0000-0000-0000-000000000004', 'Overdue: report', 'Two days late.', 'flag', 'open'),
    ('f2000000-0000-0000-0000-000000000002', 'TK01', 'low',    'person', 'x2', 'a0000000-0000-0000-0000-000000000004', 'Low item', 'x', 'flag', 'open'),
    ('f2000000-0000-0000-0000-000000000003', 'TK01', 'high',   'person', 'x3', 'a0000000-0000-0000-0000-000000000004', 'Handled item', 'x', 'flag', 'handled'),
    ('f2000000-0000-0000-0000-000000000004', 'TK01', 'high',   'person', 'x4', 'a0000000-0000-0000-0000-000000000004', 'Nobody was told', 'x', 'flag', 'open');
  -- a message went to Alerts about the first three a day and a bit ago; nothing was sent about the fourth
  INSERT INTO public.agent_outbox (connection_id, kind, ref_id, status, sent_at) SELECT 'c1000000-0000-0000-0000-0000000000c2', 'flag', id, 'sent', '2026-11-17T14:00:00Z'
    FROM public.agent_flags WHERE id IN ('f2000000-0000-0000-0000-000000000001', 'f2000000-0000-0000-0000-000000000002', 'f2000000-0000-0000-0000-000000000003')
  ON CONFLICT (connection_id, kind, ref_id, coalesce(rule_id, '00000000-0000-0000-0000-000000000000'::uuid)) DO UPDATE SET status = 'sent', sent_at = '2026-11-17T14:00:00Z';
  -- the high item that nobody was told about (its automatic row is not sent yet)
  DELETE FROM public.agent_outbox WHERE ref_id = 'f2000000-0000-0000-0000-000000000004';
  -- the manager: Alice
  UPDATE public.profiles SET reporting_manager_id = 'a0000000-0000-0000-0000-000000000002' WHERE id = 'a0000000-0000-0000-0000-000000000004';

  PERFORM public.agent_run_followups('2026-11-18T23:00:00Z');   -- 6 PM EST: quiet hours
  PERFORM public.t_eq('after hours: nothing', (SELECT count(*) FROM public.agent_followups), 0::bigint);
  PERFORM public.agent_run_followups('2026-11-21T15:00:00Z');   -- a Saturday
  PERFORM public.t_eq('on a day off: nothing', (SELECT count(*) FROM public.agent_followups), 0::bigint);

  PERFORM public.agent_run_followups('2026-11-18T15:30:00Z');
  PERFORM public.t_eq('stage 1 for the open medium item only', (SELECT count(*) FROM public.agent_followups), 1::bigint);
  PERFORM public.t_eq('it is the medium item, stage 1', (SELECT stage FROM public.agent_followups WHERE flag_id = 'f2000000-0000-0000-0000-000000000001'), 1::smallint);
  PERFORM public.t_eq('the history says so', (SELECT count(*) FROM public.agent_flag_events WHERE flag_id = 'f2000000-0000-0000-0000-000000000001' AND kind = 'repeated'), 1::bigint);
  SELECT count(*) INTO n FROM public.agent_outbox WHERE kind = 'followup';
  PERFORM public.t_eq('queued for the connection it was sent to and the one that asked for follow-ups', n, 2::bigint);
  PERFORM public.agent_run_followups('2026-11-18T15:31:00Z');
  PERFORM public.t_eq('never twice', (SELECT count(*) FROM public.agent_followups), 1::bigint);
  PERFORM public.agent_run_followups('2026-11-19T14:00:00Z');   -- under 24 hours after stage 1
  PERFORM public.t_eq('not yet stage 2', (SELECT count(*) FROM public.agent_followups), 1::bigint);

  PERFORM public.agent_run_followups('2026-11-19T15:31:00Z');
  PERFORM public.t_eq('stage 2 a day later', (SELECT count(*) FROM public.agent_followups WHERE stage = 2), 1::bigint);
  PERFORM public.t_like('the history names the manager', (SELECT detail ->> 'note' FROM public.agent_flag_events WHERE flag_id = 'f2000000-0000-0000-0000-000000000001' AND kind = 'escalated'),
    'Still open 2 days after the message: the Agent asked Alice to step in.');
  PERFORM public.agent_run_followups('2026-11-20T15:31:00Z');
  PERFORM public.t_eq('no stage 3', (SELECT count(*) FROM public.agent_followups), 2::bigint);
  RAISE NOTICE 'PASS 2: follow-through';
END $$;

-- ── 4. the weekly scorecard ────────────────────────────────────────────────
DO $$
BEGIN
  UPDATE public.profiles SET reporting_manager_id = 'a0000000-0000-0000-0000-000000000002' WHERE id IN ('a0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000004');
  -- Bob: 30 h, 20 h, then 10 h on three Tuesdays in a row
  INSERT INTO public.time_entries (employee_id, start_time, end_time, duration_minutes) VALUES
    ('a0000000-0000-0000-0000-000000000003', '2026-11-03T15:00:00Z', '2026-11-04T01:00:00Z', 1800),
    ('a0000000-0000-0000-0000-000000000003', '2026-11-10T15:00:00Z', '2026-11-10T21:00:00Z', 1200),
    ('a0000000-0000-0000-0000-000000000003', '2026-11-17T15:00:00Z', '2026-11-17T21:00:00Z', 600);
  PERFORM public.agent_run_rules('2026-11-23T11:30:00Z');   -- Monday 6:30 AM EST: too early
  PERFORM public.t_eq('before 8 AM: no scorecard', (SELECT count(*) FROM public.agent_summaries WHERE period_kind = 'scorecard'), 0::bigint);
  PERFORM public.agent_run_rules('2026-11-23T13:30:00Z');   -- Monday 8:30 AM EST
  PERFORM public.t_eq('one scorecard', (SELECT count(*) FROM public.agent_summaries WHERE period_kind = 'scorecard'), 1::bigint);
  PERFORM public.t_eq('for the week before', (SELECT period_start::text FROM public.agent_summaries WHERE period_kind = 'scorecard'), '2026-11-16');
  PERFORM public.t_like('title', (SELECT narrative FROM public.agent_summaries WHERE period_kind = 'scorecard'), '## Weekly scorecard, Nov 16 to Nov 22%');
  PERFORM public.t_like('Alice is tagged on her team', (SELECT narrative FROM public.agent_summaries WHERE period_kind = 'scorecard'), '%### @Alice (2 people)%');
  PERFORM public.t_like('Cara tracked 20 minutes', (SELECT narrative FROM public.agent_summaries WHERE period_kind = 'scorecard'), '%- Cara: 0.3 of 40 h tracked%');
  PERFORM public.t_like('Bob: 10 of 40 h, and marked as down three weeks', (SELECT narrative FROM public.agent_summaries WHERE period_kind = 'scorecard'), '%- Bob: 10 of 40 h tracked, 0 tasks done, % (down three weeks in a row)%');
  PERFORM public.t_eq('the decline list holds Bob only', (SELECT jsonb_array_length(metrics -> 'decline') FROM public.agent_summaries WHERE period_kind = 'scorecard'), 1);
  PERFORM public.agent_run_rules('2026-11-23T14:30:00Z');
  PERFORM public.agent_run_rules('2026-11-24T14:30:00Z');   -- Tuesday: not the first working day
  PERFORM public.t_eq('made once', (SELECT count(*) FROM public.agent_summaries WHERE period_kind = 'scorecard'), 1::bigint);
  RAISE NOTICE 'PASS 4: weekly scorecard';
END $$;

-- ── 5. an Admin can use the Agent (not configure it) ───────────────────────
DO $$
DECLARE v_su bigint;
BEGIN
  INSERT INTO public.profiles (id, email, full_name, job_title, role, status, pay_group_id) VALUES
    ('a0000000-0000-0000-0000-0000000000ad', 'ada@t.local', 'Ada Admin', NULL, 'admin', 'active', 'e0000000-0000-0000-0000-000000000001');
  PERFORM public.agent_run_rules('2026-11-23T14:40:00Z');   -- makes sure setup-gap items exist
  SELECT count(*) INTO v_su FROM public.agent_flags WHERE rule_code = 'SU01' AND status = 'open';
  PERFORM public.t_as('a0000000-0000-0000-0000-0000000000ad');
  PERFORM public.t_eq('an Admin may use the Agent', public.agent_can_access(), true);
  PERFORM public.t_eq('but not configure it', public.agent_can_configure(), false);
  PERFORM public.t_eq('the screens are told: access, no configure', (public.agent_my_scope() ->> 'access') || '/' || (public.agent_my_scope() ->> 'configure'), 'true/false');
  PERFORM public.t_eq('setup-gap items (no module) are visible to an Admin', (SELECT count(*) FROM public.agent_flags WHERE rule_code = 'SU01' AND status = 'open'), v_su);
  PERFORM public.t_eq('summaries are visible to an Admin', (SELECT count(*) > 0 FROM public.agent_summaries), true);
  PERFORM public.t_denied($q$SELECT public.agent_generate_summary('day')$q$, 'an Admin generating a summary on request');
  RESET ROLE;
  RAISE NOTICE 'PASS 5: Admin access';
END $$;

-- ── 6. automatic messages are about the team only ──────────────────────────
DO $$
DECLARE n bigint;
BEGIN
  DELETE FROM public.agent_outbox; DELETE FROM public.agent_flags WHERE rule_code NOT IN ('SU01');
  INSERT INTO public.agent_connections (id, kind, name, config) VALUES ('c1000000-0000-0000-0000-0000000000c9', 'cliq', 'Everything', '{"events": ["flag_all", "flag_high"]}');
  INSERT INTO public.agent_flags (rule_code, severity, subject_type, subject_id, title, why, item_type, status) VALUES
    ('SY01', 'high', 'system', 'job:failed', 'Scheduled job failed: x', 'x', 'flag', 'open'),
    ('PY01', 'high', 'system', 'pay', 'Payroll run waiting for approval', 'x', 'flag', 'open'),
    ('BK01', 'critical', 'system', 'bank', 'Bank batch failed', 'x', 'flag', 'open'),
    ('DC01', 'high', 'system', 'dc', 'Grievances open too long', 'x', 'flag', 'open'),
    ('SU01', 'high', 'system', 'su', 'Setup gap', 'x', 'flag', 'open'),
    ('TK01', 'high', 'task', 'tk', 'Overdue: Client proposal', 'x', 'flag', 'open'),
    ('TR01', 'medium', 'person', 'tr', 'Not tracking time', 'x', 'flag', 'open'),
    ('RP01', 'high', 'person', 'rp', 'Daily report missing', 'x', 'flag', 'open');
  PERFORM public.t_eq('only tasks, time tracking and reports are queued for a channel',
    (SELECT string_agg(f.rule_code, ',' ORDER BY f.rule_code) FROM public.agent_outbox o JOIN public.agent_flags f ON f.id = o.ref_id WHERE o.kind = 'flag' AND o.connection_id = 'c1000000-0000-0000-0000-0000000000c9'), 'RP01,TK01,TR01');
  PERFORM public.t_eq('the other items are still in the Inbox', (SELECT count(*) FROM public.agent_flags WHERE rule_code IN ('SY01', 'PY01', 'BK01', 'DC01') AND status = 'open'), 4::bigint);
  -- follow-ups are team items too
  INSERT INTO public.agent_flags (id, rule_code, severity, subject_type, subject_id, person_id, title, why, item_type, status) VALUES
    ('f3000000-0000-0000-0000-000000000001', 'DC02', 'high', 'person', 'dc2', 'a0000000-0000-0000-0000-000000000004', 'Disciplinary record not acknowledged', 'x', 'flag', 'open');
  INSERT INTO public.agent_outbox (connection_id, kind, ref_id, status, sent_at) VALUES ('c1000000-0000-0000-0000-0000000000c9', 'flag', 'f3000000-0000-0000-0000-000000000001', 'sent', '2026-11-17T14:00:00Z');
  PERFORM public.agent_run_followups('2026-11-24T15:30:00Z');
  PERFORM public.t_eq('no follow-up for a discipline item', (SELECT count(*) FROM public.agent_followups WHERE flag_id = 'f3000000-0000-0000-0000-000000000001'), 0::bigint);
  RAISE NOTICE 'PASS 6: team focus';
END $$;

-- ── 7. the briefing is gone ────────────────────────────────────────────────
DO $$
BEGIN
  PERFORM public.t_eq('no BR01 rule', (SELECT count(*) FROM public.agent_rules WHERE code = 'BR01'), 0::bigint);
  PERFORM public.t_eq('no briefing function', to_regprocedure('public.agent_rule_br01(timestamp with time zone)') IS NULL, true);
  PERFORM public.agent_run_rules('2026-11-25T14:00:00Z');
  PERFORM public.t_eq('nothing writes a briefing', (SELECT count(*) FROM public.agent_summaries WHERE period_kind = 'briefing'), 0::bigint);
  RAISE NOTICE 'PASS 7: briefing removed';
END $$;

-- ── 8. the report audit ────────────────────────────────────────────────────
DO $$
DECLARE r jsonb;
BEGIN
  PERFORM public.t_as('a0000000-0000-0000-0000-000000000001');
  r := public.agent_report_audit('2026-11-18');
  PERFORM public.t_eq('the audit counts the one report in the table that day', (r ->> 'people_counted')::int, 1);
  PERFORM public.t_eq('and shows the row', jsonb_array_length(r -> 'rows_for_the_day'), 1);
  PERFORM public.t_eq('with the name it counts', r -> 'rows_for_the_day' -> 0 -> 'names' ->> 0, 'Alice');
  PERFORM public.t_eq('for that day', (r -> 'rows_for_the_day' -> 0 ->> 'counted_for_day')::boolean, true);
  PERFORM public.t_eq('seven days are listed', jsonb_array_length(r -> 'last_7_days'), 7);
  RESET ROLE;
  PERFORM public.t_as('a0000000-0000-0000-0000-000000000002');
  PERFORM public.t_denied($q$SELECT public.agent_report_audit()$q$, 'a member reading the audit');
  RESET ROLE;
  RAISE NOTICE 'PASS 8: report audit';
END $$;

ROLLBACK;
SELECT 'ok' AS agent_ops_lead;
