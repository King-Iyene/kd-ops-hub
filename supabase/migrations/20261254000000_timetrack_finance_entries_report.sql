-- =============================================================================
-- Entry-level finance report for the Reports > Finance pages (Billable/
-- non-billable, Revenues, Costs, Margin). time_finance_report (see
-- 20261249000000) aggregates at employee+project+day grain, which is fine
-- for the Margin summary but too coarse for Revenues/Costs, which TimeCamp
-- shows one row per entry (task, notes, exact rate). This returns the same
-- rate-resolved numbers at full entry grain, with names already joined in
-- so the client doesn't need a second round trip.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.time_finance_entries_report(
  p_start_date date, p_end_date date
)
RETURNS TABLE (
  id uuid, employee_id uuid, employee_name text,
  project_id uuid, project_name text, task_id uuid, task_name text,
  start_time timestamptz, duration_minutes integer,
  revenue_rate_per_hour numeric, cost_rate_per_hour numeric,
  revenue numeric, cost numeric, margin numeric,
  is_billable boolean, invoiced boolean, notes text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    e.id, e.employee_id, p.full_name,
    e.project_id, pr.name, e.task_id, t.name,
    e.start_time, e.duration_minutes,
    r.revenue_rate_per_hour, r.cost_rate_per_hour,
    ROUND(e.duration_minutes / 60.0 * r.revenue_rate_per_hour, 2) * (e.is_billable::int),
    ROUND(e.duration_minutes / 60.0 * r.cost_rate_per_hour, 2),
    (ROUND(e.duration_minutes / 60.0 * r.revenue_rate_per_hour, 2) * (e.is_billable::int))
      - ROUND(e.duration_minutes / 60.0 * r.cost_rate_per_hour, 2),
    e.is_billable, e.invoiced, e.notes
  FROM public.time_entries e
  JOIN public.time_tasks t ON t.id = e.task_id
  JOIN public.time_projects pr ON pr.id = e.project_id
  JOIN public.profiles p ON p.id = e.employee_id
  JOIN LATERAL public.time_resolve_billing_rate(e.employee_id, e.project_id, e.start_time::date) r ON true
  WHERE e.end_time IS NOT NULL
    AND e.start_time::date BETWEEN p_start_date AND p_end_date
    AND (
      e.employee_id = auth.uid() OR public.time_has_capability('view_others_time')
      OR public.time_is_project_manager(e.project_id)
    );
$$;
GRANT EXECUTE ON FUNCTION public.time_finance_entries_report(date, date) TO authenticated;
