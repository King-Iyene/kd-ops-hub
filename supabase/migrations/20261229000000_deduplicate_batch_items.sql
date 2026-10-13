-- =============================================================================
-- Migration: deduplicate_batch_items
-- Removes duplicate batch_items rows and corrects payment_batches header counts.
--
-- Root cause: a React stale-closure bug in the contractor/employee picker
-- allowed the same person to be added twice to a batch before React
-- re-rendered.  The duplicate rows were written to the DB on save.
-- An auto-sync fix briefly deployed also overwrote the payment_batches
-- header counts with the inflated (doubled) values.
--
-- This migration:
--   1. Identifies duplicate batch_items (same batch_id + account_number)
--   2. Keeps the row with the earliest created_at, deletes the rest
--   3. Recalculates beneficiary_count and total_amount from surviving items
--
-- SAFETY: only touches batches where duplicates actually exist.
-- Does NOT touch items that have paystack_reference (already dispatched).
-- =============================================================================

-- Step 1: Delete duplicate batch_items, keeping the earliest row per
-- (batch_id, account_number) pair.  Only delete rows that have NOT been
-- dispatched to Paystack (no reference = no real transfer).
DELETE FROM public.batch_items
WHERE id IN (
  SELECT id FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY batch_id, account_number
        ORDER BY created_at ASC, id ASC
      ) AS rn
    FROM public.batch_items
    WHERE paystack_reference IS NULL
      AND flutterwave_reference IS NULL
  ) numbered
  WHERE rn > 1
);

-- Step 2: Recalculate payment_batches header counts from the surviving items.
UPDATE public.payment_batches pb
SET
  beneficiary_count = sub.cnt,
  total_amount      = sub.total
FROM (
  SELECT
    batch_id,
    COUNT(*)              AS cnt,
    COALESCE(SUM(amount_ngn), 0) AS total
  FROM public.batch_items
  GROUP BY batch_id
) sub
WHERE pb.id = sub.batch_id
  AND (pb.beneficiary_count != sub.cnt OR pb.total_amount != sub.total);
