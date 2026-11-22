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
  PERFORM public.t_eq('a follow-up is shown on the item but never sent on its own', n, 0::bigint);
  PERFORM public.agent_run_followups('2026-11-18T15:31:00Z');
  PERFORM public.t_eq('never twice', (SELECT count(*) FROM public.agent_followups), 1::bigint);
  PERFORM public.agent_run_followups('2026-11-19T14:00:00Z');   -- under 24 hours after stage 1
  PERFORM public.t_eq('not yet stage 2', (SELECT count(*) FROM public.agent_followups), 1::bigint);

  PERFORM public.agent_run_followups('2026-11-19T15:31:00Z');
  PERFORM public.t_eq('stage 2 a day later', (SELECT count(*) FROM public.agent_followups WHERE stage = 2), 1::bigint);
  PERFORM public.t_like('the history names the manager', (SELECT detail ->> 'note' FROM public.agent_flag_events WHERE flag_id = 'f2000000-0000-0000-0000-000000000001' AND kind = 'escalated'),
    'Still open 2 days after the message: Alice should step in.');
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

-- ── 6. nothing about an item is sent on its own ───────────────────────────
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
  PERFORM public.t_eq('no item is queued for a channel, whatever the connection asks for', (SELECT count(*) FROM public.agent_outbox o WHERE o.kind = 'flag' AND o.connection_id = 'c1000000-0000-0000-0000-0000000000c9'), 0::bigint);
  PERFORM public.t_eq('the other items are still in the Inbox', (SELECT count(*) FROM public.agent_flags WHERE rule_code IN ('SY01', 'PY01', 'BK01', 'DC01') AND status = 'open'), 4::bigint);
  -- follow-ups are team items too
  INSERT INTO public.agent_flags (id, rule_code, severity, subject_type, subject_id, person_id, title, why, item_type, status) VALUES
    ('f3000000-0000-0000-0000-000000000001', 'DC02', 'high', 'person', 'dc2', 'a0000000-0000-0000-0000-000000000004', 'Disciplinary record not acknowledged', 'x', 'flag', 'open');
  INSERT INTO public.agent_outbox (connection_id, kind, ref_id, status, sent_at) VALUES ('c1000000-0000-0000-0000-0000000000c9', 'flag', 'f3000000-0000-0000-0000-000000000001', 'sent', '2026-11-17T14:00:00Z');
  PERFORM public.agent_run_followups('2026-11-24T15:30:00Z');
  PERFORM public.t_eq('no follow-up for a discipline item', (SELECT count(*) FROM public.agent_followups WHERE flag_id = 'f3000000-0000-0000-0000-000000000001'), 0::bigint);
  RAISE NOTICE 'PASS 6: items stay in the Inbox';
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

-- ── 9. leadership reports too; exemptions decide, and are picked up at once ─
DO $$
DECLARE r jsonb;
BEGIN
  PERFORM public.t_as('a0000000-0000-0000-0000-000000000001');
  r := public.agent_chat_tool('daily_reports', '{"date":"2026-11-18"}');
  PERFORM public.t_eq('Alice reported', r -> 'reported' ->> 0, 'Alice');
  PERFORM public.t_eq('Sue (Leadership) is expected and has not reported', (SELECT count(*) FROM jsonb_array_elements(r -> 'missing') m WHERE m ->> 'name' = 'Sue Super'), 1::bigint);
  PERFORM public.t_eq('placed staff (Finn) are not expected', (SELECT count(*) FROM jsonb_array_elements(r -> 'missing') m WHERE m ->> 'name' = 'Finn'), 0::bigint);
  RESET ROLE;
  PERFORM public.agent_run_rules('2026-11-18T23:30:00Z');   -- 6:30 PM EST, past the deadline
  PERFORM public.t_eq('a missing-report item exists for Sue', (SELECT count(*) FROM public.agent_flags f JOIN public.profiles p ON p.id = f.person_id WHERE f.rule_code = 'RP01' AND p.full_name = 'Sue Super' AND f.status = 'open'), 1::bigint);
  -- exempt her from reports: it is picked up on the next look
  UPDATE public.agent_person_profile SET exemptions = '{"reports": true}'::jsonb WHERE person_id = 'a0000000-0000-0000-0000-000000000001';
  PERFORM public.t_as('a0000000-0000-0000-0000-000000000001');
  r := public.agent_chat_tool('daily_reports', '{"date":"2026-11-18"}');
  PERFORM public.t_eq('exempted: no longer expected', (SELECT count(*) FROM jsonb_array_elements(r -> 'missing') m WHERE m ->> 'name' = 'Sue Super'), 0::bigint);
  RESET ROLE;
  PERFORM public.agent_run_rules('2026-11-18T23:31:00Z');
  PERFORM public.t_eq('and her open item is closed', (SELECT count(*) FROM public.agent_flags f JOIN public.profiles p ON p.id = f.person_id WHERE f.rule_code = 'RP01' AND p.full_name = 'Sue Super' AND f.status = 'open'), 0::bigint);
  RAISE NOTICE 'PASS 9: leadership and exemptions';
END $$;

