-- =============================================================================
-- Migration: 20261002000000_derive_batch_status_total_failure.sql
-- =============================================================================
-- ROOT CAUSE: _derive_batch_status_from_items returned 'partially_processed'
-- whenever ANY item failed — even when ZERO items succeeded. For a
-- single-item batch (e.g. a Quick Pay) whose one item failed, the batch
-- showed "Partial" when it should show "Failed": nothing succeeded, so this
-- is a TOTAL failure, not a partial one. Same bug for a multi-item batch
-- where every single item failed.
--
-- "Partial" should only ever mean "some succeeded, some did not" — a mixed
-- outcome. This restores that meaning:
--
--   any pending                    → processing
--   some succeeded + some unstarted → partially_processed
--   none succeeded + some unstarted → funded (nothing dispatched yet)
--   some succeeded + some failed    → partially_processed  (mixed outcome)
--   none succeeded + some failed    → failed                (total failure — NEW)
--   otherwise (all succeeded)       → processed
--
-- 'failed' is already a valid target from 'processing' per the batch state
-- machine (enforce_payment_batch_state_machine, migration 20260815000000),
-- and finalize_batch's forward-only guard (migration 20261001000600) already
-- allows 'failed' as an outcome — no other change needed downstream.
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
    count(*) FILTER (WHERE status = 'succeeded'),
    count(*) FILTER (WHERE status IN ('failed','reversed')),
    count(*) FILTER (
      WHERE status IN ('pending','retry')
        AND (paystack_reference IS NOT NULL OR flutterwave_reference IS NOT NULL)
    ),
    count(*) FILTER (
      WHERE paystack_reference IS NULL
        AND flutterwave_reference IS NULL
        AND status NOT IN ('succeeded','failed','reversed')
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
    -- Total failure: nothing succeeded. Previously fell into the
    -- v_failed > 0 branch unconditionally and was mislabeled "partial"
    -- even for a single-item batch whose only item failed.
    RETURN 'failed';
  ELSE
    RETURN 'processed';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public._derive_batch_status_from_items(uuid) TO authenticated, service_role;

-- ── Backfill ────────────────────────────────────────────────────────────
-- Any batch currently mislabeled 'partially_processed' where NOTHING
-- actually succeeded gets recomputed with the fixed logic immediately —
-- so a Quick Pay whose single item failed shows "Failed" right away
-- instead of waiting for the next dispatch tick to touch it. Bypasses the
-- state-machine guard via the documented GUC because this corrects a
-- derived label, not a user-facing transition.
DO $$
DECLARE
  rec        record;
  new_status text;
BEGIN
  PERFORM set_config('kdops.allow_state_override', 'true', true);

  FOR rec IN
    SELECT id, status
    FROM   public.payment_batches
    WHERE  status = 'partially_processed'
      AND  deleted_at IS NULL
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
