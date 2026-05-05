-- =============================================================================
-- Payroll change lock — block bank account changes during active payroll
--
-- Defends against the BEC salary-diversion vector: an attacker who has
-- compromised an HR/operations account changes a beneficiary's bank account
-- *between* batch approval and disbursement, redirecting that one salary to
-- their own account without anyone noticing until payday.
--
-- Behaviour:
--   • If a profile's bank_account_* is being modified AND that user appears in
--     any payment_batches row with status IN
--     (pending_approval, pending_second_approval, approved, funded, processing),
--     the UPDATE is rejected.
--   • EXCEPTION: admin / super_admin actors bypass the lock entirely (per
--     project constraint #1: admins skip ALL dual-control). The change still
--     fires the audit trigger from 20260819, so the affected user is notified
--     and the change is logged.
--   • Service-role / system actors (auth.uid() IS NULL) also bypass — leaves
--     migration scripts and worker functions unaffected.
--
-- Trigger order (BEFORE UPDATE on profiles, alphabetical):
--   profiles_block_bank_change_during_batch  ← runs first (this trigger)
--   profiles_maintain_bank_modified_at       ← from 20260820
-- The audit + notification trigger (20260819) is AFTER UPDATE, so it only
-- runs once the lock has cleared the change.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.block_bank_change_during_active_batch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id     uuid := auth.uid();
  v_actor_role   text;
  v_batch_name   text;
  v_batch_status text;
BEGIN
  -- System / service-role: bypass.
  IF v_actor_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Admin / super_admin: bypass (constraint #1 — admins skip dual-control).
  SELECT role INTO v_actor_role FROM public.profiles WHERE id = v_actor_id;
  IF v_actor_role IN ('admin', 'super_admin') THEN
    RETURN NEW;
  END IF;

  -- Find any in-flight batch this user is currently part of.
  -- Match by (account_number, bank_name) on batch_items — that's the snapshot
  -- the batch was approved on. If found, lock the change.
  SELECT pb.name, pb.status
    INTO v_batch_name, v_batch_status
    FROM public.batch_items bi
    JOIN public.payment_batches pb ON pb.id = bi.batch_id
   WHERE bi.account_number = OLD.bank_account_number
     AND COALESCE(bi.bank_name, '') = COALESCE(OLD.bank_name, '')
     AND pb.status IN (
       'pending_approval',
       'pending_second_approval',
       'approved',
       'funded',
       'processing'
     )
   LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'Bank account locked: % is in active batch "%" (%). Wait for the batch to complete or ask an admin to make the change.',
      COALESCE(NEW.full_name, NEW.email, 'this employee'),
      v_batch_name,
      v_batch_status
      USING ERRCODE = 'lock_not_available';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.block_bank_change_during_active_batch IS
  'Blocks bank account changes on profiles while the user is in any active '
  'payment batch (pending_approval / approved / funded / processing). '
  'Admin / super_admin actors bypass per constraint #1.';

DROP TRIGGER IF EXISTS profiles_block_bank_change_during_batch ON public.profiles;
CREATE TRIGGER profiles_block_bank_change_during_batch
  BEFORE UPDATE OF bank_account_number, bank_name, bank_code ON public.profiles
  FOR EACH ROW
  WHEN (
    OLD.bank_account_number IS DISTINCT FROM NEW.bank_account_number
    OR OLD.bank_name         IS DISTINCT FROM NEW.bank_name
    OR OLD.bank_code         IS DISTINCT FROM NEW.bank_code
  )
  EXECUTE FUNCTION public.block_bank_change_during_active_batch();
