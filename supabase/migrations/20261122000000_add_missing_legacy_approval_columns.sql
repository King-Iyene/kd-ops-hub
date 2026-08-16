-- The trigger function enforce_expense_approval_state_writes() references
-- NEW.approved_by_secondary and NEW.approved_by_secondary_at (legacy column
-- names mirrored alongside the canonical second_approver_id / second_approved_at).
-- These columns were never created on the live table, so any UPDATE to
-- expenses (e.g. attaching a repair receipt) crashed with:
--   record "new" has no field "approved_by_secondary"
--
-- Fix: add the missing legacy columns so the trigger can read them.

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS approved_by_secondary uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS approved_by_secondary_at timestamptz;
