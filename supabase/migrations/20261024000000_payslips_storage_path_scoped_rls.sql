-- =============================================================================
-- Fix: payslips Storage bucket RLS let ANY authenticated user read ANY
-- employee's payslip object. Objects are stored at `{employee_id}/{period}.html`
-- (see src/pages/Payroll.tsx generatePayslips) but the SELECT policy added in
-- 20260425100000_phase_6_payments_payslips_reports.sql never checked the path
-- — it only checked bucket_id. That's a confidentiality gap: an employee
-- could enumerate/guess another employee's `{employee_id}/{period}.html` path
-- and download their payslip.
--
-- Scope reads the same way the `payslips` table itself already is scoped
-- (payslips_read policy): the object's own folder (first path segment) must
-- match the caller, or the caller must be admin/finance.
--
-- Idempotent — safe under supabase db push.
-- =============================================================================

DROP POLICY IF EXISTS "payslips_read_storage" ON storage.objects;
CREATE POLICY "payslips_read_storage" ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id = 'payslips'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.get_my_role() IN ('super_admin', 'admin', 'finance')
    )
  );
