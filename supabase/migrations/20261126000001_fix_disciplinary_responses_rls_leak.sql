-- =============================================================================
-- Fix: disciplinary_responses had a tautological SELECT policy
-- ("Users can read disciplinary responses" USING (auth.uid() IS NOT NULL))
-- that was never replaced when the sibling disciplinary_records table's
-- equivalent policy was fixed in 20261101000000_fix_critical_rls_and_payroll_guards.sql.
--
-- Since Postgres RLS policies are OR'd together, that unreplaced policy meant
-- ANY authenticated user — any role, including field_staff — could read every
-- employee's disciplinary hearing response text via the REST API, even though
-- disciplinary_records itself was correctly locked to the subject employee
-- plus admin/super_admin.
--
-- Fix: replace it with the same rule the parent table uses — the employee
-- who is the SUBJECT of the disciplinary_records row this response belongs
-- to (via record_id), or admin/super_admin.
--
-- Idempotent — safe under supabase db push.
-- =============================================================================

DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema='public' AND table_name='disciplinary_responses') THEN
    DROP POLICY IF EXISTS "Users can read disciplinary responses" ON public.disciplinary_responses;
    DROP POLICY IF EXISTS "Employees can read own disciplinary responses" ON public.disciplinary_responses;
    CREATE POLICY "Employees can read own disciplinary responses"
      ON public.disciplinary_responses FOR SELECT TO authenticated
      USING (
        public.current_user_role() IN ('super_admin', 'admin')
        OR EXISTS (
          SELECT 1 FROM public.disciplinary_records r
          WHERE r.id = disciplinary_responses.record_id
            AND r.employee_id = auth.uid()
        )
      );
  END IF;
END $$;
