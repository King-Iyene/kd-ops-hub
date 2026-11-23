-- Time tracker: assign people to a project, and show a project in the tracker only to the people assigned to it.
--
--   * time_projects.assigned_only: when true, the project is offered for tracking only to the people assigned to it, the project manager,
--     and admins (anyone with the manage_projects capability). When false (every project that exists today), nothing changes: everyone
--     still sees it. New projects start with it on.
--   * time_project_members: who is assigned to which project.
--   * time_my_project_ids(): the projects the signed-in person may track time on. The web tracker and the desktop app use it for their pickers.
--   * time_project_set_access(): turns "assigned only" on or off and replaces the list of assigned people in one step (admins and the
--     project's own manager).
--   * A guard: a person cannot start time for themselves on a project that is assigned-only and not theirs. Entries already recorded,
--     reports, approvals, invoices and anything done by an admin on someone's behalf are not affected.
--
-- Nothing is switched on by this migration: every existing project keeps assigned_only = false, so nobody loses a project when it deploys.
-- Rollback: supabase/rollbacks/20261438_timetrack_project_members_down.sql

ALTER TABLE public.time_projects ADD COLUMN IF NOT EXISTS assigned_only boolean NOT NULL DEFAULT false;
ALTER TABLE public.time_projects ALTER COLUMN assigned_only SET DEFAULT true;   -- projects created from now on start assigned-only

CREATE TABLE IF NOT EXISTS public.time_project_members (
  project_id uuid NOT NULL REFERENCES public.time_projects(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  assigned_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, employee_id)
);
CREATE INDEX IF NOT EXISTS time_project_members_employee_idx ON public.time_project_members (employee_id);

ALTER TABLE public.time_project_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS time_project_members_read ON public.time_project_members;
CREATE POLICY time_project_members_read ON public.time_project_members FOR SELECT TO authenticated USING (
  employee_id = auth.uid() OR public.time_has_capability('manage_projects') OR public.time_is_project_manager(project_id)
);
-- Writes go through time_project_set_access (below); nobody writes the table directly.
REVOKE ALL ON public.time_project_members FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.time_project_members TO authenticated;
GRANT ALL ON public.time_project_members TO service_role;

-- May the signed-in person track time on this project?
CREATE OR REPLACE FUNCTION public.time_can_track_project(p_project uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.time_projects pr
     WHERE pr.id = p_project
       AND (NOT pr.assigned_only
            OR pr.manager_id = auth.uid()
            OR EXISTS (SELECT 1 FROM public.time_project_members m WHERE m.project_id = pr.id AND m.employee_id = auth.uid())
            OR public.time_has_capability('manage_projects'))
  )
$$;

-- The projects the signed-in person may track time on (archived ones included; the screens filter those themselves).
CREATE OR REPLACE FUNCTION public.time_my_project_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT pr.id FROM public.time_projects pr WHERE public.time_can_track_project(pr.id)
$$;

-- Who has tracked time on a project lately: offered as a one-click starting list when "assigned only" is switched on.
CREATE OR REPLACE FUNCTION public.time_project_recent_trackers(p_project uuid, p_days integer DEFAULT 90)
RETURNS SETOF uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT (public.time_has_capability('manage_projects') OR public.time_is_project_manager(p_project)) THEN RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501'; END IF;
  RETURN QUERY SELECT DISTINCT e.employee_id FROM public.time_entries e JOIN public.profiles p ON p.id = e.employee_id
                WHERE e.project_id = p_project AND e.employee_id IS NOT NULL AND p.status = 'active' AND e.start_time > now() - make_interval(days => greatest(1, least(p_days, 365)));
END $$;

-- Switch "assigned only" on or off and set the assigned people, in one step.
CREATE OR REPLACE FUNCTION public.time_project_set_access(p_project uuid, p_assigned_only boolean, p_employee_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_n integer;
BEGIN
  IF NOT (public.time_has_capability('manage_projects') OR public.time_is_project_manager(p_project)) THEN RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.time_projects WHERE id = p_project) THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
  UPDATE public.time_projects SET assigned_only = coalesce(p_assigned_only, assigned_only) WHERE id = p_project;
  DELETE FROM public.time_project_members WHERE project_id = p_project AND NOT (employee_id = ANY (coalesce(p_employee_ids, '{}'::uuid[])));
  INSERT INTO public.time_project_members (project_id, employee_id, assigned_by)
  SELECT p_project, p.id, auth.uid() FROM public.profiles p WHERE p.id = ANY (coalesce(p_employee_ids, '{}'::uuid[]))
  ON CONFLICT (project_id, employee_id) DO NOTHING;
  SELECT count(*) INTO v_n FROM public.time_project_members WHERE project_id = p_project;
  RETURN jsonb_build_object('assigned_only', (SELECT assigned_only FROM public.time_projects WHERE id = p_project), 'members', v_n);
END $$;

REVOKE ALL ON FUNCTION public.time_can_track_project(uuid), public.time_my_project_ids(), public.time_project_recent_trackers(uuid, integer),
  public.time_project_set_access(uuid, boolean, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.time_can_track_project(uuid), public.time_my_project_ids(), public.time_project_recent_trackers(uuid, integer),
  public.time_project_set_access(uuid, boolean, uuid[]) TO authenticated, service_role;

-- The guard: starting (or moving) your own time onto an assigned-only project that is not yours is refused, with a plain sentence.
-- Only a signed-in person acting for themselves is checked; the service role, admins entering time for someone else and database functions are not.
CREATE OR REPLACE FUNCTION public.time_entries_project_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL OR NEW.employee_id IS DISTINCT FROM auth.uid() THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.project_id IS NOT DISTINCT FROM OLD.project_id THEN RETURN NEW; END IF;
  IF NOT public.time_can_track_project(NEW.project_id) THEN
    RAISE EXCEPTION 'You are not assigned to this project. Ask its project manager or an admin to assign you.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.time_entries_project_guard() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS time_entries_project_guard ON public.time_entries;
CREATE TRIGGER time_entries_project_guard BEFORE INSERT OR UPDATE OF project_id ON public.time_entries FOR EACH ROW EXECUTE FUNCTION public.time_entries_project_guard();
