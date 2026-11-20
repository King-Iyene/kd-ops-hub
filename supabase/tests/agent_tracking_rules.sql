-- =============================================================================
-- Ops Agent — contract tests for the five time-tracking rules TR06 .. TR10
--
-- Run AFTER migrations 20261408000000 .. 20261417000000:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/agent_tracking_rules.sql
-- Everything is rolled back. The clock is fixed: Wednesday 2026-11-18, 15:00 UTC = 10:00 EST (ISO week 2026-W47).
-- The minimal replay database needs time_agent_settings.app_version and .screenshots_enabled (production has both).
--
-- What this proves
--   1  TR06 timer with no tracker evidence: 44 vs 45 minutes, the capture interval stretches the grace, activity before the timer
--      started does not count, activity after it closes the item, stopping the timer closes it, high at 3 hours, nothing for
--      people without the desktop app, placement, exemptions, leave, weekends, non-team, manual entries or timers older than 48 h
--   2  TR07 manual time with nothing to back it: 119 vs 120 minutes, activity that day clears it, 59 vs 60 minutes and the
--      day-difference for late entries, high at 360, one item per person per day, the 48 hour window, skipped people and days
--   3  TR08 blocked or unproductive apps: blocked is high, 15 minutes of unproductive is medium (14 is not), websites are never
--      counted here, today only, top apps named, the threshold comes from agent_rules.params
--   4  TR09 hours that do not add up: 599 vs 600 minute entry, 719 vs 720 minute day, leave overlap (119 vs 120, half day,
--      non-working day is low), running timers, overlaps and short entries are not looked at, today and yesterday only
--   5  TR10 tracker not set up: settings missing or off, screenshots off, app never installed (more than 3 working days), web
--      only; one item per ISO week, stays over a day off, closes when fixed
--   6  every rule: no duplicates on a re-run, handled stays handled, only the team, the runner picks all five up by itself,
--      a rule that breaks does not stop the others, a module that is off stops them
--   7  the Inbox card: link, draft message and detail for each new code; the rule functions cannot be run by anon or signed-in users
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
CREATE FUNCTION public.t_id(p_name text) RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT id FROM public.profiles WHERE full_name = p_name $$;
-- the newest item of a rule for a named person (any status), optionally for one period
CREATE FUNCTION public.t_fl(p_rule text, p_name text, p_period text DEFAULT NULL) RETURNS public.agent_flags LANGUAGE sql AS $$
  SELECT f.* FROM public.agent_flags f JOIN public.profiles p ON p.id = f.person_id
   WHERE f.rule_code = p_rule AND p.full_name = p_name AND (p_period IS NULL OR f.period_key = p_period) ORDER BY f.created_at DESC, f.period_key DESC LIMIT 1
$$;
-- who has an open item of a rule (names, sorted)
CREATE FUNCTION public.t_names(p_rule text, p_status text DEFAULT 'open') RETURNS text LANGUAGE sql AS $$
  SELECT coalesce(string_agg(p.full_name, ',' ORDER BY p.full_name), '') FROM public.agent_flags f JOIN public.profiles p ON p.id = f.person_id
   WHERE f.rule_code = p_rule AND f.status = p_status
$$;
CREATE FUNCTION public.t_count(p_rule text, p_status text DEFAULT 'open') RETURNS bigint LANGUAGE sql AS $$
  SELECT count(*) FROM public.agent_flags WHERE rule_code = p_rule AND status = p_status
$$;
-- a timer or an entry for a named person
CREATE FUNCTION public.t_entry(p_name text, p_start timestamptz, p_end timestamptz, p_mins numeric, p_source text DEFAULT 'timer', p_created timestamptz DEFAULT NULL) RETURNS void LANGUAGE sql AS $$
  INSERT INTO public.time_entries (employee_id, start_time, end_time, duration_minutes, entry_source, created_at)
  VALUES (public.t_id(p_name), p_start, p_end, p_mins, p_source, coalesce(p_created, p_start))
$$;
CREATE FUNCTION public.t_log(p_name text, p_at timestamptz, p_app text DEFAULT 'Code', p_url text DEFAULT NULL, p_cat text DEFAULT 'productive', p_win integer DEFAULT 60) RETURNS void LANGUAGE sql AS $$
  INSERT INTO public.time_activity_logs (employee_id, captured_at, app_name, url, productivity_category, window_seconds, active_seconds)
  VALUES (public.t_id(p_name), p_at, p_app, p_url, p_cat, p_win, p_win)
$$;
CREATE FUNCTION public.t_setup(p_name text, p_on boolean DEFAULT true, p_shots boolean DEFAULT true, p_ver text DEFAULT '1.4.0', p_login timestamptz DEFAULT NULL, p_cap integer DEFAULT 10) RETURNS void LANGUAGE sql AS $$
  INSERT INTO public.time_agent_settings (employee_id, is_enabled, screenshots_enabled, app_version, last_login_at, capture_interval_minutes)
  VALUES (public.t_id(p_name), p_on, p_shots, p_ver, p_login, p_cap)
$$;

-- ── Fixture ────────────────────────────────────────────────────────────────
INSERT INTO public.companies (id, name, short_code) VALUES
  ('c0000000-0000-0000-0000-000000000001', 'KD Squares Ltd', 'KDS'), ('c0000000-0000-0000-0000-000000000002', 'NDI', 'NDI');
INSERT INTO public.pay_groups (id, name, company_id) VALUES
  ('e0000000-0000-0000-0000-000000000001', 'KDS - Staff', 'c0000000-0000-0000-0000-000000000001'),
  ('e0000000-0000-0000-0000-000000000002', 'NDI Staffs', 'c0000000-0000-0000-0000-000000000002');
-- Core staff (start dates long ago); everyone is on the KD Squares pay group except the NDI person.
INSERT INTO public.profiles (full_name, email, role, status, pay_group_id, start_date)
SELECT n, lower(n) || '@t.local', 'operations', 'active', 'e0000000-0000-0000-0000-000000000001', DATE '2026-01-05'
  FROM unnest(ARRAY['Tia','Uma','Vic','Wes','Xia','Yoko','Zane','Hal','Ian','Ned','Jon','Pat',
                    'Kai','Lou','Mo','Opal','Pia','Quin','Rex','Sam','Tess','Uli','Vera','Walt',
                    'Abe','Bea','Cy','Dot','Eli','Fay','Gus',
                    'Ann','Bo','Cat','Dan','Eve','Fox','Gil','Hank','Ida','Jo','Kim','Lee','Max','Mia',
                    'Ned1','Opie','Pam','Quinn','Ron','Sue2','Tim','Uri','Val','Wren']) n;
INSERT INTO public.profiles (full_name, email, role, status, pay_group_id) VALUES
  ('Sue Super', 'sue@t.local', 'super_admin', 'active', 'e0000000-0000-0000-0000-000000000001'),
  ('Fred',      'fred@t.local', 'field_staff', 'active', 'e0000000-0000-0000-0000-000000000001'),
  ('Nia',       'nia@t.local',  'operations',  'active', 'e0000000-0000-0000-0000-000000000002');
UPDATE public.profiles SET job_title = 'Field Agent' WHERE full_name = 'Fred';
-- Placement and exempt-from-time people, one of each for every rule
INSERT INTO public.agent_person_profile (person_id, group_name, group_source, exemptions)
SELECT public.t_id(n), CASE WHEN n IN ('Wes', 'Rex', 'Lee') THEN 'placement' ELSE 'core' END, 'manual',
       CASE WHEN n IN ('Xia', 'Max', 'Mia') THEN '{"time": true}'::jsonb ELSE '{}'::jsonb END
  FROM unnest(ARRAY['Tia','Uma','Vic','Wes','Xia','Yoko','Zane','Hal','Ian','Ned','Jon','Pat','Kai','Lou','Mo','Opal','Pia','Quin','Rex','Sam','Tess','Uli','Vera','Walt',
                    'Abe','Bea','Cy','Dot','Eli','Fay','Gus','Ann','Bo','Cat','Dan','Eve','Fox','Gil','Hank','Ida','Jo','Kim','Lee','Max','Mia',
                    'Ned1','Opie','Pam','Quinn','Ron','Sue2','Tim','Uri','Val','Wren']) n;
