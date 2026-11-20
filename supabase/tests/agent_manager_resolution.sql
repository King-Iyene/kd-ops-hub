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

-- ROLLBACK so nothing stays
ROLLBACK;
SELECT 'ok' AS agent_manager_resolution;
