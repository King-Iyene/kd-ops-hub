-- =============================================================================
-- leave_requests.status allows 'cancelled'.
--
-- The Cancel action in the Leave UI sets status = 'cancelled', but the original
-- CHECK constraint only permitted ('pending','approved','rejected'), so every
-- cancel attempt failed with a constraint violation. Add 'cancelled' to the
-- allowed set.
--
-- The original constraint was created inline (auto-generated name), so we look
-- it up by definition before dropping it, then re-add a named one. Idempotent.
-- =============================================================================

DO $$
DECLARE
  v_conname text;
BEGIN
  SELECT conname INTO v_conname
  FROM pg_constraint
  WHERE conrelid = 'public.leave_requests'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%status%';
  IF v_conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.leave_requests DROP CONSTRAINT %I', v_conname);
  END IF;
END $$;

ALTER TABLE public.leave_requests
  ADD CONSTRAINT leave_requests_status_check
  CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled'));
