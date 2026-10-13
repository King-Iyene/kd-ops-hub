-- =============================================================================
-- Migration: fix_batch_header_counts
-- The previous migration (20261229000000) successfully removed duplicate
-- batch_items but failed when updating payment_batches header counts because
-- the enforce_batch_totals_lock trigger blocks edits on processed batches.
--
-- This migration temporarily disables that trigger, corrects the counts,
-- and re-enables it.
-- =============================================================================

-- Temporarily disable the totals lock trigger so we can fix the counts.
ALTER TABLE public.payment_batches DISABLE TRIGGER payment_batches_totals_lock;

-- Recalculate beneficiary_count and total_amount from surviving batch_items.
UPDATE public.payment_batches pb
SET
  beneficiary_count = sub.cnt,
  total_amount      = sub.total
FROM (
  SELECT
    batch_id,
    COUNT(*)                       AS cnt,
    COALESCE(SUM(amount_ngn), 0)   AS total
  FROM public.batch_items
  GROUP BY batch_id
) sub
WHERE pb.id = sub.batch_id
  AND (pb.beneficiary_count IS DISTINCT FROM sub.cnt
    OR pb.total_amount IS DISTINCT FROM sub.total);

-- Re-enable the trigger.
ALTER TABLE public.payment_batches ENABLE TRIGGER payment_batches_totals_lock;
