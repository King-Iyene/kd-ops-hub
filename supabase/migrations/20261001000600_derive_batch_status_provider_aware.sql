-- =============================================================================
-- Migration: 20261001000600_derive_batch_status_provider_aware.sql
-- =============================================================================
-- ROOT CAUSE: _derive_batch_status_from_items only inspected paystack_reference.
-- Every Flutterwave batch had paystack_reference=NULL on all items (they use
-- flutterwave_reference instead). The derive function therefore counted every
-- Flutterwave item as v_unstarted, which combined with v_succeeded=0 returned
-- 'funded'. finalize_batch then attempted 'processing -> funded' — invalid per
-- the state machine — and the batch got stuck forever.
--
-- FIX: treat an item as "dispatched" if EITHER provider's reference is set.
-- Same behaviour for Paystack items (their flutterwave_reference is NULL, so
-- OR-ing has no effect). Provider-agnostic; symmetric.
--
-- Also adds a defensive guard inside finalize_batch: never regress a
-- 'processing' or 'partially_processed' batch backward to funded / approved /
-- pending_approval / draft. If the derive function ever returns such a value,
-- finalize returns the current row unchanged instead of blowing up on the
-- state-machine trigger.
--
-- Idempotent (CREATE OR REPLACE). Safe to re-run.
-- =============================================================================


-- ── 1. _derive_batch_status_from_items — provider-aware ─────────────────────
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
    -- "Dispatched, waiting for terminal" — has a reference for EITHER provider.
    count(*) FILTER (
      WHERE status IN ('pending','retry')
        AND (paystack_reference IS NOT NULL OR flutterwave_reference IS NOT NULL)
    ),
    -- "Never dispatched" — no reference for either provider.
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
  ELSIF v_failed > 0 THEN
    RETURN 'partially_processed';
  ELSE
    RETURN 'processed';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public._derive_batch_status_from_items(uuid) TO authenticated, service_role;


-- ── 2. finalize_batch — never regress backward ──────────────────────────────
-- Existing body kept identical except for the new guard that returns the
-- current row unchanged if v_derived is a state MORE UPSTREAM than the
-- batch's current status. Prevents "Invalid payment_batches state
-- transition: processing -> funded" errors even if some other caller passes
-- a bad derived value.
CREATE OR REPLACE FUNCTION public.finalize_batch(p_batch_id uuid)
RETURNS public.payment_batches
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch       public.payment_batches;
  v_caller      uuid := auth.uid();
  v_caller_role text;
  v_derived     text;
BEGIN
  -- service_role / cron path doesn't carry auth.uid(); allow it through.
  IF v_caller IS NOT NULL THEN
    SELECT role INTO v_caller_role FROM public.profiles
     WHERE id = v_caller AND COALESCE(status, 'active') = 'active';
    IF v_caller_role IS NULL OR v_caller_role NOT IN ('super_admin','admin','finance') THEN
      RAISE EXCEPTION 'Only super_admin/admin/finance can finalize a batch'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  SELECT * INTO v_batch FROM public.payment_batches
   WHERE id = p_batch_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Batch % not found', p_batch_id; END IF;

  IF v_batch.status NOT IN ('processing','partially_processed') THEN
    RETURN v_batch;
  END IF;

  v_derived := public._derive_batch_status_from_items(p_batch_id);
  IF v_derived IS NULL OR v_derived = v_batch.status THEN
    RETURN v_batch;
  END IF;

  -- ── NEW GUARD ────────────────────────────────────────────────────────────
  -- Never regress backward. From 'processing' or 'partially_processed',
  -- only forward transitions are valid: processed / partially_processed /
  -- failed. Anything else (funded / approved / pending_approval / draft)
  -- means the derive function is confused about item state; return unchanged
  -- rather than crash on the state-machine trigger.
  IF v_batch.status IN ('processing','partially_processed')
     AND v_derived NOT IN ('processed','partially_processed','failed') THEN
    RETURN v_batch;
  END IF;

  UPDATE public.payment_batches SET
    status = v_derived,
    processing_finalized_at = CASE
      WHEN v_derived IN ('processed','partially_processed','failed') THEN now()
      ELSE processing_finalized_at
    END
  WHERE id = p_batch_id
  RETURNING * INTO v_batch;

  INSERT INTO public.audit_logs (action_type, description, performed_by, performed_by_name)
  VALUES (
    'batch_finalized',
    format('Batch "%s" finalized → %s', v_batch.name, v_derived),
    v_caller,
    COALESCE((SELECT full_name FROM public.profiles WHERE id = v_caller), 'system')
  );

  RETURN v_batch;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.finalize_batch(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalize_batch(uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
