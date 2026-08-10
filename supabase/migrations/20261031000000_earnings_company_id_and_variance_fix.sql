-- =============================================================================
-- Patch: add company_id to employee_earnings, fix search_path on
-- compute_payroll_variance
-- =============================================================================

-- company_id on employee_earnings (future multi-tenant readiness)
ALTER TABLE public.employee_earnings
  ADD COLUMN IF NOT EXISTS company_id uuid;

ALTER TABLE public.bank_payment_files
  ADD COLUMN IF NOT EXISTS company_id uuid;

-- Fix SECURITY DEFINER function missing SET search_path
CREATE OR REPLACE FUNCTION compute_payroll_variance(p_run_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run        payroll_runs%ROWTYPE;
  v_prior      payroll_runs%ROWTYPE;
  v_pct        numeric;
BEGIN
  SELECT * INTO v_run FROM payroll_runs WHERE id = p_run_id;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT * INTO v_prior
  FROM payroll_runs
  WHERE period < v_run.period
    AND status IN ('approved', 'paid')
    AND (v_run.payroll_segment_id IS NOT DISTINCT FROM payroll_segment_id)
  ORDER BY period DESC
  LIMIT 1;

  IF NOT FOUND THEN
    UPDATE payroll_runs
    SET variance_pct = NULL, variance_prior_period = NULL
    WHERE id = p_run_id;
    RETURN;
  END IF;

  IF v_prior.total_burn_ngn > 0 THEN
    v_pct := round(
      ((v_run.total_burn_ngn - v_prior.total_burn_ngn) / v_prior.total_burn_ngn) * 100,
      2
    );
  ELSE
    v_pct := NULL;
  END IF;

  UPDATE payroll_runs
  SET variance_pct = v_pct,
      variance_prior_period = v_prior.period
  WHERE id = p_run_id;
END;
$$;
