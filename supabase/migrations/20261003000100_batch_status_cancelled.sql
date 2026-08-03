-- =============================================================================
-- Migration: 20261003000100_batch_status_cancelled.sql
-- =============================================================================
-- A batch whose only outcome was manual cancellation (stuck item(s) closed
-- via mark_batch_item_resolved / cancel_batch_bulk with method='cancelled',
-- nothing ever actually paid) was landing on 'processed' — same status and
-- same green "Completed" pill as a batch that genuinely paid everyone. That's
-- misleading: no money moved, the operator gave up on it.
--
-- Adds a real 'cancelled' terminal status, distinct from 'processed'
-- (something was actually paid) and 'failed' (Paystack/Flutterwave reported
-- failure and nobody wrote it off). A batch only derives to 'cancelled' when
-- EVERY item that closed out did so via method='cancelled' and zero items
-- ever actually succeeded or were marked paid through another channel — a
-- mixed batch (some paid, some cancelled) still shows 'processed', since
-- money did move and the batch is legitimately done.
-- =============================================================================

-- 1. Widen the CHECK constraint.
DO $$
BEGIN
  ALTER TABLE public.payment_batches
    DROP CONSTRAINT IF EXISTS payment_batches_status_check;
  ALTER TABLE public.payment_batches
    ADD CONSTRAINT payment_batches_status_check
    CHECK (status IN ('draft','pending_approval','pending_second_approval',
                      'approved','funded','processing','processed',
                      'partially_processed','failed','rejected','cancelled'));
EXCEPTION WHEN others THEN NULL;
END $$;

-- 2. Allow the state machine to reach 'cancelled' from the states a batch
--    can actually be cancelled out of. mark_batch_item_resolved / unresolve
--    already bypass this trigger via kdops.allow_state_override, so this is
--    belt-and-braces documentation of the legitimate edges, not a functional
--    requirement — but keeping the whitelist honest matters for anyone
--    reading it later.
CREATE OR REPLACE FUNCTION public.enforce_payment_batch_state_machine()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_override text;
  v_allowed  boolean := false;
BEGIN
  v_override := current_setting('kdops.allow_state_override', true);
  IF v_override = 'true' THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  v_allowed := CASE OLD.status
    WHEN 'draft' THEN
      NEW.status IN ('pending_approval', 'rejected', 'draft')
    WHEN 'pending_approval' THEN
      NEW.status IN ('approved', 'pending_second_approval', 'rejected', 'draft')
    WHEN 'pending_second_approval' THEN
      NEW.status IN ('approved', 'rejected', 'pending_approval')
    WHEN 'approved' THEN
      NEW.status IN ('funded', 'rejected')
    WHEN 'funded' THEN
      NEW.status IN ('processing', 'failed', 'funded', 'cancelled')
    WHEN 'processing' THEN
      NEW.status IN ('processed', 'partially_processed', 'failed', 'processing', 'cancelled')
    WHEN 'partially_processed' THEN
      NEW.status IN ('processing', 'processed', 'partially_processed', 'cancelled')
    WHEN 'rejected' THEN
      NEW.status IN ('pending_approval')
    ELSE false
  END;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Invalid payment_batches state transition: % -> %',
      OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END
$$;

-- 3. _derive_batch_status_from_items: split "succeeded for real" from
--    "resolved" so a fully-cancelled batch (nothing ever paid) lands on
--    'cancelled' instead of 'processed'.
CREATE OR REPLACE FUNCTION public._derive_batch_status_from_items(p_batch_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total      int;
  v_succeeded  int;  -- real success OR marked paid through another channel
  v_cancelled  int;  -- manually resolved with method='cancelled' — nothing paid
  v_failed     int;
  v_pending    int;
  v_unstarted  int;
BEGIN
  SELECT count(*) INTO v_total FROM public.batch_items WHERE batch_id = p_batch_id;
  IF v_total = 0 THEN RETURN NULL; END IF;

  SELECT
    count(*) FILTER (
      WHERE status = 'succeeded'
         OR (is_manually_resolved = true AND manual_resolution_method IS DISTINCT FROM 'cancelled')
    ),
    count(*) FILTER (
      WHERE is_manually_resolved = true AND manual_resolution_method = 'cancelled'
    ),
    count(*) FILTER (WHERE status IN ('failed','reversed') AND is_manually_resolved = false),
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
  INTO v_succeeded, v_cancelled, v_failed, v_pending, v_unstarted
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
  ELSIF v_succeeded = 0 AND v_cancelled = v_total THEN
    RETURN 'cancelled';
  ELSE
    RETURN 'processed';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public._derive_batch_status_from_items(uuid) TO authenticated, service_role;

-- 4. Backfill: any batch currently mislabeled 'processed' where every item
--    was actually just cancelled (nothing ever paid) gets relabelled now.
DO $$
DECLARE
  rec        record;
  new_status text;
BEGIN
  PERFORM set_config('kdops.allow_state_override', 'true', true);

  FOR rec IN
    SELECT id, status
    FROM   public.payment_batches
    WHERE  status = 'processed'
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

-- 5. finalize_batch's forward-only guard only allowed deriving to
--    processed/partially_processed/failed from processing/partially_processed
--    — 'cancelled' would have silently been blocked (returned unchanged)
--    instead of applied. Add it to the allowed forward set.
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

  -- Never regress backward. From 'processing' or 'partially_processed', only
  -- forward transitions are valid: processed / partially_processed / failed
  -- / cancelled. Anything else (funded / approved / pending_approval / draft)
  -- means the derive function is confused about item state; return unchanged
  -- rather than crash on the state-machine trigger.
  IF v_batch.status IN ('processing','partially_processed')
     AND v_derived NOT IN ('processed','partially_processed','failed','cancelled') THEN
    RETURN v_batch;
  END IF;

  UPDATE public.payment_batches SET
    status = v_derived,
    processing_finalized_at = CASE
      WHEN v_derived IN ('processed','partially_processed','failed','cancelled') THEN now()
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
