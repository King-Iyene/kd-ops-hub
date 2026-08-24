-- A paid payroll run or its payslips could still be UPDATE/DELETE'd — no
-- immutability guarantee once money has actually gone out. This is scoped
-- (not a blanket freeze) because finalize_payroll_run_disbursement() flips
-- status to 'paid' FIRST, then calls settle_payroll_run_deductions() which
-- writes payroll_runs.deductions_settled_at on that same now-paid row —
-- a blanket lock would break real disbursement settlement. Financial and
-- identity columns are frozen; deductions_settled_at, notes, and
-- updated_at stay writable. Corrections to a paid run go through a new
-- adjustment run, not an edit-in-place.

CREATE OR REPLACE FUNCTION public.trg_fn_lock_paid_payroll_run()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'paid' THEN
      RAISE EXCEPTION 'Cannot delete a paid payroll run — corrections go through a new adjustment run'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.status = 'paid' AND (
       NEW.status               IS DISTINCT FROM OLD.status
    OR NEW.total_contractor_ngn IS DISTINCT FROM OLD.total_contractor_ngn
    OR NEW.total_employee_ngn   IS DISTINCT FROM OLD.total_employee_ngn
    OR NEW.total_expenses_ngn   IS DISTINCT FROM OLD.total_expenses_ngn
    OR NEW.paye_ngn              IS DISTINCT FROM OLD.paye_ngn
    OR NEW.pension_ngn           IS DISTINCT FROM OLD.pension_ngn
    OR NEW.employer_pension_ngn  IS DISTINCT FROM OLD.employer_pension_ngn
    OR NEW.nhf_ngn                IS DISTINCT FROM OLD.nhf_ngn
    OR NEW.total_burn_ngn         IS DISTINCT FROM OLD.total_burn_ngn
    OR NEW.employee_count         IS DISTINCT FROM OLD.employee_count
    OR NEW.period                 IS DISTINCT FROM OLD.period
    OR NEW.period_type            IS DISTINCT FROM OLD.period_type
    OR NEW.pay_date                IS DISTINCT FROM OLD.pay_date
    OR NEW.cutoff_date              IS DISTINCT FROM OLD.cutoff_date
    OR NEW.bonuses_json              IS DISTINCT FROM OLD.bonuses_json
    OR NEW.allowances_json            IS DISTINCT FROM OLD.allowances_json
    OR NEW.pay_group_id                IS DISTINCT FROM OLD.pay_group_id
    OR NEW.payroll_segment_id            IS DISTINCT FROM OLD.payroll_segment_id
    OR NEW.created_by                     IS DISTINCT FROM OLD.created_by
    OR NEW.approved_by                     IS DISTINCT FROM OLD.approved_by
  ) THEN
    RAISE EXCEPTION 'Cannot modify a paid payroll run — corrections go through a new adjustment run'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lock_paid_payroll_run ON public.payroll_runs;
CREATE TRIGGER trg_lock_paid_payroll_run
  BEFORE UPDATE OR DELETE ON public.payroll_runs
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_lock_paid_payroll_run();

-- Payslips have no status of their own — check the linked run's status.
-- storage_path/updated_at stay writable (regenerating a PDF link after the
-- fact is legitimate); the actual pay figures are not.

CREATE OR REPLACE FUNCTION public.trg_fn_lock_paid_payslip()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run_status text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT status INTO v_run_status FROM public.payroll_runs WHERE id = OLD.payroll_run_id;
    IF v_run_status = 'paid' THEN
      RAISE EXCEPTION 'Cannot delete a payslip from a paid payroll run'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN OLD;
  END IF;

  SELECT status INTO v_run_status FROM public.payroll_runs WHERE id = OLD.payroll_run_id;
  IF v_run_status = 'paid' AND (
       NEW.gross_ngn        IS DISTINCT FROM OLD.gross_ngn
    OR NEW.paye_ngn          IS DISTINCT FROM OLD.paye_ngn
    OR NEW.pension_ngn        IS DISTINCT FROM OLD.pension_ngn
    OR NEW.nhf_ngn              IS DISTINCT FROM OLD.nhf_ngn
    OR NEW.nhis_ngn               IS DISTINCT FROM OLD.nhis_ngn
    OR NEW.avc_ngn                  IS DISTINCT FROM OLD.avc_ngn
    OR NEW.net_ngn                    IS DISTINCT FROM OLD.net_ngn
    OR NEW.deductions_ngn               IS DISTINCT FROM OLD.deductions_ngn
    OR NEW.deductions_json                IS DISTINCT FROM OLD.deductions_json
    OR NEW.earnings_json                    IS DISTINCT FROM OLD.earnings_json
    OR NEW.employee_id                        IS DISTINCT FROM OLD.employee_id
    OR NEW.payroll_run_id                       IS DISTINCT FROM OLD.payroll_run_id
    OR NEW.period                                 IS DISTINCT FROM OLD.period
  ) THEN
    RAISE EXCEPTION 'Cannot modify a payslip from a paid payroll run'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lock_paid_payslip ON public.payslips;
CREATE TRIGGER trg_lock_paid_payslip
  BEFORE UPDATE OR DELETE ON public.payslips
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_lock_paid_payslip();