-- ── 10. the tracking tile counts against who is expected to track; exemptions are picked up at once ─
DO $$
DECLARE v jsonb; v_before int; v_team int; v_now int;
BEGIN
  RESET ROLE;
  -- make today a work day for everyone so the numbers do not depend on the day the test runs
  UPDATE public.agent_settings SET default_working_days = '{1,2,3,4,5,6,7}';
  DELETE FROM public.public_holidays;
  PERFORM public.t_as('a0000000-0000-0000-0000-000000000001');
  v := public.agent_team_pulse();
  v_before := (v ->> 'tracking_expected')::int; v_team := (v ->> 'team_size')::int; v_now := (v ->> 'tracking_now')::int;
  PERFORM public.t_eq('Alice is tracking now and is expected to', v_now, 1);
  PERFORM public.t_eq('expected to track is the team minus placed staff (and anyone on leave)', v_before > 0 AND v_before < v_team, true);
  RESET ROLE;
  -- exempt Alice (who has a running timer) from time tracking
  INSERT INTO public.agent_person_profile (person_id, exemptions) VALUES ('a0000000-0000-0000-0000-000000000002', '{"time": true}'::jsonb)
    ON CONFLICT (person_id) DO UPDATE SET exemptions = coalesce(public.agent_person_profile.exemptions, '{}'::jsonb) || '{"time": true}'::jsonb;
  PERFORM public.t_as('a0000000-0000-0000-0000-000000000001');
  v := public.agent_team_pulse();
  PERFORM public.t_eq('an exempt person leaves the expected number', (v ->> 'tracking_expected')::int, v_before - 1);
  PERFORM public.t_eq('and does not count as tracking either', (v ->> 'tracking_now')::int, 0);
  PERFORM public.t_eq('the whole team size is unchanged', (v ->> 'team_size')::int, v_team);
  RAISE NOTICE 'PASS 10: tracking expected honours exemptions';
END $$;

