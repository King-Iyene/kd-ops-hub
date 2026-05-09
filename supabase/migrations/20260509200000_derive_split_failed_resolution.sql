-- ─────────────────────────────────────────────────────────────────
-- Bug: a batch with mix of paid + cancelled (no actionable items
-- left) was staying in 'partially_processed', which the
-- PendingPayoutsCard treats as "still pending" via:
--
--   const IN_FLIGHT = ['funded', 'processing', 'partially_processed'];
--
-- So an operator who'd cancelled the only failed item in a 3-item
-- batch (2 paid, 1 cancelled) would still see the batch under
-- Pending Payouts with no remaining work to do — confusing and
-- visually wrong.
--
-- Root cause: the failed counter conflates two populations:
--   (a) failed-unresolved — operator can retry / mark paid / cancel
--   (b) failed-resolved   — already cancelled, no action remaining
--
-- Both were being treated the same: a non-zero count flipped the
-- batch into 'partially_processed', regardless of whether anything
-- was actionable.
--
-- Fix: split into v_failed_unresolved (actionable) and
-- v_failed_cancelled (audit-only). Now:
--   • v_failed_unresolved > 0 → 'partially_processed' (actionable)
--   • v_failed_cancelled = v_total → 'failed' (all cancelled audit)
--   • mix of succeeded + cancelled (no unresolved failures, no
--     in-flight) → 'processed' (closed, drops from Pending)
--
-- Also backfills any existing batch that's stuck in this state.
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
  v_total              int;
  v_succeeded          int;
  v_failed_unresolved  int;  -- actionable: operator can still retry / resolve
  v_failed_cancelled   int;  -- audit-only: already manually-cancelled
  v_pending            int;
  v_unstarted          int;
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
    -- Failed-unresolved: actionable. Operator can retry or close out.
    count(*) FILTER (
      WHERE status IN ('failed','reversed') AND is_manually_resolved = false
    ),
    -- Failed-cancelled: already resolved, audit history only.
    count(*) FILTER (
      WHERE is_manually_resolved = true
        AND manual_resolution_method IN ('cancelled','voided')
    ),
    -- Pending: items still genuinely waiting on Paystack.
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
  INTO v_succeeded, v_failed_unresolved, v_failed_cancelled, v_pending, v_unstarted
  FROM public.batch_items
  WHERE batch_id = p_batch_id;

  -- Order matters: in-flight states are checked first so a batch
  -- with mixed in-flight + done items doesn't accidentally fall
  -- into a terminal status.
  IF v_pending > 0 THEN
    RETURN 'processing';
  ELSIF v_unstarted > 0 AND v_succeeded > 0 THEN
    RETURN 'partially_processed';
  ELSIF v_unstarted > 0 AND v_succeeded = 0 THEN
    RETURN 'funded';
  -- Everything below this point: no in-flight items, no unstarted.
  -- Determine the terminal status from the resolution mix.
  ELSIF v_failed_unresolved = v_total THEN
    RETURN 'failed';
  ELSIF v_failed_unresolved > 0 THEN
    -- Some items still actionable (failed-without-resolution).
    -- Stays as 'partially_processed' so it surfaces in Pending
    -- Payouts and operator can still retry / cancel.
    RETURN 'partially_processed';
  ELSIF v_failed_cancelled = v_total THEN
    -- All cancelled. Visible in FAILED tab for audit, drops from
    -- Pending Payouts (status='failed' isn't in PENDING_ALL).
    RETURN 'failed';
  ELSE
    -- Mix of succeeded + cancelled (or all succeeded). No actionable
    -- items remaining — batch is closed. Reads as 'processed' so
    -- it drops from Pending Payouts. The cancelled items are still
    -- visible inside BatchDetail for audit.
    RETURN 'processed';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public._derive_batch_status_from_items(uuid)
  TO authenticated, service_role;

-- ── Backfill ──────────────────────────────────────────────────────
-- Any batch whose current status doesn't match the new derive
-- output gets corrected. The backfill targets every batch — not
-- just 'partially_processed' — because the previous fix
-- (20260509000000) might have flipped some batches one way and
-- this fix flips a subset back. Bypasses the state-machine guard
-- via the documented session GUC.
DO $$
DECLARE
  rec        record;
  new_status text;
BEGIN
  PERFORM set_config('kdops.allow_state_override', 'true', true);

  FOR rec IN
    SELECT id, status
    FROM   public.payment_batches
    WHERE  status NOT IN ('draft', 'rejected', 'pending_approval',
                          'pending_second_approval', 'approved', 'funded')
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
