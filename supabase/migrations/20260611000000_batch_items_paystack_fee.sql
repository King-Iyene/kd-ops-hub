-- Capture Paystack transfer fees on a per-line-item basis so they can be
-- attributed properly in financial reports.
--
-- Paystack returns `fee` (in kobo) on every transfer.success webhook.
-- We previously stored it inside `paystack_raw` JSON only, which made it
-- invisible to SQL aggregation and dashboards.
--
-- Idempotent. Backfill at the end picks up historical transfers that had
-- a fee in paystack_raw but never made it into the structured column.

ALTER TABLE public.batch_items
  ADD COLUMN IF NOT EXISTS paystack_fee_ngn numeric DEFAULT 0 NOT NULL;

CREATE INDEX IF NOT EXISTS batch_items_paystack_fee_idx
  ON public.batch_items (paystack_fee_ngn)
  WHERE paystack_fee_ngn > 0;

COMMENT ON COLUMN public.batch_items.paystack_fee_ngn IS
  'Paystack transfer fee charged for this specific item, in NGN. Populated by paystack-webhook from data.fee (kobo, /100). Reports treat this as a separate cost line so it does not double-count against the disbursed amount.';

-- Backfill from existing paystack_raw payloads for transfers that already
-- completed before this column existed. Only updates rows where fee_ngn is
-- still 0 so re-running this is safe.
UPDATE public.batch_items
SET paystack_fee_ngn = ROUND((paystack_raw->>'fee')::numeric / 100, 2)
WHERE paystack_fee_ngn = 0
  AND paystack_raw IS NOT NULL
  AND (paystack_raw ? 'fee')
  AND (paystack_raw->>'fee') ~ '^[0-9]+$';
