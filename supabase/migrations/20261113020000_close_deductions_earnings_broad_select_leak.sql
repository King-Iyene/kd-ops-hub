-- ═══════════════════════════════════════════════════════════════════════
-- Close a live PII/financial leak on employee_deductions — the same class
-- of bug as the profiles leak fixed in 20261112010000, found by a second-
-- pass forensic audit.
-- ═══════════════════════════════════════════════════════════════════════
--
-- (employee_earnings gets the same tightened policy directly in
-- 20261113030000 — that migration discovered the table had never actually
-- been created despite schema_migrations claiming otherwise, so there was
-- no live broad policy on it to close; it's created correctly-scoped from
-- the start there instead of being fixed here.)
--
-- employee_deductions was created with `FOR SELECT TO authenticated
-- USING (true)`, commented "payroll view needs all employees' deductions"
-- — but every actual read call site (src/pages/EmployeeProfile.tsx,
-- Payroll.tsx, ContractorProfile.tsx) lives behind a route already gated
-- to MANAGER_ROLES/APPROVER_ROLES (super_admin/admin/finance/operations),
-- so the broad policy was never needed for the UI to work — it just also
-- let ANY authenticated user (e.g. a driver or field_staff) run
-- `supabase.from('employee_deductions').select('*')` directly from the
-- browser console and read every other employee's loan repayments,
-- garnishments, salary advances, and bonuses.
--
-- Fix: scope SELECT to the row's own entity (entity_id = auth.uid(), for
-- if/when a self-service "my deductions" view is ever added) OR a
-- finance/admin/super_admin role — mirrors profiles_read_own +
-- profiles_read_managers. No frontend change needed: every current call
-- site already runs as a qualifying role.
-- ═══════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Authenticated can read deductions" ON public.employee_deductions;

CREATE POLICY "employee_deductions_read_own_or_finance"
  ON public.employee_deductions
  FOR SELECT
  TO authenticated
  USING (
    entity_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('super_admin', 'admin', 'finance')
        AND status = 'active'
    )
  );
