-- =============================================================================
-- Billing rates — never overwritten. Each change inserts a new row with its
-- own effective_from; effective_to is set on the PREVIOUS row when a new
-- one starts (never backdated across an already-reported period). Project
-- rates override the employee's global rate when both exist for a date.
-- =============================================================================

CREATE TABLE public.time_billing_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  revenue_rate_per_hour numeric(10,2) NOT NULL CHECK (revenue_rate_per_hour >= 0),
  cost_rate_per_hour numeric(10,2) NOT NULL CHECK (cost_rate_per_hour >= 0),
  effective_from date NOT NULL,
  effective_to date,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);
CREATE INDEX time_billing_rates_employee_idx ON public.time_billing_rates(employee_id, effective_from);

CREATE TABLE public.time_project_billing_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.time_projects(id) ON DELETE CASCADE,
  employee_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE, -- NULL = applies to all employees on this project
  revenue_rate_per_hour numeric(10,2) NOT NULL CHECK (revenue_rate_per_hour >= 0),
  cost_rate_per_hour numeric(10,2) NOT NULL CHECK (cost_rate_per_hour >= 0),
  effective_from date NOT NULL,
  effective_to date,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);
CREATE INDEX time_project_billing_rates_idx ON public.time_project_billing_rates(project_id, employee_id, effective_from);

-- Insert-only helper: closes the previous open-ended row for the same
-- employee (and same project+employee scope for project overrides) the day
-- before the new row starts, then inserts the new row. Never updates a rate
-- that's already in use by a past report — it only ever adjusts
-- effective_to going forward from "now".
CREATE OR REPLACE FUNCTION public.time_set_billing_rate(
  p_employee_id uuid, p_revenue_rate numeric, p_cost_rate numeric, p_effective_from date
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT public.time_has_capability('manage_rates') THEN
    RAISE EXCEPTION 'Not permitted to manage billing rates';
  END IF;

  UPDATE public.time_billing_rates
  SET effective_to = p_effective_from - 1
  WHERE employee_id = p_employee_id AND effective_to IS NULL AND effective_from < p_effective_from;

  INSERT INTO public.time_billing_rates (employee_id, revenue_rate_per_hour, cost_rate_per_hour, effective_from, created_by)
  VALUES (p_employee_id, p_revenue_rate, p_cost_rate, p_effective_from, auth.uid())
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.time_set_billing_rate(uuid, numeric, numeric, date) TO authenticated;

CREATE OR REPLACE FUNCTION public.time_set_project_billing_rate(
  p_project_id uuid, p_employee_id uuid, p_revenue_rate numeric, p_cost_rate numeric, p_effective_from date
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT (public.time_has_capability('manage_rates') OR public.time_is_project_manager(p_project_id)) THEN
    RAISE EXCEPTION 'Not permitted to manage this project''s billing rates';
  END IF;

  UPDATE public.time_project_billing_rates
  SET effective_to = p_effective_from - 1
  WHERE project_id = p_project_id
    AND employee_id IS NOT DISTINCT FROM p_employee_id
    AND effective_to IS NULL AND effective_from < p_effective_from;

  INSERT INTO public.time_project_billing_rates
    (project_id, employee_id, revenue_rate_per_hour, cost_rate_per_hour, effective_from, created_by)
  VALUES (p_project_id, p_employee_id, p_revenue_rate, p_cost_rate, p_effective_from, auth.uid())
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.time_set_project_billing_rate(uuid, uuid, numeric, numeric, date) TO authenticated;

-- Rate resolution used by both the billable-entry guard and every finance
-- report: project+employee override > project-wide override > global rate.
CREATE OR REPLACE FUNCTION public.time_resolve_billing_rate(
  p_employee_id uuid, p_project_id uuid, p_as_of date
) RETURNS TABLE (revenue_rate_per_hour numeric, cost_rate_per_hour numeric, source text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT revenue_rate_per_hour, cost_rate_per_hour, 'project_employee'
  FROM public.time_project_billing_rates
  WHERE project_id = p_project_id AND employee_id = p_employee_id
    AND effective_from <= p_as_of AND (effective_to IS NULL OR effective_to >= p_as_of)
  UNION ALL
  SELECT revenue_rate_per_hour, cost_rate_per_hour, 'project_wide'
  FROM public.time_project_billing_rates
  WHERE project_id = p_project_id AND employee_id IS NULL
    AND effective_from <= p_as_of AND (effective_to IS NULL OR effective_to >= p_as_of)
  UNION ALL
  SELECT revenue_rate_per_hour, cost_rate_per_hour, 'global'
  FROM public.time_billing_rates
  WHERE employee_id = p_employee_id
    AND effective_from <= p_as_of AND (effective_to IS NULL OR effective_to >= p_as_of)
  LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.time_resolve_billing_rate(uuid, uuid, date) TO authenticated;

-- Now that time_resolve_billing_rate exists, attach the before-write trigger
-- on time_entries (function body was defined in the entries migration).
CREATE TRIGGER time_entries_before_write_trg
  BEFORE INSERT OR UPDATE ON public.time_entries
  FOR EACH ROW EXECUTE FUNCTION public.time_entries_before_write();

ALTER TABLE public.time_billing_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_project_billing_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "time_billing_rates_read" ON public.time_billing_rates
  FOR SELECT TO authenticated USING (
    employee_id = auth.uid() OR public.time_has_capability('manage_rates')
  );
CREATE POLICY "time_billing_rates_write_via_rpc_only" ON public.time_billing_rates
  FOR ALL TO authenticated USING (false) WITH CHECK (false);

CREATE POLICY "time_project_billing_rates_read" ON public.time_project_billing_rates
  FOR SELECT TO authenticated USING (
    employee_id = auth.uid() OR public.time_has_capability('manage_rates')
    OR public.time_is_project_manager(project_id)
  );
CREATE POLICY "time_project_billing_rates_write_via_rpc_only" ON public.time_project_billing_rates
  FOR ALL TO authenticated USING (false) WITH CHECK (false);

COMMENT ON TABLE public.time_billing_rates IS 'Append-only rate history; write only via time_set_billing_rate(). Never UPDATE/DELETE a past rate — reports must see the rate live at the time.';
