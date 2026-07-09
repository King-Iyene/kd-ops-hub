-- =============================================================================
-- payment_batches: prevent INSERT-time approval bypass
--
-- Regression discovered in the payment audit: enforce_batch_approval_state_writes
-- fires only on UPDATE. An admin/finance user could therefore INSERT a batch
-- directly at status='funded' — skipping the whole approve → co-approve → fund
-- pipeline. The CO-APPROVAL requirement (transfer_limits.co_approval_threshold_ngn)
-- was intended to force a second approver for large amounts; a direct-to-funded
-- INSERT dodges it entirely.
--
-- QuickPay uses this exact shortcut intentionally: single-recipient, is_quick_pay
-- = true, operator's click is the approval. We keep that path open; we just
-- refuse everything else.
--
-- Rules enforced BEFORE INSERT on payment_batches for authenticated callers
-- (SECURITY DEFINER RPCs and service_role skip the check):
--
--   • status must be one of: draft, pending_approval, funded
--   • status='funded' is allowed ONLY when is_quick_pay = true
--     (QuickPay's synthetic single-line-item batches).
--   • QuickPay rows must additionally carry a created_by, beneficiary_count = 1,
--     and total_amount > 0 so the row is a genuine one-off dispatch, not a
--     smuggled-in bulk run relabelled as quick pay.
--   • Anything else raises with insufficient_privilege so the client sees an
--     RLS-style rejection rather than a silent bad insert.
--
-- Note: the state-machine trigger continues to enforce transitions post-insert;
-- this is the missing entry-point guard.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.enforce_batch_insert_gate()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_user <> 'authenticated' THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS NULL OR NEW.status NOT IN ('draft','pending_approval','funded') THEN
    RAISE EXCEPTION
      'payment_batches INSERT rejected: status % is not a valid entry state (must be draft, pending_approval, or funded via QuickPay)',
      NEW.status
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NEW.status = 'funded' THEN
    IF COALESCE(NEW.is_quick_pay, false) = false THEN
      RAISE EXCEPTION
        'payment_batches INSERT rejected: direct-to-funded status is only allowed for QuickPay (is_quick_pay=true). Route large batches through the approval pipeline (draft → pending_approval → approved → funded).'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF NEW.created_by IS NULL THEN
      RAISE EXCEPTION
        'payment_batches INSERT rejected: QuickPay batches must carry created_by'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF COALESCE(NEW.beneficiary_count, 0) <> 1 THEN
      RAISE EXCEPTION
        'payment_batches INSERT rejected: QuickPay batches must have beneficiary_count = 1 (got %)',
        COALESCE(NEW.beneficiary_count, 0)
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF COALESCE(NEW.total_amount, 0) <= 0 THEN
      RAISE EXCEPTION
        'payment_batches INSERT rejected: total_amount must be > 0'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payment_batches_insert_gate ON public.payment_batches;
CREATE TRIGGER payment_batches_insert_gate
  BEFORE INSERT ON public.payment_batches
  FOR EACH ROW EXECUTE FUNCTION public.enforce_batch_insert_gate();

COMMENT ON FUNCTION public.enforce_batch_insert_gate IS
  'Blocks direct-to-funded INSERTs from authenticated callers unless the row '
  'is a well-formed single-recipient QuickPay batch. Prevents the "insider '
  'admin skips co-approval by inserting funded" attack.';
