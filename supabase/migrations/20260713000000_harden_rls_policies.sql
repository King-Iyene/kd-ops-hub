-- Security hardening: tighten overly-permissive RLS policies
--
-- SAFE TO RUN IN ANY ORDER — uses conditional blocks so it silently skips
-- tables that don't exist yet (e.g. if Phase 4-6 migrations haven't been
-- applied to this environment). Re-running is idempotent.

-- ── INVOICES ─────────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema='public' AND table_name='invoices') THEN
    DROP POLICY IF EXISTS "Finance can insert invoices"     ON public.invoices;
    DROP POLICY IF EXISTS "Finance can update invoices"     ON public.invoices;
    DROP POLICY IF EXISTS "Finance can delete invoices"     ON public.invoices;
    CREATE POLICY "Finance can insert invoices"
      ON public.invoices FOR INSERT TO authenticated
      WITH CHECK (public.current_user_role() IN ('super_admin','admin','finance'));
    CREATE POLICY "Finance can update invoices"
      ON public.invoices FOR UPDATE TO authenticated
      USING (public.current_user_role() IN ('super_admin','admin','finance'));
    CREATE POLICY "Finance can delete invoices"
      ON public.invoices FOR DELETE TO authenticated
      USING (public.current_user_role() IN ('super_admin','admin','finance'));
  END IF;
END $$;

-- ── VENDORS ──────────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema='public' AND table_name='vendors') THEN
    DROP POLICY IF EXISTS "Managers can insert vendors"  ON public.vendors;
    DROP POLICY IF EXISTS "Managers can update vendors"  ON public.vendors;
    DROP POLICY IF EXISTS "Managers can delete vendors"  ON public.vendors;
    CREATE POLICY "Managers can insert vendors"
      ON public.vendors FOR INSERT TO authenticated
      WITH CHECK (public.current_user_role() IN ('super_admin','admin','finance','operations'));
    CREATE POLICY "Managers can update vendors"
      ON public.vendors FOR UPDATE TO authenticated
      USING (public.current_user_role() IN ('super_admin','admin','finance','operations'));
    CREATE POLICY "Managers can delete vendors"
      ON public.vendors FOR DELETE TO authenticated
      USING (public.current_user_role() IN ('super_admin','admin','finance','operations'));
  END IF;
END $$;

-- ── CLIENTS ──────────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema='public' AND table_name='clients') THEN
    DROP POLICY IF EXISTS "Managers can insert clients"  ON public.clients;
    DROP POLICY IF EXISTS "Managers can update clients"  ON public.clients;
    DROP POLICY IF EXISTS "Managers can delete clients"  ON public.clients;
    CREATE POLICY "Managers can insert clients"
      ON public.clients FOR INSERT TO authenticated
      WITH CHECK (public.current_user_role() IN ('super_admin','admin','finance','operations'));
    CREATE POLICY "Managers can update clients"
      ON public.clients FOR UPDATE TO authenticated
      USING (public.current_user_role() IN ('super_admin','admin','finance','operations'));
    CREATE POLICY "Managers can delete clients"
      ON public.clients FOR DELETE TO authenticated
      USING (public.current_user_role() IN ('super_admin','admin','finance','operations'));
  END IF;
END $$;

-- ── PETTY CASH ────────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema='public' AND table_name='petty_cash_funds') THEN
    DROP POLICY IF EXISTS "Finance can manage petty cash funds" ON public.petty_cash_funds;
    CREATE POLICY "Finance can manage petty cash funds"
      ON public.petty_cash_funds FOR ALL TO authenticated
      USING (public.current_user_role() IN ('super_admin','admin','finance'));
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema='public' AND table_name='petty_cash_entries') THEN
    DROP POLICY IF EXISTS "Authenticated users can insert petty cash entries" ON public.petty_cash_entries;
    DROP POLICY IF EXISTS "Finance can insert petty cash entries"             ON public.petty_cash_entries;
    DROP POLICY IF EXISTS "Finance can update petty cash entries"             ON public.petty_cash_entries;
    DROP POLICY IF EXISTS "Finance can delete petty cash entries"             ON public.petty_cash_entries;
    CREATE POLICY "Finance can insert petty cash entries"
      ON public.petty_cash_entries FOR INSERT TO authenticated
      WITH CHECK (public.current_user_role() IN ('super_admin','admin','finance'));
    CREATE POLICY "Finance can update petty cash entries"
      ON public.petty_cash_entries FOR UPDATE TO authenticated
      USING (public.current_user_role() IN ('super_admin','admin','finance'));
    CREATE POLICY "Finance can delete petty cash entries"
      ON public.petty_cash_entries FOR DELETE TO authenticated
      USING (public.current_user_role() IN ('super_admin','admin','finance'));
  END IF;
