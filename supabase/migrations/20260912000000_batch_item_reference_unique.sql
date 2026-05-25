-- =============================================================================
-- Idempotency-key uniqueness for payment references (C1 — Part A, backstop).
--
-- Each batch_item carries a deterministic Paystack reference (kdops_<item-id>)
-- that acts as its idempotency key. Until now nothing at the database level
-- stopped two rows from ever carrying the same reference — the only guard was
-- application logic plus Paystack rejecting a duplicate. This adds the missing
-- structural guarantee: a non-null reference may attach to AT MOST one row.
--
-- This is purely additive and cannot strand or alter any in-flight payment:
-- rows that have not been dispatched have reference = NULL and are unaffected
-- (the index is partial on NOT NULL). It catches only the catastrophic bug
-- where the same reference would be written to two different items.
--
-- NOTE (operational): CREATE UNIQUE INDEX briefly takes a lock that blocks
-- writes to batch_items for the duration of the build. Apply during a
-- low-traffic window (not mid-payroll-run) on large datasets.
-- =============================================================================

-- Safety: refuse to proceed if dirty data already violates uniqueness, with a
-- clear message, rather than failing with an opaque index-build error.
DO $$
DECLARE
  v_dupes int;
BEGIN
  SELECT count(*) INTO v_dupes FROM (
    SELECT paystack_reference
    FROM public.batch_items
    WHERE paystack_reference IS NOT NULL
    GROUP BY paystack_reference
    HAVING count(*) > 1
  ) d;

  IF v_dupes > 0 THEN
    RAISE EXCEPTION
      'Cannot create unique reference index: % duplicate paystack_reference value(s) already exist in batch_items. Investigate and resolve these (they indicate a possible double-processed transfer) before applying this migration.',
      v_dupes;
  END IF;
END;
$$;

-- The idempotency-key uniqueness guarantee.
CREATE UNIQUE INDEX IF NOT EXISTS batch_items_paystack_reference_uniq
  ON public.batch_items (paystack_reference)
  WHERE paystack_reference IS NOT NULL;

COMMENT ON INDEX public.batch_items_paystack_reference_uniq IS
  'Idempotency guard: a Paystack reference (kdops_<item-id>) may attach to at '
  'most one batch_item, preventing reference collisions that could double-'
  'process a transfer.';

-- The new unique partial index fully supersedes this older non-unique partial
-- index on the same predicate; drop the redundant one. (The all-rows
-- batch_items_reference_idx is kept — it supports the worker''s
-- "WHERE paystack_reference IS NULL" pull-queue scan, which a NOT NULL partial
-- index cannot serve.)
DROP INDEX IF EXISTS public.batch_items_paystack_reference_idx;
