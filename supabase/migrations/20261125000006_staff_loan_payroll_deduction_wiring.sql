-- Fix: Staff Loans lets HR mark a repayment's channel as "Payroll Deduction",
-- implying repayment happens automatically each pay period — but nothing on
-- the loan itself ever created anything Payroll reads. create_payslip /
-- generatePayslips() only pulls from employee_deductions, which
-- handleRecordRepayment() in StaffLoans.tsx never touches; it only inserts a
-- staff_loan_repayments row and hand-decrements staff_loans.outstanding_ngn
-- after HR manually does the math themselves. Confirmed zero active loans in
-- production, so nothing is being under-deducted today — this closes the gap
-- before the first real loan hits it.
--
-- Fix, in two parts:
--   1. staff_loans gains repayment_method, chosen once per loan (defaults to
--      'manual' so every existing/new loan keeps today's fully-manual
--      behavior unless HR explicitly opts in — no silent behavior change).
--   2. When a loan with repayment_method = 'payroll_deduction' is approved,
--      a trigger creates a linked employee_deductions row mirroring its
--      monthly_deduction_ngn. That row flows through the payroll pipeline
--      exactly like any other recurring deduction — no changes needed to
--      payslip generation. The settlement side (crediting the loan when
--      payroll actually pays) is wired in application code in Payroll.tsx's
--      markPaid(), the same place employee_advances already gets settled.

ALTER TABLE public.staff_loans
  ADD COLUMN IF NOT EXISTS repayment_method text NOT NULL DEFAULT 'manual'
    CHECK (repayment_method IN ('payroll_deduction', 'manual', 'bank_transfer'));

ALTER TABLE public.employee_deductions
  ADD COLUMN IF NOT EXISTS staff_loan_id uuid REFERENCES public.staff_loans(id);

CREATE INDEX IF NOT EXISTS employee_deductions_staff_loan_idx
  ON public.employee_deductions (staff_loan_id) WHERE staff_loan_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.link_staff_loan_payroll_deduction()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'approved'
     AND OLD.status IS DISTINCT FROM 'approved'
     AND NEW.repayment_method = 'payroll_deduction'
     AND NOT EXISTS (SELECT 1 FROM public.employee_deductions WHERE staff_loan_id = NEW.id) THEN
    INSERT INTO public.employee_deductions (
      entity_id, entity_type, description, amount_ngn, frequency,
      start_date, total_deductible_amount, amount_deducted_to_date,
      status, created_by, staff_loan_id
    ) VALUES (
      NEW.employee_id, 'employee',
      'Staff loan repayment (' || NEW.loan_type || ')',
      NEW.monthly_deduction_ngn, 'monthly',
      CURRENT_DATE, NEW.principal_ngn, 0,
      'active', NEW.approved_by, NEW.id
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS staff_loan_link_payroll_deduction ON public.staff_loans;
CREATE TRIGGER staff_loan_link_payroll_deduction
  AFTER UPDATE ON public.staff_loans
  FOR EACH ROW
  EXECUTE FUNCTION public.link_staff_loan_payroll_deduction();
