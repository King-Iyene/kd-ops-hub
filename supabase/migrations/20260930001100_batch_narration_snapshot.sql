-- =============================================================================
-- payment_batches.payment_narration_at_dispatch — snapshot the operator's
-- final narration at dispatch time so post-dispatch renames or edits can't
-- change what recipients see on their bank statements.
--
-- Root cause the column addresses (audit v2 Bug A + P1-4):
--
--   1. The narration operators type in the pre-flight modal ("What recipients
--      will see") was being discarded by BatchDetail.executeProcess
--      (`void customNarration; // legacy override`), and the batch-worker
--      hard-coded `reason: KDOps · ${batch.name}`. Recipients saw the batch
--      NAME, not the operator's intent.
--
--   2. The rename-at-any-status feature (added earlier today) meant an
--      already-approved batch could be silently renamed after approval AND
--      before dispatch, changing the narration Paystack sends without
--      re-triggering approval.
--
-- This column is populated by batch-worker on the FIRST dispatch tick of a
-- batch (only if still NULL — subsequent ticks reuse the same value) with
-- whichever narration source the operator actually selected. Then every
-- /transfer call for that batch reads from the snapshot, so renaming the
-- batch NAME or editing payment_description later has no effect on the
-- transfers already in flight or still to dispatch in this batch.
--
-- Nullable + no default: null means "not yet dispatched"; the batch's
-- existing name/description are still displayed everywhere except the
-- Paystack `reason` field.
-- =============================================================================

ALTER TABLE public.payment_batches
  ADD COLUMN IF NOT EXISTS payment_narration_at_dispatch text
  CHECK (payment_narration_at_dispatch IS NULL OR char_length(payment_narration_at_dispatch) <= 100);

COMMENT ON COLUMN public.payment_batches.payment_narration_at_dispatch IS
  'Snapshot of the narration Paystack was told to send at dispatch time. '
  'Written once by batch-worker on the first tick; immutable afterwards. '
  'Post-dispatch renames of the batch NAME do not affect this value.';