-- On approved leave
INSERT INTO public.leave_requests (employee_id, start_date, end_date, is_half_day, status) VALUES
  (public.t_id('Yoko'), '2026-11-17', '2026-11-18', false, 'approved'),     -- TR06, TR07: out of the office
  (public.t_id('Eve'),  '2026-11-17', '2026-11-17', false, 'approved'),     -- TR09: tracked 120 minutes on leave
  (public.t_id('Fox'),  '2026-11-17', '2026-11-17', false, 'approved'),     -- TR09: tracked 119 minutes on leave
  (public.t_id('Ida'),  '2026-11-17', '2026-11-17', true,  'approved'),     -- TR09: a half day is not a day off
  (public.t_id('Gil'),  '2026-11-20', '2026-11-23', false, 'approved'),     -- TR09: leave that covers a weekend
  (public.t_id('Pat'),  '2026-11-30', '2026-11-30', false, 'approved'),
  (public.t_id('Wren'), '2026-11-18', '2026-11-18', false, 'approved');     -- TR10: on leave today

-- ── 1. TR06 timer running with no tracker evidence ─────────────────────────
-- Desktop app on for everyone except Vic (off) and Zane (no settings row); Uma captures every 15 minutes (grace 3 x 15 + 10 = 55).
SELECT public.t_setup(n) FROM unnest(ARRAY['Tia','Wes','Xia','Yoko','Fred','Nia','Hal','Ian','Ned','Jon','Pat']) n;
SELECT public.t_setup('Uma', true, true, '1.4.0', NULL, 15);
SELECT public.t_setup('Vic', false);
-- open timers
SELECT public.t_entry('Tia',  '2026-11-18T14:16:00Z', NULL, NULL);   -- 44 minutes at 15:00
SELECT public.t_entry('Uma',  '2026-11-18T14:10:00Z', NULL, NULL);   -- 50 minutes at 15:00
SELECT public.t_entry(n,      '2026-11-18T12:00:00Z', NULL, NULL) FROM unnest(ARRAY['Vic','Wes','Xia','Yoko','Zane','Fred','Nia']) n;
SELECT public.t_entry('Hal',  '2026-11-18T11:50:00Z', NULL, NULL);   -- 190 minutes
SELECT public.t_entry('Ian',  '2026-11-18T12:01:00Z', NULL, NULL);   -- 179 minutes
SELECT public.t_entry('Ned',  '2026-11-18T12:00:00Z', NULL, NULL, 'manual');
SELECT public.t_entry('Jon',  '2026-11-16T10:00:00Z', NULL, NULL);   -- 53 hours: TR02's business
SELECT public.t_entry('Pat',  '2026-11-21T12:00:00Z', NULL, NULL);   -- a Saturday
SELECT public.t_log('Uma', '2026-11-18T14:00:00Z');                  -- captured BEFORE her timer started: not evidence

DO $$
DECLARE r jsonb; fl public.agent_flags;
BEGIN
  r := public.agent_rule_tr06('2026-11-18T15:00:00Z');
  PERFORM public.t_eq('15:00: only the people far past the grace (190 and 179 minutes)', public.t_names('TR06'), 'Hal,Ian');
  PERFORM public.t_eq('Hal at 190 minutes is high', (public.t_fl('TR06', 'Hal')).severity, 'high');
  PERFORM public.t_eq('Ian at 179 minutes is still medium', (public.t_fl('TR06', 'Ian')).severity, 'medium');
  PERFORM public.t_eq('Tia at 44 minutes is not flagged', (public.t_fl('TR06', 'Tia')).id IS NULL, true);

  r := public.agent_rule_tr06('2026-11-18T15:01:00Z');
  PERFORM public.t_eq('15:01: Tia at exactly 45 minutes is flagged', public.t_names('TR06'), 'Hal,Ian,Tia');
  PERFORM public.t_eq('Ian crosses 3 hours: high', (public.t_fl('TR06', 'Ian')).severity, 'high');
  fl := public.t_fl('TR06', 'Tia');
  PERFORM public.t_eq('Tia is medium', fl.severity, 'medium');
  PERFORM public.t_eq('module is track', fl.module, 'track');
  PERFORM public.t_eq('period is the Eastern day', fl.period_key, '2026-11-18');
  PERFORM public.t_eq('it is an item about the person', fl.subject_type || ':' || fl.subject_id, 'person:' || public.t_id('Tia'));
  PERFORM public.t_eq('company is set', fl.company_id, 'c0000000-0000-0000-0000-000000000001'::uuid);
  IF fl.why NOT LIKE 'The timer started at 9:16 AM EST has been running for 45 minutes%' THEN RAISE EXCEPTION 'FAIL: why text: %', fl.why; END IF;
  PERFORM public.t_eq('evidence: running minutes', (fl.evidence ->> 'running_minutes')::int, 45);
  PERFORM public.t_eq('evidence: capture interval', (fl.evidence ->> 'capture_interval_minutes')::int, 10);
  PERFORM public.t_eq('Uma at 51 minutes: her 15 minute interval needs 55', (public.t_fl('TR06', 'Uma')).id IS NULL, true);

  r := public.agent_rule_tr06('2026-11-18T15:04:00Z');
  PERFORM public.t_eq('Uma at 54 minutes: still not', (public.t_fl('TR06', 'Uma')).id IS NULL, true);
  r := public.agent_rule_tr06('2026-11-18T15:05:00Z');
  PERFORM public.t_eq('Uma at 55 minutes: flagged (the capture from before the timer does not count)', (public.t_fl('TR06', 'Uma')).status, 'open');

  PERFORM public.t_eq('nobody without the desktop app (Vic off, Zane none), placed (Wes), exempt (Xia), on leave (Yoko), a Field Agent (Fred), NDI (Nia), a manual entry (Ned), a timer older than 48 hours (Jon), a Saturday timer (Pat)',
    (SELECT count(*) FROM public.agent_flags f JOIN public.profiles p ON p.id = f.person_id WHERE f.rule_code = 'TR06' AND p.full_name IN ('Vic','Zane','Wes','Xia','Yoko','Fred','Nia','Ned','Jon','Pat')), 0::bigint);

  -- running again changes nothing
  PERFORM public.agent_rule_tr06('2026-11-18T15:05:00Z'); PERFORM public.agent_rule_tr06('2026-11-18T15:06:00Z');
  PERFORM public.t_eq('no duplicates after repeated runs', public.t_count('TR06'), 4::bigint);
  PERFORM public.t_eq('one created event per item', (SELECT count(*) FROM public.agent_flag_events WHERE flag_id = fl.id), 1::bigint);

  -- activity arrives (an offline replay, say): the item closes by itself
  PERFORM public.t_log('Tia', '2026-11-18T14:30:00Z');
  PERFORM public.agent_rule_tr06('2026-11-18T15:07:00Z');
  PERFORM public.t_eq('Tia: activity since the timer started closes it', (public.t_fl('TR06', 'Tia')).status, 'auto_resolved');
  PERFORM public.t_eq('the close is recorded', (SELECT count(*) FROM public.agent_flag_events WHERE flag_id = fl.id AND kind = 'auto_resolved'), 1::bigint);
  -- the timer stops: closes
  UPDATE public.time_entries SET end_time = '2026-11-18T15:07:00Z', duration_minutes = 197 WHERE employee_id = public.t_id('Hal');
  PERFORM public.agent_rule_tr06('2026-11-18T15:08:00Z');
  PERFORM public.t_eq('Hal: stopping the timer closes it', (public.t_fl('TR06', 'Hal')).status, 'auto_resolved');
  PERFORM public.t_eq('Ian and Uma stay open', public.t_names('TR06'), 'Ian,Uma');

  -- a handled item stays handled
  UPDATE public.agent_flags SET status = 'handled' WHERE id = (public.t_fl('TR06', 'Ian')).id;
  PERFORM public.agent_rule_tr06('2026-11-18T15:09:00Z');
  PERFORM public.t_eq('a handled item is not reopened', (public.t_fl('TR06', 'Ian')).status, 'handled');
  -- the grace comes from the rule's params: with 120 minutes, Uma (60 minutes) is no longer flagged
  UPDATE public.agent_rules SET params = '{"grace_minutes": 120, "high_hours": 3}' WHERE code = 'TR06';
  PERFORM public.agent_rule_tr06('2026-11-18T15:10:00Z');
  PERFORM public.t_eq('grace 120: Uma closes', (public.t_fl('TR06', 'Uma')).status, 'auto_resolved');
  UPDATE public.agent_rules SET params = '{"grace_minutes": 45, "high_hours": 3}' WHERE code = 'TR06';
  PERFORM public.agent_rule_tr06('2026-11-18T15:11:00Z');
  PERFORM public.t_eq('grace back to 45: Uma is open again', (public.t_fl('TR06', 'Uma')).status, 'open');

  -- a Saturday: nobody is expected to work, so nothing is open
  PERFORM public.agent_rule_tr06('2026-11-21T15:00:00Z');
  PERFORM public.t_eq('Saturday: the weekday items are closed and Pat is not flagged', public.t_names('TR06') = '' AND (public.t_fl('TR06', 'Pat')).id IS NULL, true);
  RAISE NOTICE 'PASS 1: TR06 flags a timer with no tracker evidence at 45 minutes (not 44), stretches the grace with the capture interval, ignores earlier captures, closes itself, and skips everyone it should';
