-- Fix: "Re-edit & Resubmit" on a rejected payment batch was broken.
--
-- reset_batch_to_draft() (backing the Re-edit & Resubmit button) explicitly
-- allows resetting a 'rejected' batch to 'draft' — that's its whole
-- purpose. But enforce_payment_batch_state_machine()'s transition table
-- for OLD.status = 'rejected' only permitted 'pending_approval', not
-- 'draft' — so the RPC's own UPDATE was rejected by the trigger it runs
-- under, with "Invalid payment_batches state transition: rejected ->
-- draft". The RPC's guard clause and the trigger's whitelist had drifted
-- apart; this brings the trigger in line with what the RPC (and the UI
-- button built around it) already promises.

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
      NEW.status IN ('pending_approval', 'draft')
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
