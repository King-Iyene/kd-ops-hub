-- P1-1 fix (payroll audit, docs/audits/PAYROLL_MODULE_AUDIT.md): there was
-- no way to exclude a single employee from one specific payroll run without
-- removing them from the pay group / zeroing their salary / marking them
-- inactive — all of which affect them in every OTHER run too, not just this
-- one. payslip_adjustments is already scoped to (payroll_run_id,
-- employee_id), the exact shape needed, so this adds a fifth `kind` rather
-- than a new table: 'exclude' marks that employee as not paid in this one
-- run. amount_ngn is meaningless for an exclusion — the app always inserts
-- 0, which the existing `amount_ngn >= 0` check already allows.

ALTER TABLE public.payslip_adjustments DROP CONSTRAINT IF EXISTS payslip_adjustments_kind_check;
ALTER TABLE public.payslip_adjustments
  ADD CONSTRAINT payslip_adjustments_kind_check
  CHECK (kind IN ('bonus', 'overtime', 'allowance', 'deduction', 'exclude'));
