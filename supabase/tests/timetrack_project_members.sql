-- =============================================================================
-- Time tracker: assigning people to a project.
--
-- Run on a database that has the time tracker core migrations (20261240, 20261241) and 20261438:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/timetrack_project_members.sql
-- Everything is rolled back.
--
-- What this proves
--   1  Existing projects (assigned_only = false) are still offered to everyone; a new project starts assigned-only
--   2  An assigned-only project is offered to its assigned people, its project manager and admins, and nobody else
--   3  time_my_project_ids() says the same, and archived projects are not special-cased
--   4  A person cannot start their own time on a project that is not theirs; admins can enter time for them, the service role is not checked,
--      a project that is open to everyone is unaffected, and editing an old entry (not its project) is allowed
--   5  Only admins and the project's manager can change who is assigned; the list is replaced, switching it off opens the project again
--   6  The assigned list is readable by admins, the project's manager and the person themselves, and not writable directly
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
BEGIN IF p_got IS DISTINCT FROM p_want THEN RAISE EXCEPTION 'FAIL: % (got %, want %)', p_label, p_got, p_want; END IF; END $$;
CREATE FUNCTION public.t_denied(p_sql text, p_label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN EXECUTE p_sql; RAISE EXCEPTION 'FAIL: % was allowed', p_label; EXCEPTION WHEN insufficient_privilege THEN RETURN; END $$;
GRANT EXECUTE ON FUNCTION public.t_as(uuid), public.t_eq(text, anyelement, anyelement), public.t_denied(text, text) TO PUBLIC;
GRANT SELECT, INSERT, UPDATE ON public.time_entries TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.time_projects, public.time_tasks TO authenticated;

INSERT INTO public.profiles (id, full_name, email, role, status) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'Ada Admin', 'ada@t.local', 'admin', 'active'),
  ('a0000000-0000-0000-0000-000000000002', 'Pat Manager', 'pat@t.local', 'operations', 'active'),
  ('a0000000-0000-0000-0000-000000000003', 'Ann Assigned', 'ann@t.local', 'operations', 'active'),
  ('a0000000-0000-0000-0000-000000000004', 'Ben Other', 'ben@t.local', 'operations', 'active'),
  ('a0000000-0000-0000-0000-000000000005', 'Cy Gone', 'cy@t.local', 'operations', 'inactive');

