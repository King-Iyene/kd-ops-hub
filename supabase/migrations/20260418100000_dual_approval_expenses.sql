-- Dual approval columns for high-value expenses.
-- The threshold is stored in company_settings.dual_approval_threshold_ngn.
-- When an expense amount_ngn >= threshold, two distinct approvers are required.

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS approved_by            uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS approved_at            timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by_secondary  uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS approved_by_secondary_at timestamptz;

-- Widen the status check constraint to allow the intermediate state.
-- Drop the old constraint first (name may vary; use DO block to be safe).
DO $$
BEGIN
  ALTER TABLE public.expenses
    DROP CONSTRAINT IF EXISTS expenses_status_check;

  ALTER TABLE public.expenses
    ADD CONSTRAINT expenses_status_check
    CHECK (status IN ('pending', 'pending_second_approval', 'approved', 'rejected'));
EXCEPTION
  WHEN others THEN
    -- Constraint may not exist; that's fine.
    NULL;
END $$;

-- Ensure dual_approval_threshold_ngn exists in company_settings.
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS dual_approval_threshold_ngn numeric DEFAULT 0;
