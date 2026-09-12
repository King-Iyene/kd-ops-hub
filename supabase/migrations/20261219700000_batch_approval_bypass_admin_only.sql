-- Correction to 20261219600000 (same-day follow-up): the product owner
-- clarified the intended bypass list is admin/super_admin ONLY — finance
-- and operations must still be the batch's creator to submit, withdraw, or
-- resubmit it. The prior migration (matching 20260924000000's original
-- wording) allowed all four roles; that was wrong per current intent.
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
      -- Draft preparation moves (submit / withdraw / resubmit). Bypass is
      -- admin/super_admin ONLY — they can act on any batch regardless of
      -- who created it. finance and operations must be the creator; they
      -- are the roles this restriction is actually meant to constrain
      -- (per product clarification, 2026-09-12 — the prior version of this
      -- function incorrectly also exempted finance/operations).
      IF auth.uid() IS DISTINCT FROM NEW.created_by
         AND public.current_user_role() NOT IN ('super_admin','admin') THEN
        RAISE EXCEPTION 'Only the batch creator or an admin can submit, withdraw, or resubmit'
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

NOTIFY pgrst, 'reload schema';
