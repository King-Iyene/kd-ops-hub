-- Cancellation path for batch items.
--
-- Use case: a batch transfer fails (wrong account number, dormant
-- account, recipient unreachable). Operator decides NOT to chase it
-- — money won't move at all. Today the only "close-out" option is
-- "Mark as paid", which is wrong if no payment actually happened.
--
-- This migration adds 'cancelled' / 'voided' as legal values for
-- batch_items.manual_resolution_method. Combined with the existing
-- is_manually_resolved flag, that closes the item: it drops out of
-- pending counts and the parent batch lifts to a terminal state,
-- but its `status` column stays on 'failed' so the original
-- Paystack outcome is preserved for audit. The UI distinguishes
-- "Paid externally" (real money moved off-rail) from "Cancelled"
-- (no payment, item written off) using the method value.
--
-- The _derive_batch_status_from_items function defined in
-- 20260508200000 already counts is_manually_resolved=true items as
-- "succeeded" for the purposes of derivation, so no functional
-- change to that logic is needed.

ALTER TABLE public.batch_items
  DROP CONSTRAINT IF EXISTS batch_items_manual_resolution_method_check;

ALTER TABLE public.batch_items
  ADD CONSTRAINT batch_items_manual_resolution_method_check
  CHECK (manual_resolution_method IS NULL OR manual_resolution_method IN (
    'bank_transfer', 'cash', 'cheque', 'other',
    'cancelled', 'voided'
  ));

NOTIFY pgrst, 'reload schema';
