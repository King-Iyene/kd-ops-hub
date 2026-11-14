-- =============================================================================
-- Project drill-down report (TimeCamp's "Go to report" page). One RPC
-- returns everything the report page needs in a single round trip: per-task
-- totals, a cumulative-hours-over-time series, overall totals (hours split
-- billable/non-billable, costs split billable/non-billable revenue + cost),
-- a flat list of time entries (for the Time Entries tab), and a per-tag
-- breakdown (for the Tags tab).
--
-- Visibility matches the rest of the module: a project manager or anyone
-- with view_others_time (admins get this via the app-wide bypass already
-- baked into time_has_capability) sees everyone's time on the project;
-- everyone else sees only their own entries, silently scoped — same
-- fail-closed pattern as time_dashboard_today().
-- =============================================================================

CREATE OR REPLACE FUNCTION public.time_project_report(
  p_project_id uuid,
  p_start date DEFAULT NULL,
  p_end date DEFAULT NULL,
  p_employee_ids uuid[] DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_can_view_all boolean;
  v_result jsonb;
BEGIN
  v_can_view_all := public.time_has_capability('view_others_time') OR public.time_is_project_manager(p_project_id);

  WITH scoped_entries AS (
    SELECT e.*
    FROM public.time_entries e
    WHERE e.project_id = p_project_id
      AND (p_start IS NULL OR e.start_time::date >= p_start)
      AND (p_end IS NULL OR e.start_time::date <= p_end)
      AND (v_can_view_all OR e.employee_id = auth.uid())
      AND (p_employee_ids IS NULL OR e.employee_id = ANY(p_employee_ids))
  ),
  entry_amounts AS (
    SELECT
      se.*,
      COALESCE(r.revenue_rate_per_hour, 0) AS revenue_rate,
      COALESCE(r.cost_rate_per_hour, 0) AS cost_rate,
      (COALESCE(se.duration_minutes, 0) / 60.0) AS hours
    FROM scoped_entries se
    LEFT JOIN LATERAL public.time_resolve_billing_rate(se.employee_id, se.project_id, se.start_time::date) r ON true
  ),
  by_task AS (
    SELECT
      t.id AS task_id, t.name AS task_name,
      SUM(ea.hours) AS hours,
      SUM(CASE WHEN ea.is_billable THEN ea.hours * ea.revenue_rate ELSE 0 END) AS income,
      SUM(ea.hours * ea.cost_rate) AS cost,
      array_agg(DISTINCT ea.employee_id) AS employee_ids
    FROM entry_amounts ea
    JOIN public.time_tasks t ON t.id = ea.task_id
    GROUP BY t.id, t.name
  ),
  daily AS (
    SELECT ea.start_time::date AS d, SUM(ea.hours) AS hours
    FROM entry_amounts ea
    GROUP BY ea.start_time::date
  ),
  cumulative AS (
    SELECT d, SUM(hours) OVER (ORDER BY d) AS cum_hours FROM daily ORDER BY d
  ),
  totals AS (
    SELECT
      SUM(ea.hours) AS total_hours,
      SUM(CASE WHEN ea.is_billable THEN ea.hours ELSE 0 END) AS billable_hours,
      SUM(CASE WHEN NOT ea.is_billable THEN ea.hours ELSE 0 END) AS non_billable_hours,
      SUM(CASE WHEN ea.is_billable THEN ea.hours * ea.revenue_rate ELSE 0 END) AS billable_revenue,
      SUM(CASE WHEN NOT ea.is_billable THEN ea.hours * ea.revenue_rate ELSE 0 END) AS non_billable_revenue,
      SUM(ea.hours * ea.cost_rate) AS total_cost
    FROM entry_amounts ea
  ),
  entries_out AS (
    SELECT
      ea.id, ea.employee_id, p.full_name AS employee_name,
      ea.task_id, t.name AS task_name,
      ea.start_time, ea.end_time, ea.duration_minutes, ea.notes, ea.is_billable,
      round((ea.hours * ea.revenue_rate)::numeric, 2) AS income,
      round((ea.hours * ea.cost_rate)::numeric, 2) AS cost
    FROM entry_amounts ea
    JOIN public.time_tasks t ON t.id = ea.task_id
    JOIN public.profiles p ON p.id = ea.employee_id
    ORDER BY ea.start_time DESC
    LIMIT 1000
  ),
  tags_out AS (
    SELECT
      tg.id AS tag_id, tg.name AS tag_name, ea.employee_id, p.full_name AS employee_name,
      SUM(ea.hours) AS hours
    FROM entry_amounts ea
    JOIN public.time_entry_tags ett ON ett.time_entry_id = ea.id
    JOIN public.time_tags tg ON tg.id = ett.tag_id
    JOIN public.profiles p ON p.id = ea.employee_id
    GROUP BY tg.id, tg.name, ea.employee_id, p.full_name
  )
  SELECT jsonb_build_object(
    'tasks', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'task_id', task_id, 'task_name', task_name,
        'hours', round(hours::numeric, 2), 'income', round(income::numeric, 2), 'cost', round(cost::numeric, 2),
        'employee_ids', employee_ids
      ) ORDER BY hours DESC) FROM by_task), '[]'::jsonb),
    'cumulative', COALESCE((SELECT jsonb_agg(jsonb_build_object('date', d, 'hours', round(cum_hours::numeric, 2)) ORDER BY d) FROM cumulative), '[]'::jsonb),
    'totals', (SELECT jsonb_build_object(
        'total_hours', round(COALESCE(total_hours, 0)::numeric, 2),
        'billable_hours', round(COALESCE(billable_hours, 0)::numeric, 2),
        'non_billable_hours', round(COALESCE(non_billable_hours, 0)::numeric, 2),
        'billable_revenue', round(COALESCE(billable_revenue, 0)::numeric, 2),
        'non_billable_revenue', round(COALESCE(non_billable_revenue, 0)::numeric, 2),
        'total_cost', round(COALESCE(total_cost, 0)::numeric, 2)
      ) FROM totals),
    'entries', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', id, 'employee_id', employee_id, 'employee_name', employee_name,
        'task_id', task_id, 'task_name', task_name,
        'start_time', start_time, 'end_time', end_time, 'duration_minutes', duration_minutes,
        'notes', notes, 'is_billable', is_billable, 'income', income, 'cost', cost
      )) FROM entries_out), '[]'::jsonb),
    'tags', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'tag_id', tag_id, 'tag_name', tag_name, 'employee_id', employee_id, 'employee_name', employee_name,
        'hours', round(hours::numeric, 2)
      )) FROM tags_out), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.time_project_report(uuid, date, date, uuid[]) TO authenticated;

NOTIFY pgrst, 'reload schema';