-- ── 11. summaries count the same people as the Inbox, honour site assignments and show only team items ─
DO $$
DECLARE b jsonb; n0 integer; o0 integer; v_sites jsonb;
BEGIN
  RESET ROLE;
  -- earlier sections exempted Sue (reports) and Alice (time tracking): lift both so this section starts from the plain rule
  UPDATE public.agent_person_profile SET exemptions = '{}'::jsonb WHERE person_id IN ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002');
  b := public.agent_build_summary('day', '2026-11-18', '2026-11-18');
  PERFORM public.t_eq('tracking expects the team who work that day, minus placed and exempt: leadership is in',
    (b -> 'metrics' -> 'tracking' ->> 'expected_days')::int,
    (SELECT count(*)::int FROM public.agent_team_today('2026-11-18T17:00:00Z') t WHERE t.expects_work AND coalesce(t.grp, '') <> 'placement' AND NOT t.exempt_time));
  PERFORM public.t_eq('Sue (leadership) is one of them', (SELECT count(*)::int FROM public.agent_team_today('2026-11-18T17:00:00Z') t WHERE t.person_id = 'a0000000-0000-0000-0000-000000000001' AND t.expects_work AND NOT t.exempt_time), 1);
  PERFORM public.t_eq('a timer still running counts as tracked (Alice), and so does Cara', (b -> 'metrics' -> 'tracking' ->> 'tracked_days')::int, 2);
  PERFORM public.t_eq('reports expect the same people, plus anyone only exempt from tracking',
    (b -> 'metrics' -> 'reports' ->> 'expected')::int,
    (SELECT count(*)::int FROM public.agent_team_today('2026-11-18T17:00:00Z') t WHERE t.expects_work AND coalesce(t.grp, '') <> 'placement' AND NOT t.exempt_reports));
  PERFORM public.t_eq('Sue is missing a report, as the Inbox says', (SELECT count(*)::int FROM jsonb_array_elements(b -> 'metrics' -> 'reports' -> 'missing') m WHERE m ->> 'name' = 'Sue Super'), 1);
  UPDATE public.agent_person_profile SET exemptions = '{"time": true}'::jsonb WHERE person_id = 'a0000000-0000-0000-0000-000000000002';
  PERFORM public.t_eq('exempt Alice from tracking: she leaves the expected number at once', (public.agent_build_summary('day', '2026-11-18', '2026-11-18') -> 'metrics' -> 'tracking' ->> 'expected_days')::int, (b -> 'metrics' -> 'tracking' ->> 'expected_days')::int - 1);
  UPDATE public.agent_person_profile SET exemptions = '{}'::jsonb WHERE person_id = 'a0000000-0000-0000-0000-000000000002';
  b := public.agent_build_summary('day', '2026-11-18', '2026-11-18');
  -- overdue is the Inbox rule: a task due today is not overdue yet
  PERFORM public.t_eq('overdue: Alice has two, nobody else has one before the 18th', (b -> 'metrics' -> 'tasks' ->> 'overdue')::int, 2);
  INSERT INTO public.tm_tasks (title, status, assignee_id, due_date) VALUES ('Bob due today', 'in_progress', 'a0000000-0000-0000-0000-000000000003', '2026-11-18');
  b := public.agent_build_summary('day', '2026-11-18', '2026-11-18');
  PERFORM public.t_eq('a task due today is not counted as overdue', (b -> 'metrics' -> 'tasks' ->> 'overdue')::int, 2);

  -- items: the team's only; the others are counted apart
  n0 := (b -> 'metrics' -> 'flags' ->> 'opened')::int; o0 := (b -> 'metrics' -> 'flags' ->> 'other_opened')::int;
  PERFORM public.agent_raise_flag('SY01', 'system', NULL, 'system', 'sum-test', '', 'high', 'A system thing', 'w', '{}'::jsonb, '', '2026-11-18T15:00:00Z');
  PERFORM public.agent_raise_flag('TK01', 'task', 'a0000000-0000-0000-0000-000000000002', 'task', 'b1000000-0000-0000-0000-0000000000ff', '', 'high', 'A task thing', 'w', '{}'::jsonb, '', '2026-11-18T15:00:00Z');
  b := public.agent_build_summary('day', '2026-11-18', '2026-11-18');
  PERFORM public.t_eq('a team item is counted', (b -> 'metrics' -> 'flags' ->> 'opened')::int, n0 + 1);
  PERFORM public.t_eq('a system item is counted apart, not as a team item', (b -> 'metrics' -> 'flags' ->> 'other_opened')::int, o0 + 1);

  -- sites: Track says youtube is unproductive; your assignment in Agent wins either way
  INSERT INTO public.time_activity_logs (employee_id, captured_at, app_name, url, productivity_category)
  SELECT 'a0000000-0000-0000-0000-000000000003', ts, 'Chrome', 'https://www.youtube.com/watch?v=1', 'unproductive'
    FROM (VALUES ('2026-11-18T14:10:00Z'::timestamptz), ('2026-11-18T14:11:00Z'), ('2026-11-18T14:12:00Z')) v(ts);
  PERFORM public.agent_rule_tr05('2026-11-18T15:00:00Z');
  PERFORM public.t_eq('Bob has an open unproductive-site item', (SELECT count(*) FROM public.agent_flags f WHERE f.rule_code = 'TR05' AND f.person_id = 'a0000000-0000-0000-0000-000000000003' AND f.status = 'open'), 1::bigint);
  b := public.agent_build_summary('day', '2026-11-18', '2026-11-18');
  v_sites := b -> 'metrics' -> 'sites';
  PERFORM public.t_eq('the summary lists youtube as unproductive', v_sites -> 0 ->> 'domain' || ':' || (v_sites -> 0 ->> 'category'), 'youtube.com:unproductive');
  INSERT INTO public.agent_domain_list (domain, category, source) VALUES ('youtube.com', 'approved', 'manual');   -- you assign it productive
  PERFORM public.agent_rule_tr05('2026-11-18T15:01:00Z');
  PERFORM public.t_eq('marked productive: youtube leaves Bob''s item on the next look (his other, unfamiliar sites stay)',
    (SELECT count(*) FROM public.agent_flags f, jsonb_array_elements(f.evidence -> 'sites') x WHERE f.rule_code = 'TR05' AND f.person_id = 'a0000000-0000-0000-0000-000000000003' AND f.status = 'open' AND x ->> 'domain' = 'youtube.com'), 0::bigint);
  PERFORM public.t_eq('and the item is no longer an unproductive one', (SELECT (f.evidence ->> 'unproductive_seconds')::int FROM public.agent_flags f WHERE f.rule_code = 'TR05' AND f.person_id = 'a0000000-0000-0000-0000-000000000003' AND f.status = 'open'), 0);
  b := public.agent_build_summary('day', '2026-11-18', '2026-11-18');
  PERFORM public.t_eq('marked productive: the summary no longer lists it', (SELECT count(*) FROM jsonb_array_elements(b -> 'metrics' -> 'sites') x WHERE x ->> 'domain' = 'youtube.com'), 0::bigint);
  PERFORM public.t_eq('the class helper: your assignment first', public.agent_site_class('www.youtube.com', 'unproductive'), 'productive');
  PERFORM public.t_eq('the class helper: otherwise Track''s category', public.agent_site_class('github.com', 'productive'), 'productive');
  PERFORM public.t_eq('the class helper: unclassified', public.agent_site_class('nothing.example', NULL), NULL::text);

  -- the Monday scorecard counts leadership too
  PERFORM public.t_eq('the weekly stats include Sue (leadership)', (SELECT count(*) FROM public.agent_week_stats('2026-11-16') w WHERE w.person_id = 'a0000000-0000-0000-0000-000000000001'), 1::bigint);
  RAISE NOTICE 'PASS 11: summaries match the Inbox';
END $$;

