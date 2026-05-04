-- =============================================================================
-- Fix: add metadata column to audit_logs + correct bank_account_modified_at backfill
--
-- Problems fixed:
--   1. audit_logs was missing a `metadata jsonb` column. The trigger function
--      audit_profile_bank_account_change() (from 20260819000000) inserts into
--      audit_logs with a metadata value, which would fail at trigger-fire time.
--   2. The backfill in 20260820000000 referenced audit_logs.metadata which did
--      not exist, causing "ERROR: 42703: column metadata does not exist".
--
-- This migration:
--   a. Adds `metadata jsonb` to audit_logs (idempotent — IF NOT EXISTS).
--   b. Runs a corrected backfill: since the metadata column didn't exist when
--      the prior backfill ran, there is no queryable history. Fall back to
--      created_at for all profiles that still have a NULL bank_account_modified_at.
-- =============================================================================

-- 1. Add the missing metadata column to audit_logs.
ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS metadata jsonb;

COMMENT ON COLUMN public.audit_logs.metadata IS
  'Arbitrary structured data attached to an audit event (e.g. old/new field values, '
  'actor role, masked account numbers). Optional; NULL for legacy rows.';

-- 2. Corrected backfill for profiles.bank_account_modified_at.
--    The original backfill tried to join against audit_logs.metadata (which did
--    not exist). Since we cannot recover that history, we conservatively set
--    bank_account_modified_at = created_at for any profile that has a bank
--    account but whose timestamp column is still NULL.
UPDATE public.profiles
   SET bank_account_modified_at = created_at
 WHERE bank_account_number IS NOT NULL
   AND bank_account_modified_at IS NULL;
