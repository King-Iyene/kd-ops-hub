-- upsert_payroll_draft() needs a company_id now that payroll_runs.company_id
-- is NOT NULL and its find-or-create lookup + uniqueness are scoped by
-- (company_id, period[, payroll_segment_id]) rather than just period. Adding
-- a new required parameter changes the function's signature, which Postgres
-- treats as a distinct overload — explicitly dropping the old 16-arg version
-- first so it doesn't linger as a second, no-longer-reachable-from-the-UI
-- callable with the exact same authz hole class already fixed twice on this
-- function (20261123000001, 20261219000000).

DROP FUNCTION IF EXISTS public.upsert_payroll_draft(
  text, uuid, numeric, numeric, numeric, numeric, numeric, numeric, numeric,
  numeric, uuid, jsonb, text, integer, jsonb, jsonb
);

CREATE OR REPLACE FUNCTION public.upsert_payroll_draft(
  p_period text,
  p_segment_id uuid,
  p_total_contractor_ngn numeric,
  p_total_employee_ngn numeric,
  p_total_expenses_ngn numeric,
  p_paye_ngn numeric,
  p_pension_ngn numeric,
  p_nhf_ngn numeric,
  p_employer_pension_ngn numeric,
  p_total_burn_ngn numeric,
  p_created_by uuid,
  p_company_id uuid,
  p_run_options jsonb DEFAULT NULL,
  p_period_type text DEFAULT 'monthly',
  p_employee_count integer DEFAULT 0,
  p_bonuses_json jsonb DEFAULT NULL,
  p_allowances_json jsonb DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id uuid;
  v_caller uuid := auth.uid();
  v_caller_role text;
BEGIN
  SELECT role INTO v_caller_role FROM public.profiles
   WHERE id = v_caller AND COALESCE(status, 'active') = 'active';
  IF v_caller_role IS NULL THEN
    RAISE EXCEPTION 'Caller is not an active user' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_caller_role NOT IN ('super_admin', 'admin', 'finance') THEN
    RAISE EXCEPTION 'Your role is not permitted to draft payroll runs'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'A company must be selected before drafting payroll'
      USING ERRCODE = '23502';
  END IF;

  -- Serialize: lock the matching row if it exists. Scoped by company_id so
  -- KD Squares and NDI drafting the same period+segment shape never collide.
  IF p_segment_id IS NULL THEN
    SELECT id INTO v_id FROM payroll_runs
      WHERE company_id = p_company_id AND period = p_period AND payroll_segment_id IS NULL
      FOR UPDATE;
  ELSE
    SELECT id INTO v_id FROM payroll_runs
      WHERE company_id = p_company_id AND period = p_period AND payroll_segment_id = p_segment_id
      FOR UPDATE;
  END IF;

  IF v_id IS NOT NULL THEN
    UPDATE payroll_runs SET
      total_contractor_ngn = p_total_contractor_ngn,
      total_employee_ngn   = p_total_employee_ngn,
      total_expenses_ngn   = p_total_expenses_ngn,
      paye_ngn             = p_paye_ngn,
      pension_ngn          = p_pension_ngn,
      nhf_ngn              = p_nhf_ngn,
      employer_pension_ngn = p_employer_pension_ngn,
      total_burn_ngn       = p_total_burn_ngn,
      run_options          = p_run_options,
      period_type          = p_period_type,
      employee_count       = p_employee_count,
      bonuses_json         = p_bonuses_json,
      allowances_json      = p_allowances_json,
      status               = 'draft'
    WHERE id = v_id;
  ELSE
    INSERT INTO payroll_runs (
      period, payroll_segment_id, company_id,
      total_contractor_ngn, total_employee_ngn, total_expenses_ngn,
      paye_ngn, pension_ngn, nhf_ngn, employer_pension_ngn,
      total_burn_ngn, status, created_by, run_options,
      period_type, employee_count, bonuses_json, allowances_json
    ) VALUES (
      p_period, p_segment_id, p_company_id,
      p_total_contractor_ngn, p_total_employee_ngn, p_total_expenses_ngn,
      p_paye_ngn, p_pension_ngn, p_nhf_ngn, p_employer_pension_ngn,
      p_total_burn_ngn, 'draft', p_created_by, p_run_options,
      p_period_type, p_employee_count, p_bonuses_json, p_allowances_json
    )
    RETURNING id INTO v_id;
  END IF;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_payroll_draft(
  text, uuid, numeric, numeric, numeric, numeric, numeric, numeric, numeric,
  numeric, uuid, uuid, jsonb, text, integer, jsonb, jsonb
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.upsert_payroll_draft(
  text, uuid, numeric, numeric, numeric, numeric, numeric, numeric, numeric,
  numeric, uuid, uuid, jsonb, text, integer, jsonb, jsonb
) TO authenticated;
