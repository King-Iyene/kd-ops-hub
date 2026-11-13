-- =============================================================================
-- Overtime rules (web-side threshold/alert config — actual OS-level idle
-- detection is out of scope here, see section 10 native-agent proposal) and
-- per-project budgets with a near-limit alert threshold.
-- =============================================================================

CREATE TABLE public.time_overtime_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL DEFAULT 'global' CHECK (scope IN ('global', 'employee', 'project')),
  scope_id uuid, -- employee_id or project_id depending on scope; NULL for 'global'
  daily_threshold_hours numeric(4,2) NOT NULL DEFAULT 8,
  weekly_threshold_hours numeric(5,2) NOT NULL DEFAULT 40,
  multiplier numeric(3,2) NOT NULL DEFAULT 1.5,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((scope = 'global') = (scope_id IS NULL))
);
INSERT INTO public.time_overtime_rules (scope, daily_threshold_hours, weekly_threshold_hours, multiplier)
  VALUES ('global', 8, 40, 1.5);

CREATE TABLE public.time_project_budgets (
  project_id uuid PRIMARY KEY REFERENCES public.time_projects(id) ON DELETE CASCADE,
  budget_type text NOT NULL CHECK (budget_type IN ('hours', 'amount')),
  budget_hours numeric(8,2),
  budget_amount numeric(12,2),
  alert_threshold_pct numeric(5,2) NOT NULL DEFAULT 80,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (budget_type = 'hours' AND budget_hours IS NOT NULL)
    OR (budget_type = 'amount' AND budget_amount IS NOT NULL)
  )
);

-- Budget usage: actual hours/revenue pulled live from time_entries, never
-- stored/duplicated, so it can't drift.
CREATE OR REPLACE FUNCTION public.time_project_budget_usage(p_project_id uuid)
RETURNS TABLE (
  budget_type text, budget_hours numeric, budget_amount numeric, alert_threshold_pct numeric,
  used_hours numeric, used_amount numeric, pct_used numeric, over_threshold boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_budget public.time_project_budgets;
  v_used_hours numeric;
  v_used_amount numeric;
  v_pct numeric;
BEGIN
  SELECT * INTO v_budget FROM public.time_project_budgets WHERE project_id = p_project_id;
  IF v_budget.project_id IS NULL THEN RETURN; END IF;

  SELECT COALESCE(SUM(e.duration_minutes), 0) / 60.0 INTO v_used_hours
  FROM public.time_entries e WHERE e.project_id = p_project_id AND e.end_time IS NOT NULL;

  SELECT COALESCE(SUM(e.duration_minutes) / 60.0 * r.revenue_rate_per_hour, 0) INTO v_used_amount
  FROM public.time_entries e
  JOIN LATERAL public.time_resolve_billing_rate(e.employee_id, e.project_id, e.start_time::date) r ON true
  WHERE e.project_id = p_project_id AND e.end_time IS NOT NULL AND e.is_billable;

  v_pct := CASE v_budget.budget_type
    WHEN 'hours' THEN CASE WHEN v_budget.budget_hours > 0 THEN v_used_hours / v_budget.budget_hours * 100 ELSE 0 END
    ELSE CASE WHEN v_budget.budget_amount > 0 THEN v_used_amount / v_budget.budget_amount * 100 ELSE 0 END
  END;

  RETURN QUERY SELECT
    v_budget.budget_type, v_budget.budget_hours, v_budget.budget_amount, v_budget.alert_threshold_pct,
    v_used_hours, v_used_amount, ROUND(v_pct, 1), v_pct >= v_budget.alert_threshold_pct;
END;
$$;
GRANT EXECUTE ON FUNCTION public.time_project_budget_usage(uuid) TO authenticated;

ALTER TABLE public.time_overtime_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_project_budgets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "time_overtime_rules_read" ON public.time_overtime_rules FOR SELECT TO authenticated USING (true);
CREATE POLICY "time_overtime_rules_write" ON public.time_overtime_rules
  FOR ALL TO authenticated
  USING (public.time_has_capability('manage_overtime_rules'))
  WITH CHECK (public.time_has_capability('manage_overtime_rules'));

CREATE POLICY "time_project_budgets_read" ON public.time_project_budgets
  FOR SELECT TO authenticated USING (
    public.time_has_capability('view_others_time') OR public.time_is_project_manager(project_id)
  );
CREATE POLICY "time_project_budgets_write" ON public.time_project_budgets
  FOR ALL TO authenticated
  USING (public.time_has_capability('manage_budgets'))
  WITH CHECK (public.time_has_capability('manage_budgets'));
