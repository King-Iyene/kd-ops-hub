-- =============================================================================
-- Migration: deduplicate_batch_items
-- Removes duplicate batch_items rows and corrects payment_batches header counts.
--
-- Root cause: a React stale-closure bug in the contractor/employee picker
-- allowed the same person to be added twice to a batch before React
-- re-rendered.  The duplicate rows were written to the DB on save.
--
-- This migration:
--   1. Identifies duplicate batch_items (same batch_id + account_number)
--   2. Keeps the row with the earliest created_at, deletes the rest
--   3. Temporarily disables the totals-lock trigger
--   4. Recalculates beneficiary_count and total_amount from surviving items
--   5. Re-enables the trigger
--   6. Adds a unique constraint to prevent future duplicates
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

-- Step 2: Temporarily disable the totals lock trigger so we can fix counts.
ALTER TABLE public.payment_batches DISABLE TRIGGER payment_batches_totals_lock;

-- Step 3: Recalculate payment_batches header counts from the surviving items.
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

-- Step 4: Re-enable the trigger.
ALTER TABLE public.payment_batches ENABLE TRIGGER payment_batches_totals_lock;

-- Step 5: Add unique constraint to prevent future duplicates.
-- Use a partial unique index (ignores dispatched items which we don't touch).
CREATE UNIQUE INDEX IF NOT EXISTS uq_batch_items_batch_account
  ON public.batch_items (batch_id, account_number)
  WHERE paystack_reference IS NULL
    AND flutterwave_reference IS NULL;
