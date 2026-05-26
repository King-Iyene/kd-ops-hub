-- =============================================================================
-- Per-employee payslip adjustments (bonuses, overtime, allowances, one-off
-- deductions) attached to a specific payroll run.
--
-- Until now bonuses/allowances existed only at the company-run level
-- (payroll_runs.bonuses_json) for the burn total and never reached an
-- individual's payslip. This table lets an admin/finance user attach one-off
-- earnings or deductions to a single employee for a single run; generatePayslips
-- folds them into that employee's earnings, PAYE base, net pay and payslip lines.
--
-- kind:
--   bonus / overtime / allowance  → an EARNING (adds to pay)
--   deduction                     → a one-off DEDUCTION (reduces pay)
-- taxable: for earnings, whether the amount is added to the PAYE base. Ignored
--          for deductions (always applied after tax).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.payslip_adjustments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_run_id  uuid NOT NULL REFERENCES public.payroll_runs(id) ON DELETE CASCADE,
  employee_id     uuid NOT NULL REFERENCES public.profiles(id),
  kind            text NOT NULL CHECK (kind IN ('bonus', 'overtime', 'allowance', 'deduction')),
  description     text NOT NULL,
  amount_ngn      numeric NOT NULL CHECK (amount_ngn >= 0),
  taxable         boolean NOT NULL DEFAULT true,
  created_by      uuid REFERENCES public.profiles(id),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payslip_adjustments_run_emp_idx
  ON public.payslip_adjustments (payroll_run_id, employee_id);

ALTER TABLE public.payslip_adjustments ENABLE ROW LEVEL SECURITY;

-- Only payroll managers (super_admin/admin/finance) read or mutate adjustments.
DROP POLICY IF EXISTS "payslip_adjustments_select" ON public.payslip_adjustments;
CREATE POLICY "payslip_adjustments_select" ON public.payslip_adjustments
  FOR SELECT TO authenticated
  USING (public.current_user_role() IN ('super_admin', 'admin', 'finance'));

DROP POLICY IF EXISTS "payslip_adjustments_insert" ON public.payslip_adjustments;
CREATE POLICY "payslip_adjustments_insert" ON public.payslip_adjustments
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role() IN ('super_admin', 'admin', 'finance'));

DROP POLICY IF EXISTS "payslip_adjustments_update" ON public.payslip_adjustments;
CREATE POLICY "payslip_adjustments_update" ON public.payslip_adjustments
  FOR UPDATE TO authenticated
  USING (public.current_user_role() IN ('super_admin', 'admin', 'finance'));

DROP POLICY IF EXISTS "payslip_adjustments_delete" ON public.payslip_adjustments;
CREATE POLICY "payslip_adjustments_delete" ON public.payslip_adjustments
  FOR DELETE TO authenticated
  USING (public.current_user_role() IN ('super_admin', 'admin', 'finance'));
