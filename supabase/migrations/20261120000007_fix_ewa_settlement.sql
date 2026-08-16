-- Fix: only settle EWA requests that were actually disbursed to the employee.
-- Previously the function also settled 'approved' requests, which meant an
-- employee's pay could be docked for an advance they never received (e.g. if
-- the payment batch failed after approval).

CREATE OR REPLACE FUNCTION public.settle_ewa_for_payroll(
  p_payroll_run_id UUID
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period TEXT;
  v_count  INT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin','finance','super_admin')
  ) THEN
    RAISE EXCEPTION 'Only finance or admin can settle EWA' USING ERRCODE='42501';
  END IF;

  SELECT period INTO v_period FROM public.payroll_runs WHERE id = p_payroll_run_id;
  IF v_period IS NULL THEN
    RAISE EXCEPTION 'Payroll run not found';
  END IF;

  UPDATE public.ewa_requests
     SET status = 'settled',
         settled_payroll_run_id = p_payroll_run_id,
         settled_at = now()
   WHERE settlement_period = v_period
     AND status = 'disbursed';

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
