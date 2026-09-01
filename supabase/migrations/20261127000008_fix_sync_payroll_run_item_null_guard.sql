-- Payslips created from batch payments (employee_salary batches) have
-- payroll_run_id = NULL.  The previous version of this trigger blindly
-- inserted that NULL into payroll_run_items, which has a NOT NULL
-- constraint on payroll_run_id, crashing all Paystack webhooks for
-- employee_salary batches.

CREATE OR REPLACE FUNCTION public.sync_payroll_run_item_from_payslip()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.payroll_run_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.payroll_run_items (
    payroll_run_id,
    employee_id,
    employee_name,
    gross_ngn,
    paye_ngn,
    pension_ngn,
    nhf_ngn,
    nhis_ngn,
    avc_ngn,
    net_ngn
  ) VALUES (
    NEW.payroll_run_id,
    NEW.employee_id,
    NEW.employee_name,
    COALESCE(NEW.gross_ngn, 0),
    COALESCE(NEW.paye_ngn, 0),
    COALESCE(NEW.pension_ngn, 0),
    COALESCE(NEW.nhf_ngn, 0),
    COALESCE(NEW.nhis_ngn, 0),
    COALESCE(NEW.avc_ngn, 0),
    COALESCE(NEW.net_ngn, 0)
  )
  ON CONFLICT (payroll_run_id, employee_id)
  DO UPDATE SET
    employee_name = EXCLUDED.employee_name,
    gross_ngn     = EXCLUDED.gross_ngn,
    paye_ngn      = EXCLUDED.paye_ngn,
    pension_ngn   = EXCLUDED.pension_ngn,
    nhf_ngn       = EXCLUDED.nhf_ngn,
    nhis_ngn      = EXCLUDED.nhis_ngn,
    avc_ngn       = EXCLUDED.avc_ngn,
    net_ngn       = EXCLUDED.net_ngn;

  RETURN NEW;
END;
$$;
