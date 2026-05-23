-- ─────────────────────────────────────────────────────────────────
-- batch_items.status — allow 'reversed'.
--
-- The platform is already fully plumbed for the 'reversed' state
-- (process_paystack_webhook RPC maps transfer.reversed →
-- status='reversed' on line 363/380 of 20260815000000_*, the derive
-- function counts it, transactions_view surfaces it, spend totals
-- filter status='succeeded' so reversed correctly drops out of
-- batch_paid_amount_ngn and paid_total_in_period). The ONLY piece
-- missing was the CHECK constraint — without it, the RPC's UPDATE
-- throws and the webhook returns 500.
--
-- Verified via audit log query: 0 paystack_transfer_reversed entries
-- on this account, so no backfill is needed. The bug was latent:
-- the first reversal that ever happened would have failed silently
-- (webhook 500 → Paystack retries → eventually gives up → audit log
-- never written → batch_items.status stays 'succeeded' → spend
-- numbers overstate by the reversal amount).
--
-- Pure additive ALTER. Existing rows are not affected (none of them
-- have status='reversed' so the new constraint is a strict superset).
-- ─────────────────────────────────────────────────────────────────

ALTER TABLE public.batch_items
  DROP CONSTRAINT IF EXISTS batch_items_status_check;

ALTER TABLE public.batch_items
  ADD CONSTRAINT batch_items_status_check
  CHECK (status IN ('pending', 'succeeded', 'failed', 'retry', 'reversed'));

COMMENT ON CONSTRAINT batch_items_status_check ON public.batch_items IS
  'Allowed batch_item statuses. "reversed" is set by '
  'process_paystack_webhook when Paystack reports a transfer.reversed '
  'event (rare but real — chargeback / fraud claim / recipient bank '
  'returned the funds). Reversed items are EXCLUDED from spend totals '
  'by the SUM filters in batch_paid_amount_ngn and paid_total_in_period.';

NOTIFY pgrst, 'reload schema';
