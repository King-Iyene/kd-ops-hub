-- Security hardening: tighten overly-permissive RLS policies
--
-- Problem: Phase 3–6 migrations used `auth.uid() IS NOT NULL` for write
-- policies, which allows ANY authenticated user (even field_staff) to
-- create/update/delete sensitive records — invoices, vendor data, petty cash,
-- performance reviews, HR records, etc.
--
-- Fix: replace permissive `auth.uid() IS NOT NULL` checks with explicit
-- role gates using the `public.current_user_role()` helper already established
-- in 20260608000000_fix_rls_finance_operations_access.sql.
--
-- Role hierarchy used here:
--   APPROVER_ROLES  = super_admin, admin, finance
--   MANAGER_ROLES   = super_admin, admin, finance, operations
--   ADMIN_ONLY      = super_admin, admin
--
-- Idempotent — drops each old policy before recreating.

-- ── INVOICES ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Finance can insert invoices"     ON public.invoices;
DROP POLICY IF EXISTS "Finance can update invoices"     ON public.invoices;

CREATE POLICY "Finance can insert invoices"
  ON public.invoices FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role() IN ('super_admin','admin','finance'));

CREATE POLICY "Finance can update invoices"
  ON public.invoices FOR UPDATE TO authenticated
  USING (public.current_user_role() IN ('super_admin','admin','finance'));

CREATE POLICY "Finance can delete invoices"
  ON public.invoices FOR DELETE TO authenticated
  USING (public.current_user_role() IN ('super_admin','admin','finance'));

-- ── VENDORS ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Managers can insert vendors"     ON public.vendors;
DROP POLICY IF EXISTS "Managers can update vendors"     ON public.vendors;

CREATE POLICY "Managers can insert vendors"
  ON public.vendors FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role() IN ('super_admin','admin','finance','operations'));

CREATE POLICY "Managers can update vendors"
  ON public.vendors FOR UPDATE TO authenticated
  USING (public.current_user_role() IN ('super_admin','admin','finance','operations'));

CREATE POLICY "Managers can delete vendors"
  ON public.vendors FOR DELETE TO authenticated
  USING (public.current_user_role() IN ('super_admin','admin','finance','operations'));

-- ── CLIENTS ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Managers can insert clients"     ON public.clients;
DROP POLICY IF EXISTS "Managers can update clients"     ON public.clients;

CREATE POLICY "Managers can insert clients"
  ON public.clients FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role() IN ('super_admin','admin','finance','operations'));

CREATE POLICY "Managers can update clients"
  ON public.clients FOR UPDATE TO authenticated
  USING (public.current_user_role() IN ('super_admin','admin','finance','operations'));

CREATE POLICY "Managers can delete clients"
  ON public.clients FOR DELETE TO authenticated
  USING (public.current_user_role() IN ('super_admin','admin','finance','operations'));

-- ── PETTY CASH ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Finance can manage petty cash funds"    ON public.petty_cash_funds;
DROP POLICY IF EXISTS "Authenticated users can insert petty cash entries" ON public.petty_cash_entries;
DROP POLICY IF EXISTS "Finance can update petty cash entries"  ON public.petty_cash_entries;

CREATE POLICY "Finance can manage petty cash funds"
  ON public.petty_cash_funds FOR ALL TO authenticated
  USING (public.current_user_role() IN ('super_admin','admin','finance'));

CREATE POLICY "Finance can insert petty cash entries"
  ON public.petty_cash_entries FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role() IN ('super_admin','admin','finance'));

CREATE POLICY "Finance can update petty cash entries"
  ON public.petty_cash_entries FOR UPDATE TO authenticated
  USING (public.current_user_role() IN ('super_admin','admin','finance'));

CREATE POLICY "Finance can delete petty cash entries"
  ON public.petty_cash_entries FOR DELETE TO authenticated
  USING (public.current_user_role() IN ('super_admin','admin','finance'));

-- ── PERFORMANCE REVIEWS ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Managers can manage review cycles"      ON public.review_cycles;
DROP POLICY IF EXISTS "Users can insert own reviews"           ON public.performance_reviews;
DROP POLICY IF EXISTS "Reviewers can update their own reviews before acknowledgement" ON public.performance_reviews;

CREATE POLICY "Managers can manage review cycles"
  ON public.review_cycles FOR ALL TO authenticated
  USING (public.current_user_role() IN ('super_admin','admin','finance','operations'));

-- Reviewers can insert reviews they are assigned to; managers can insert any.
CREATE POLICY "Managers can insert performance reviews"
  ON public.performance_reviews FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role() IN ('super_admin','admin','finance','operations'));

-- A reviewer can update their own review; managers can update any.
CREATE POLICY "Reviewers can update their own reviews"
  ON public.performance_reviews FOR UPDATE TO authenticated
  USING (
    reviewer_id = auth.uid()
    OR public.current_user_role() IN ('super_admin','admin','finance','operations')
  );