-- ── 12. weekly and monthly: consistent trackers and reporters, task completion rate, and the period before ─
DO $$
DECLARE b jsonb; k jsonb; v_tasks jsonb; v_exp_t integer; v_exp_r integer; v_sub integer;
BEGIN
  RESET ROLE;
  UPDATE public.agent_person_profile SET exemptions = '{}'::jsonb WHERE person_id IN ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002');
  -- a one-day "week" (Wed 18th): consistent means tracked or reported on at least 80% of the person's working days, here that one day
  b := public.agent_build_summary('week', '2026-11-18', '2026-11-18');
  k := b -> 'metrics' -> 'kpis';
  SELECT count(*)::int INTO v_exp_t FROM public.agent_team_today('2026-11-18T17:00:00Z') t WHERE t.expects_work AND coalesce(t.grp, '') <> 'placement' AND NOT t.exempt_time;
  SELECT count(*)::int INTO v_exp_r FROM public.agent_team_today('2026-11-18T17:00:00Z') t WHERE t.expects_work AND coalesce(t.grp, '') <> 'placement' AND NOT t.exempt_reports;
  SELECT count(*)::int INTO v_sub FROM public.agent_team_today('2026-11-18T17:00:00Z') t WHERE t.expects_work AND coalesce(t.grp, '') <> 'placement' AND NOT t.exempt_reports
     AND t.person_id IN (SELECT x FROM public.agent_report_submitters('2026-11-18') x);
  PERFORM public.t_eq('people expected to track', (k ->> 'trackers_total')::int, v_exp_t);
  PERFORM public.t_eq('consistent trackers: Alice (a timer still running) and Cara', (k ->> 'trackers_consistent')::int, 2);
  PERFORM public.t_eq('the others tracked nothing', (k ->> 'trackers_none')::int, v_exp_t - 2);
  PERFORM public.t_eq('people expected to report', (k ->> 'reporters_total')::int, v_exp_r);
  PERFORM public.t_eq('consistent reporters are those with a report that day', (k ->> 'reporters_consistent')::int, v_sub);
  PERFORM public.t_eq('the not-consistent list leaves out the consistent', (SELECT count(*)::int FROM jsonb_array_elements(k -> 'trackers_inconsistent') x WHERE x ->> 'name' IN ('Alice', 'Cara')), 0);
  PERFORM public.t_eq('the threshold is stated', (k ->> 'threshold')::int, 80);
  PERFORM public.t_eq('a daily summary does not carry these', (public.agent_build_summary('day', '2026-11-18', '2026-11-18') -> 'metrics' -> 'kpis') IS NULL OR (public.agent_build_summary('day', '2026-11-18', '2026-11-18') -> 'metrics' ->> 'kpis') IS NULL, true);

  -- tasks, week of Nov 16 to 20: two already open (one of them closed on the 17th), two opened (17th, 18th), two closed (17th on time, 19th late)
  INSERT INTO public.tm_tasks (title, status, assignee_id, due_date, created_at, completed_at) VALUES
    ('KPI already open',          'in_progress', 'a0000000-0000-0000-0000-000000000003', '2026-12-01', '2026-11-10T15:00:00Z', NULL),
    ('KPI open, closed the 17th', 'done',        'a0000000-0000-0000-0000-000000000003', '2026-11-18', '2026-11-10T15:00:00Z', '2026-11-17T15:00:00Z'),
    ('KPI opened 17th, closed 19th late', 'done','a0000000-0000-0000-0000-000000000003', '2026-11-18', '2026-11-17T12:00:00Z', '2026-11-19T15:00:00Z'),
    ('KPI opened the 18th',       'in_progress', 'a0000000-0000-0000-0000-000000000003', '2026-12-01', '2026-11-18T15:00:00Z', NULL);
  b := public.agent_build_summary('week', '2026-11-16', '2026-11-20');
  v_tasks := b -> 'metrics' -> 'kpis' -> 'tasks';
  PERFORM public.t_eq('opened in the week', (v_tasks ->> 'opened')::int, 2);
  PERFORM public.t_eq('closed in the week', (v_tasks ->> 'closed')::int, 2);
  PERFORM public.t_eq('open at the start', (v_tasks ->> 'open_start')::int, 2);
  PERFORM public.t_eq('work in play = already open + opened', (v_tasks ->> 'workload')::int, 4);
  PERFORM public.t_eq('completion rate: 2 closed of 4 in play', (v_tasks ->> 'completion_rate')::int, 50);
  PERFORM public.t_eq('open at the end of the week', (v_tasks ->> 'open_end')::int, 2);
  PERFORM public.t_eq('on time: one of the two closed tasks with a due date', (v_tasks ->> 'on_time_rate')::int, 50);
  PERFORM public.t_eq('Bob closed the most', v_tasks -> 'top_closers' -> 0 ->> 'name', 'Bob');
  IF b ->> 'narrative' NOT LIKE '%people tracked consistently%' OR b ->> 'narrative' NOT LIKE '%of the work in play was closed%' THEN RAISE EXCEPTION 'FAIL: narrative %', b ->> 'narrative'; END IF;
  IF b -> 'metrics' ->> 'headline' NOT LIKE '%50% of tasks closed (2 of 4)%' THEN RAISE EXCEPTION 'FAIL: headline %', b -> 'metrics' ->> 'headline'; END IF;
  -- the month works the same way
  PERFORM public.t_eq('the period before is carried for comparison when it has data (tasks were open then)', (b -> 'metrics' -> 'previous') IS NOT NULL, true);
  -- a period whose previous period is empty compares with nothing, and the text does not say "last week: 0 of ..."
  b := public.agent_build_summary('week', '2026-11-02', '2026-11-06');
  PERFORM public.t_eq('nothing recorded the week before: no comparison', (b -> 'metrics' -> 'previous') IS NULL OR (b -> 'metrics' ->> 'previous') IS NULL, true);
  IF b ->> 'narrative' LIKE '%last week%' THEN RAISE EXCEPTION 'FAIL: a comparison with an empty week: %', b ->> 'narrative'; END IF;
  b := public.agent_build_summary('month', '2026-11-01', '2026-11-20');
  PERFORM public.t_eq('the monthly one carries the numbers', (b -> 'metrics' -> 'kpis' -> 'tasks' ->> 'closed')::int >= 2, true);
  RAISE NOTICE 'PASS 12: weekly and monthly key numbers';
