-- =============================================================================
-- P2 audit follow-ups: NULL-safe paid_total, complete awaiting_otp transitions
--
-- #8 — paid_total_in_period() missed rows where is_manually_resolved is NULL.
--
-- The filter `bi.is_manually_resolved = false` returns UNKNOWN (three-valued
-- logic) for any legacy row that predates the manual-resolution feature and
-- still has NULL there, so those rows silently drop out of the paid total.
-- The newer pending_payouts_summary already uses COALESCE(..., false) = false
-- for the same reason; mirror that here.
--
-- #9 — enforce_batch_item_state_machine had two missing transitions.
--
--   • awaiting_otp → pending
--     Paystack occasionally releases an OTP-held transfer back into the pending
--     pool (they resolved the OTP challenge upstream). We could not accept that
--     event, so the row would stay stuck on 'awaiting_otp' forever unless
--     hand-fixed in the DB.
--
--   • retry → awaiting_otp
--     A retry that Paystack decides needs OTP triggered the same rejection.
--     Retries should be able to enter the OTP-hold path just like a first-time
--     dispatch can.
--
-- Neither transition weakens the money-safety guarantees: 'succeeded' still
-- requires a paystack_reference (the C2 concealment guard), 'reversed' is
-- still terminal, and every transition still passes through this trigger
-- when kdops.allow_state_override is off.
-- =============================================================================

-- #8 ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.paid_total_in_period(
  p_start date,
  p_end   date
)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(bi.amount_ngn), 0)::numeric
  FROM   public.batch_items bi
  JOIN   public.payment_batches pb ON pb.id = bi.batch_id
  WHERE  bi.status = 'succeeded'
    AND  COALESCE(bi.is_manually_resolved, false) = false
    AND  pb.deleted_at IS NULL
    AND  pb.payment_date >= p_start
    AND  pb.payment_date <  p_end;
$$;

-- #9 ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.enforce_batch_item_state_machine()
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

  IF NEW.status = 'succeeded'
     AND NEW.paystack_reference IS NULL
     AND current_user = 'authenticated' THEN
    RAISE EXCEPTION 'Cannot mark a batch item succeeded without a transfer reference'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_allowed := CASE OLD.status
    WHEN 'pending' THEN
      NEW.status IN ('succeeded', 'failed', 'reversed', 'retry', 'awaiting_otp', 'pending')
    WHEN 'awaiting_otp' THEN
      -- Added 'pending' so Paystack releasing the OTP hold back into the
      -- pending pool is a legal transition (was silently rejected before).
      NEW.status IN ('succeeded', 'failed', 'awaiting_otp', 'pending')
    WHEN 'retry' THEN
      -- Added 'awaiting_otp' so a retry that Paystack decides needs OTP
      -- can flow into the OTP-hold path (same as a first-time dispatch).
      NEW.status IN ('succeeded', 'failed', 'retry', 'pending', 'awaiting_otp')
    WHEN 'succeeded' THEN
      NEW.status IN ('reversed')
    WHEN 'failed' THEN
      NEW.status IN ('retry', 'failed')
    WHEN 'reversed' THEN
      false
    ELSE false
  END;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Illegal batch_item status transition % -> %', OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_batch_item_state_machine ON public.batch_items;
CREATE TRIGGER enforce_batch_item_state_machine
  BEFORE UPDATE ON public.batch_items
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_batch_item_state_machine();

NOTIFY pgrst, 'reload schema';
