-- =============================================================================
-- Migration: 20261001000400_heal_approval_state.sql
-- =============================================================================
-- Heals the approval state ONLY where the current design intent says it
-- should be healed. Reconciled against ALL approval migrations up to
-- 20260930000300:
--
--   20260811000000 approval_framework       — ADDED batches_no_self_approval
--                                             CHECK constraint (the bug source)
--   20260811100000 relax_self_approval      — attempted DROP (never applied)
--   20260817000000 remove_restrictions      — attempted DROP (never applied)
--   20260818000000 drop_remaining_constraints — attempted DROP (never applied)
--   20260924000000 restore_payment_authorization_controls
--                                           — re-added approval-state triggers
--                                             as C1/C2 security guards; DID
--                                             NOT recreate the CHECK constraint
--                                             (that's the correct policy)
--
-- Correct end state per the latest design intent:
--   ✓ batches_no_self_approval CHECK  — DROPPED (admin/super_admin can
--                                       self-approve; RPC enforces per-role
--                                       policy)
--   ✓ batches_distinct_approvers CHECK — DROPPED
--   ✓ payment_batches_approval_state_lock TRIGGER  — KEPT (security guard)
--   ✓ expenses_approval_state_lock TRIGGER         — KEPT (security guard)
--   ✓ enforce_batch_approval_state_writes() FUNC   — KEPT (trigger body)
--   ✓ enforce_expense_approval_state_writes() FUNC — KEPT (trigger body)
--
-- This migration ONLY drops the CHECK constraints. It deliberately does NOT
-- touch the triggers/functions because migration 20260924 restored them on
-- purpose to prevent direct authenticated writes to approval columns
-- (audit findings C1 + C2). The RPCs run as SECURITY DEFINER so they
-- bypass the trigger cleanly — no interference with self-approval flow.
--
-- Idempotent: DROP CONSTRAINT IF EXISTS is a no-op on a clean DB. Safe to
-- re-run any number of times.
-- =============================================================================

-- ── The active bug: batches_no_self_approval blocks self-approval at the
--    row-level CHECK, before the RPC's per-role policy can decide. Drop it.
ALTER TABLE public.payment_batches
  DROP CONSTRAINT IF EXISTS batches_no_self_approval;

-- ── Safety belt: also drop the distinct-approvers CHECK if it survived,
--    because it blocks admin from second-approving their own first-approved
--    batch when co-approval is required — undesired for a super_admin.
ALTER TABLE public.payment_batches
  DROP CONSTRAINT IF EXISTS batches_distinct_approvers;

NOTIFY pgrst, 'reload schema';
