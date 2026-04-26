-- ─────────────────────────────────────────────────────────────────────────
-- PHASE 1 SECURITY HARDENING (P0)
--
-- Fixes the highest-priority issues found in the production-readiness +
-- security audits:
--   1. audit_logs RLS — block read by non-managers, block impersonation on insert
--   2. Wide-open RLS (USING (true)) on tasks, task_comments, approval_comments,
--      referrals, vehicle_maintenance, employee_deductions
--   3. Missing tables that the UI queries (silent failures): salary_increments,
--      revenue_entries; tags view aliases global_tags
--   4. webhook_idempotency table for the paystack-webhook edge function
--
-- Idempotent — safe to run more than once. Run in Supabase SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────

-- ── 1. AUDIT LOGS ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can view audit logs"     ON public.audit_logs;
DROP POLICY IF EXISTS "Authenticated can view audit logs"           ON public.audit_logs;
DROP POLICY IF EXISTS "Authenticated users can insert audit logs"   ON public.audit_logs;
DROP POLICY IF EXISTS "Authenticated can insert audit logs"         ON public.audit_logs;
DROP POLICY IF EXISTS "audit_logs_select_managers"                  ON public.audit_logs;
DROP POLICY IF EXISTS "audit_logs_insert_self_only"                 ON public.audit_logs;

CREATE POLICY "audit_logs_select_managers" ON public.audit_logs
  FOR SELECT TO authenticated
  USING (public.current_user_role() IN ('super_admin', 'admin', 'finance', 'operations'));

-- INSERT must have performed_by = auth.uid() (or NULL for system writes from
-- service-role). Stops contractors from injecting fake actions for someone else.
CREATE POLICY "audit_logs_insert_self_only" ON public.audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (performed_by = auth.uid() OR performed_by IS NULL);

-- ── 2. WIDE-OPEN POLICIES — REPLACE USING(true) WITH ROLE/OWNER GATES ──

-- Tasks: only the assignee, creator, or operations/admins.
DROP POLICY IF EXISTS "tasks_all"               ON public.tasks;
DROP POLICY IF EXISTS "tasks_all_authenticated" ON public.tasks;
DROP POLICY IF EXISTS "Authenticated can manage tasks" ON public.tasks;
DROP POLICY IF EXISTS "tasks_select" ON public.tasks;
DROP POLICY IF EXISTS "tasks_insert" ON public.tasks;
DROP POLICY IF EXISTS "tasks_update" ON public.tasks;
DROP POLICY IF EXISTS "tasks_delete" ON public.tasks;

CREATE POLICY "tasks_select" ON public.tasks
  FOR SELECT TO authenticated
  USING (
    assignee_id = auth.uid()
    OR created_by = auth.uid()
    OR public.current_user_role() IN ('super_admin', 'admin', 'operations')
  );
CREATE POLICY "tasks_insert" ON public.tasks
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    OR public.current_user_role() IN ('super_admin', 'admin', 'operations')
  );
CREATE POLICY "tasks_update" ON public.tasks
  FOR UPDATE TO authenticated
  USING (
    assignee_id = auth.uid()
    OR created_by = auth.uid()
    OR public.current_user_role() IN ('super_admin', 'admin', 'operations')
  );
CREATE POLICY "tasks_delete" ON public.tasks
  FOR DELETE TO authenticated
  USING (
    created_by = auth.uid()
    OR public.current_user_role() IN ('super_admin', 'admin')
  );

-- Task comments: visible to anyone who can see the parent task.
DROP POLICY IF EXISTS "task_comments_all"               ON public.task_comments;
DROP POLICY IF EXISTS "task_comments_all_authenticated" ON public.task_comments;
DROP POLICY IF EXISTS "task_comments_select"            ON public.task_comments;
DROP POLICY IF EXISTS "task_comments_insert"            ON public.task_comments;

CREATE POLICY "task_comments_select" ON public.task_comments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tasks t WHERE t.id = task_id AND (
        t.assignee_id = auth.uid() OR t.created_by = auth.uid()
        OR public.current_user_role() IN ('super_admin', 'admin', 'operations')
      )
    )
  );
CREATE POLICY "task_comments_insert" ON public.task_comments
  FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid());

-- Approval comments: only approvers.
DROP POLICY IF EXISTS "approval_comments_all"               ON public.approval_comments;
DROP POLICY IF EXISTS "approval_comments_all_authenticated" ON public.approval_comments;
DROP POLICY IF EXISTS "approval_comments_select"            ON public.approval_comments;
DROP POLICY IF EXISTS "approval_comments_insert"            ON public.approval_comments;

CREATE POLICY "approval_comments_select" ON public.approval_comments
  FOR SELECT TO authenticated
  USING (public.current_user_role() IN ('super_admin', 'admin', 'finance', 'operations'));
CREATE POLICY "approval_comments_insert" ON public.approval_comments
  FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND public.current_user_role() IN ('super_admin', 'admin', 'finance', 'operations')
  );

-- Referrals: scope to owner OR admin.
DROP POLICY IF EXISTS "referrals_write"  ON public.referrals;
DROP POLICY IF EXISTS "referrals_read"   ON public.referrals;
DROP POLICY IF EXISTS "referrals_select" ON public.referrals;
DROP POLICY IF EXISTS "referrals_modify" ON public.referrals;

