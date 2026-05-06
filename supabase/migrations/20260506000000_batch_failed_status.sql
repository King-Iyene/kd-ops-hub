-- ──────────────────────────────────────────────────────────────────────────
-- batch_failed_status: when ALL items in a batch fail, the batch status
-- should be 'failed', not 'partially_processed'. The previous derivation
-- collapsed any failed-item count to 'partially_processed', so the UI
-- showed "Partial" even when 0 items succeeded — confusing finance and
-- making it look like some money moved when none did.
--
-- Three changes:
--   1. Allow 'failed' as a valid payment_batches.status (CHECK constraint)
--   2. _derive_batch_status_from_items returns 'failed' when v_failed = v_total
--   3. State machine allows 'partially_processed' → 'failed' transition
--      (e.g. operator retries the last surviving item, it fails too)
-- ──────────────────────────────────────────────────────────────────────────

-- 1. Widen status CHECK to include 'failed'.
DO $$
BEGIN
  ALTER TABLE public.payment_batches
    DROP CONSTRAINT IF EXISTS payment_batches_status_check;
  ALTER TABLE public.payment_batches
    ADD CONSTRAINT payment_batches_status_check
    CHECK (status IN ('draft','pending_approval','pending_second_approval',
                      'approved','funded','processing','processed',
                      'partially_processed','failed','rejected'));
EXCEPTION WHEN others THEN NULL;
END $$;

-- 2. Update _derive_batch_status_from_items: distinguish "all failed"
--    from "some failed, some succeeded".
CREATE OR REPLACE FUNCTION public._derive_batch_status_from_items(p_batch_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
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
    count(*) FILTER (WHERE status = 'succeeded'),
    count(*) FILTER (WHERE status IN ('failed','reversed')),
    count(*) FILTER (WHERE status IN ('pending','retry') AND paystack_reference IS NOT NULL),
    count(*) FILTER (WHERE paystack_reference IS NULL AND status NOT IN ('succeeded','failed','reversed'))
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
    -- ALL items failed, none succeeded → batch is fully failed.
    RETURN 'failed';
  ELSIF v_failed > 0 THEN
    -- Some failed, some succeeded → partial.
    RETURN 'partially_processed';
  ELSE
    RETURN 'processed';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public._derive_batch_status_from_items(uuid) TO authenticated, service_role;

-- 3. Allow 'partially_processed' → 'failed' transition for the case where
--    the surviving items get retried and also fail.
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
      NEW.status IN ('processing', 'failed', 'funded')
    WHEN 'processing' THEN
      NEW.status IN ('processed', 'partially_processed', 'failed', 'processing')
    WHEN 'partially_processed' THEN
      NEW.status IN ('processing', 'processed', 'partially_processed', 'failed')
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