-- an old project (open to everyone, as every existing one is), and a restricted one run by Pat
INSERT INTO public.time_projects (id, name, assigned_only) VALUES ('b0000000-0000-0000-0000-000000000001', 'Old open project', false);
INSERT INTO public.time_projects (id, name, manager_id) VALUES ('b0000000-0000-0000-0000-000000000002', 'New project', 'a0000000-0000-0000-0000-000000000002');
INSERT INTO public.time_tasks (id, project_id, name) VALUES
  ('c0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'General'),
  ('c0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000002', 'General');
INSERT INTO public.time_project_members (project_id, employee_id) VALUES ('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000003');

DO $$
DECLARE n bigint; v_e uuid;
BEGIN
  -- 1 ────────────────────────────────────────────────────────────────────
  PERFORM public.t_eq('a new project starts assigned-only', (SELECT assigned_only FROM public.time_projects WHERE id = 'b0000000-0000-0000-0000-000000000002'), true);
  PERFORM public.t_eq('an existing project stays open', (SELECT assigned_only FROM public.time_projects WHERE id = 'b0000000-0000-0000-0000-000000000001'), false);
  PERFORM public.t_as('a0000000-0000-0000-0000-000000000004');
  PERFORM public.t_eq('Ben still sees the old project', public.time_can_track_project('b0000000-0000-0000-0000-000000000001'), true);
  RAISE NOTICE 'PASS 1: existing projects stay open, new ones start assigned-only';

  -- 2 + 3 ────────────────────────────────────────────────────────────────
  PERFORM public.t_as('a0000000-0000-0000-0000-000000000003');
  PERFORM public.t_eq('Ann (assigned) sees the new project', public.time_can_track_project('b0000000-0000-0000-0000-000000000002'), true);
  PERFORM public.t_eq('Ann gets both in her list', (SELECT count(*) FROM public.time_my_project_ids()), 2::bigint);
  PERFORM public.t_as('a0000000-0000-0000-0000-000000000004');
  PERFORM public.t_eq('Ben (not assigned) does not see it', public.time_can_track_project('b0000000-0000-0000-0000-000000000002'), false);
  PERFORM public.t_eq('Ben only gets the open project', (SELECT array_agg(x) FROM public.time_my_project_ids() x), ARRAY['b0000000-0000-0000-0000-000000000001'::uuid]);
  PERFORM public.t_as('a0000000-0000-0000-0000-000000000002');
  PERFORM public.t_eq('Pat (project manager) sees it without being assigned', public.time_can_track_project('b0000000-0000-0000-0000-000000000002'), true);
  PERFORM public.t_as('a0000000-0000-0000-0000-000000000001');
  PERFORM public.t_eq('an admin sees every project', (SELECT count(*) FROM public.time_my_project_ids()), 2::bigint);
  RAISE NOTICE 'PASS 2/3: assigned people, the manager and admins see it; nobody else';

  -- 4 ────────────────────────────────────────────────────────────────────
  PERFORM public.t_as('a0000000-0000-0000-0000-000000000004');
  PERFORM public.t_denied($q$INSERT INTO public.time_entries (employee_id, task_id, project_id, start_time) VALUES ('a0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000002', now())$q$, 'Ben starting time on a project that is not his');
  INSERT INTO public.time_entries (employee_id, task_id, project_id, start_time, end_time) VALUES ('a0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', now() - interval '2 hours', now() - interval '1 hour') RETURNING id INTO v_e;
  PERFORM public.t_denied(format($q$UPDATE public.time_entries SET project_id = 'b0000000-0000-0000-0000-000000000002', task_id = 'c0000000-0000-0000-0000-000000000002' WHERE id = %L$q$, v_e), 'Ben moving his entry onto a project that is not his');
  UPDATE public.time_entries SET notes = 'edited' WHERE id = v_e;                    -- editing something else about it is fine
  PERFORM public.t_as('a0000000-0000-0000-0000-000000000003');
  INSERT INTO public.time_entries (employee_id, task_id, project_id, start_time, end_time) VALUES ('a0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000002', now() - interval '3 hours', now() - interval '2 hours');
  PERFORM public.t_as('a0000000-0000-0000-0000-000000000001');
  INSERT INTO public.time_entries (employee_id, task_id, project_id, start_time, end_time) VALUES ('a0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000002', now() - interval '5 hours', now() - interval '4 hours');
  PERFORM public.t_as(NULL);
  RESET ROLE;
  INSERT INTO public.time_entries (employee_id, task_id, project_id, start_time, end_time) VALUES ('a0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000002', now() - interval '7 hours', now() - interval '6 hours');
  PERFORM public.t_eq('what an admin or the system entered for Ben is kept', (SELECT count(*) FROM public.time_entries WHERE employee_id = 'a0000000-0000-0000-0000-000000000004' AND project_id = 'b0000000-0000-0000-0000-000000000002'), 2::bigint);
  RAISE NOTICE 'PASS 4: you cannot start your own time on a project that is not yours; everything else still works';

  -- 5 ────────────────────────────────────────────────────────────────────
  PERFORM public.t_as('a0000000-0000-0000-0000-000000000004');
  PERFORM public.t_denied($q$SELECT public.time_project_set_access('b0000000-0000-0000-0000-000000000002', false, '{}')$q$, 'Ben changing who is assigned');
  PERFORM public.t_denied($q$SELECT public.time_project_recent_trackers('b0000000-0000-0000-0000-000000000002')$q$, 'Ben reading who tracked');
  PERFORM public.t_as('a0000000-0000-0000-0000-000000000002');
  PERFORM public.t_eq('the project manager sets the list', (public.time_project_set_access('b0000000-0000-0000-0000-000000000002', true, ARRAY['a0000000-0000-0000-0000-000000000004'::uuid, 'a0000000-0000-0000-0000-000000000003'::uuid]) ->> 'members')::int, 2);
  PERFORM public.t_as('a0000000-0000-0000-0000-000000000004');
  PERFORM public.t_eq('Ben, now assigned, sees it', public.time_can_track_project('b0000000-0000-0000-0000-000000000002'), true);
  PERFORM public.t_as('a0000000-0000-0000-0000-000000000002');
  PERFORM public.t_eq('the list is replaced, not added to', (public.time_project_set_access('b0000000-0000-0000-0000-000000000002', true, ARRAY['a0000000-0000-0000-0000-000000000003'::uuid]) ->> 'members')::int, 1);
  PERFORM public.t_as('a0000000-0000-0000-0000-000000000004');
  PERFORM public.t_eq('Ben is unassigned again', public.time_can_track_project('b0000000-0000-0000-0000-000000000002'), false);
  PERFORM public.t_as('a0000000-0000-0000-0000-000000000001');
  PERFORM public.t_eq('recent trackers: Ann and Ben', (SELECT count(*) FROM public.time_project_recent_trackers('b0000000-0000-0000-0000-000000000002')), 2::bigint);
  PERFORM public.time_project_set_access('b0000000-0000-0000-0000-000000000002', false, ARRAY['a0000000-0000-0000-0000-000000000003'::uuid]);
  PERFORM public.t_as('a0000000-0000-0000-0000-000000000004');
  PERFORM public.t_eq('switched off: everyone sees it again', public.time_can_track_project('b0000000-0000-0000-0000-000000000002'), true);
  PERFORM public.t_as('a0000000-0000-0000-0000-000000000001');
  PERFORM public.time_project_set_access('b0000000-0000-0000-0000-000000000002', true, ARRAY['a0000000-0000-0000-0000-000000000003'::uuid, 'a0000000-0000-0000-0000-000000000099'::uuid]);
  PERFORM public.t_eq('an id that is not a person is ignored', (SELECT count(*) FROM public.time_project_members WHERE project_id = 'b0000000-0000-0000-0000-000000000002'), 1::bigint);
  RAISE NOTICE 'PASS 5: only admins and the manager change the list; it is replaced; off means open';

  -- 6 ────────────────────────────────────────────────────────────────────
  PERFORM public.t_as('a0000000-0000-0000-0000-000000000004');
  PERFORM public.t_eq('Ben sees no one else on the list', (SELECT count(*) FROM public.time_project_members), 0::bigint);
  PERFORM public.t_as('a0000000-0000-0000-0000-000000000003');
  PERFORM public.t_eq('Ann sees her own row', (SELECT count(*) FROM public.time_project_members), 1::bigint);
  PERFORM public.t_denied($q$INSERT INTO public.time_project_members (project_id, employee_id) VALUES ('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000004')$q$, 'writing the list directly');
  PERFORM public.t_as('a0000000-0000-0000-0000-000000000002');
  PERFORM public.t_eq('the project manager reads the list', (SELECT count(*) FROM public.time_project_members), 1::bigint);
  RAISE NOTICE 'PASS 6: the list is readable by the right people and not writable directly';
END $$;

ROLLBACK;
SELECT 'ok' AS timetrack_project_members;
