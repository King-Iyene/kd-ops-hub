-- ─────────────────────────────────────────────────────────────────
-- Bug: a batch with stuck-pending items (no Paystack webhook ever
-- arrived) couldn't be closed by manually resolving them. The
-- operator marks the item as paid externally or cancelled, but
-- the batch's derived status stayed 'processing' forever.
--
-- Root cause: _derive_batch_status_from_items counts pending items
-- with `status IN ('pending','retry') AND paystack_reference IS
-- NOT NULL`, ignoring the is_manually_resolved column. So a
-- resolved pending item was still treated as in-flight.
--
-- Fix: add `AND is_manually_resolved = false` to the pending
-- counter. A resolved item — whether failed-resolved, pending-
-- resolved, or whatever — falls into the "done" bucket via the
-- v_succeeded count and stops blocking the batch.
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
    -- Succeeded == real Paystack success OR manually resolved.
    -- Both close the loop financially.
    count(*) FILTER (WHERE status = 'succeeded' OR is_manually_resolved = true),
    -- Failed-and-not-yet-resolved keeps the batch on 'failed' /
    -- 'partially_processed'. A resolved-failed item drops out.
    count(*) FILTER (WHERE status IN ('failed','reversed') AND is_manually_resolved = false),
    -- Pending counts only items genuinely waiting on Paystack —
    -- exclude anything the operator has manually resolved, otherwise
    -- a stuck-pending batch never closes after the operator marks
    -- the item paid externally / cancelled.
    count(*) FILTER (WHERE status IN ('pending','retry')
                       AND paystack_reference IS NOT NULL
                       AND is_manually_resolved = false),
    count(*) FILTER (WHERE paystack_reference IS NULL
                       AND status NOT IN ('succeeded','failed','reversed')
                       AND is_manually_resolved = false)
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

NOTIFY pgrst, 'reload schema';