END $$;

-- ── 2. TR07 manual time with nothing to back it ────────────────────────────
-- Manual entries are typed without a time zone and stored as UTC clock time: the day is the typed date.
-- (a) 120+ minutes on a day with no captured activity, app on.   (b) added 2+ days after the work, 60+ minutes.
SELECT public.t_setup(n) FROM unnest(ARRAY['Kai','Lou','Opal','Pia','Quin','Rex','Sam','Tess','Uli','Vera','Walt','Ned1']) n;
SELECT public.t_setup('Mo', false);                                       -- app off: (a) cannot apply
-- Kai: 180 minutes on Tue 17th, no activity that day: flagged. Lou: same, but there was activity that day.
SELECT public.t_entry('Kai',  '2026-11-17T09:00:00Z', '2026-11-17T12:00:00Z', 180, 'manual', '2026-11-17T20:00:00Z');
SELECT public.t_entry('Lou',  '2026-11-17T09:00:00Z', '2026-11-17T12:00:00Z', 180, 'manual', '2026-11-17T20:00:00Z');
SELECT public.t_log('Lou', '2026-11-17T16:00:00Z');
SELECT public.t_entry('Mo',   '2026-11-17T09:00:00Z', '2026-11-17T12:00:00Z', 180, 'manual', '2026-11-17T20:00:00Z');
-- the edge: 119 vs 120 minutes
SELECT public.t_entry('Quin', '2026-11-17T09:00:00Z', '2026-11-17T10:59:00Z', 119, 'manual', '2026-11-17T20:00:00Z');
SELECT public.t_entry('Opal', '2026-11-17T09:00:00Z', '2026-11-17T11:00:00Z', 120, 'manual', '2026-11-17T20:00:00Z');
-- (b) added late: Pia 60 minutes for Fri 13th added on the 18th (5 days later; activity that day so (a) cannot fire)
SELECT public.t_log('Pia', '2026-11-13T16:00:00Z');
SELECT public.t_entry('Pia',  '2026-11-13T09:00:00Z', '2026-11-13T10:00:00Z', 60, 'manual', '2026-11-18T13:00:00Z');
-- 59 minutes added late: not enough
SELECT public.t_log('Uli', '2026-11-13T16:00:00Z');
SELECT public.t_entry('Uli',  '2026-11-13T09:00:00Z', '2026-11-13T09:59:00Z', 59, 'manual', '2026-11-18T13:00:00Z');
-- compared by day: for the 17th, added on the 18th (one day later) is fine; for the 16th, added on the 18th (two days later) is not
SELECT public.t_log('Rex', '2026-11-17T16:00:00Z');
SELECT public.t_entry('Rex',  '2026-11-17T09:00:00Z', '2026-11-17T10:00:00Z', 60, 'manual', '2026-11-18T14:00:00Z');
SELECT public.t_log('Sam', '2026-11-16T16:00:00Z');
SELECT public.t_entry('Sam',  '2026-11-16T09:00:00Z', '2026-11-16T10:00:00Z', 60, 'manual', '2026-11-18T14:00:00Z');
-- severity: 360 minutes is high, 359 is medium (no activity that day)
SELECT public.t_entry('Tess', '2026-11-17T09:00:00Z', '2026-11-17T15:00:00Z', 360, 'manual', '2026-11-17T20:00:00Z');
SELECT public.t_entry('Ned1', '2026-11-17T09:00:00Z', '2026-11-17T14:59:00Z', 359, 'manual', '2026-11-17T20:00:00Z');
-- one item per person per day listing everything: two 90 minute entries
SELECT public.t_entry('Vera', '2026-11-17T09:00:00Z', '2026-11-17T10:30:00Z', 90, 'manual', '2026-11-17T20:00:00Z');
SELECT public.t_entry('Vera', '2026-11-17T13:00:00Z', '2026-11-17T14:30:00Z', 90, 'manual', '2026-11-17T20:01:00Z');
-- skipped: placed, exempt from time, on leave that day, a weekend, a timer entry, an old entry
SELECT public.t_setup(n) FROM unnest(ARRAY['Max']) n;
INSERT INTO public.profiles (full_name, email, role, status, pay_group_id) VALUES ('Zed', 'zed@t.local', 'operations', 'active', 'e0000000-0000-0000-0000-000000000001');
SELECT public.t_setup('Zed');
SELECT public.t_entry('Rex',  '2026-11-17T09:00:00Z', '2026-11-17T17:00:00Z', 480, 'manual', '2026-11-17T20:00:00Z');   -- Rex is in the Placement group
SELECT public.t_entry('Max',  '2026-11-17T09:00:00Z', '2026-11-17T17:00:00Z', 480, 'manual', '2026-11-17T20:00:00Z');   -- Max is exempt
SELECT public.t_entry('Yoko', '2026-11-17T09:00:00Z', '2026-11-17T17:00:00Z', 480, 'manual', '2026-11-17T20:00:00Z');   -- Yoko is on leave
SELECT public.t_entry('Walt', '2026-11-14T09:00:00Z', '2026-11-14T17:00:00Z', 480, 'manual', '2026-11-17T20:00:00Z');   -- a Saturday
SELECT public.t_entry('Zed',  '2026-11-17T09:00:00Z', '2026-11-17T17:00:00Z', 480, 'timer',  '2026-11-17T20:00:00Z');   -- a timer entry is not manual
INSERT INTO public.time_entries (employee_id, start_time, end_time, duration_minutes, entry_source, created_at)
  SELECT public.t_id(n), '2026-11-16T09:00:00Z', '2026-11-16T17:00:00Z', 480, 'manual', '2026-11-16T14:00:00Z' FROM unnest(ARRAY['Pia']) n;   -- created 49 hours ago