END $$;

-- ── PERFORMANCE REVIEWS ───────────────────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema='public' AND table_name='review_cycles') THEN
    DROP POLICY IF EXISTS "Managers can manage review cycles" ON public.review_cycles;
    CREATE POLICY "Managers can manage review cycles"
      ON public.review_cycles FOR ALL TO authenticated
      USING (public.current_user_role() IN ('super_admin','admin','finance','operations'));
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema='public' AND table_name='performance_reviews') THEN
    DROP POLICY IF EXISTS "Users can insert own reviews"                                       ON public.performance_reviews;
    DROP POLICY IF EXISTS "Managers can insert performance reviews"                            ON public.performance_reviews;
    DROP POLICY IF EXISTS "Reviewers can update their own reviews before acknowledgement"      ON public.performance_reviews;
    DROP POLICY IF EXISTS "Reviewers can update their own reviews"                             ON public.performance_reviews;
    DROP POLICY IF EXISTS "Managers can delete performance reviews"                            ON public.performance_reviews;
    CREATE POLICY "Managers can insert performance reviews"
      ON public.performance_reviews FOR INSERT TO authenticated
      WITH CHECK (public.current_user_role() IN ('super_admin','admin','finance','operations'));
    CREATE POLICY "Reviewers can update their own reviews"
      ON public.performance_reviews FOR UPDATE TO authenticated
      USING (
        reviewer_id = auth.uid()
        OR public.current_user_role() IN ('super_admin','admin','finance','operations')
      );
    CREATE POLICY "Managers can delete performance reviews"
      ON public.performance_reviews FOR DELETE TO authenticated
      USING (public.current_user_role() IN ('super_admin','admin','finance','operations'));
  END IF;
END $$;

-- ── ASSETS ────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema='public' AND table_name='assets') THEN
    DROP POLICY IF EXISTS "Managers can insert assets"  ON public.assets;
    DROP POLICY IF EXISTS "Managers can update assets"  ON public.assets;
    DROP POLICY IF EXISTS "Finance can insert assets"   ON public.assets;
    DROP POLICY IF EXISTS "Finance can update assets"   ON public.assets;
    DROP POLICY IF EXISTS "Finance can delete assets"   ON public.assets;
    CREATE POLICY "Finance can insert assets"
      ON public.assets FOR INSERT TO authenticated
      WITH CHECK (public.current_user_role() IN ('super_admin','admin','finance'));
    CREATE POLICY "Finance can update assets"
      ON public.assets FOR UPDATE TO authenticated
      USING (public.current_user_role() IN ('super_admin','admin','finance'));
    CREATE POLICY "Finance can delete assets"
      ON public.assets FOR DELETE TO authenticated
      USING (public.current_user_role() IN ('super_admin','admin','finance'));
  END IF;
END $$;

-- ── EMPLOYEE LOANS ────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema='public' AND table_name='employee_loans') THEN
    DROP POLICY IF EXISTS "Finance can manage loans" ON public.employee_loans;
    CREATE POLICY "Finance can manage loans"
      ON public.employee_loans FOR ALL TO authenticated
      USING (public.current_user_role() IN ('super_admin','admin','finance'));
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema='public' AND table_name='loan_repayments') THEN
    DROP POLICY IF EXISTS "Finance can manage repayments" ON public.loan_repayments;
    CREATE POLICY "Finance can manage repayments"
      ON public.loan_repayments FOR ALL TO authenticated
      USING (public.current_user_role() IN ('super_admin','admin','finance'));
  END IF;
END $$;

-- ── TRAINING RECORDS ──────────────────────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema='public' AND table_name='training_records') THEN
    DROP POLICY IF EXISTS "Managers can insert training records" ON public.training_records;
    DROP POLICY IF EXISTS "Managers can update training records" ON public.training_records;
    DROP POLICY IF EXISTS "Managers can delete training records" ON public.training_records;
    CREATE POLICY "Managers can insert training records"
      ON public.training_records FOR INSERT TO authenticated
      WITH CHECK (public.current_user_role() IN ('super_admin','admin','finance','operations'));
    CREATE POLICY "Managers can update training records"
      ON public.training_records FOR UPDATE TO authenticated
      USING (public.current_user_role() IN ('super_admin','admin','finance','operations'));
    CREATE POLICY "Managers can delete training records"
      ON public.training_records FOR DELETE TO authenticated
      USING (public.current_user_role() IN ('super_admin','admin','finance','operations'));
  END IF;
