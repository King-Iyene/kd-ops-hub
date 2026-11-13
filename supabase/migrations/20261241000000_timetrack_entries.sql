-- =============================================================================
-- Time entries — the core tracked-time record. One active (end_time IS NULL)
-- timer per employee at most, enforced by a partial unique index. project_id
-- is denormalized from task_id by trigger (not trusted from the client) so
-- reports can filter/group on project without a join, and so it can never
-- drift from the task's actual project.
-- =============================================================================

CREATE TABLE public.time_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  task_id uuid NOT NULL REFERENCES public.time_tasks(id) ON DELETE RESTRICT,
  project_id uuid NOT NULL REFERENCES public.time_projects(id) ON DELETE RESTRICT,
  start_time timestamptz NOT NULL,
  end_time timestamptz,
  duration_minutes integer,
  is_billable boolean NOT NULL DEFAULT false,
  notes text,
  entry_source text NOT NULL DEFAULT 'manual' CHECK (entry_source IN ('manual', 'timer', 'import')),
  invoiced boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_time IS NULL OR end_time >= start_time)
);

CREATE INDEX time_entries_employee_idx ON public.time_entries(employee_id, start_time);
CREATE INDEX time_entries_project_idx ON public.time_entries(project_id, start_time);
CREATE INDEX time_entries_task_idx ON public.time_entries(task_id);

-- One running timer per employee.
CREATE UNIQUE INDEX time_entries_one_active_timer_idx
  ON public.time_entries(employee_id) WHERE end_time IS NULL;

CREATE TABLE public.time_entry_tags (
  time_entry_id uuid NOT NULL REFERENCES public.time_entries(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.time_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (time_entry_id, tag_id)
);

-- ---------------------------------------------------------------------------
-- Sync project_id from task, compute duration, and block billable entries
-- with no billing rate on file (spec: "No entry can be marked billable
-- without a real rate on file").
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.time_entries_before_write()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_project_id uuid;
  v_rate_found boolean;
BEGIN
  SELECT project_id INTO v_project_id FROM public.time_tasks WHERE id = NEW.task_id;
  IF v_project_id IS NULL THEN
    RAISE EXCEPTION 'Task % does not exist', NEW.task_id;
  END IF;
  NEW.project_id := v_project_id;

  IF NEW.end_time IS NOT NULL THEN
    NEW.duration_minutes := GREATEST(0, ROUND(EXTRACT(EPOCH FROM (NEW.end_time - NEW.start_time)) / 60)::integer);
  ELSE
    NEW.duration_minutes := NULL;
  END IF;

  IF NEW.is_billable THEN
    SELECT EXISTS (
      SELECT 1 FROM public.time_resolve_billing_rate(NEW.employee_id, NEW.project_id, NEW.start_time::date)
    ) INTO v_rate_found;
    IF NOT v_rate_found THEN
      RAISE EXCEPTION 'Cannot mark time entry billable: no billing rate on file for this employee/project as of %', NEW.start_time::date;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- time_resolve_billing_rate is defined in the billing-rates migration; this
-- trigger is created there (after the function exists) rather than here.

ALTER TABLE public.time_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_entry_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "time_entries_read" ON public.time_entries
  FOR SELECT TO authenticated USING (
    employee_id = auth.uid()
    OR public.time_has_capability('view_others_time')
    OR public.time_is_project_manager(project_id)
  );

CREATE POLICY "time_entries_insert" ON public.time_entries
  FOR INSERT TO authenticated WITH CHECK (
    employee_id = auth.uid() OR public.time_has_capability('track_time_for_others')
  );

-- UPDATE/DELETE additionally blocked by time_approvals lock — see approvals migration.
CREATE POLICY "time_entries_update" ON public.time_entries
  FOR UPDATE TO authenticated
  USING (employee_id = auth.uid() OR public.time_has_capability('track_time_for_others'))
  WITH CHECK (employee_id = auth.uid() OR public.time_has_capability('track_time_for_others'));

CREATE POLICY "time_entries_delete" ON public.time_entries
  FOR DELETE TO authenticated USING (
    employee_id = auth.uid() OR public.time_has_capability('track_time_for_others')
  );

CREATE POLICY "time_entry_tags_read" ON public.time_entry_tags
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "time_entry_tags_write" ON public.time_entry_tags
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