DO $$
DECLARE fl public.agent_flags; r jsonb;
BEGIN
  r := public.agent_rule_tr07('2026-11-18T15:00:00Z');
  PERFORM public.t_eq('who is flagged: no activity that day (Kai, Opal, Tess, Ned1, Vera), or added late (Pia, Sam)',
    public.t_names('TR07'), 'Kai,Ned1,Opal,Pia,Sam,Tess,Vera');
  fl := public.t_fl('TR07', 'Kai');
  PERFORM public.t_eq('period is the day of the work', fl.period_key, '2026-11-17');
  PERFORM public.t_eq('medium', fl.severity, 'medium');
  PERFORM public.t_eq('module', fl.module, 'track');
  PERFORM public.t_eq('evidence: day', fl.evidence ->> 'day', '2026-11-17');
  PERFORM public.t_eq('evidence: total hours', (fl.evidence ->> 'total_hours')::numeric, 3.0);
  IF fl.why NOT LIKE '1 manual time entry (3h) for Tue Nov 17: 1 on a day with no activity captured by the desktop app.' THEN RAISE EXCEPTION 'FAIL: why %', fl.why; END IF;
  PERFORM public.t_eq('Quin at 119 minutes is not flagged, Opal at 120 is', (SELECT count(*) FROM public.agent_flags f JOIN public.profiles p ON p.id = f.person_id WHERE f.rule_code = 'TR07' AND p.full_name IN ('Quin')), 0::bigint);
  PERFORM public.t_eq('Lou had activity that day: not flagged', (public.t_fl('TR07', 'Lou')).id IS NULL, true);
  PERFORM public.t_eq('Mo has the desktop app off: not flagged', (public.t_fl('TR07', 'Mo')).id IS NULL, true);
  PERFORM public.t_eq('Pia: 60 minutes added 5 days late is flagged, for the day of the work', (public.t_fl('TR07', 'Pia')).period_key, '2026-11-13');
  IF (public.t_fl('TR07', 'Pia')).why NOT LIKE '1 manual time entry (1h) for Fri Nov 13: 1 added more than a day after the work.' THEN RAISE EXCEPTION 'FAIL: Pia why %', (public.t_fl('TR07', 'Pia')).why; END IF;
  PERFORM public.t_eq('Uli: 59 minutes added late is not enough', (public.t_fl('TR07', 'Uli')).id IS NULL, true);
  PERFORM public.t_eq('Rex: one day later is fine (and Rex is placed anyway)', (public.t_fl('TR07', 'Rex')).id IS NULL, true);
  PERFORM public.t_eq('Sam: two days later is late (day difference, not clock time)', (public.t_fl('TR07', 'Sam')).period_key, '2026-11-16');
  PERFORM public.t_eq('Tess: one entry of 360 minutes is high', (public.t_fl('TR07', 'Tess')).severity, 'high');
  PERFORM public.t_eq('Ned1: 359 minutes is medium', (public.t_fl('TR07', 'Ned1')).severity, 'medium');
  fl := public.t_fl('TR07', 'Vera');
  PERFORM public.t_eq('Vera: two entries are ONE item', (SELECT count(*) FROM public.agent_flags WHERE rule_code = 'TR07' AND person_id = public.t_id('Vera')), 1::bigint);
  PERFORM public.t_eq('with the count', (fl.evidence ->> 'count')::int, 2);
  PERFORM public.t_eq('and the total', (fl.evidence ->> 'total_minutes')::int, 180);
  IF fl.why NOT LIKE '2 manual time entries (3h) for Tue Nov 17:%' THEN RAISE EXCEPTION 'FAIL: Vera why %', fl.why; END IF;
  PERFORM public.t_eq('nobody who is placed (Rex), exempt (Max), on leave (Yoko), a weekend entry (Walt), a timer entry (Zed), or an entry created 49 hours ago (Pia on the 16th)',
    (SELECT count(*) FROM public.agent_flags f JOIN public.profiles p ON p.id = f.person_id WHERE f.rule_code = 'TR07' AND (p.full_name IN ('Rex', 'Max', 'Yoko', 'Walt', 'Zed') OR (p.full_name = 'Pia' AND f.period_key = '2026-11-16'))), 0::bigint);

  -- running again changes nothing
  PERFORM public.agent_rule_tr07('2026-11-18T15:00:00Z'); PERFORM public.agent_rule_tr07('2026-11-18T15:01:00Z');
  PERFORM public.t_eq('no duplicates after three runs', public.t_count('TR07'), 7::bigint);

  -- activity that day closes the item; so does deleting the entry; so does time passing (48 hours)
  PERFORM public.t_log('Kai', '2026-11-17T18:00:00Z');
  PERFORM public.agent_rule_tr07('2026-11-18T15:02:00Z');
  PERFORM public.t_eq('Kai: activity that day closes it', (public.t_fl('TR07', 'Kai')).status, 'auto_resolved');
  DELETE FROM public.time_entries WHERE employee_id = public.t_id('Opal');
  PERFORM public.agent_rule_tr07('2026-11-18T15:03:00Z');
  PERFORM public.t_eq('Opal: deleting the entry closes it', (public.t_fl('TR07', 'Opal')).status, 'auto_resolved');
  UPDATE public.agent_flags SET status = 'handled' WHERE id = (public.t_fl('TR07', 'Tess')).id;
  PERFORM public.agent_rule_tr07('2026-11-19T20:30:00Z');   -- the 17th 20:00 entries are now 48.5 hours old
  PERFORM public.t_eq('after 48 hours the lookback ends: Vera and Ned1 close', public.t_names('TR07'), 'Pia,Sam');
  PERFORM public.t_eq('a handled item stays handled', (public.t_fl('TR07', 'Tess')).status, 'handled');
  RAISE NOTICE 'PASS 2: TR07 flags unbacked or late manual time (120 not 119 minutes, 60 not 59, by day), one item per person per day, severity by the longest entry, bounded to 48 hours';
END $$;

-- ── 3. TR08 blocked or unproductive apps ───────────────────────────────────
-- Today = 2026-11-18 from 05:00 UTC (Eastern midnight).
SELECT public.t_log('Abe', ts, 'Steam', NULL, 'blocked', 600) FROM unnest(ARRAY['2026-11-18T14:00:00Z', '2026-11-18T14:10:00Z', '2026-11-18T14:20:00Z']::timestamptz[]) ts;
SELECT public.t_log('Bea', ts, 'Solitaire', NULL, 'unproductive', 420) FROM unnest(ARRAY['2026-11-18T14:00:00Z', '2026-11-18T14:10:00Z']::timestamptz[]) ts;           -- 14 minutes
SELECT public.t_log('Cy',  ts, 'Solitaire', NULL, 'unproductive', 450) FROM unnest(ARRAY['2026-11-18T14:00:00Z', '2026-11-18T14:10:00Z']::timestamptz[]) ts;           -- exactly 15 minutes
SELECT public.t_log('Dot', '2026-11-18T14:00:00Z', 'Minesweeper', NULL, 'unproductive', 480);
SELECT public.t_log('Dot', '2026-11-18T14:10:00Z', 'Solitaire',   NULL, 'unproductive', 480);                                                                           -- 8 + 8 = 16 minutes
SELECT public.t_log('Eli', ts, 'Chrome', 'https://www.youtube.com/watch?v=1', 'unproductive', 600) FROM unnest(ARRAY['2026-11-18T14:00:00Z', '2026-11-18T14:10:00Z', '2026-11-18T14:20:00Z']::timestamptz[]) ts;
SELECT public.t_log('Eli', '2026-11-18T14:30:00Z', 'Chrome', 'https://blocked-site.example/x', 'blocked', 600);     -- a blocked WEBSITE is not TR08's
SELECT public.t_log('Fay', '2026-11-17T20:00:00Z', 'Steam', NULL, 'blocked', 600);                                  -- yesterday evening (Eastern)
SELECT public.t_log('Gus', '2026-11-18T14:00:00Z', 'Game A', NULL, 'unproductive', 600);
SELECT public.t_log('Gus', '2026-11-18T14:10:00Z', 'Game B', NULL, 'unproductive', 540);
SELECT public.t_log('Gus', '2026-11-18T14:20:00Z', 'Game C', NULL, 'unproductive', 480);
SELECT public.t_log('Gus', '2026-11-18T14:30:00Z', 'Game D', NULL, 'unproductive', 120);
SELECT public.t_log('Gus', '2026-11-18T14:40:00Z', 'Chrome', NULL, 'productive', 600);
-- the same blocked app for people who are skipped
SELECT public.t_log(n, '2026-11-18T14:00:00Z', 'Steam', NULL, 'blocked', 600) FROM unnest(ARRAY['Wes', 'Xia', 'Yoko', 'Fred', 'Nia']) n;