CREATE POLICY "referrals_select" ON public.referrals
  FOR SELECT TO authenticated
  USING (
    referrer_id = auth.uid()
    OR public.current_user_role() IN ('super_admin', 'admin', 'finance')
  );
CREATE POLICY "referrals_modify" ON public.referrals
  FOR ALL TO authenticated
  USING (
    referrer_id = auth.uid()
    OR public.current_user_role() IN ('super_admin', 'admin')
  )
  WITH CHECK (
    referrer_id = auth.uid()
    OR public.current_user_role() IN ('super_admin', 'admin')
  );

-- Vehicle maintenance: read open (it's just service log info), write admins/operations.
DROP POLICY IF EXISTS "vehicle_maintenance_all"               ON public.vehicle_maintenance;
DROP POLICY IF EXISTS "vehicle_maintenance_all_authenticated" ON public.vehicle_maintenance;
DROP POLICY IF EXISTS "vehicle_maintenance_select"            ON public.vehicle_maintenance;
DROP POLICY IF EXISTS "vehicle_maintenance_modify"            ON public.vehicle_maintenance;

CREATE POLICY "vehicle_maintenance_select" ON public.vehicle_maintenance
  FOR SELECT TO authenticated
  USING (true);
CREATE POLICY "vehicle_maintenance_modify" ON public.vehicle_maintenance
  FOR ALL TO authenticated
  USING (public.current_user_role() IN ('super_admin', 'admin', 'operations'))
  WITH CHECK (public.current_user_role() IN ('super_admin', 'admin', 'operations'));

-- Employee deductions: own row OR admin/finance only.
DROP POLICY IF EXISTS "employee_deductions_select"               ON public.employee_deductions;
DROP POLICY IF EXISTS "employee_deductions_select_authenticated" ON public.employee_deductions;
DROP POLICY IF EXISTS "Authenticated can view employee_deductions" ON public.employee_deductions;

CREATE POLICY "employee_deductions_select" ON public.employee_deductions
  FOR SELECT TO authenticated
  USING (
    entity_id = auth.uid()
    OR public.current_user_role() IN ('super_admin', 'admin', 'finance')
  );

-- ── 3. MISSING TABLES & VIEW ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.salary_increments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  old_salary_ngn numeric(14,2) NOT NULL DEFAULT 0,
  new_salary_ngn numeric(14,2) NOT NULL DEFAULT 0,
  effective_date date NOT NULL DEFAULT CURRENT_DATE,
  reason text,
  approved_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS salary_increments_employee_idx
  ON public.salary_increments (employee_id, effective_date DESC);

ALTER TABLE public.salary_increments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "salary_increments_select" ON public.salary_increments;
CREATE POLICY "salary_increments_select" ON public.salary_increments
  FOR SELECT TO authenticated
  USING (
    employee_id = auth.uid()
    OR public.current_user_role() IN ('super_admin', 'admin', 'finance')
  );
DROP POLICY IF EXISTS "salary_increments_modify" ON public.salary_increments;
CREATE POLICY "salary_increments_modify" ON public.salary_increments
  FOR ALL TO authenticated
  USING (public.current_user_role() IN ('super_admin', 'admin', 'finance'))
  WITH CHECK (public.current_user_role() IN ('super_admin', 'admin', 'finance'));

CREATE TABLE IF NOT EXISTS public.revenue_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  amount_ngn numeric(14,2) NOT NULL DEFAULT 0,
  category text NOT NULL DEFAULT 'general',
  month text NOT NULL,                      -- YYYY-MM
  notes text,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT revenue_entries_month_format CHECK (month ~ '^\d{4}-\d{2}$')
);
CREATE INDEX IF NOT EXISTS revenue_entries_month_idx
  ON public.revenue_entries (month);

ALTER TABLE public.revenue_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "revenue_entries_select" ON public.revenue_entries;
CREATE POLICY "revenue_entries_select" ON public.revenue_entries
  FOR SELECT TO authenticated
  USING (public.current_user_role() IN ('super_admin', 'admin', 'finance'));
DROP POLICY IF EXISTS "revenue_entries_modify" ON public.revenue_entries;
CREATE POLICY "revenue_entries_modify" ON public.revenue_entries
  FOR ALL TO authenticated
  USING (public.current_user_role() IN ('super_admin', 'admin', 'finance'))
  WITH CHECK (public.current_user_role() IN ('super_admin', 'admin', 'finance'));

-- tags view: unblocks Contractors / Tasks / Employees pages which query
-- supabase.from('tags'). Maps directly to the existing global_tags table.
CREATE OR REPLACE VIEW public.tags AS
SELECT id, name, color, module, created_at FROM public.global_tags;

-- ── 4. WEBHOOK IDEMPOTENCY ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.webhook_idempotency (
  reference   text NOT NULL,
  event_type  text NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (reference, event_type)
);
CREATE INDEX IF NOT EXISTS webhook_idempotency_processed_idx
  ON public.webhook_idempotency (processed_at);

ALTER TABLE public.webhook_idempotency ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "webhook_idempotency_admin_select" ON public.webhook_idempotency;
CREATE POLICY "webhook_idempotency_admin_select" ON public.webhook_idempotency
  FOR SELECT TO authenticated
  USING (public.current_user_role() IN ('super_admin', 'admin'));

NOTIFY pgrst, 'reload schema';
