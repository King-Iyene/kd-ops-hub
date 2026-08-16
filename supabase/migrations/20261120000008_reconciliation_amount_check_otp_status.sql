-- Fix reconciliation: add amount verification guard and distinct OTP-blocked status.
--
-- 1. Adds 'otp_blocked' to the batch_items status check constraint so the
--    reconciliation function can write it when Paystack reports status = "otp".
--    Previously these items stayed as "pending" and were invisible to finance.
-- 2. The reconciliation edge function now verifies the transferred amount
--    matches the expected amount_ngn before marking an item as "succeeded".

ALTER TABLE public.batch_items
  DROP CONSTRAINT IF EXISTS batch_items_status_check;

ALTER TABLE public.batch_items
  ADD CONSTRAINT batch_items_status_check
  CHECK (status IN ('pending', 'succeeded', 'failed', 'retry', 'reversed', 'otp_blocked'));

COMMENT ON CONSTRAINT batch_items_status_check ON public.batch_items IS
  'Allowed batch_item statuses. "otp_blocked" means Paystack is waiting '
  'for OTP authorisation on the merchant dashboard — distinct from "pending" '
  'so finance can filter and act on these items.';
