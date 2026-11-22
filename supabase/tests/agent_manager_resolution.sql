-- Ops Agent: one rule for a person's manager. The manager set in Settings, People wins, then the staff profile's reporting manager, then
-- the head of the department, never the person themselves; the Inbox card shows it and open items are corrected.
-- Replay: build the minimal fixture, apply the agent migrations, then:  psql -v ON_ERROR_STOP=1 < supabase/tests/agent_manager_resolution.sql
BEGIN;

CREATE FUNCTION public.t_as(p_uid uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  RESET ROLE;
  IF p_uid IS NULL THEN PERFORM set_config('request.jwt.claim.sub', '', true); RETURN; END IF;
  PERFORM set_config('request.jwt.claim.sub', p_uid::text, true);
  SET ROLE authenticated;
END $$;
CREATE FUNCTION public.t_eq(p_label text, p_got anyelement, p_want anyelement) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF p_got IS DISTINCT FROM p_want THEN RAISE EXCEPTION 'FAIL: % (got %, want %)', p_label, p_got, p_want; END IF; END $$;

INSERT INTO auth.users (id, email) SELECT ('a0000000-0000-0000-0000-00000000000' || g)::uuid, 'u' || g || '@t.local' FROM generate_series(1, 8) g;
INSERT INTO public.companies (id, name, short_code) VALUES ('c0000000-0000-0000-0000-000000000001', 'KD Squares Ltd', 'KDS');
INSERT INTO public.pay_groups (id, name, company_id) VALUES ('e0000000-0000-0000-0000-000000000001', 'KDS - Admin', 'c0000000-0000-0000-0000-000000000001');
INSERT INTO public.departments (id, name, head_id) VALUES ('d0000000-0000-0000-0000-000000000001', 'Ops', 'a0000000-0000-0000-0000-000000000008');

-- 1 super admin. 2 manager on the profile. 3 manager set in Settings. 4 department head only. 5 nobody. 6 own manager (self). 7 the person we look at.
INSERT INTO public.profiles (id, email, full_name, role, status, pay_group_id, reporting_manager_id, department_id) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'u1@t.local', 'Sue Super',  'super_admin', 'active', 'e0000000-0000-0000-0000-000000000001', NULL, NULL),
  ('a0000000-0000-0000-0000-000000000002', 'u2@t.local', 'Pat Profile','operations',  'active', 'e0000000-0000-0000-0000-000000000001', NULL, NULL),
  ('a0000000-0000-0000-0000-000000000003', 'u3@t.local', 'Sam Setting','operations',  'active', 'e0000000-0000-0000-0000-000000000001', NULL, NULL),
  ('a0000000-0000-0000-0000-000000000004', 'u4@t.local', 'Dee Dept',   'operations',  'active', 'e0000000-0000-0000-0000-000000000001', NULL, 'd0000000-0000-0000-0000-000000000001'),
  ('a0000000-0000-0000-0000-000000000005', 'u5@t.local', 'Nina None',  'operations',  'active', 'e0000000-0000-0000-0000-000000000001', NULL, NULL),
  ('a0000000-0000-0000-0000-000000000006', 'u6@t.local', 'Self Sam',   'operations',  'active', 'e0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000006', NULL),
  ('a0000000-0000-0000-0000-000000000007', 'u7@t.local', 'Both Bea',   'operations',  'active', 'e0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', NULL),
  ('a0000000-0000-0000-0000-000000000008', 'u8@t.local', 'Head Hal',   'operations',  'active', 'e0000000-0000-0000-0000-000000000001', NULL, NULL);
-- person 3 has no profile manager but one chosen in Settings; person 7 has both (Settings wins)
INSERT INTO public.agent_person_profile (person_id, group_name, group_source, manager_id) VALUES
  ('a0000000-0000-0000-0000-000000000003', 'core', 'manual', 'a0000000-0000-0000-0000-000000000002'),
  ('a0000000-0000-0000-0000-000000000007', 'core', 'manual', 'a0000000-0000-0000-0000-000000000003');

SELECT public.t_eq('Settings, People manager is used when the profile has none', public.agent_manager_of('a0000000-0000-0000-0000-000000000003'), 'a0000000-0000-0000-0000-000000000002'::uuid);
SELECT public.t_eq('Settings, People wins over the profile', public.agent_manager_of('a0000000-0000-0000-0000-000000000007'), 'a0000000-0000-0000-0000-000000000003'::uuid);
SELECT public.t_eq('the department head is the last resort', public.agent_manager_of('a0000000-0000-0000-0000-000000000004'), 'a0000000-0000-0000-0000-000000000008'::uuid);
SELECT public.t_eq('nobody gives null', public.agent_manager_of('a0000000-0000-0000-0000-000000000005'), NULL::uuid);
SELECT public.t_eq('never the person themselves', public.agent_manager_of('a0000000-0000-0000-0000-000000000006'), NULL::uuid);
SELECT public.t_eq('the team view carries it', (SELECT manager_id FROM public.agent_team_v WHERE person_id = 'a0000000-0000-0000-0000-000000000003'), 'a0000000-0000-0000-0000-000000000002'::uuid);