DO $$
DECLARE fl public.agent_flags;
BEGIN
  PERFORM public.agent_rule_tr08('2026-11-18T15:00:00Z');
  PERFORM public.t_eq('Abe (blocked), Cy (15 minutes), Dot (16 over two apps), Gus (the sum of four apps, 29 minutes) are flagged',
    (SELECT string_agg(p.full_name, ',' ORDER BY p.full_name) FROM public.agent_flags f JOIN public.profiles p ON p.id = f.person_id WHERE f.rule_code = 'TR08' AND f.status = 'open' AND p.full_name IN ('Abe','Bea','Cy','Dot','Eli','Fay','Gus','Wes','Xia','Yoko','Fred','Nia')),
    'Abe,Cy,Dot,Gus');
  fl := public.t_fl('TR08', 'Abe');
  PERFORM public.t_eq('any blocked use is high', fl.severity, 'high');
  PERFORM public.t_eq('title names the app', fl.title, 'Blocked app used: Steam');
  PERFORM public.t_eq('why names the app with minutes', fl.why, 'Today: Steam 30 min (blocked).');
  PERFORM public.t_eq('period is today', fl.period_key, '2026-11-18');
  PERFORM public.t_eq('evidence: blocked seconds', (fl.evidence ->> 'blocked_seconds')::int, 1800);
  PERFORM public.t_eq('Cy: exactly 15 minutes of unproductive is medium', (public.t_fl('TR08', 'Cy')).severity, 'medium');
  PERFORM public.t_eq('Cy title', (public.t_fl('TR08', 'Cy')).title, 'Unproductive app: Solitaire');
  PERFORM public.t_eq('Bea: 14 minutes is not enough', (public.t_fl('TR08', 'Bea')).id IS NULL, true);
  PERFORM public.t_eq('Dot: two apps, medium', (public.t_fl('TR08', 'Dot')).title || ':' || (public.t_fl('TR08', 'Dot')).severity, 'Unproductive apps (2):medium');
  PERFORM public.t_eq('Eli: websites (even a blocked one) are TR05 territory, not counted here', (public.t_fl('TR08', 'Eli')).id IS NULL, true);
  PERFORM public.t_eq('Fay: yesterday is not today', (public.t_fl('TR08', 'Fay')).id IS NULL, true);
  fl := public.t_fl('TR08', 'Gus');
  PERFORM public.t_eq('Gus: the top three apps are named, the rest counted', fl.why, 'Today: Game A 10 min, Game B 9 min, Game C 8 min and 1 more.');
  PERFORM public.t_eq('and all four are in the evidence (a productive app is not)', jsonb_array_length(fl.evidence -> 'apps'), 4);
  PERFORM public.t_eq('Gus title', fl.title, 'Unproductive apps (4)');
  PERFORM public.t_eq('no item for placed, exempt, on leave, Field Agent or NDI', (SELECT count(*) FROM public.agent_flags f JOIN public.profiles p ON p.id = f.person_id WHERE f.rule_code = 'TR08' AND p.full_name IN ('Wes','Xia','Yoko','Fred','Nia')), 0::bigint);

  PERFORM public.agent_rule_tr08('2026-11-18T15:00:00Z'); PERFORM public.agent_rule_tr08('2026-11-18T15:01:00Z');
  PERFORM public.t_eq('no duplicates', (SELECT count(*) FROM public.agent_flags f JOIN public.profiles p ON p.id = f.person_id WHERE f.rule_code = 'TR08' AND p.full_name IN ('Abe','Cy','Dot','Gus')), 4::bigint);

  -- more use raises the minutes; a new capture pushes Bea over the line
  PERFORM public.t_log('Bea', '2026-11-18T14:50:00Z', 'Solitaire', NULL, 'unproductive', 60);
  PERFORM public.agent_rule_tr08('2026-11-18T15:02:00Z');
  PERFORM public.t_eq('Bea at 15 minutes is flagged', (public.t_fl('TR08', 'Bea')).severity, 'medium');
  -- it is reclassified: the item closes by itself
  UPDATE public.time_activity_logs SET productivity_category = 'productive' WHERE employee_id = public.t_id('Cy');
  PERFORM public.agent_rule_tr08('2026-11-18T15:03:00Z');
  PERFORM public.t_eq('Cy: no longer unproductive, closed', (public.t_fl('TR08', 'Cy')).status, 'auto_resolved');
  -- the threshold comes from the rule's params
  UPDATE public.agent_rules SET params = '{"unproductive_minutes": 5}' WHERE code = 'TR08';
  INSERT INTO public.time_activity_logs (employee_id, captured_at, app_name, url, productivity_category, window_seconds) VALUES (public.t_id('Quin'), '2026-11-18T14:00:00Z', 'Solitaire', NULL, 'unproductive', 360);
  PERFORM public.agent_rule_tr08('2026-11-18T15:04:00Z');
  PERFORM public.t_eq('with the threshold at 5 minutes, 6 minutes is flagged', (public.t_fl('TR08', 'Quin')).status, 'open');
  UPDATE public.agent_rules SET params = '{"unproductive_minutes": 15}' WHERE code = 'TR08';
  PERFORM public.agent_rule_tr08('2026-11-18T15:05:00Z');
  PERFORM public.t_eq('and back at 15 it closes', (public.t_fl('TR08', 'Quin')).status, 'auto_resolved');
  -- next day: the day's items close
  PERFORM public.agent_rule_tr08('2026-11-19T15:00:00Z');
  PERFORM public.t_eq('the next day, yesterday''s apps are not carried over', public.t_count('TR08'), 0::bigint);
  -- the previous day's blocked-site (TR05) is not duplicated by TR08: web domains stay out of the app totals
  PERFORM public.t_eq('Eli is still not in TR08', (public.t_fl('TR08', 'Eli')).id IS NULL, true);
  RAISE NOTICE 'PASS 3: TR08 flags blocked apps (high) and 15 minutes of unproductive apps (medium), names the top apps, ignores websites and other days, and closes when the data changes';
END $$;

-- ── 4. TR09 hours that do not add up ───────────────────────────────────────
-- Today = Wed 2026-11-18, yesterday = Tue 2026-11-17 (Eastern). Entries are timer entries unless said.
SELECT public.t_entry('Ann', '2026-11-17T13:00:00Z', '2026-11-17T23:30:00Z', 630);        -- 10.5 hours in one go, yesterday
SELECT public.t_entry('Bo',  '2026-11-17T13:00:00Z', '2026-11-17T22:59:00Z', 599);        -- one minute under
SELECT public.t_entry('Cat', '2026-11-18T05:30:00Z', '2026-11-18T10:30:00Z', 300);        -- today: 300 + 300 + 130 = 730 minutes
SELECT public.t_entry('Cat', '2026-11-18T11:00:00Z', '2026-11-18T16:00:00Z', 300);
SELECT public.t_entry('Cat', '2026-11-18T16:30:00Z', '2026-11-18T18:40:00Z', 130);
SELECT public.t_entry('Dan', '2026-11-18T05:30:00Z', '2026-11-18T10:30:00Z', 300);        -- 300 + 300 + 119 = 719
SELECT public.t_entry('Dan', '2026-11-18T11:00:00Z', '2026-11-18T16:00:00Z', 300);
SELECT public.t_entry('Dan', '2026-11-18T16:30:00Z', '2026-11-18T18:29:00Z', 119);
SELECT public.t_entry('Eve', '2026-11-17T14:00:00Z', '2026-11-17T16:00:00Z', 120);        -- on approved leave: 120 minutes
SELECT public.t_entry('Fox', '2026-11-17T14:00:00Z', '2026-11-17T15:59:00Z', 119);        -- on approved leave: 119 minutes
SELECT public.t_entry('Ida', '2026-11-17T14:00:00Z', '2026-11-17T17:20:00Z', 200);        -- half-day leave: a normal day
SELECT public.t_entry('Jo',  '2026-11-17T09:00:00Z', '2026-11-17T11:00:00Z', 120, 'manual');   -- two identical manual entries: an overlap, 240 minutes, not 12 hours
SELECT public.t_entry('Jo',  '2026-11-17T09:00:00Z', '2026-11-17T11:00:00Z', 120, 'manual');
SELECT public.t_entry('Jo',  '2026-11-17T20:00:00Z', '2026-11-17T20:01:00Z', 1);            -- and a one minute entry
SELECT public.t_entry('Kim', '2026-11-17T08:00:00Z', '2026-11-17T19:00:00Z', 660, 'manual');     -- a long MANUAL entry counts, by its typed day
SELECT public.t_entry('Lee', '2026-11-17T13:00:00Z', '2026-11-17T23:30:00Z', 630);        -- Lee is placed
SELECT public.t_entry('Max', '2026-11-17T13:00:00Z', '2026-11-17T23:30:00Z', 630);        -- Max is exempt
SELECT public.t_entry('Mia', '2026-11-17T13:00:00Z', '2026-11-17T23:30:00Z', 630);        -- Mia is exempt
SELECT public.t_entry('Hank','2026-11-15T13:00:00Z', '2026-11-15T23:30:00Z', 700);        -- 3 days ago: out of range
SELECT public.t_entry('Zane','2026-11-17T13:00:00Z', NULL, NULL);                          -- a running timer is TR02's, not this rule's

