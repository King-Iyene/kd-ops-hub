-- ─────────────────────────────────────────────────────────────────
-- Bug: cancelling all items in a failed batch flipped the batch's
-- derived status to 'processed', which removed it from both the
-- Pending Payouts card AND the FAILED tab on /payments. Operator
-- could no longer find the batch — it was effectively erased from
-- the visible list.
--
-- The previous derive function counted ANY manually-resolved item
-- as "succeeded":
--   v_succeeded := WHERE status = 'succeeded' OR is_manually_resolved = true
-- That treats a cancellation (no money moved) as equivalent to an
-- actual transfer success. It's wrong for two reasons:
--   1. Spend totals would be off if we ever changed the spend SQL
--      to count v_succeeded items
--   2. Batch derivation flips an all-cancelled batch to 'processed',
--      hiding it from the FAILED tab where the operator expects to
--      see audit history.
--
-- Fix: distinguish bookkeeping intent of the manual resolution.
--   • method NOT IN ('cancelled','voided')  → paid externally,
--     counts as succeeded (money moved off-rail; recipient was paid)
--   • method IN ('cancelled','voided')      → cancelled / voided,
--     counts as failed (no money moved; row is closed without payment)
--
-- After this fix:
--   • All-cancelled batch     → 'failed'              (audit visible)
--   • All-paid-externally     → 'processed'           (closed clean)
--   • Mix paid + cancelled    → 'partially_processed' (audit visible,
--                                                      still surfaces in
--                                                      Pending Payouts —
--                                                      acceptable, op can
--                                                      see what they did)
--   • Cancelled does NOT count toward spend (already filtered by
--     batch_paid_amount_ngn / paid_total_in_period via
--     is_manually_resolved=false on those queries — unchanged here).
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public._derive_batch_status_from_items(
  p_batch_id uuid
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_total int;
  v_succeeded int;
  v_failed int;
  v_pending int;
  v_unstarted int;
BEGIN
  SELECT count(*) INTO v_total FROM public.batch_items WHERE batch_id = p_batch_id;
  IF v_total = 0 THEN RETURN NULL; END IF;

  SELECT
    -- Succeeded == real Paystack success OR manually-resolved-as-paid.
    -- Cancelled / voided do NOT count as succeeded — no money moved.
    count(*) FILTER (
      WHERE status = 'succeeded'
         OR (is_manually_resolved = true
             AND COALESCE(manual_resolution_method, '') NOT IN ('cancelled','voided'))
    ),
    -- Failed counter pulls in two populations:
    --   (a) genuine failed/reversed Paystack outcomes that haven't
    --       been resolved (operator can still retry or close out)
    --   (b) cancelled / voided manual resolutions (no money moved,
    --       but the row should not flip the batch into 'processed')
    -- Both populations belong on the FAILED tab for audit, and both
    -- correctly drop out of the Pending Payouts card once they stop
    -- counting toward v_pending below.
    count(*) FILTER (
      WHERE (status IN ('failed','reversed') AND is_manually_resolved = false)
         OR (is_manually_resolved = true
             AND manual_resolution_method IN ('cancelled','voided'))
    ),
    -- Pending counter: only items still genuinely waiting on Paystack.
    -- Manually-resolved items (cancelled OR paid externally) drop out
    -- so the parent batch can advance.
    count(*) FILTER (
      WHERE status IN ('pending','retry')
        AND paystack_reference IS NOT NULL
        AND is_manually_resolved = false
    ),
    -- Unstarted: not yet dispatched and not manually-resolved.
    count(*) FILTER (
      WHERE paystack_reference IS NULL
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
  ELSIF v_failed = v_total THEN
    RETURN 'failed';
  ELSIF v_failed > 0 THEN
    RETURN 'partially_processed';
  ELSE
    RETURN 'processed';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public._derive_batch_status_from_items(uuid)
  TO authenticated, service_role;

-- ── Backfill ──────────────────────────────────────────────────────
-- Any batch that has already been affected by the bug (status =
-- 'processed' even though all items are cancelled) gets its status
-- recomputed using the new derive logic. Bypasses the state-machine
-- guard via the documented session GUC because we're correcting a
-- derived state, not a user-facing transition.
DO $$
DECLARE
  rec        record;
  new_status text;
BEGIN
  PERFORM set_config('kdops.allow_state_override', 'true', true);

  FOR rec IN
    SELECT id, status
    FROM   public.payment_batches
    WHERE  status IN ('processed', 'partially_processed')
      AND  deleted_at IS NULL
  LOOP
    new_status := public._derive_batch_status_from_items(rec.id);
    IF new_status IS NOT NULL AND new_status IS DISTINCT FROM rec.status THEN
      UPDATE public.payment_batches
      SET    status = new_status
      WHERE  id = rec.id;
    END IF;
  END LOOP;

  PERFORM set_config('kdops.allow_state_override', 'false', true);
END $$;

NOTIFY pgrst, 'reload schema';
