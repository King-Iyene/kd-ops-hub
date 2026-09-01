-- Migration: Payroll Production Readiness
-- Fixes critical data issues blocking September 2026 payroll:
--   1. Sets salary components (60/20/20 split) for all salaried employees
--   2. Links pay groups to the pay schedule
--   3. Normalizes employment_type values
--   4. Fixes period format inconsistency in payslips
--   5. Deletes wrong payslips from misclassified batches
--   6. Reclassifies remaining mistagged batches (commission, contractor)

-- ═══════════════════════════════════════════════════════════════
-- 1. SALARY COMPONENTS: set basic/housing/transport using 60/20/20 split
--    This is the Nigerian statutory-friendly breakdown. Without it,
--    pension (8% of basic+housing+transport) and NHF (2.5% of basic)
--    cannot be computed correctly.
-- ═══════════════════════════════════════════════════════════════
UPDATE profiles
SET
  basic_ngn     = ROUND(salary_ngn * 0.60, 2),
  housing_ngn   = ROUND(salary_ngn * 0.20, 2),
  transport_ngn = ROUND(salary_ngn * 0.20, 2),
  use_salary_components = true
WHERE salary_ngn > 0
  AND (use_salary_components = false OR use_salary_components IS NULL)
  AND (basic_ngn IS NULL OR basic_ngn = 0);

-- ═══════════════════════════════════════════════════════════════
-- 2. LINK PAY GROUPS TO PAY SCHEDULE
--    All 3 groups need pay_schedule_id set to "Monthly — KD Squares"
-- ═══════════════════════════════════════════════════════════════
UPDATE pay_groups
SET pay_schedule_id = '8fcb7f2f-c775-4d81-a778-ed6db924b397'
WHERE pay_schedule_id IS NULL;

-- ═══════════════════════════════════════════════════════════════
-- 3. NORMALIZE employment_type
--    "full_time" → "Full-time" to match the UI-entered format
-- ═══════════════════════════════════════════════════════════════
UPDATE profiles
SET employment_type = 'Full-time'
WHERE employment_type = 'full_time';

-- ═══════════════════════════════════════════════════════════════
-- 4. FIX PAYSLIP PERIOD FORMAT
--    Standardize to "YYYY-MM" format (e.g. "2026-05") which is what
--    the payroll run pipeline uses and what YTD queries expect.
-- ═══════════════════════════════════════════════════════════════
UPDATE payslips SET period = '2026-04' WHERE period = 'April 2026';
UPDATE payslips SET period = '2026-05' WHERE period IN ('May 2026', 'May  2026');
UPDATE payslips SET period = '2026-06' WHERE period IN ('Jun 2026', 'June 2026');
UPDATE payslips SET period = '2026-07' WHERE period IN ('Jul 2026', 'July  2026');
UPDATE payslips SET period = '2026-08' WHERE period = 'Aug 2026';

-- ═══════════════════════════════════════════════════════════════
-- 5. DELETE WRONG PAYSLIPS from misclassified batches
--    These are allowances, commissions, and contractor payments
--    that created payslips because their batch was mistagged as
--    employee_salary. The prior migration (20261128000001) handles
--    reclassification; this cleans up orphaned payslips from any
--    batch that is NOT employee_salary.
-- ═══════════════════════════════════════════════════════════════
DELETE FROM payslips
WHERE batch_item_id IN (
  SELECT bi.id
  FROM batch_items bi
  JOIN payment_batches pb ON pb.id = bi.batch_id
  WHERE pb.batch_type IS DISTINCT FROM 'employee_salary'
);

-- Also delete payslips from batches whose names indicate non-salary
-- even if batch_type hasn't been corrected yet (belt and suspenders).
DELETE FROM payslips
WHERE batch_item_id IN (
  SELECT bi.id
  FROM batch_items bi
  JOIN payment_batches pb ON pb.id = bi.batch_id
  WHERE pb.name ILIKE '%relentless%'
     OR pb.name ILIKE '%commission%'
     OR pb.name ILIKE '%allowance%'
     OR pb.name ILIKE '%reimbursement%'
     OR pb.name ILIKE '%repair%'
     OR pb.name ILIKE '%refund%'
     OR pb.name ILIKE '%stipend%'
);

-- ═══════════════════════════════════════════════════════════════
-- 6. RECLASSIFY REMAINING MISTAGGED BATCHES
--    Covers commission batches ("Relentless", "Comm") missed by
--    the prior migration's patterns.
-- ═══════════════════════════════════════════════════════════════
UPDATE payment_batches
SET batch_type = 'contractor'
WHERE batch_type = 'employee_salary'
  AND (name ILIKE '%relentless%' OR name ILIKE '%commission%' OR name ILIKE '%comm%');

-- Fix "Contractor Payment — May 2026" if it's mistagged
UPDATE payment_batches
SET batch_type = 'contractor'
WHERE batch_type = 'employee_salary'
  AND name ILIKE '%contractor%';