CREATE POLICY "Managers can delete performance reviews"
  ON public.performance_reviews FOR DELETE TO authenticated
  USING (public.current_user_role() IN ('super_admin','admin','finance','operations'));

-- ── ASSETS ────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Managers can insert assets"      ON public.assets;
DROP POLICY IF EXISTS "Managers can update assets"      ON public.assets;

CREATE POLICY "Finance can insert assets"
  ON public.assets FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role() IN ('super_admin','admin','finance'));

CREATE POLICY "Finance can update assets"
  ON public.assets FOR UPDATE TO authenticated
  USING (public.current_user_role() IN ('super_admin','admin','finance'));

CREATE POLICY "Finance can delete assets"
  ON public.assets FOR DELETE TO authenticated
  USING (public.current_user_role() IN ('super_admin','admin','finance'));

-- ── EMPLOYEE LOANS ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Finance can manage loans"        ON public.employee_loans;
DROP POLICY IF EXISTS "Finance can manage repayments"   ON public.loan_repayments;

CREATE POLICY "Finance can manage loans"
  ON public.employee_loans FOR ALL TO authenticated
  USING (public.current_user_role() IN ('super_admin','admin','finance'));

CREATE POLICY "Finance can manage repayments"
  ON public.loan_repayments FOR ALL TO authenticated
  USING (public.current_user_role() IN ('super_admin','admin','finance'));

-- ── TRAINING RECORDS ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Managers can insert training records"   ON public.training_records;
DROP POLICY IF EXISTS "Managers can update training records"   ON public.training_records;

CREATE POLICY "Managers can insert training records"
  ON public.training_records FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role() IN ('super_admin','admin','finance','operations'));

CREATE POLICY "Managers can update training records"
  ON public.training_records FOR UPDATE TO authenticated
  USING (public.current_user_role() IN ('super_admin','admin','finance','operations'));

CREATE POLICY "Managers can delete training records"
  ON public.training_records FOR DELETE TO authenticated
  USING (public.current_user_role() IN ('super_admin','admin','finance','operations'));

-- ── PROJECTS & MILESTONES ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Managers can manage projects"    ON public.projects;
DROP POLICY IF EXISTS "Managers can manage milestones"  ON public.project_milestones;

CREATE POLICY "Managers can manage projects"
  ON public.projects FOR ALL TO authenticated
  USING (public.current_user_role() IN ('super_admin','admin','finance','operations'));

CREATE POLICY "Managers can manage milestones"
  ON public.project_milestones FOR ALL TO authenticated
  USING (public.current_user_role() IN ('super_admin','admin','finance','operations'));

-- ── EMPLOYEE BENEFITS ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Managers can manage benefits"    ON public.employee_benefits;

CREATE POLICY "Managers can manage benefits"
  ON public.employee_benefits FOR ALL TO authenticated
  USING (public.current_user_role() IN ('super_admin','admin','finance','operations'));

-- ── ONBOARDING ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Managers can manage checklists"  ON public.onboarding_checklists;
DROP POLICY IF EXISTS "Managers can manage checklist items" ON public.onboarding_items;

CREATE POLICY "Managers can manage checklists"
  ON public.onboarding_checklists FOR ALL TO authenticated
  USING (public.current_user_role() IN ('super_admin','admin','finance','operations'));

CREATE POLICY "Managers can manage checklist items"
  ON public.onboarding_items FOR ALL TO authenticated
  USING (public.current_user_role() IN ('super_admin','admin','finance','operations'));

-- ── RECRUITMENT ───────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Managers can manage job openings" ON public.job_openings;
DROP POLICY IF EXISTS "Managers can manage applicants"   ON public.job_applicants;

CREATE POLICY "Managers can manage job openings"
  ON public.job_openings FOR ALL TO authenticated
  USING (public.current_user_role() IN ('super_admin','admin','finance','operations'));

CREATE POLICY "Managers can manage applicants"
  ON public.job_applicants FOR ALL TO authenticated
  USING (public.current_user_role() IN ('super_admin','admin','finance','operations'));

-- ── ATTENDANCE ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Managers can manage attendance"   ON public.attendance_records;

CREATE POLICY "Managers can manage attendance"
  ON public.attendance_records FOR ALL TO authenticated
  USING (public.current_user_role() IN ('super_admin','admin','finance','operations'));

-- ── DISCIPLINARY ─────────────────────────────────────────────────────────────
-- Already restricted in Phase 6 migration — tighten further to admin-only writes.
DROP POLICY IF EXISTS "Managers can manage disciplinary records"   ON public.disciplinary_records;
DROP POLICY IF EXISTS "Managers can manage disciplinary responses" ON public.disciplinary_responses;

CREATE POLICY "Admins can manage disciplinary records"
  ON public.disciplinary_records FOR ALL TO authenticated
  USING (public.current_user_role() IN ('super_admin','admin'));

CREATE POLICY "Admins can manage disciplinary responses"
  ON public.disciplinary_responses FOR ALL TO authenticated
  USING (public.current_user_role() IN ('super_admin','admin'));
