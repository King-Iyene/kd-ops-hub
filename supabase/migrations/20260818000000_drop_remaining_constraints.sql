-- =============================================================================
-- Drop all remaining approval-blocking constraints and trigger functions.
--
-- Every statement uses IF EXISTS so this migration is safe to apply regardless
-- of which prior migrations reached the production database.
--
-- Removes:
--   batches_no_self_approval       CHECK constraint — blocks admin/super_admin
--                                   self-approval; the RPC enforces per-role
--                                   policy and admin/super_admin are allowed.
--   batches_distinct_approvers     CHECK constraint — already targeted by
--                                   20260817000000; belt-and-suspenders drop.
--   payment_batches_approval_state_lock  TRIGGER — already targeted by
--                                   20260817000000; belt-and-suspenders drop.
--   expenses_approval_state_lock   TRIGGER — already targeted by 20260817000000;
--                                   belt-and-suspenders drop.
--   enforce_batch_approval_state_writes()   function — already targeted by
--                                   20260817000000; belt-and-suspenders drop.
--   enforce_expense_approval_state_writes() function — was NOT dropped by any
--                                   prior migration; orphaned after trigger drop.
-- =============================================================================

-- ── 1. batches_no_self_approval (THE ACTIVE BUG) ─────────────────────────────
-- This CHECK (approved_by IS NULL OR approved_by != created_by) blocks admin
-- and super_admin from self-approving even though the RPC explicitly allows it.
-- The RPC is the correct enforcement layer; the CHECK cannot query the profiles
-- table and must be removed.
ALTER TABLE public.payment_batches
  DROP CONSTRAINT IF EXISTS batches_no_self_approval;

-- ── 2. batches_distinct_approvers (safety belt) ───────────────────────────────
ALTER TABLE public.payment_batches
  DROP CONSTRAINT IF EXISTS batches_distinct_approvers;

-- ── 3. approval_state_lock triggers (safety belt) ────────────────────────────
DROP TRIGGER IF EXISTS payment_batches_approval_state_lock ON public.payment_batches;
DROP TRIGGER IF EXISTS expenses_approval_state_lock        ON public.expenses;

-- ── 4. approval_state_write trigger functions ─────────────────────────────────
-- enforce_batch_approval_state_writes was targeted by 20260817000000 but
-- enforce_expense_approval_state_writes was never explicitly dropped.
DROP FUNCTION IF EXISTS public.enforce_batch_approval_state_writes();
DROP FUNCTION IF EXISTS public.enforce_expense_approval_state_writes();