DO $$
DECLARE fl public.agent_flags;
BEGIN
  PERFORM public.agent_rule_tr09('2026-11-18T19:00:00Z');   -- 14:00 EST
  PERFORM public.t_eq('Ann (630), Cat (730 in the day), Eve (120 on leave), Kim (660, manual) and Yoko (8 hours of manual time on a day of leave) are flagged',
    (SELECT string_agg(p.full_name, ',' ORDER BY p.full_name) FROM public.agent_flags f JOIN public.profiles p ON p.id = f.person_id WHERE f.rule_code = 'TR09' AND f.status = 'open'
      AND p.full_name IN ('Ann','Bo','Cat','Dan','Eve','Fox','Ida','Jo','Kim','Lee','Max','Mia','Hank','Zane','Gil','Yoko')), 'Ann,Cat,Eve,Kim,Yoko');
  fl := public.t_fl('TR09', 'Ann');
  PERFORM public.t_eq('Ann: period is the day of the entry', fl.period_key, '2026-11-17');
  PERFORM public.t_eq('medium', fl.severity, 'medium');
  PERFORM public.t_eq('evidence: longest entry', (fl.evidence ->> 'longest_entry_minutes')::int, 630);
  IF fl.why NOT LIKE 'Hours on Tue Nov 17 do not add up: one entry of 10h 30m.' THEN RAISE EXCEPTION 'FAIL: Ann why %', fl.why; END IF;
  fl := public.t_fl('TR09', 'Cat');
  PERFORM public.t_eq('Cat: today', fl.period_key, '2026-11-18');
  IF fl.why NOT LIKE 'Hours on Wed Nov 18 do not add up: 12h 10m tracked in the day.' THEN RAISE EXCEPTION 'FAIL: Cat why %', fl.why; END IF;
  fl := public.t_fl('TR09', 'Eve');
  PERFORM public.t_eq('Eve: leave overlap on a working day is medium', fl.severity, 'medium');
  IF fl.why NOT LIKE 'Hours on Tue Nov 17 do not add up: 2h tracked on a day of approved leave.' THEN RAISE EXCEPTION 'FAIL: Eve why %', fl.why; END IF;
  PERFORM public.t_eq('Kim: a long manual entry counts', (public.t_fl('TR09', 'Kim')).period_key, '2026-11-17');
  PERFORM public.t_eq('Bo (599 minutes), Dan (719 in the day), Fox (119 on leave), Ida (half-day leave), Jo (overlapping and short entries) are not flagged',
    (SELECT count(*) FROM public.agent_flags f JOIN public.profiles p ON p.id = f.person_id WHERE f.rule_code = 'TR09' AND p.full_name IN ('Bo', 'Dan', 'Fox', 'Ida', 'Jo')), 0::bigint);
  PERFORM public.t_eq('placed (Lee), exempt (Max, Mia), out of range (Hank) and a running timer (Zane) are not flagged',
    (SELECT count(*) FROM public.agent_flags f JOIN public.profiles p ON p.id = f.person_id WHERE f.rule_code = 'TR09' AND p.full_name IN ('Lee', 'Max', 'Mia', 'Hank', 'Zane')), 0::bigint);

  PERFORM public.agent_rule_tr09('2026-11-18T19:00:00Z'); PERFORM public.agent_rule_tr09('2026-11-18T19:01:00Z');
  PERFORM public.t_eq('no duplicates', public.t_count('TR09'), 5::bigint);

  -- a day is raised and cleared on its own: Cat deletes an entry, Ann corrects hers
  DELETE FROM public.time_entries WHERE employee_id = public.t_id('Cat') AND duration_minutes = 130;
  UPDATE public.time_entries SET duration_minutes = 500, end_time = '2026-11-17T21:20:00Z' WHERE employee_id = public.t_id('Ann');
  PERFORM public.agent_rule_tr09('2026-11-18T19:02:00Z');
  PERFORM public.t_eq('Cat (600 minutes now) and Ann (500) close', (public.t_fl('TR09', 'Cat')).status || ',' || (public.t_fl('TR09', 'Ann')).status, 'auto_resolved,auto_resolved');
  -- one minute over, the item comes back
  UPDATE public.time_entries SET duration_minutes = 600, end_time = '2026-11-17T23:00:00Z' WHERE employee_id = public.t_id('Ann');
  PERFORM public.agent_rule_tr09('2026-11-18T19:03:00Z');
  PERFORM public.t_eq('Ann at exactly 600 minutes is flagged again', (public.t_fl('TR09', 'Ann')).status, 'open');
  PERFORM public.t_eq('with a higher count', (public.t_fl('TR09', 'Ann')).occurrence_count, 2);
  -- the day after tomorrow Tuesday is no longer yesterday: closed
  PERFORM public.agent_rule_tr09('2026-11-19T19:00:00Z');
  PERFORM public.t_eq('on Thursday Tuesday is out of range (Ann, Eve, Kim, Yoko) and Cat is back under 12 hours: nothing is open', public.t_names('TR09'), '');
  RAISE NOTICE 'PASS 4a: TR09 flags a closed entry of 10 hours (not 599 minutes), a 12 hour day (not 719), leave overlap (not 119 or half days), ignores short entries, overlaps and running timers';
END $$;

-- Leave that covers a weekend: Sun 2026-11-22, looking at Sat 21st and today.
SELECT public.t_entry('Gil',  '2026-11-21T14:00:00Z', '2026-11-21T16:30:00Z', 150);    -- on leave on a Saturday: low
SELECT public.t_entry('Hank', '2026-11-21T09:00:00Z', '2026-11-21T22:00:00Z', 780);    -- 13 hours on a Saturday, no leave: nobody is expected to work, so it is skipped
DO $$
BEGIN
  PERFORM public.agent_rule_tr09('2026-11-22T15:00:00Z');
  PERFORM public.t_eq('Gil is flagged for the leave overlap, low because it is a non-working day', (public.t_fl('TR09', 'Gil')).severity, 'low');
  PERFORM public.t_eq('for Saturday', (public.t_fl('TR09', 'Gil')).period_key, '2026-11-21');
  PERFORM public.t_eq('Hank worked a weekend day and is skipped', (public.t_fl('TR09', 'Hank')).id IS NULL, true);
  RAISE NOTICE 'PASS 4b: tracked time on approved leave over a weekend is low; a weekend day without leave is skipped';
END $$;

-- ── 5. TR10 tracker not set up ─────────────────────────────────────────────
-- Today = Wed 2026-11-18 (ISO week 2026-W47). Everyone not set up below has a complete setup, or is skipped.
SELECT public.t_setup('Opie', true, false);                                 -- screenshots off
SELECT public.t_setup('Pam', false, true);                                  -- tracker off
SELECT public.t_setup('Quinn');                                             -- complete: never flagged
SELECT public.t_setup('Ron', true, true, NULL);                             -- app never installed, started 2026-11-10 (6 working days)
UPDATE public.profiles SET start_date = '2026-11-10' WHERE full_name = 'Ron';
SELECT public.t_setup('Sue2', true, true, NULL);                            -- app never installed, started Fri 2026-11-13: 3 working days (16, 17, 18)
UPDATE public.profiles SET start_date = '2026-11-13' WHERE full_name = 'Sue2';
SELECT public.t_setup('Tim');                                               -- web only: tracks with the timer, no activity, no login
SELECT public.t_setup('Uri', true, true, '1.4.0', '2026-11-13T12:00:00Z');  -- same, but logged in 5 days ago
SELECT public.t_setup('Val');                                               -- has activity
SELECT public.t_setup('Wren');                                              -- on leave today (never looked at today)
SELECT public.t_entry(n, '2026-11-17T14:00:00Z', '2026-11-17T16:00:00Z', 120, 'timer') FROM unnest(ARRAY['Tim', 'Uri', 'Val']) n;
SELECT public.t_log('Val', '2026-11-17T15:00:00Z');
-- Ned1 has no settings row at all (it was set up above for TR07: remove it); Pia and the others have one
DELETE FROM public.time_agent_settings WHERE employee_id = public.t_id('Ned1');