END $$;

-- ── 13. tailored messages, the warning that a call will follow, and the "Call needed" item ─
DO $$
DECLARE v_f1 uuid; v_f2 uuid; v_f3 uuid; d jsonb; v_msg uuid; v_call uuid; n bigint;
BEGIN
  RESET ROLE;
  UPDATE public.agent_person_profile SET exemptions = '{}'::jsonb WHERE person_id IN ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002');
  UPDATE public.profiles SET reporting_manager_id = 'a0000000-0000-0000-0000-000000000002' WHERE id = 'a0000000-0000-0000-0000-000000000003';
  DELETE FROM public.agent_warnings; DELETE FROM public.agent_flags WHERE rule_code IN ('TR01', 'TK06', 'FT02') AND person_id = 'a0000000-0000-0000-0000-000000000003';

  -- the first time: short, personal, asks what is happening, no warning
  INSERT INTO public.agent_flags (rule_code, severity, subject_type, subject_id, person_id, title, why, item_type, status, period_key, first_seen_at, evidence)
    VALUES ('TR01', 'medium', 'person', 'a0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000003', 'Not tracking time', 'x', 'flag', 'open', '2026-11-09', '2026-11-09T15:00:00Z',
            '{"tracked_minutes_today": 0, "work_started_at": "2026-11-09T14:00:00Z", "idle_minutes": 60}') RETURNING id INTO v_f1;
  PERFORM public.t_as('a0000000-0000-0000-0000-000000000001');
  d := public.agent_flag_draft(v_f1);
  IF d ->> 'body' NOT LIKE 'Hi Bob, I found that you are not tracking time. Work starts at 9 AM EST and I have nothing from you yet. What is happening?%' THEN RAISE EXCEPTION 'FAIL: TR01 wording: %', d ->> 'body'; END IF;
  PERFORM public.t_eq('first time: no warning', d -> 'warning' ->> 'level', 'none');
  IF d ->> 'body' LIKE '%call with you%' THEN RAISE EXCEPTION 'FAIL: the first time must not mention a call'; END IF;

  -- a person with no task: the message asks them to reach out to their manager
  RESET ROLE;
  INSERT INTO public.agent_flags (rule_code, severity, subject_type, subject_id, person_id, title, why, item_type, status, period_key, first_seen_at)
    VALUES ('TK06', 'low', 'person', 'a0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000004', 'No open tasks', 'x', 'flag', 'open', '2026-11-18', '2026-11-18T15:00:00Z') RETURNING id INTO v_f3;
  PERFORM public.t_as('a0000000-0000-0000-0000-000000000001');
  d := public.agent_flag_draft(v_f3);
  IF d ->> 'body' NOT LIKE 'Hi Cara, there is no task assigned to you in Task. What is happening? Can you reach out to your manager?%' THEN RAISE EXCEPTION 'FAIL: TK06 wording: %', d ->> 'body'; END IF;

  -- the second time in the window: says so, and names the manager's call
  RESET ROLE;
  INSERT INTO public.agent_flags (rule_code, severity, subject_type, subject_id, person_id, title, why, item_type, status, period_key, first_seen_at, evidence)
    VALUES ('TR01', 'medium', 'person', 'a0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000003', 'Not tracking time', 'x', 'flag', 'open', '2026-11-12', '2026-11-12T15:00:00Z',
            '{"tracked_minutes_today": 0, "work_started_at": "2026-11-12T14:00:00Z", "idle_minutes": 60}') RETURNING id INTO v_f2;
  PERFORM public.t_as('a0000000-0000-0000-0000-000000000001');
  d := public.agent_flag_draft(v_f2);
  PERFORM public.t_eq('second time: a warning', d -> 'warning' ->> 'level', 'warn');
  IF d ->> 'body' NOT LIKE '%This is the 2nd time in the last 14 days that this has come up. If it happens again, Alice will have a call with you.%' THEN RAISE EXCEPTION 'FAIL: warning wording: %', d ->> 'body'; END IF;
  RESET ROLE;
  PERFORM public.t_eq('nothing is recorded until the message is sent', (SELECT count(*) FROM public.agent_warnings), 0::bigint);

  -- sending it records the warning (once), on the item's history
  INSERT INTO public.agent_messages (flag_id, recipient_id, recipient_label, channel, body, status, sent_by, sent_at)
    VALUES (v_f2, 'a0000000-0000-0000-0000-000000000003', 'Bob', 'email', 'x', 'sent', 'a0000000-0000-0000-0000-000000000001', '2026-11-12T16:00:00Z') RETURNING id INTO v_msg;
  PERFORM public.t_eq('the warning is recorded', (SELECT count(*) FROM public.agent_warnings WHERE person_id = 'a0000000-0000-0000-0000-000000000003' AND rule_code = 'TR01'), 1::bigint);
  PERFORM public.t_eq('with the manager', (SELECT manager_id FROM public.agent_warnings WHERE message_id = v_msg), 'a0000000-0000-0000-0000-000000000002'::uuid);
  PERFORM public.t_eq('and a note on the item', (SELECT count(*) FROM public.agent_flag_events WHERE flag_id = v_f2 AND kind = 'note' AND detail ->> 'note' LIKE 'Warned:%'), 1::bigint);
  -- a message to the manager, a failed message, and a first-time message are not warnings
  INSERT INTO public.agent_messages (flag_id, recipient_id, recipient_label, channel, body, status, sent_at) VALUES (v_f1, 'a0000000-0000-0000-0000-000000000003', 'Bob', 'email', 'x', 'sent', now());
  INSERT INTO public.agent_messages (flag_id, recipient_id, recipient_label, channel, body, status) VALUES (v_f2, 'a0000000-0000-0000-0000-000000000003', 'Bob', 'email', 'x', 'failed');
  INSERT INTO public.agent_messages (flag_id, recipient_id, recipient_label, channel, body, status, sent_at) VALUES (v_f2, 'a0000000-0000-0000-0000-000000000002', 'Alice', 'cliq', 'x', 'sent', now());
  PERFORM public.t_eq('still one warning', (SELECT count(*) FROM public.agent_warnings), 1::bigint);

  -- no call item yet: it has not happened again
  PERFORM public.agent_rule_ft02('2026-11-13T15:00:00Z');
  PERFORM public.t_eq('no call needed before it happens again', (SELECT count(*) FROM public.agent_flags WHERE rule_code = 'FT02'), 0::bigint);

  -- it happens again after the warning
  INSERT INTO public.agent_flags (rule_code, severity, subject_type, subject_id, person_id, title, why, item_type, status, period_key, first_seen_at, evidence)
    VALUES ('TR01', 'medium', 'person', 'a0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000003', 'Not tracking time', 'x', 'flag', 'open', '2026-11-18', '2026-11-18T15:00:00Z',
            '{"tracked_minutes_today": 0, "work_started_at": "2026-11-18T14:00:00Z", "idle_minutes": 60}') RETURNING id INTO v_f3;
  PERFORM public.t_as('a0000000-0000-0000-0000-000000000001');
  d := public.agent_flag_draft(v_f3);
  PERFORM public.t_eq('after a warning: the call', d -> 'warning' ->> 'level', 'call');
  IF d ->> 'body' NOT LIKE '%This has come up again since I messaged you on Nov 12. Alice will have a call with you about it.%' THEN RAISE EXCEPTION 'FAIL: call wording: %', d ->> 'body'; END IF;
  RESET ROLE;
  PERFORM public.agent_rule_ft02('2026-11-18T15:30:00Z');
  PERFORM public.t_eq('a Call needed item is raised', (SELECT count(*) FROM public.agent_flags WHERE rule_code = 'FT02' AND status = 'open'), 1::bigint);
  SELECT id INTO v_call FROM public.agent_flags WHERE rule_code = 'FT02';
  PERFORM public.t_eq('it is about Bob', (SELECT person_id FROM public.agent_flags WHERE id = v_call), 'a0000000-0000-0000-0000-000000000003'::uuid);
  PERFORM public.t_eq('high', (SELECT severity FROM public.agent_flags WHERE id = v_call), 'high');
  IF (SELECT why FROM public.agent_flags WHERE id = v_call) NOT LIKE '%Bob was told on Nov 12 that Alice would have a call with them%' THEN RAISE EXCEPTION 'FAIL: call item text: %', (SELECT why FROM public.agent_flags WHERE id = v_call); END IF;
  PERFORM public.t_eq('the warning knows its call item', (SELECT call_flag_id FROM public.agent_warnings LIMIT 1), v_call);
  PERFORM public.agent_rule_ft02('2026-11-18T15:31:00Z');
  PERFORM public.t_eq('never twice', (SELECT count(*) FROM public.agent_flags WHERE rule_code = 'FT02'), 1::bigint);
  -- the call item goes to the manager, as a short note without a question
  PERFORM public.t_as('a0000000-0000-0000-0000-000000000001');
  d := public.agent_flag_draft(v_call);
  PERFORM public.t_eq('the call goes to the manager', d ->> 'recipient_name', 'Alice');
  IF d ->> 'body' NOT LIKE 'Hi Alice, %' OR d ->> 'body' LIKE '%What is happening%' THEN RAISE EXCEPTION 'FAIL: call draft: %', d ->> 'body'; END IF;
  RESET ROLE;
  -- only the people who run the Agent can read the warnings
  PERFORM public.t_as('a0000000-0000-0000-0000-000000000003');
  PERFORM public.t_eq('a member sees no warnings', (SELECT count(*) FROM public.agent_warnings), 0::bigint);
  PERFORM public.t_denied($q$SELECT public.agent_rule_ft02()$q$, 'a signed-in user running FT02');
  RESET ROLE;
  RAISE NOTICE 'PASS 13: tailored messages, repeat warning, the warning is remembered, a call is raised once when it happens again';
