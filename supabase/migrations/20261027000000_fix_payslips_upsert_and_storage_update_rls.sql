-- =============================================================================
-- Fix: payslip generation via a payroll run has never actually written a
-- payslips row, ever — confirmed live: of 92 existing payslips rows, 0 have
-- payroll_run_id set (all came from the payslip_from_batch_item trigger, a
-- separate path). Two real, systemic bugs, both hit on the first live
-- end-to-end test of the formal draft -> submit -> approve ->
-- generate-payslips pipeline:
--
--  1. src/pages/Payroll.tsx generatePayslips() upserts into payslips with
--     `{ onConflict: 'payroll_run_id,employee_id' }`, but no unique
--     constraint on that column pair has ever existed on this table.
--     Postgres validates the ON CONFLICT target at parse time regardless of
--     whether a row actually conflicts, so EVERY such upsert has always
--     failed with "there is no unique or exclusion constraint matching the
--     ON CONFLICT specification" — even a brand-new row with nothing to
--     conflict with.
--
--  2. generatePayslips() uploads the payslip HTML with `{ upsert: true }`.
--     The payslips Storage bucket has INSERT and SELECT policies but no
--     UPDATE policy, so re-uploading to a path that already has an object
--     (any regeneration/re-run) is denied by RLS on the storage engine's
--     underlying UPDATE. Confirmed live: two employees hit exactly this on
--     a second generation attempt for the same run.
--
-- Also consolidates the payslips-bucket storage policies: two separate
-- migrations (20260425100000 and this session's 20261024000000) each added
-- an equivalent SELECT/INSERT policy under a different name
-- (payslips_download/payslips_upload vs payslips_read_storage/
-- payslips_write_storage, using different helper functions that resolve
-- the same role). Functionally harmless but redundant; folding them into
-- one clean set here rather than leaving four overlapping policies plus a
-- newly-added fifth.
--
-- Idempotent — safe under supabase db push.
-- =============================================================================

-- ── 1. The missing unique constraint ────────────────────────────────────────
-- Plain UNIQUE (not partial) is correct here: batch-derived payslips have
-- payroll_run_id IS NULL, and Postgres unique constraints never treat NULLs
-- as duplicates of each other, so those rows are unaffected.
ALTER TABLE public.payslips
  ADD CONSTRAINT payslips_run_employee_unique UNIQUE (payroll_run_id, employee_id);

-- ── 2. Storage RLS: add UPDATE, drop the redundant duplicate policies ──────
DROP POLICY IF EXISTS "payslips_download" ON storage.objects;
DROP POLICY IF EXISTS "payslips_upload" ON storage.objects;
DROP POLICY IF EXISTS "payslips_read_storage" ON storage.objects;
DROP POLICY IF EXISTS "payslips_write_storage" ON storage.objects;

CREATE POLICY "payslips_read_storage" ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id = 'payslips'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.get_my_role() IN ('super_admin', 'admin', 'finance')
    )
  );

CREATE POLICY "payslips_write_storage" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'payslips'
    AND public.get_my_role() IN ('super_admin', 'admin', 'finance')
  );

CREATE POLICY "payslips_update_storage" ON storage.objects
  FOR UPDATE TO authenticated USING (
    bucket_id = 'payslips'
    AND public.get_my_role() IN ('super_admin', 'admin', 'finance')
  ) WITH CHECK (
    bucket_id = 'payslips'
    AND public.get_my_role() IN ('super_admin', 'admin', 'finance')
  );
