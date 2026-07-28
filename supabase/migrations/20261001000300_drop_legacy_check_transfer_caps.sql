-- =============================================================================
-- Migration: 20261001000300_drop_legacy_check_transfer_caps.sql
-- =============================================================================
-- Root cause: two overloads of check_transfer_caps live in the production DB
-- simultaneously:
--   1. check_transfer_caps(uuid, numeric)                              (legacy,
--      from migrations 20260807000000 + 20260813000000)
--   2. check_transfer_caps(uuid, numeric, boolean, text, boolean, text, text)
--      (current, from migration 20260814000000 — added params for
--      intent/audit but forgot to DROP the legacy 2-arg signature)
--
-- Every 2-arg call site (approve_payment_batch, approve_expense, batch-worker,
-- etc.) matches BOTH signatures — Postgres refuses with:
--   "function public.check_transfer_caps(uuid, numeric) is not unique"
--
-- Fix: DROP the legacy 2-arg overload. Keep the 7-arg current version — its
-- optional params default to the same semantics the old 2-arg had, so no
-- caller needs to change. Idempotent (IF EXISTS), safe to re-run.
--
-- Side effects: none. Any caller that was resolving to the old 2-arg version
-- silently falls through to the 7-arg version (identical result for
-- (p_user_id, p_amount_ngn) invocations because the extra params default to
-- 'no-op' behaviour: p_intent=false, p_check_batch_cap=false, etc.).
-- =============================================================================

DROP FUNCTION IF EXISTS public.check_transfer_caps(uuid, numeric);

-- Defensive: also drop any variant that might have crept in with different
-- default combinations across environments. These are no-ops on a clean DB.
DROP FUNCTION IF EXISTS public.check_transfer_caps(uuid, numeric, boolean);
DROP FUNCTION IF EXISTS public.check_transfer_caps(uuid, numeric, boolean, text);

NOTIFY pgrst, 'reload schema';