END $$;

-- ── 14. Cliq watch: tagged and not answered ─────────────────────────────────
DO $$
DECLARE v_conn uuid := 'c1000000-0000-0000-0000-0000000000d1'; m1 uuid; m2 uuid; m5 uuid; m6 uuid; v_flag uuid; d jsonb; n bigint; r jsonb;
BEGIN
  RESET ROLE;
  UPDATE public.agent_settings SET default_working_days = '{1,2,3,4,5}';   -- earlier sections made every day a working day
  -- working time: only working days, only 9 to 5 Eastern
  PERFORM public.t_eq('two hours inside a working day', public.agent_working_minutes('2026-11-18T15:00:00Z', '2026-11-18T17:00:00Z'), 120::numeric);
  PERFORM public.t_eq('4 PM to 10 AM next day is 2 working hours', public.agent_working_minutes('2026-11-18T21:00:00Z', '2026-11-19T15:00:00Z'), 120::numeric);
  PERFORM public.t_eq('Friday 4 PM to Monday 10 AM skips the weekend', public.agent_working_minutes('2026-11-20T21:00:00Z', '2026-11-23T15:00:00Z'), 120::numeric);
  PERFORM public.t_eq('all of Saturday is nothing', public.agent_working_minutes('2026-11-21T14:00:00Z', '2026-11-22T02:00:00Z'), 0::numeric);

  INSERT INTO public.agent_connections (id, kind, name, status, config) VALUES (v_conn, 'cliq', 'Cliq watch', 'connected', '{"mode": "api", "dc": "com", "channel": "ops"}');
  INSERT INTO public.agent_identity_map (person_id, cliq_user_id) VALUES
    ('a0000000-0000-0000-0000-000000000002', '1003'), ('a0000000-0000-0000-0000-000000000003', '1001'), ('a0000000-0000-0000-0000-000000000004', '1002'), ('a0000000-0000-0000-0000-000000000005', '1005')
  ON CONFLICT (person_id) DO UPDATE SET cliq_user_id = EXCLUDED.cliq_user_id;

  -- only the Super Admin switches it on, and it starts from now
  PERFORM public.t_as('a0000000-0000-0000-0000-000000000002');
  PERFORM public.t_denied($q$SELECT public.agent_cliq_watch_set('c1000000-0000-0000-0000-0000000000d1', true)$q$, 'an Operations user switching the watch on');
  PERFORM public.t_denied($q$SELECT public.agent_cliq_watch_status()$q$, 'an Operations user reading the watch');
  PERFORM public.t_as('a0000000-0000-0000-0000-000000000001');
  PERFORM public.agent_cliq_watch_set(v_conn, true);
  RESET ROLE;
  PERFORM public.t_eq('the watch is on', (SELECT enabled FROM public.agent_cliq_watch WHERE connection_id = v_conn), true);
  PERFORM public.t_eq('and starts from now', (SELECT checked_through IS NOT NULL AND enabled_at IS NOT NULL FROM public.agent_cliq_watch WHERE connection_id = v_conn), true);

  -- when it reads: working days, 9 to 5:30, every 2 hours
  UPDATE public.agent_cliq_watch SET last_run_at = NULL WHERE connection_id = v_conn;
  PERFORM public.t_eq('due on a working morning', public.agent_cliq_watch_due('2026-11-18T14:07:00Z'), true);
  PERFORM public.t_eq('due at the end of the day', public.agent_cliq_watch_due('2026-11-18T22:07:00Z'), true);
  PERFORM public.t_eq('not before work', public.agent_cliq_watch_due('2026-11-18T12:07:00Z'), false);
  PERFORM public.t_eq('not in the evening', public.agent_cliq_watch_due('2026-11-18T23:07:00Z'), false);
  PERFORM public.t_eq('not on a Saturday', public.agent_cliq_watch_due('2026-11-21T15:07:00Z'), false);
  UPDATE public.agent_cliq_watch SET last_run_at = '2026-11-18T14:07:00Z' WHERE connection_id = v_conn;
  PERFORM public.t_eq('not again within the 2 hours', public.agent_cliq_watch_due('2026-11-18T15:07:00Z'), false);
  PERFORM public.t_eq('again after 2 hours', public.agent_cliq_watch_due('2026-11-18T16:07:00Z'), true);

  -- tagged messages: Alice tags Bob (a request), Cara (a thank-you), someone unknown, Dan (a field agent) and herself
  INSERT INTO public.agent_cliq_messages (connection_id, channel_name, channel_unique, message_id, posted_at, sender_cliq_id, sender_name, tagged_cliq_id, tagged_name, text, classification) VALUES
    (v_conn, 'ops', 'ops', 'M1', '2026-11-18T14:00:00Z', '1003', 'Alice', '1001', 'Bob', 'Can you send the report?', 'request') RETURNING id INTO m1;
  INSERT INTO public.agent_cliq_messages (connection_id, channel_name, channel_unique, message_id, posted_at, sender_cliq_id, sender_name, tagged_cliq_id, tagged_name, text, classification) VALUES
    (v_conn, 'ops', 'ops', 'M2', '2026-11-18T14:00:00Z', '1003', 'Alice', '1002', 'Cara', 'thanks!', 'ack') RETURNING id INTO m2;
  INSERT INTO public.agent_cliq_messages (connection_id, channel_name, channel_unique, message_id, posted_at, sender_cliq_id, sender_name, tagged_cliq_id, tagged_name, text, classification) VALUES
    (v_conn, 'ops', 'ops', 'M3', '2026-11-18T14:00:00Z', '1003', 'Alice', '9999', 'Unknown', 'Can you look at this?', 'request'),
    (v_conn, 'ops', 'ops', 'M4', '2026-11-18T14:00:00Z', '1003', 'Alice', '1005', 'Dan', 'Can you look at this?', 'request'),
    (v_conn, 'ops', 'ops', 'M5', '2026-11-18T14:00:00Z', '1003', 'Alice', '1003', 'Alice', 'note to self?', 'request');
  PERFORM public.t_eq('two writes of the same tag are one', (SELECT count(*) FROM public.agent_cliq_messages WHERE message_id = 'M1'), 1::bigint);

  r := public.agent_rule_cq01('2026-11-18T15:30:00Z');    -- 90 working minutes
  PERFORM public.t_eq('under 2 working hours: nothing yet', (SELECT count(*) FROM public.agent_flags WHERE rule_code = 'CQ01'), 0::bigint);
  r := public.agent_rule_cq01('2026-11-18T16:05:00Z');    -- 125 working minutes
  PERFORM public.t_eq('after 2 working hours: one item, for Bob only', (SELECT count(*) FROM public.agent_flags WHERE rule_code = 'CQ01' AND status = 'open'), 1::bigint);
  SELECT id INTO v_flag FROM public.agent_flags WHERE rule_code = 'CQ01';
  PERFORM public.t_eq('about Bob', (SELECT person_id FROM public.agent_flags WHERE id = v_flag), 'a0000000-0000-0000-0000-000000000003'::uuid);
  PERFORM public.t_eq('medium', (SELECT severity FROM public.agent_flags WHERE id = v_flag), 'medium');
  PERFORM public.t_eq('the message is remembered on the item', (SELECT evidence ->> 'text' FROM public.agent_flags WHERE id = v_flag), 'Can you send the report?');
  PERFORM public.t_eq('and the row knows its item', (SELECT flag_id FROM public.agent_cliq_messages WHERE id = m1), v_flag);
  r := public.agent_rule_cq01('2026-11-18T16:06:00Z');
  PERFORM public.t_eq('never twice', (SELECT count(*) FROM public.agent_flags WHERE rule_code = 'CQ01'), 1::bigint);

  -- the message that asks for a reply goes to the tagged person and says who asked
  PERFORM public.t_as('a0000000-0000-0000-0000-000000000001');
  d := public.agent_flag_draft(v_flag);
  PERFORM public.t_eq('the draft goes to Bob', d ->> 'recipient_name', 'Bob');
  IF d ->> 'channel_body' NOT LIKE 'Hi Bob, Alice tagged you in #ops at 9:00 AM EST and I do not see a reply yet: "Can you send the report?". What is happening? Can you reply in the thread%' THEN
    RAISE EXCEPTION 'FAIL: Cliq draft: %', d ->> 'channel_body';
  END IF;
  RESET ROLE;

  -- a reply from the tagged person closes it (the reader marks the row answered; the rule closes the item)
  UPDATE public.agent_cliq_messages SET status = 'answered', answered_at = '2026-11-18T16:30:00Z', answered_in = 'thread' WHERE id = m1;
  r := public.agent_rule_cq01('2026-11-18T17:00:00Z');
  PERFORM public.t_eq('answered: the item closes by itself', (SELECT status FROM public.agent_flags WHERE id = v_flag), 'auto_resolved');

  -- not watching any more closes what is left; an old, unanswered one expires
  INSERT INTO public.agent_cliq_messages (connection_id, channel_name, channel_unique, message_id, posted_at, sender_cliq_id, sender_name, tagged_cliq_id, tagged_name, text, classification)
    VALUES (v_conn, 'ops', 'ops', 'M6', '2026-11-18T14:00:00Z', '1003', 'Alice', '1002', 'Cara', 'Please confirm the numbers', 'request') RETURNING id INTO m6;
  r := public.agent_rule_cq01('2026-11-18T16:05:00Z');
  PERFORM public.t_eq('a new one for Cara', (SELECT count(*) FROM public.agent_flags WHERE rule_code = 'CQ01' AND status = 'open'), 1::bigint);
  PERFORM public.t_as('a0000000-0000-0000-0000-000000000001');
  PERFORM public.agent_cliq_watch_set(v_conn, false);
  RESET ROLE;
  r := public.agent_rule_cq01('2026-11-18T16:10:00Z');
  PERFORM public.t_eq('watch off: items close', (SELECT count(*) FROM public.agent_flags WHERE rule_code = 'CQ01' AND status = 'open'), 0::bigint);
  RAISE NOTICE 'PASS 14: Cliq watch: working time, when it reads, who is tracked, 2 working hours, the draft, answered and switched off';
END $$;

ROLLBACK;
SELECT 'ok' AS agent_ops_lead;
