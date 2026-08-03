-- =============================================================================
-- Migration: 20261003000000_derive_batch_status_manual_resolution_regression.sql
-- =============================================================================
-- ROOT CAUSE: migration 20261002002100 (fixing the "total failure showed as
-- Partial" bug) replaced _derive_batch_status_from_items but dropped the
-- is_manually_resolved awareness that the ORIGINAL definition (migration
-- 20260508200000_batch_item_manual_resolution.sql) had. mark_batch_item_resolved
-- deliberately never changes an item's `status` column (keeps it 'pending' /
-- 'failed' for audit) — it only sets is_manually_resolved = true and expects
-- the derive function to treat that as done. Without that awareness:
--   • A cancelled STUCK item (status still 'pending', has a reference) kept
--     getting counted in v_pending → batch forced back to 'processing' —
--     "cancelled but it didn't go."
--   • A resolved FAILED item (status still 'failed') stopped being excluded
--     from v_failed, undermining the original manual-resolution feature.
--
-- Fix: restore is_manually_resolved exclusion in v_failed/v_pending and
-- inclusion in v_succeeded, while keeping the total-failure fix from
-- 20261002002100 intact.
-- =============================================================================

CREATE OR REPLACE FUNCTION public._derive_batch_status_from_items(p_batch_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total     int;
  v_succeeded int;
  v_failed    int;
  v_pending   int;
  v_unstarted int;
BEGIN
  SELECT count(*) INTO v_total FROM public.batch_items WHERE batch_id = p_batch_id;
  IF v_total = 0 THEN RETURN NULL; END IF;

  SELECT
    -- Succeeded == real success OR manually resolved (cancelled / marked paid
    -- off-platform). Both close the loop financially for this batch.
    count(*) FILTER (WHERE status = 'succeeded' OR is_manually_resolved = true),
    -- Only an UNRESOLVED failure keeps the batch from closing.
    count(*) FILTER (WHERE status IN ('failed','reversed') AND is_manually_resolved = false),
    -- Only an UNRESOLVED pending/retry item counts as still in flight — a
    -- manually-cancelled item stays 'pending' in its status column by design
    -- (audit trail) but must not block the batch from reaching a terminal
    -- state anymore.
    count(*) FILTER (
      WHERE status IN ('pending','retry')
        AND (paystack_reference IS NOT NULL OR flutterwave_reference IS NOT NULL)
        AND is_manually_resolved = false
    ),
    count(*) FILTER (
      WHERE paystack_reference IS NULL
        AND flutterwave_reference IS NULL
        AND status NOT IN ('succeeded','failed','reversed')
        AND is_manually_resolved = false
    )
  INTO v_succeeded, v_failed, v_pending, v_unstarted
  FROM public.batch_items
  WHERE batch_id = p_batch_id;

  IF v_pending > 0 THEN
    RETURN 'processing';
  ELSIF v_unstarted > 0 AND v_succeeded > 0 THEN
    RETURN 'partially_processed';
  ELSIF v_unstarted > 0 AND v_succeeded = 0 THEN
    RETURN 'funded';
  ELSIF v_failed > 0 AND v_succeeded > 0 THEN
    RETURN 'partially_processed';
  ELSIF v_failed > 0 AND v_succeeded = 0 THEN
    RETURN 'failed';
  ELSE
    RETURN 'processed';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public._derive_batch_status_from_items(uuid) TO authenticated, service_role;

-- ── Backfill ────────────────────────────────────────────────────────────
-- Recompute every non-terminal batch that has at least one manually-resolved
-- item right now, so the batches you already tried to cancel settle
-- immediately instead of waiting for the next write to touch them.
DO $$
DECLARE
  rec        record;
  new_status text;
BEGIN
  PERFORM set_config('kdops.allow_state_override', 'true', true);

  FOR rec IN
    SELECT DISTINCT pb.id, pb.status
    FROM   public.payment_batches pb
    JOIN   public.batch_items bi ON bi.batch_id = pb.id
    WHERE  pb.deleted_at IS NULL
      AND  pb.status IN ('processing', 'partially_processed', 'funded')
      AND  bi.is_manually_resolved = true
  LOOP
    new_status := public._derive_batch_status_from_items(rec.id);
    IF new_status IS NOT NULL AND new_status IS DISTINCT FROM rec.status THEN
      UPDATE public.payment_batches
      SET    status = new_status,
             processing_finalized_at = now()
      WHERE  id = rec.id;
    END IF;
  END LOOP;

  PERFORM set_config('kdops.allow_state_override', 'false', true);
END $$;

NOTIFY pgrst, 'reload schema';
