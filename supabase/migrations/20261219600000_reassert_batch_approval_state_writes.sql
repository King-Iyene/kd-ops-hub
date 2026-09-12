-- Live incident 2026-09-12: an actual admin (role = 'admin') got
-- "Only the batch creator can submit, withdraw, or resubmit" trying to
-- submit/withdraw/resubmit a draft batch they did not personally create.
--
-- That exact wording only exists in one place in this migration history —
-- _pre_applied/20260813000000_payment_state_rpcs.sql's original, stricter
-- version of enforce_batch_approval_state_writes(), which had NO role-based
-- exception at all (creator-only, full stop). 20260924000000 widened this
-- to also allow super_admin/admin/finance/operations regardless of creator,
-- and that migration's own CI deploy shows as a successful run. But an
-- admin still hit the old message today, which means the database's live
-- function body has drifted from what the migration files say it should
-- be — root cause not fully established (no direct DB introspection access
-- at the time of this fix), but the fix does not depend on finding it:
-- CREATE OR REPLACE unconditionally reinstalls the correct body regardless
-- of whatever is currently live.
--
-- This is a byte-for-byte re-assertion of 20260924000000's version — no
-- behavior change beyond guaranteeing it is actually what's installed.
CREATE OR REPLACE FUNCTION public.enforce_batch_approval_state_writes()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_user <> 'authenticated' THEN
    RETURN NEW;
  END IF;

  IF NEW.approved_by                IS DISTINCT FROM OLD.approved_by
     OR NEW.approved_at             IS DISTINCT FROM OLD.approved_at
     OR NEW.second_approver_id      IS DISTINCT FROM OLD.second_approver_id
     OR NEW.second_approved_at      IS DISTINCT FROM OLD.second_approved_at
     OR NEW.payload_hash_at_approval IS DISTINCT FROM OLD.payload_hash_at_approval
     OR NEW.co_approval_required    IS DISTINCT FROM OLD.co_approval_required
     OR NEW.funded_at               IS DISTINCT FROM OLD.funded_at
     OR NEW.funded_by               IS DISTINCT FROM OLD.funded_by
     OR NEW.funding_evidence        IS DISTINCT FROM OLD.funding_evidence
     OR NEW.processing_started_at   IS DISTINCT FROM OLD.processing_started_at
     OR NEW.processing_finalized_at IS DISTINCT FROM OLD.processing_finalized_at THEN
    RAISE EXCEPTION 'Direct writes to batch lifecycle state columns are not allowed. Use approve_payment_batch / mark_batch_funded / start_batch_processing / finalize_batch / reject_payment_batch / reset_batch_to_draft.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF (OLD.status = 'draft' AND NEW.status IN ('draft','pending_approval'))
       OR (OLD.status = 'rejected' AND NEW.status = 'pending_approval')
       OR (OLD.status = 'pending_approval' AND NEW.status = 'draft') THEN
      -- Draft preparation moves (submit / withdraw / resubmit). Allowed for
      -- the batch creator OR any payments-team role (super_admin, admin,
      -- finance, operations) — an admin must NEVER be blocked here
      -- regardless of who created the batch. Only a user with none of
      -- those roles, acting on a batch they didn't create, is blocked.
      IF auth.uid() IS DISTINCT FROM NEW.created_by
         AND public.current_user_role() NOT IN ('super_admin','admin','finance','operations') THEN
        RAISE EXCEPTION 'Only the batch creator or a payments role can submit, withdraw, or resubmit'
          USING ERRCODE = 'insufficient_privilege';
      END IF;
    ELSE
      RAISE EXCEPTION 'Status transition % -> % requires the appropriate RPC (approve / fund / process / finalize / reject / reset)', OLD.status, NEW.status
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Belt-and-braces: make sure the trigger itself is actually attached (in
-- case the drift extended to the trigger binding, not just the function
-- body — DROP + CREATE is idempotent and safe to run any number of times).
DROP TRIGGER IF EXISTS payment_batches_approval_state_lock ON public.payment_batches;
CREATE TRIGGER payment_batches_approval_state_lock
  BEFORE UPDATE ON public.payment_batches
  FOR EACH ROW EXECUTE FUNCTION public.enforce_batch_approval_state_writes();

NOTIFY pgrst, 'reload schema';