DO $$
DECLARE fl public.agent_flags; v_names text;
BEGIN
  PERFORM public.agent_rule_tr10('2026-11-18T15:00:00Z');
  v_names := (SELECT string_agg(p.full_name, ',' ORDER BY p.full_name) FROM public.agent_flags f JOIN public.profiles p ON p.id = f.person_id
               WHERE f.rule_code = 'TR10' AND f.status = 'open' AND p.full_name IN ('Ned1','Opie','Pam','Quinn','Ron','Sue2','Tim','Uri','Val','Wren','Wes','Xia','Fred','Nia','Max','Rex','Lee','Mia','Yoko'));
  PERFORM public.t_eq('no settings (Ned1), screenshots off (Opie), tracker off (Pam), app never installed (Ron), web only (Tim)', v_names, 'Ned1,Opie,Pam,Ron,Tim');
  fl := public.t_fl('TR10', 'Ned1');
  PERFORM public.t_eq('low', fl.severity, 'low');
  PERFORM public.t_eq('module', fl.module, 'track');
  PERFORM public.t_eq('period is the ISO week', fl.period_key, '2026-W47');
  PERFORM public.t_eq('the why text says which', fl.why, 'The time tracker is not set up for Ned1: no desktop tracker settings exist for them.');
  PERFORM public.t_eq('evidence has the reason code', fl.evidence -> 'reasons', '["no_settings"]'::jsonb);
  PERFORM public.t_eq('Opie', (public.t_fl('TR10', 'Opie')).evidence -> 'reasons', '["screenshots_off"]'::jsonb);
  PERFORM public.t_eq('Pam: tracker off and screenshots on', (public.t_fl('TR10', 'Pam')).why, 'The time tracker is not set up for Pam: the desktop tracker is switched off for them.');
  PERFORM public.t_eq('Ron', (public.t_fl('TR10', 'Ron')).evidence -> 'reasons', '["app_not_installed"]'::jsonb);
  IF (public.t_fl('TR10', 'Ron')).why NOT LIKE '%not been installed or signed in (they started on Nov 10)%' THEN RAISE EXCEPTION 'FAIL: Ron why %', (public.t_fl('TR10', 'Ron')).why; END IF;
  PERFORM public.t_eq('Tim: web only', (public.t_fl('TR10', 'Tim')).evidence -> 'reasons', '["web_only"]'::jsonb);
  IF (public.t_fl('TR10', 'Tim')).why NOT LIKE '%web timer only%' THEN RAISE EXCEPTION 'FAIL: Tim why %', (public.t_fl('TR10', 'Tim')).why; END IF;
  PERFORM public.t_eq('Sue2 started 3 working days ago: not yet (more than 3 is needed)', (public.t_fl('TR10', 'Sue2')).id IS NULL, true);
  PERFORM public.t_eq('Uri logged in 5 days ago: not web only; Val has activity', (public.t_fl('TR10', 'Uri')).id IS NULL AND (public.t_fl('TR10', 'Val')).id IS NULL, true);
  PERFORM public.t_eq('a complete setup is never flagged', (public.t_fl('TR10', 'Quinn')).id IS NULL, true);
  PERFORM public.t_eq('on leave (Wren), placed (Wes, Lee, Rex), exempt (Xia, Max, Mia), a Field Agent and NDI are not flagged', (SELECT count(*) FROM public.agent_flags f JOIN public.profiles p ON p.id = f.person_id WHERE f.rule_code = 'TR10' AND p.full_name IN ('Wren', 'Wes', 'Lee', 'Rex', 'Xia', 'Max', 'Mia', 'Fred', 'Nia')), 0::bigint);

  -- a re-run, even an hour later, is the same item
  PERFORM public.agent_rule_tr10('2026-11-18T15:00:00Z'); PERFORM public.agent_rule_tr10('2026-11-18T16:00:00Z');
  PERFORM public.t_eq('no duplicates', (SELECT count(*) FROM public.agent_flags WHERE rule_code = 'TR10' AND period_key = '2026-W47' AND person_id = public.t_id('Opie')), 1::bigint);
  -- Thursday: Sue2 has now passed 3 working days
  PERFORM public.agent_rule_tr10('2026-11-19T15:00:00Z');
  PERFORM public.t_eq('Thursday: Sue2 is flagged (4 working days after the start)', (public.t_fl('TR10', 'Sue2')).status, 'open');
  PERFORM public.t_eq('and it is the same ISO week', (public.t_fl('TR10', 'Sue2')).period_key, '2026-W47');
  -- the setup is fixed: closes
  UPDATE public.time_agent_settings SET screenshots_enabled = true WHERE employee_id = public.t_id('Opie');
  PERFORM public.agent_rule_tr10('2026-11-19T15:01:00Z');
  PERFORM public.t_eq('Opie: fixed, closed', (public.t_fl('TR10', 'Opie')).status, 'auto_resolved');
  -- a day off: Saturday does not close the others, and does not raise new ones
  PERFORM public.agent_rule_tr10('2026-11-21T15:00:00Z');
  PERFORM public.t_eq('on a Saturday the open items stay open',
    (SELECT string_agg(p.full_name, ',' ORDER BY p.full_name) FROM public.agent_flags f JOIN public.profiles p ON p.id = f.person_id
      WHERE f.rule_code = 'TR10' AND f.status = 'open' AND f.period_key = '2026-W47' AND p.full_name IN ('Ned1','Opie','Pam','Quinn','Ron','Sue2','Tim','Uri','Val')), 'Ned1,Pam,Ron,Sue2,Tim');
  -- next week: a new item for the new week, the old week closes
  PERFORM public.agent_rule_tr10('2026-11-23T15:00:00Z');
  PERFORM public.t_eq('Monday: the new week gets its own item', (public.t_fl('TR10', 'Pam', '2026-W48')).status, 'open');
  PERFORM public.t_eq('and last week''s closes', (public.t_fl('TR10', 'Pam', '2026-W47')).status, 'auto_resolved');
  -- handled stays handled
  UPDATE public.agent_flags SET status = 'handled' WHERE id = (public.t_fl('TR10', 'Pam', '2026-W48')).id;
  PERFORM public.agent_rule_tr10('2026-11-23T15:05:00Z');
  PERFORM public.t_eq('a handled item stays handled', (public.t_fl('TR10', 'Pam', '2026-W48')).status, 'handled');
  RAISE NOTICE 'PASS 5: TR10 raises one low item per person per ISO week for each kind of missing setup, waits more than 3 working days for the app, survives a day off, and closes when fixed';
END $$;

-- ── 6. the runner, failures, switches ──────────────────────────────────────
DELETE FROM public.agent_flags WHERE rule_code IN ('TR06', 'TR07', 'TR08', 'TR09', 'TR10');
DELETE FROM public.time_activity_logs WHERE employee_id = public.t_id('Tia');
SELECT public.t_entry('Tia', '2026-11-24T14:16:00Z', NULL, NULL);       -- Tuesday 24th, timer, desktop app on, no activity
SELECT public.t_log('Abe', '2026-11-24T14:00:00Z', 'Steam', NULL, 'blocked', 600);
SELECT public.t_entry('Ann', '2026-11-24T05:30:00Z', '2026-11-24T16:30:00Z', 660);
SELECT public.t_entry('Kai', '2026-11-23T09:00:00Z', '2026-11-23T13:00:00Z', 240, 'manual', '2026-11-24T12:00:00Z');
DO $$
DECLARE r jsonb;
BEGIN
  r := public.agent_run_rules('2026-11-24T15:30:00Z');
  PERFORM public.t_eq('the runner ran without errors', r -> 'errors', '[]'::jsonb);
  PERFORM public.t_eq('TR06 ran by itself (Tia)', (public.t_fl('TR06', 'Tia')).status, 'open');
  PERFORM public.t_eq('TR07 ran by itself (Kai)', (public.t_fl('TR07', 'Kai')).status, 'open');
  PERFORM public.t_eq('TR08 ran by itself (Abe)', (public.t_fl('TR08', 'Abe')).status, 'open');
  PERFORM public.t_eq('TR09 ran by itself (Ann)', (public.t_fl('TR09', 'Ann')).status, 'open');
  PERFORM public.t_eq('TR10 ran by itself (the week of the 24th)', (public.t_fl('TR10', 'Ned1')).period_key, '2026-W48');
  PERFORM public.t_eq('the run log says so', (SELECT count(DISTINCT rule_code) FROM public.agent_rule_runs WHERE rule_code IN ('TR06','TR07','TR08','TR09','TR10') AND error IS NULL), 5::bigint);
  PERFORM public.t_eq('running the whole monitor again creates nothing', (public.agent_run_rules('2026-11-24T15:31:00Z') ->> 'created')::int, 0);

  -- a rule that breaks is isolated, reported and cleared; the other new rules still run
  DELETE FROM public.agent_flags WHERE rule_code IN ('TR06', 'TR08');
  ALTER FUNCTION public.agent_rule_tr07(timestamptz) RENAME TO agent_rule_tr07_real;
  CREATE FUNCTION public.agent_rule_tr07(p timestamptz DEFAULT now()) RETURNS jsonb LANGUAGE plpgsql AS $f$ BEGIN RAISE EXCEPTION 'boom'; END $f$;
  r := public.agent_run_rules('2026-11-24T15:32:00Z');
  PERFORM public.t_eq('the failure is reported', r -> 'errors', '["TR07"]'::jsonb);
  PERFORM public.t_eq('the others still ran: TR06, TR08', public.t_names('TR06') || '/' || public.t_names('TR08'), 'Tia/Abe');
  PERFORM public.t_eq('a system item says which rule failed', public.t_count('SY03'), 1::bigint);
  DROP FUNCTION public.agent_rule_tr07(timestamptz);
  ALTER FUNCTION public.agent_rule_tr07_real(timestamptz) RENAME TO agent_rule_tr07;
  r := public.agent_run_rules('2026-11-24T15:33:00Z');
  PERFORM public.t_eq('no errors once it works', r -> 'errors', '[]'::jsonb);
  PERFORM public.t_eq('and the failure item clears itself', public.t_count('SY03'), 0::bigint);

  -- a rule that is off raises nothing and closes its items; a module that is off stops all five
  UPDATE public.agent_rules SET enabled = false WHERE code = 'TR08';
  PERFORM public.agent_run_rules('2026-11-24T15:34:00Z');
  PERFORM public.t_eq('rule off: its open items close', public.t_count('TR08'), 0::bigint);
  UPDATE public.agent_rules SET enabled = true WHERE code = 'TR08';
  PERFORM public.agent_run_rules('2026-11-24T15:35:00Z');
  PERFORM public.t_eq('rule on: it raises again', public.t_count('TR08'), 1::bigint);
  DELETE FROM public.agent_flags WHERE rule_code IN ('TR06', 'TR07', 'TR08', 'TR09', 'TR10');
  UPDATE public.agent_module_access SET enabled = false WHERE module_key = 'track';
  PERFORM public.agent_run_rules('2026-11-24T15:36:00Z');
  PERFORM public.t_eq('module off: none of the five runs', (SELECT count(*) FROM public.agent_flags WHERE rule_code IN ('TR06', 'TR07', 'TR08', 'TR09', 'TR10')), 0::bigint);
  UPDATE public.agent_module_access SET enabled = true WHERE module_key = 'track';
  PERFORM public.agent_run_rules('2026-11-24T15:37:00Z');
  PERFORM public.t_eq('module on: they run again', (SELECT count(DISTINCT rule_code) FROM public.agent_flags WHERE rule_code IN ('TR06', 'TR07', 'TR08', 'TR09', 'TR10')), 5::bigint);
  RAISE NOTICE 'PASS 6: the runner picks up TR06..TR10 by itself, a failing rule is isolated and reported, a rule or module that is off stops them';