END $$;

-- ── PROJECTS & MILESTONES ─────────────────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema='public' AND table_name='projects') THEN
    DROP POLICY IF EXISTS "Managers can manage projects"   ON public.projects;
    CREATE POLICY "Managers can manage projects"
      ON public.projects FOR ALL TO authenticated
      USING (public.current_user_role() IN ('super_admin','admin','finance','operations'));
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema='public' AND table_name='project_milestones') THEN
    DROP POLICY IF EXISTS "Managers can manage milestones" ON public.project_milestones;
    CREATE POLICY "Managers can manage milestones"
      ON public.project_milestones FOR ALL TO authenticated
      USING (public.current_user_role() IN ('super_admin','admin','finance','operations'));
  END IF;
END $$;

-- ── EMPLOYEE BENEFITS ─────────────────────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema='public' AND table_name='employee_benefits') THEN
    DROP POLICY IF EXISTS "Managers can manage benefits" ON public.employee_benefits;
    CREATE POLICY "Managers can manage benefits"
      ON public.employee_benefits FOR ALL TO authenticated
      USING (public.current_user_role() IN ('super_admin','admin','finance','operations'));
  END IF;
END $$;

-- ── ONBOARDING ────────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema='public' AND table_name='onboarding_checklists') THEN
    DROP POLICY IF EXISTS "Managers can manage checklists" ON public.onboarding_checklists;
    CREATE POLICY "Managers can manage checklists"
      ON public.onboarding_checklists FOR ALL TO authenticated
      USING (public.current_user_role() IN ('super_admin','admin','finance','operations'));
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema='public' AND table_name='onboarding_items') THEN
    DROP POLICY IF EXISTS "Managers can manage checklist items" ON public.onboarding_items;
    CREATE POLICY "Managers can manage checklist items"
      ON public.onboarding_items FOR ALL TO authenticated
      USING (public.current_user_role() IN ('super_admin','admin','finance','operations'));
  END IF;
END $$;

-- ── RECRUITMENT ───────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema='public' AND table_name='job_openings') THEN
    DROP POLICY IF EXISTS "Managers can manage job openings" ON public.job_openings;
    CREATE POLICY "Managers can manage job openings"
      ON public.job_openings FOR ALL TO authenticated
      USING (public.current_user_role() IN ('super_admin','admin','finance','operations'));
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema='public' AND table_name='job_applicants') THEN
    DROP POLICY IF EXISTS "Managers can manage applicants" ON public.job_applicants;
    CREATE POLICY "Managers can manage applicants"
      ON public.job_applicants FOR ALL TO authenticated
      USING (public.current_user_role() IN ('super_admin','admin','finance','operations'));
  END IF;
END $$;

-- ── ATTENDANCE ────────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema='public' AND table_name='attendance_records') THEN
    DROP POLICY IF EXISTS "Managers can manage attendance" ON public.attendance_records;
    CREATE POLICY "Managers can manage attendance"
      ON public.attendance_records FOR ALL TO authenticated
      USING (public.current_user_role() IN ('super_admin','admin','finance','operations'));
  END IF;
END $$;

-- ── DISCIPLINARY ─────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema='public' AND table_name='disciplinary_records') THEN
    DROP POLICY IF EXISTS "Managers can manage disciplinary records" ON public.disciplinary_records;
    DROP POLICY IF EXISTS "Admins can manage disciplinary records"   ON public.disciplinary_records;
    CREATE POLICY "Admins can manage disciplinary records"
      ON public.disciplinary_records FOR ALL TO authenticated
      USING (public.current_user_role() IN ('super_admin','admin'));
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema='public' AND table_name='disciplinary_responses') THEN
    DROP POLICY IF EXISTS "Managers can manage disciplinary responses" ON public.disciplinary_responses;
    DROP POLICY IF EXISTS "Admins can manage disciplinary responses"   ON public.disciplinary_responses;
    CREATE POLICY "Admins can manage disciplinary responses"
      ON public.disciplinary_responses FOR ALL TO authenticated
      USING (public.current_user_role() IN ('super_admin','admin'));
  END IF;
END $$;
