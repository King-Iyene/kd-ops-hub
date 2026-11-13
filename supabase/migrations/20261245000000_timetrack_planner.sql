-- =============================================================================
-- Resource-scheduling planner: planned assignments, compared against actual
-- tracked hours (pulled live from time_entries by the UI/report — not stored
-- here, so it's never stale).
-- =============================================================================

CREATE TABLE public.time_planner_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.time_projects(id) ON DELETE CASCADE,
  scheduled_date date NOT NULL,
  scheduled_hours numeric(5,2) NOT NULL CHECK (scheduled_hours >= 0 AND scheduled_hours <= 24),
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, project_id, scheduled_date)
);
CREATE INDEX time_planner_assignments_date_idx ON public.time_planner_assignments(scheduled_date);
CREATE INDEX time_planner_assignments_employee_idx ON public.time_planner_assignments(employee_id, scheduled_date);

ALTER TABLE public.time_planner_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "time_planner_assignments_read" ON public.time_planner_assignments
  FOR SELECT TO authenticated USING (
    employee_id = auth.uid() OR public.time_has_capability('view_others_time')
    OR public.time_is_project_manager(project_id)
  );
CREATE POLICY "time_planner_assignments_write" ON public.time_planner_assignments
  FOR ALL TO authenticated
  USING (public.time_has_capability('manage_planner') OR public.time_is_project_manager(project_id))
  WITH CHECK (public.time_has_capability('manage_planner') OR public.time_is_project_manager(project_id));

-- Planned vs. actual, by employee/project/week — actual pulled live from
-- time_entries so it's never a stored, staleness-prone duplicate.
CREATE OR REPLACE FUNCTION public.time_planner_vs_actual(p_start_date date, p_end_date date)
RETURNS TABLE (
  employee_id uuid, project_id uuid, scheduled_date date,
  scheduled_hours numeric, actual_hours numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    a.employee_id, a.project_id, a.scheduled_date, a.scheduled_hours,
    COALESCE((
      SELECT SUM(e.duration_minutes) / 60.0 FROM public.time_entries e
      WHERE e.employee_id = a.employee_id AND e.project_id = a.project_id
        AND e.start_time::date = a.scheduled_date AND e.end_time IS NOT NULL
    ), 0) AS actual_hours
  FROM public.time_planner_assignments a
  WHERE a.scheduled_date BETWEEN p_start_date AND p_end_date
    AND (
      a.employee_id = auth.uid() OR public.time_has_capability('view_others_time')
      OR public.time_is_project_manager(a.project_id)
    );
$$;
GRANT EXECUTE ON FUNCTION public.time_planner_vs_actual(date, date) TO authenticated;
