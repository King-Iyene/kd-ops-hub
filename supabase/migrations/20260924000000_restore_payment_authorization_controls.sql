-- =============================================================================
-- Restore payment-authorization controls (forensic audit C1 + C2).
--
-- Two later migrations (20260817000000_remove_restrictions,
-- 20260818000000_drop_remaining_constraints) dropped the approval-state-write
-- lock, and 20260916000000 granted Operations raw UPDATE on batch_items. Net
-- effect:
--   C1 — a finance/operations user could set payment_batches.status='approved'
--        with a direct UPDATE, skipping approve_payment_batch's self-approval,
--        co-approval and cap checks, then fund + process.
--   C2 — Operations could flip batch_items.status to 'succeeded' with no real
--        transfer, concealing an unpaid (or diverted) payment.
--
-- This migration restores the controls WITHOUT reinstating the pieces that were
-- removed on purpose:
--   • batches_no_self_approval is NOT recreated — admin/super_admin keep
--     single-handed approval (and remain eligible as the final approver). The
--     co-approval threshold (configurable) still forces a distinct second
--     approver above it; that logic lives in the RPCs and is untouched.
--   • The submit/withdraw/resubmit transitions are widened so the whole
--     payments team (super_admin/admin/finance/operations) — not only the
--     original creator — can move a draft, matching the Operations batch-prep
--     workflow.
--
-- Idempotent: every CREATE is OR REPLACE / paired with DROP IF EXISTS.
-- =============================================================================

-- ── C1: payment_batches lifecycle write-lock ────────────────────────────────
-- Blocks direct authenticated writes to approval/funding/processing columns and
-- forces every status transition (other than the draft⇄pending_approval prep
-- moves) through the SECURITY DEFINER RPCs. SECURITY DEFINER funcs and
-- service_role run as a non-'authenticated' role and pass straight through.
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
      -- Draft preparation moves (submit / withdraw / resubmit). Allowed for the
      -- batch creator OR any payments-team role — the team that prepares runs
      -- must be able to submit a draft they didn't personally create. Everyone
      -- else is blocked so a random user can't resurrect/submit a batch.
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

DROP TRIGGER IF EXISTS payment_batches_approval_state_lock ON public.payment_batches;
CREATE TRIGGER payment_batches_approval_state_lock
  BEFORE UPDATE ON public.payment_batches
  FOR EACH ROW EXECUTE FUNCTION public.enforce_batch_approval_state_writes();

-- ── C1 (expenses): mirror lock for the expense approval state machine ────────
CREATE OR REPLACE FUNCTION public.enforce_expense_approval_state_writes()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_user <> 'authenticated' THEN
    RETURN NEW;
  END IF;

  IF NEW.approved_by                 IS DISTINCT FROM OLD.approved_by
     OR NEW.approved_at              IS DISTINCT FROM OLD.approved_at
     OR NEW.second_approver_id       IS DISTINCT FROM OLD.second_approver_id
     OR NEW.second_approved_at       IS DISTINCT FROM OLD.second_approved_at
     OR NEW.approved_by_secondary    IS DISTINCT FROM OLD.approved_by_secondary
     OR NEW.approved_by_secondary_at IS DISTINCT FROM OLD.approved_by_secondary_at
     OR NEW.payload_hash_at_approval IS DISTINCT FROM OLD.payload_hash_at_approval
     OR NEW.co_approval_required     IS DISTINCT FROM OLD.co_approval_required THEN
    RAISE EXCEPTION 'Direct writes to expense approval state are not allowed. Use approve_expense / confirm_second_expense_approval / reject_expense.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NEW.payment_status IS DISTINCT FROM OLD.payment_status THEN
    IF NEW.payment_status = 'processed' AND OLD.payment_status <> 'processed' THEN
      RAISE EXCEPTION 'Direct writes to payment_status=processed are not allowed. Use mark_expense_paid (or the webhook).'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF (OLD.status = 'pending' AND NEW.status IN ('approved','pending_second_approval','rejected'))
       OR (OLD.status = 'pending_second_approval' AND NEW.status IN ('approved','pending','rejected'))
       OR (OLD.status = 'approved' AND NEW.status = 'rejected') THEN
      RAISE EXCEPTION 'Status transition % -> % requires the approval RPCs', OLD.status, NEW.status
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS expenses_approval_state_lock ON public.expenses;
CREATE TRIGGER expenses_approval_state_lock
  BEFORE UPDATE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.enforce_expense_approval_state_writes();

-- ── C2a: Operations may only edit batch_items on DRAFT batches ───────────────
-- Operations prepare draft batches; they must not touch items on a batch that
-- has left draft (pending_approval / approved / funded / processing / …). This
-- closes the "flip a live item to succeeded" path. Admin/finance/super_admin
-- are unrestricted — they run the dispatch + reconciliation flow.
DROP POLICY IF EXISTS "batch_items_update" ON public.batch_items;
CREATE POLICY "batch_items_update" ON public.batch_items
  FOR UPDATE TO authenticated
  USING (
    public.current_user_role() IN ('super_admin', 'admin', 'finance')
    OR (
      public.current_user_role() = 'operations'
      AND EXISTS (
        SELECT 1 FROM public.payment_batches b
        WHERE b.id = batch_items.batch_id AND b.status = 'draft'
      )
    )
  );

-- ── C2b: an item cannot be marked 'succeeded' without a real transfer ────────
-- Recreates the batch_items state machine (unchanged transitions) plus a guard:
-- an authenticated client cannot set status='succeeded' unless the row carries
-- a paystack_reference — a genuine transfer always has one by the time it can
-- succeed (poll loop, recovery and reconcile all set it). The webhook /
-- reconciliation paths set the kdops.allow_state_override GUC (handled first)
-- or run as a non-authenticated role, so they are unaffected. This blocks
-- faking a success to conceal a payment that never moved.
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

  -- Concealment guard (C2): no faking a success without a transfer reference.
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
      NEW.status IN ('succeeded', 'failed', 'awaiting_otp')
    WHEN 'retry' THEN
      NEW.status IN ('succeeded', 'failed', 'retry', 'pending')
    WHEN 'succeeded' THEN
      NEW.status IN ('reversed')
    WHEN 'failed' THEN
      NEW.status IN ('retry', 'failed')
    WHEN 'reversed' THEN
      false
    ELSE false
  END;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Invalid batch_items state transition: % -> %',
      OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS enforce_batch_item_state_machine ON public.batch_items;
CREATE TRIGGER enforce_batch_item_state_machine
  BEFORE UPDATE ON public.batch_items
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_batch_item_state_machine();

NOTIFY pgrst, 'reload schema';
