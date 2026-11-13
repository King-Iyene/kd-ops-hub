-- =============================================================================
-- Finance report (revenue/cost/margin) and live dashboard. Computed
-- server-side with time-accurate rates resolved per entry's own date — this
-- is the exact calculation the spec calls out as broken in TimeCamp.
-- Summary/detailed/pivot reports are built client-side as plain filtered
-- selects (RLS already scopes visibility); only the rate-sensitive finance
-- numbers get a dedicated function.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.time_finance_report(
  p_start_date date, p_end_date date, p_employee_id uuid DEFAULT NULL, p_project_id uuid DEFAULT NULL
)
RETURNS TABLE (
  entry_date date, employee_id uuid, project_id uuid, hours numeric,
  revenue_rate_per_hour numeric, cost_rate_per_hour numeric,
  revenue numeric, cost numeric, margin numeric, is_billable boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    e.start_time::date, e.employee_id, e.project_id,
    ROUND(e.duration_minutes / 60.0, 2),
    r.revenue_rate_per_hour, r.cost_rate_per_hour,
    ROUND(e.duration_minutes / 60.0 * r.revenue_rate_per_hour, 2) * (e.is_billable::int),
    ROUND(e.duration_minutes / 60.0 * r.cost_rate_per_hour, 2),
    (ROUND(e.duration_minutes / 60.0 * r.revenue_rate_per_hour, 2) * (e.is_billable::int))
      - ROUND(e.duration_minutes / 60.0 * r.cost_rate_per_hour, 2),
    e.is_billable
  FROM public.time_entries e
  JOIN LATERAL public.time_resolve_billing_rate(e.employee_id, e.project_id, e.start_time::date) r ON true
  WHERE e.end_time IS NOT NULL
    AND e.start_time::date BETWEEN p_start_date AND p_end_date
    AND (p_employee_id IS NULL OR e.employee_id = p_employee_id)
    AND (p_project_id IS NULL OR e.project_id = p_project_id)
    AND (
      e.employee_id = auth.uid() OR public.time_has_capability('view_others_time')
      OR public.time_is_project_manager(e.project_id)
    );
$$;
GRANT EXECUTE ON FUNCTION public.time_finance_report(date, date, uuid, uuid) TO authenticated;

-- Today's logged hours by person + who has an active timer right now.
CREATE OR REPLACE FUNCTION public.time_dashboard_today()
RETURNS TABLE (
  employee_id uuid, full_name text, hours_today numeric, is_timer_active boolean, active_project_name text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    p.id, p.full_name,
    COALESCE((
      SELECT SUM(e.duration_minutes) / 60.0 FROM public.time_entries e
      WHERE e.employee_id = p.id AND e.start_time::date = CURRENT_DATE AND e.end_time IS NOT NULL
    ), 0),
    EXISTS (SELECT 1 FROM public.time_entries e WHERE e.employee_id = p.id AND e.end_time IS NULL),
    (SELECT pr.name FROM public.time_entries e JOIN public.time_projects pr ON pr.id = e.project_id
      WHERE e.employee_id = p.id AND e.end_time IS NULL LIMIT 1)
  FROM public.profiles p
  WHERE p.status = 'active'
    AND (public.time_has_capability('view_others_time') OR p.id = auth.uid());
$$;
GRANT EXECUTE ON FUNCTION public.time_dashboard_today() TO authenticated;
