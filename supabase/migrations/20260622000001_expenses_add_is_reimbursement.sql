-- Add is_reimbursement flag to expenses.
-- true  = employee paid from their own pocket and is claiming reimbursement.
-- false = direct company charge / advance (company pays directly).
-- Default true because the vast majority of historical expense claims are
-- reimbursements.

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS is_reimbursement BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.expenses.is_reimbursement IS
  'True when employee paid out of pocket and is claiming back the amount. False for direct company charges or advances.';
