-- ═══════════════════════════════════════════════════════════════════════════════
-- Allow new draft alongside a paid run for the same (company, period, segment)
-- ─────────────────────────────────────────────────────────────────────────────
-- The existing unique indexes enforce a hard one-run-per-slot rule. Once a run
-- reaches "paid" there is no way to draft a replacement or supplementary run
-- for the same period + pay group — even if the paid run was a test with ₦0.
--
-- Fix: narrow the uniqueness constraint to non-paid runs. A paid run keeps its
-- place in the ledger/audit trail; a new draft for the same slot is allowed.
-- The RPC guard (upsert_payroll_draft) is updated to skip paid rows as well.
-- ═══════════════════════════════════════════════════════════════════════════════

-- 1. Rebuild the two partial unique indexes excluding paid runs.
DROP INDEX IF EXISTS payroll_runs_company_period_no_segment_uniq;
CREATE UNIQUE INDEX payroll_runs_company_period_no_segment_uniq
  ON public.payroll_runs (company_id, period)
  WHERE payroll_segment_id IS NULL AND status != 'paid';

DROP INDEX IF EXISTS payroll_runs_company_period_segment_uniq;
CREATE UNIQUE INDEX payroll_runs_company_period_segment_uniq
  ON public.payroll_runs (company_id, period, payroll_segment_id)
  WHERE payroll_segment_id IS NOT NULL AND status != 'paid';

-- 2. Update the RPC to skip paid runs when looking for an existing row.
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
  v_status text;
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
  -- Skip paid runs — they stay in the ledger and a new draft is allowed.
  IF p_segment_id IS NULL THEN
    SELECT id, status INTO v_id, v_status FROM payroll_runs
      WHERE company_id = p_company_id AND period = p_period AND payroll_segment_id IS NULL
        AND status != 'paid'
      FOR UPDATE;
  ELSE
    SELECT id, status INTO v_id, v_status FROM payroll_runs
      WHERE company_id = p_company_id AND period = p_period AND payroll_segment_id = p_segment_id
        AND status != 'paid'
      FOR UPDATE;
  END IF;

  IF v_id IS NOT NULL THEN
    IF v_status IS DISTINCT FROM 'draft' THEN
      RAISE EXCEPTION
        'A payroll run for % already exists for this pay group and is % — open it instead, or recall it to draft first if you need to change the figures.',
        p_period,
        CASE v_status
          WHEN 'pending_approval' THEN 'awaiting approval'
          WHEN 'approved'         THEN 'already approved'
          WHEN 'processing'       THEN 'being disbursed right now'
          ELSE v_status
        END
        USING ERRCODE = 'invalid_parameter_value';
    END IF;

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
