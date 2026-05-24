-- =============================================================================
-- Finance Phase 1b — snapshot the FX rate + USD origin onto generated batches.
--
-- When the Partner Pay calculator generates a payment batch, the NGN amounts are
-- computed from USD at the live rate. For audit + reproducibility we snapshot
-- the exact rate used onto the batch, and the USD source amount onto each line,
-- so a payout can always be explained ("$500 at ₦1,650 = ₦825,000") long after
-- the live rate has moved. Additive only.
-- =============================================================================

ALTER TABLE public.payment_batches
  ADD COLUMN IF NOT EXISTS fx_rate_used numeric,
  ADD COLUMN IF NOT EXISTS fx_base text,
  ADD COLUMN IF NOT EXISTS fx_quote text;

COMMENT ON COLUMN public.payment_batches.fx_rate_used IS
  'FX rate locked when this batch was generated (quote per 1 base). NULL for '
  'batches not generated from a USD-priced source.';

ALTER TABLE public.batch_items
  ADD COLUMN IF NOT EXISTS source_usd_minor bigint;

COMMENT ON COLUMN public.batch_items.source_usd_minor IS
  'The USD amount (minor units / cents) this line was priced from, before '
  'conversion to NGN at the batch fx_rate_used. NULL for NGN-native lines.';