END $$;

-- ── 7. the Inbox card, and who may run what ────────────────────────────────
SELECT public.t_as(public.t_id('Sue Super'));
DO $$
DECLARE d jsonb; v jsonb; c text; v_id uuid;
BEGIN
  FOREACH c IN ARRAY ARRAY['TR06', 'TR07', 'TR08', 'TR09', 'TR10'] LOOP
    SELECT id INTO v_id FROM public.agent_flags WHERE rule_code = c AND status = 'open' LIMIT 1;
    IF v_id IS NULL THEN RAISE EXCEPTION 'FAIL: no open % item to look at', c; END IF;
    d := public.agent_flag_draft(v_id);
    IF d ->> 'body' NOT LIKE 'Hi %' OR d ->> 'body' LIKE '%Please let me know what is happening.%' THEN RAISE EXCEPTION 'FAIL: % draft is generic: %', c, d ->> 'body'; END IF;
    PERFORM public.t_eq(c || ' link goes to Track', public.agent_flag_link(v_id) ->> 'path', '/timesheets');
    PERFORM public.t_eq(c || ' goes to the person', d ->> 'to', 'person');
    v := public.agent_flag_detail(v_id);
    PERFORM public.t_eq(c || ' detail has the draft', v -> 'draft' ->> 'subject', (SELECT title FROM public.agent_flags WHERE id = v_id));
    PERFORM public.t_eq(c || ' detail has a tracker block', v -> 'tracker' IS NOT NULL, true);
  END LOOP;
  SELECT id INTO v_id FROM public.agent_flags WHERE rule_code = 'TR06' AND status = 'open' LIMIT 1;
  d := public.agent_flag_draft(v_id);
  IF d ->> 'body' NOT LIKE '%Your timer, started at 9:16 AM EST%' OR d ->> 'body' NOT LIKE '%captured nothing since it started%' OR d ->> 'body' NOT LIKE '%Open it here: https://%/timesheets%' THEN RAISE EXCEPTION 'FAIL: TR06 draft: %', d ->> 'body'; END IF;
  SELECT id INTO v_id FROM public.agent_flags WHERE rule_code = 'TR08' AND status = 'open' LIMIT 1;
  d := public.agent_flag_draft(v_id);
  IF d ->> 'body' NOT LIKE '%Time in Steam (about 10 min) today.%' OR d ->> 'body' NOT LIKE '%blocked on work time%' THEN RAISE EXCEPTION 'FAIL: TR08 draft: %', d ->> 'body'; END IF;
  SELECT id INTO v_id FROM public.agent_flags WHERE rule_code = 'TR07' AND status = 'open' LIMIT 1;
  IF public.agent_flag_draft(v_id) ->> 'body' NOT LIKE '%Manual time on Mon Nov 23%' THEN RAISE EXCEPTION 'FAIL: TR07 draft names the day'; END IF;
  SELECT id INTO v_id FROM public.agent_flags WHERE rule_code = 'TR10' AND status = 'open' LIMIT 1;
  IF public.agent_flag_draft(v_id) ->> 'body' NOT LIKE '%Time tracker setup, week 2026-W48%' THEN RAISE EXCEPTION 'FAIL: TR10 draft names the week'; END IF;
  -- what it said before for the old rules is unchanged
  PERFORM public.t_eq('TR01 still links to Track', public.agent_flag_link((SELECT id FROM public.agent_flags WHERE rule_code = 'TR01' LIMIT 1)) ->> 'path', '/timesheets');
  RAISE NOTICE 'PASS 7a: each new rule has a specific draft message, a Track link and a detail block';
END $$;
RESET ROLE;
SELECT public.t_as(public.t_id('Tia'));
DO $$
BEGIN
  PERFORM public.t_denied($q$SELECT public.agent_rule_tr06()$q$, 'a signed-in user running TR06');
  PERFORM public.t_denied($q$SELECT public.agent_rule_tr07()$q$, 'a signed-in user running TR07');
  PERFORM public.t_denied($q$SELECT public.agent_rule_tr08()$q$, 'a signed-in user running TR08');
  PERFORM public.t_denied($q$SELECT public.agent_rule_tr09()$q$, 'a signed-in user running TR09');
  PERFORM public.t_denied($q$SELECT public.agent_rule_tr10()$q$, 'a signed-in user running TR10');
  PERFORM public.t_denied($q$SELECT public.agent_entry_day(now(), 'manual', 'UTC')$q$, 'a signed-in user calling the day helper');
  PERFORM public.t_denied($q$SELECT public.agent_flag_draft(gen_random_uuid())$q$, 'a member reading a draft');
END $$;
RESET ROLE;
SET ROLE anon;
DO $$
BEGIN
  PERFORM public.t_denied($q$SELECT public.agent_rule_tr06()$q$, 'anon running TR06');
  PERFORM public.t_denied($q$SELECT public.agent_rule_tr07()$q$, 'anon running TR07');
  PERFORM public.t_denied($q$SELECT public.agent_rule_tr08()$q$, 'anon running TR08');
  PERFORM public.t_denied($q$SELECT public.agent_rule_tr09()$q$, 'anon running TR09');
  PERFORM public.t_denied($q$SELECT public.agent_rule_tr10()$q$, 'anon running TR10');
  PERFORM public.t_denied($q$SELECT public.agent_flag_draft(gen_random_uuid())$q$, 'anon reading a draft');
END $$;
RESET ROLE;
DO $$
DECLARE v_bad text;
BEGIN
  SELECT string_agg(p.proname, ',') INTO v_bad FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname IN ('agent_rule_tr06', 'agent_rule_tr07', 'agent_rule_tr08', 'agent_rule_tr09', 'agent_rule_tr10')
     AND (NOT p.prosecdef OR p.proconfig IS NULL OR NOT ('search_path=public, pg_temp' = ANY (p.proconfig))
          OR has_function_privilege('anon', p.oid, 'EXECUTE') OR has_function_privilege('authenticated', p.oid, 'EXECUTE') OR has_function_privilege('public', p.oid, 'EXECUTE')
          OR NOT has_function_privilege('service_role', p.oid, 'EXECUTE'));
  IF v_bad IS NOT NULL THEN RAISE EXCEPTION 'FAIL: not SECURITY DEFINER with a fixed search_path, or callable by the wrong role: %', v_bad; END IF;
  RAISE NOTICE 'PASS 7b: the new rule functions are SECURITY DEFINER with search_path = public, pg_temp, and only the service role can run them';
END $$;

ROLLBACK;
