-- Add a user-editable custom name to payroll runs.
-- Falls back to the period label (e.g. "October 2026") when NULL.
ALTER TABLE payroll_runs
  ADD COLUMN IF NOT EXISTS custom_name text;
