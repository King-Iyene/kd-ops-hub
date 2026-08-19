-- CRITICAL: Replace blanket 'any authenticated user = full CRUD' on 15 HR tables
-- with proper role-scoped, ownership-scoped policies.
--
-- Pattern: employees can read/insert their own rows; only admin/super_admin/HR
-- can update status/approval fields; no blanket DELETE on audit-relevant tables.

-- ============================================================================
-- Helper: reusable role check (avoids repeating the subselect in every policy)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.current_user_is_hr_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND role IN ('super_admin', 'admin')
  );
$$;

-- ============================================================================
-- 1. hr_letters — employee can read own; admin can CRUD
-- ============================================================================
DROP POLICY IF EXISTS hr_letters_auth ON public.hr_letters;

CREATE POLICY hr_letters_select ON public.hr_letters
  FOR SELECT USING (
    employee_id = auth.uid()
    OR public.current_user_is_hr_admin()
  );

CREATE POLICY hr_letters_insert ON public.hr_letters
  FOR INSERT WITH CHECK (public.current_user_is_hr_admin());

CREATE POLICY hr_letters_update ON public.hr_letters
  FOR UPDATE USING (public.current_user_is_hr_admin());

CREATE POLICY hr_letters_delete ON public.hr_letters
  FOR DELETE USING (public.current_user_is_hr_admin());

-- ============================================================================
-- 2. grievances — reporter can read/insert own; admin can manage
-- ============================================================================
DROP POLICY IF EXISTS grievances_auth ON public.grievances;

CREATE POLICY grievances_select ON public.grievances
  FOR SELECT USING (
    reporter_id = auth.uid()
    OR assigned_to = auth.uid()
    OR public.current_user_is_hr_admin()
  );

CREATE POLICY grievances_insert ON public.grievances
  FOR INSERT WITH CHECK (reporter_id = auth.uid());

CREATE POLICY grievances_update ON public.grievances
  FOR UPDATE USING (
    assigned_to = auth.uid()
    OR public.current_user_is_hr_admin()
  );

-- No DELETE on grievances — evidentiary record

-- ============================================================================
-- 3. surveys — creator/admin can manage; everyone can read
-- ============================================================================
DROP POLICY IF EXISTS surveys_auth ON public.surveys;

CREATE POLICY surveys_select ON public.surveys
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY surveys_insert ON public.surveys
  FOR INSERT WITH CHECK (public.current_user_is_hr_admin());

CREATE POLICY surveys_update ON public.surveys
  FOR UPDATE USING (
    created_by = auth.uid()
    OR public.current_user_is_hr_admin()
  );

CREATE POLICY surveys_delete ON public.surveys
  FOR DELETE USING (public.current_user_is_hr_admin());

-- ============================================================================
-- 4. survey_questions — tied to survey; admin manages
-- ============================================================================
DROP POLICY IF EXISTS survey_questions_auth ON public.survey_questions;

CREATE POLICY survey_questions_select ON public.survey_questions
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY survey_questions_insert ON public.survey_questions
  FOR INSERT WITH CHECK (public.current_user_is_hr_admin());

CREATE POLICY survey_questions_update ON public.survey_questions
  FOR UPDATE USING (public.current_user_is_hr_admin());

CREATE POLICY survey_questions_delete ON public.survey_questions
  FOR DELETE USING (public.current_user_is_hr_admin());

-- ============================================================================
-- 5. survey_responses — respondent can insert own; admin can read all
-- ============================================================================
DROP POLICY IF EXISTS survey_responses_auth ON public.survey_responses;

CREATE POLICY survey_responses_select ON public.survey_responses
  FOR SELECT USING (
    respondent_id = auth.uid()
    OR public.current_user_is_hr_admin()
  );

CREATE POLICY survey_responses_insert ON public.survey_responses
  FOR INSERT WITH CHECK (respondent_id = auth.uid());

-- No UPDATE or DELETE on survey_responses — audit trail

-- ============================================================================
-- 6. staff_loans — employee reads own; admin/finance manages
-- ============================================================================
DROP POLICY IF EXISTS staff_loans_auth ON public.staff_loans;

CREATE POLICY staff_loans_select ON public.staff_loans
  FOR SELECT USING (
    employee_id = auth.uid()
    OR (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('super_admin', 'admin', 'finance')
  );

CREATE POLICY staff_loans_insert ON public.staff_loans
  FOR INSERT WITH CHECK (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('super_admin', 'admin', 'finance')
  );

CREATE POLICY staff_loans_update ON public.staff_loans
  FOR UPDATE USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('super_admin', 'admin', 'finance')
  );

-- ============================================================================
-- 7. staff_loan_repayments — employee reads own loan's repayments; admin/finance manages
-- ============================================================================
DROP POLICY IF EXISTS staff_loan_repayments_auth ON public.staff_loan_repayments;

CREATE POLICY staff_loan_repayments_select ON public.staff_loan_repayments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.staff_loans sl
      WHERE sl.id = staff_loan_repayments.loan_id
      AND (sl.employee_id = auth.uid()
           OR (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('super_admin', 'admin', 'finance'))
    )
  );

CREATE POLICY staff_loan_repayments_insert ON public.staff_loan_repayments
  FOR INSERT WITH CHECK (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('super_admin', 'admin', 'finance')
  );

CREATE POLICY staff_loan_repayments_update ON public.staff_loan_repayments
  FOR UPDATE USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('super_admin', 'admin', 'finance')
  );

-- ============================================================================
-- 8. shift_definitions — admin manages; everyone reads
-- ============================================================================
DROP POLICY IF EXISTS shift_definitions_auth ON public.shift_definitions;

