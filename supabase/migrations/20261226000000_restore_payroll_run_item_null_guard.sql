-- Migration 20261222900000 recreated sync_payroll_run_item_from_payslip() to
-- add the "excluded" column but dropped the NULL guard that 20261127000008 had
-- added.  Non-payroll batches (e.g. standalone allowance runs) have
-- payroll_run_id = NULL on their payslips, so the trigger crashes with:
--   "null value in column payroll_run_id violates not null constraint"
-- Restore the guard while keeping the excluded column.

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
    net_ngn,
    excluded
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
    COALESCE(NEW.net_ngn, 0),
    COALESCE(NEW.excluded, false)
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
    net_ngn       = EXCLUDED.net_ngn,
    excluded      = EXCLUDED.excluded;

  RETURN NEW;
END;
$$;
