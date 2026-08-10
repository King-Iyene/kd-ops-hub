-- =============================================================================
-- Fix Critical Findings: RLS SELECT policies, payroll_runs upsert key,
-- and audit_logs.created_at NOT NULL.
--
-- 1. Replace 6 tautological SELECT policies that exposed private employee
--    records to all authenticated users.
-- 2. Drop the over-broad UNIQUE(period) on payroll_runs and replace with
--    a compound constraint that allows multiple segments per period.
-- 3. Add NOT NULL to audit_logs.created_at (hash-chain integrity).
--
-- Idempotent — safe under supabase db push.
-- =============================================================================

-- ── 1. Fix broken RLS SELECT policies ──────────────────────────────────────

-- 1a. disciplinary_records (admin-only visibility)
DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema='public' AND table_name='disciplinary_records') THEN
    DROP POLICY IF EXISTS "Employees can read own disciplinary records" ON public.disciplinary_records;
    CREATE POLICY "Employees can read own disciplinary records"
      ON public.disciplinary_records FOR SELECT TO authenticated
      USING (
        employee_id = auth.uid()
        OR public.current_user_role() IN ('super_admin', 'admin')
      );
  END IF;
END $$;

-- 1b. employee_loans (finance can also see)
DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema='public' AND table_name='employee_loans') THEN
    DROP POLICY IF EXISTS "Employees can read own loans" ON public.employee_loans;
    CREATE POLICY "Employees can read own loans"
      ON public.employee_loans FOR SELECT TO authenticated
      USING (
        employee_id = auth.uid()
        OR public.current_user_role() IN ('super_admin', 'admin', 'finance')
      );
  END IF;
END $$;

-- 1c. training_records
DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema='public' AND table_name='training_records') THEN
    DROP POLICY IF EXISTS "Users can read own training records" ON public.training_records;
    CREATE POLICY "Users can read own training records"
      ON public.training_records FOR SELECT TO authenticated
      USING (
        employee_id = auth.uid()
        OR public.current_user_role() IN ('super_admin', 'admin', 'finance', 'operations')
      );
  END IF;
END $$;

-- 1d. employee_benefits
DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema='public' AND table_name='employee_benefits') THEN
    DROP POLICY IF EXISTS "Users can read own benefits" ON public.employee_benefits;
    CREATE POLICY "Users can read own benefits"
      ON public.employee_benefits FOR SELECT TO authenticated
      USING (
        employee_id = auth.uid()
        OR public.current_user_role() IN ('super_admin', 'admin', 'finance', 'operations')
      );
  END IF;
END $$;

-- 1e. onboarding_checklists
DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema='public' AND table_name='onboarding_checklists') THEN
    DROP POLICY IF EXISTS "Users can read own checklists" ON public.onboarding_checklists;
    CREATE POLICY "Users can read own checklists"
      ON public.onboarding_checklists FOR SELECT TO authenticated
      USING (
        employee_id = auth.uid()
        OR public.current_user_role() IN ('super_admin', 'admin', 'finance', 'operations')
      );
  END IF;
END $$;

-- 1f. attendance_records
DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema='public' AND table_name='attendance_records') THEN
    DROP POLICY IF EXISTS "Employees can read own attendance" ON public.attendance_records;
    CREATE POLICY "Employees can read own attendance"
      ON public.attendance_records FOR SELECT TO authenticated
      USING (
        employee_id = auth.uid()
        OR public.current_user_role() IN ('super_admin', 'admin', 'finance', 'operations')
      );
  END IF;
END $$;

-- ── 2. Fix payroll_runs unique constraint for segments ─────────────────────

-- Drop the over-broad UNIQUE(period) that prevents multiple segments.
ALTER TABLE payroll_runs DROP CONSTRAINT IF EXISTS payroll_runs_period_key;

-- For runs WITHOUT a segment (legacy / "all staff"), period must still be
-- unique — two un-segmented drafts for the same month is still a collision.
CREATE UNIQUE INDEX IF NOT EXISTS payroll_runs_period_no_segment_uniq
  ON payroll_runs (period)
  WHERE payroll_segment_id IS NULL;

-- For segmented runs, (period, payroll_segment_id) must be unique.
CREATE UNIQUE INDEX IF NOT EXISTS payroll_runs_period_segment_uniq
  ON payroll_runs (period, payroll_segment_id)
  WHERE payroll_segment_id IS NOT NULL;

-- ── 3. audit_logs.created_at NOT NULL ──────────────────────────────────────

UPDATE audit_logs SET created_at = now() WHERE created_at IS NULL;
ALTER TABLE audit_logs ALTER COLUMN created_at SET NOT NULL;
