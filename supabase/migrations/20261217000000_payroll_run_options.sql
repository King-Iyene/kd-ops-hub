-- Per-run override toggles for statutory deductions and salary advance repayments.
-- Stored as JSONB so new flags can be added without another migration.
-- Default NULL = all deductions enabled (legacy behavior).
--
-- Shape: {
--   include_paye: boolean,       -- PAYE income tax
--   include_pension: boolean,    -- Employee 8% + Employer 10%
--   include_nhf: boolean,        -- National Housing Fund 2.5%
--   include_nhis: boolean,       -- NHIS 5% employee + 10% employer
--   include_dev_levy: boolean,   -- Development levy
--   include_advances: boolean,   -- Salary advance repayments
--   include_deductions: boolean, -- Recurring employee deductions
--   include_ewa: boolean         -- Earned-wage-access settlements
-- }

ALTER TABLE payroll_runs
  ADD COLUMN IF NOT EXISTS run_options jsonb DEFAULT NULL;

COMMENT ON COLUMN payroll_runs.run_options IS
  'Per-run toggles for statutory deductions and advance repayments. NULL = all enabled.';