CREATE POLICY shift_definitions_select ON public.shift_definitions
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY shift_definitions_insert ON public.shift_definitions
  FOR INSERT WITH CHECK (public.current_user_is_hr_admin());

CREATE POLICY shift_definitions_update ON public.shift_definitions
  FOR UPDATE USING (public.current_user_is_hr_admin());

CREATE POLICY shift_definitions_delete ON public.shift_definitions
  FOR DELETE USING (public.current_user_is_hr_admin());

-- ============================================================================
-- 9. shift_assignments — employee reads own; admin manages
-- ============================================================================
DROP POLICY IF EXISTS shift_assignments_auth ON public.shift_assignments;

CREATE POLICY shift_assignments_select ON public.shift_assignments
  FOR SELECT USING (
    employee_id = auth.uid()
    OR public.current_user_is_hr_admin()
  );

CREATE POLICY shift_assignments_insert ON public.shift_assignments
  FOR INSERT WITH CHECK (public.current_user_is_hr_admin());

CREATE POLICY shift_assignments_update ON public.shift_assignments
  FOR UPDATE USING (public.current_user_is_hr_admin());

CREATE POLICY shift_assignments_delete ON public.shift_assignments
  FOR DELETE USING (public.current_user_is_hr_admin());

-- ============================================================================
-- 10. succession_plans — admin only
-- ============================================================================
DROP POLICY IF EXISTS succession_plans_auth ON public.succession_plans;

CREATE POLICY succession_plans_select ON public.succession_plans
  FOR SELECT USING (public.current_user_is_hr_admin());

CREATE POLICY succession_plans_insert ON public.succession_plans
  FOR INSERT WITH CHECK (public.current_user_is_hr_admin());

CREATE POLICY succession_plans_update ON public.succession_plans
  FOR UPDATE USING (public.current_user_is_hr_admin());

CREATE POLICY succession_plans_delete ON public.succession_plans
  FOR DELETE USING (public.current_user_is_hr_admin());

-- ============================================================================
-- 11. succession_candidates — admin only
-- ============================================================================
DROP POLICY IF EXISTS succession_candidates_auth ON public.succession_candidates;

CREATE POLICY succession_candidates_select ON public.succession_candidates
  FOR SELECT USING (public.current_user_is_hr_admin());

CREATE POLICY succession_candidates_insert ON public.succession_candidates
  FOR INSERT WITH CHECK (public.current_user_is_hr_admin());

CREATE POLICY succession_candidates_update ON public.succession_candidates
  FOR UPDATE USING (public.current_user_is_hr_admin());

CREATE POLICY succession_candidates_delete ON public.succession_candidates
  FOR DELETE USING (public.current_user_is_hr_admin());

-- ============================================================================
-- 12. handbook_policies — everyone reads; admin manages
-- ============================================================================
DROP POLICY IF EXISTS handbook_policies_auth ON public.handbook_policies;

CREATE POLICY handbook_policies_select ON public.handbook_policies
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY handbook_policies_insert ON public.handbook_policies
  FOR INSERT WITH CHECK (public.current_user_is_hr_admin());

CREATE POLICY handbook_policies_update ON public.handbook_policies
  FOR UPDATE USING (public.current_user_is_hr_admin());

CREATE POLICY handbook_policies_delete ON public.handbook_policies
  FOR DELETE USING (public.current_user_is_hr_admin());

-- ============================================================================
-- 13. policy_acknowledgments — employee inserts/reads own; admin reads all
-- ============================================================================
DROP POLICY IF EXISTS policy_acknowledgments_auth ON public.policy_acknowledgments;

CREATE POLICY policy_acknowledgments_select ON public.policy_acknowledgments
  FOR SELECT USING (
    employee_id = auth.uid()
    OR public.current_user_is_hr_admin()
  );

CREATE POLICY policy_acknowledgments_insert ON public.policy_acknowledgments
  FOR INSERT WITH CHECK (employee_id = auth.uid());

-- No UPDATE or DELETE — acknowledgment is immutable evidence

-- ============================================================================
-- 14. timesheets — employee reads/inserts own; admin manages
-- ============================================================================
DROP POLICY IF EXISTS timesheets_auth ON public.timesheets;

CREATE POLICY timesheets_select ON public.timesheets
  FOR SELECT USING (
    employee_id = auth.uid()
    OR public.current_user_is_hr_admin()
  );

CREATE POLICY timesheets_insert ON public.timesheets
  FOR INSERT WITH CHECK (employee_id = auth.uid());

CREATE POLICY timesheets_update ON public.timesheets
  FOR UPDATE USING (
    (employee_id = auth.uid() AND status = 'draft')
    OR public.current_user_is_hr_admin()
  );

-- ============================================================================
-- 15. timesheet_entries — follows parent timesheet access
-- ============================================================================
DROP POLICY IF EXISTS timesheet_entries_auth ON public.timesheet_entries;

CREATE POLICY timesheet_entries_select ON public.timesheet_entries
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.timesheets t
      WHERE t.id = timesheet_entries.timesheet_id
      AND (t.employee_id = auth.uid() OR public.current_user_is_hr_admin())
    )
  );

CREATE POLICY timesheet_entries_insert ON public.timesheet_entries
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.timesheets t
      WHERE t.id = timesheet_entries.timesheet_id
      AND t.employee_id = auth.uid()
    )
  );

CREATE POLICY timesheet_entries_update ON public.timesheet_entries
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.timesheets t
      WHERE t.id = timesheet_entries.timesheet_id
      AND ((t.employee_id = auth.uid() AND t.status = 'draft') OR public.current_user_is_hr_admin())
    )
  );
