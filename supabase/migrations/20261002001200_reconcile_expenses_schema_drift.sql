-- Schema drift reconciliation: these 7 columns exist on the live
-- `expenses` table (confirmed via the generated Supabase types, which
-- mirror production) and are actively read/written by Expenses.tsx and
-- Fleet.tsx, and referenced by the receipt-accountability trigger in
-- 20261002001100_expenses_submitter_receipt_update.sql — but no migration
-- ever created them, meaning they were added directly against the
-- database at some point outside the migration history.
--
-- Purely additive and a no-op on the current database (columns already
-- exist there). This exists so a fresh environment built from migrations
-- alone — a new dev project, a disaster-recovery restore — ends up with
-- the same schema production actually has today.
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS account_name      text,
  ADD COLUMN IF NOT EXISTS account_number    text,
  ADD COLUMN IF NOT EXISTS bank_name         text,
  ADD COLUMN IF NOT EXISTS payment_status    text,
  ADD COLUMN IF NOT EXISTS payment_reference text,
  ADD COLUMN IF NOT EXISTS processed_at      timestamptz,
  ADD COLUMN IF NOT EXISTS processed_by      uuid REFERENCES public.profiles(id);
