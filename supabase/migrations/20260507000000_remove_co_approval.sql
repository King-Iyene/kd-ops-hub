-- ──────────────────────────────────────────────────────────────────────────
-- remove_co_approval: the co-approval / second-approver feature is being
-- retired from the UI. Approvers complained that for a Nigerian SME the
-- two-signer requirement was operational friction more than fraud
-- mitigation, and our actual mitigation (per-user transfer caps + dual
-- audit log + rejection workflow) covers the same ground without the
-- bottleneck.
--
-- This migration is conservative — we keep the columns and the state
-- machine alive so historical rows still read correctly, but:
--   1. NULL out every transfer_limits.co_approval_threshold_ngn so no
--      future batch can be flagged as needing a second signer.
--   2. Promote any in-flight payment_batches.status = 'pending_second_approval'
--      to 'approved' (state machine already permits this transition) and
--      clear co_approval_required.
-- ──────────────────────────────────────────────────────────────────────────

-- 1. Disable the threshold for every role and per-user override.
UPDATE public.transfer_limits
SET co_approval_threshold_ngn = NULL
WHERE co_approval_threshold_ngn IS NOT NULL;

-- 2. Clear the flag on every payment batch that currently carries it,
--    and lift the status of any batch waiting on a second signer. We
--    bypass the state-machine trigger via the documented session GUC
--    because the *intent* of this migration is to clear the queue —
--    not to walk every batch through the normal approve flow.
DO $$
BEGIN
  PERFORM set_config('kdops.allow_state_override', 'true', true);

  UPDATE public.payment_batches
  SET status = 'approved'
  WHERE status = 'pending_second_approval';

  UPDATE public.payment_batches
  SET co_approval_required = false
  WHERE co_approval_required = true;

  PERFORM set_config('kdops.allow_state_override', 'false', true);
END $$;

-- 3. Same treatment for expenses that supported a secondary approver.
UPDATE public.expenses
SET status = 'approved'
WHERE status = 'pending_second_approval';
