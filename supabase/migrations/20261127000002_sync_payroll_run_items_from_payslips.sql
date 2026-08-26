-- Bridge the gap between `payslips` (where Payroll.tsx writes per-employee
-- data) and `payroll_run_items` (which anomaly detection, compliance filings,
-- and statutory exports read from).  The trigger keeps the two in sync on
-- every INSERT or UPDATE to payslips.

CREATE OR REPLACE FUNCTION public.sync_payroll_run_item_from_payslip()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
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

-- The upsert above requires a unique constraint on (payroll_run_id, employee_id).
-- Add it idempotently — the original CREATE TABLE didn't include one.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.payroll_run_items'::regclass
      AND conname  = 'payroll_run_items_run_employee_uq'
  ) THEN
    ALTER TABLE public.payroll_run_items
      ADD CONSTRAINT payroll_run_items_run_employee_uq
      UNIQUE (payroll_run_id, employee_id);
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_payroll_run_item ON public.payslips;
CREATE TRIGGER trg_sync_payroll_run_item
  AFTER INSERT OR UPDATE ON public.payslips
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_payroll_run_item_from_payslip();

COMMENT ON FUNCTION public.sync_payroll_run_item_from_payslip()
  IS 'Keeps payroll_run_items in sync with payslips so downstream consumers (anomaly detection, compliance filings, statutory exports) always have data.';