-- the Inbox card shows the manager chosen in Settings (an item raised before it was set has none stored)
INSERT INTO public.agent_flags (id, rule_code, severity, subject_type, subject_id, person_id, manager_id, title, item_type, period_key)
VALUES ('f1000000-0000-0000-0000-000000000001', 'TR03', 'high', 'person', 'a0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000003', NULL, 'Low tracked hours', 'flag', '2026-11-19'),
       ('f1000000-0000-0000-0000-000000000002', 'TR03', 'high', 'person', 'a0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000005', NULL, 'Low tracked hours', 'flag', '2026-11-19');
SELECT public.t_as('a0000000-0000-0000-0000-000000000001');
SELECT public.t_eq('the detail card names the manager', (public.agent_flag_detail('f1000000-0000-0000-0000-000000000001') -> 'person' -> 'manager' ->> 'full_name'), 'Pat Profile');
SELECT public.t_eq('no manager anywhere still shows none', (public.agent_flag_detail('f1000000-0000-0000-0000-000000000002') -> 'person' -> 'manager'), 'null'::jsonb);
RESET ROLE;


-- ── the drafted message is a question to the person; the manager is copied on the email and tagged in the channel message ────────────
INSERT INTO public.agent_flags (id, rule_code, severity, subject_type, subject_id, person_id, manager_id, title, why, item_type, period_key)
VALUES ('f1000000-0000-0000-0000-000000000003', 'TR01', 'medium', 'person', 'a0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000003', NULL, 'Not tracking time',
        'Their work day started at 9:00 AM ET and nothing has been tracked 30 minutes in.', 'flag', '2026-11-20'),
       ('f1000000-0000-0000-0000-000000000004', 'TK14', 'low', 'person', 'a0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000003', NULL, 'Done well', 'Finished early.', 'flag', '2026-11-20');
SELECT public.t_as('a0000000-0000-0000-0000-000000000001');
DO $$
DECLARE d jsonb;
BEGIN
  d := public.agent_flag_draft('f1000000-0000-0000-0000-000000000003');
  IF d ->> 'body' NOT LIKE 'Hi Sam, I found that you are not tracking time. Work starts at 9 AM EST and I have nothing from you yet. What is happening?%' THEN RAISE EXCEPTION 'FAIL: the draft asks the person: %', d ->> 'body'; END IF;
  IF d ->> 'body' NOT LIKE '%I have copied Pat Profile (your manager) so they can follow up with you.%Thank you,%' THEN RAISE EXCEPTION 'FAIL: the email names the copied manager: %', d ->> 'body'; END IF;
  IF d ->> 'channel_body' NOT LIKE '%What is happening?%@Pat Profile please follow up with Sam.' THEN RAISE EXCEPTION 'FAIL: the channel message tags the manager last: %', d ->> 'channel_body'; END IF;
  IF d ->> 'channel_body' LIKE '%Thank you%' OR d ->> 'channel_body' LIKE '%I have copied%' THEN RAISE EXCEPTION 'FAIL: the channel message has no email wording'; END IF;
  IF d -> 'manager' ->> 'email' <> 'u2@t.local' OR d -> 'manager' ->> 'name' <> 'Pat Profile' THEN RAISE EXCEPTION 'FAIL: the draft carries the manager: %', d -> 'manager'; END IF;
  -- nobody to copy: no manager line, and both texts are the same
  d := public.agent_flag_draft('f1000000-0000-0000-0000-000000000002');
  IF d -> 'manager' <> 'null'::jsonb OR d ->> 'body' LIKE '%copied%' OR d ->> 'channel_body' <> d ->> 'body' THEN RAISE EXCEPTION 'FAIL: no manager means no manager line: %', d; END IF;
  -- a thank-you is not a question and copies nobody
  d := public.agent_flag_draft('f1000000-0000-0000-0000-000000000004');
  IF d ->> 'body' LIKE '%What is happening%' OR d -> 'manager' <> 'null'::jsonb THEN RAISE EXCEPTION 'FAIL: a thank-you stays a thank-you: %', d; END IF;
END $$;
RESET ROLE;

-- ROLLBACK so nothing stays
ROLLBACK;
SELECT 'ok' AS agent_manager_resolution;
