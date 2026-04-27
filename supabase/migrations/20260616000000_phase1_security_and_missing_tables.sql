-- ─────────────────────────────────────────────────────────────────────────
-- PHASE 1 — SECURITY HARDENING + MISSING TABLES + WEBHOOK IDEMPOTENCY
--
-- Idempotent. Safe to re-run. Skips RLS work on tables that don't exist
-- on this DB (live schema drift). Defensive everywhere.
--
-- Fixes the highest-priority issues from the production-readiness +
-- security audits:
--   1. audit_logs RLS — block read by non-managers, block impersonation on insert
--   2. Wide-open RLS (USING (true)) on tasks, task_comments, approval_comments,
--      referrals, vehicle_maintenance, employee_deductions
--   3. tags — add 'module' column the UI filters on; migrate rows from
--      legacy global_tags table; one canonical table
--   4. Missing tables: salary_increments, revenue_entries
--   5. webhook_idempotency for the paystack-webhook edge function
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

-- ── 2. TASKS ─────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='tasks') THEN
    EXECUTE 'DROP POLICY IF EXISTS "tasks_all"               ON public.tasks';
    EXECUTE 'DROP POLICY IF EXISTS "tasks_all_authenticated" ON public.tasks';
    EXECUTE 'DROP POLICY IF EXISTS "Authenticated can manage tasks" ON public.tasks';
    EXECUTE 'DROP POLICY IF EXISTS "tasks_select" ON public.tasks';
    EXECUTE 'DROP POLICY IF EXISTS "tasks_insert" ON public.tasks';
    EXECUTE 'DROP POLICY IF EXISTS "tasks_update" ON public.tasks';
    EXECUTE 'DROP POLICY IF EXISTS "tasks_delete" ON public.tasks';
    EXECUTE $POL$
      CREATE POLICY "tasks_select" ON public.tasks FOR SELECT TO authenticated
      USING (assignee_id = auth.uid() OR created_by = auth.uid()
        OR public.current_user_role() IN ('super_admin', 'admin', 'operations'))
    $POL$;
    EXECUTE $POL$
      CREATE POLICY "tasks_insert" ON public.tasks FOR INSERT TO authenticated
      WITH CHECK (created_by = auth.uid()
        OR public.current_user_role() IN ('super_admin', 'admin', 'operations'))
    $POL$;
    EXECUTE $POL$
      CREATE POLICY "tasks_update" ON public.tasks FOR UPDATE TO authenticated
      USING (assignee_id = auth.uid() OR created_by = auth.uid()
        OR public.current_user_role() IN ('super_admin', 'admin', 'operations'))
    $POL$;
    EXECUTE $POL$
      CREATE POLICY "tasks_delete" ON public.tasks FOR DELETE TO authenticated
      USING (created_by = auth.uid()
        OR public.current_user_role() IN ('super_admin', 'admin'))
    $POL$;
  END IF;
END $$;

-- ── 3. TASK COMMENTS ─────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='task_comments') THEN
    EXECUTE 'DROP POLICY IF EXISTS "task_comments_all"               ON public.task_comments';
    EXECUTE 'DROP POLICY IF EXISTS "task_comments_all_authenticated" ON public.task_comments';
    EXECUTE 'DROP POLICY IF EXISTS "task_comments_select"            ON public.task_comments';
    EXECUTE 'DROP POLICY IF EXISTS "task_comments_insert"            ON public.task_comments';
    EXECUTE $POL$
      CREATE POLICY "task_comments_select" ON public.task_comments FOR SELECT TO authenticated
      USING (EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND (
        t.assignee_id = auth.uid() OR t.created_by = auth.uid()
        OR public.current_user_role() IN ('super_admin', 'admin', 'operations'))))
    $POL$;
    EXECUTE $POL$
      CREATE POLICY "task_comments_insert" ON public.task_comments FOR INSERT TO authenticated
      WITH CHECK (author_id = auth.uid())
    $POL$;
  END IF;
END $$;

-- ── 4. APPROVAL COMMENTS ─────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='approval_comments') THEN
    EXECUTE 'DROP POLICY IF EXISTS "approval_comments_all"               ON public.approval_comments';
    EXECUTE 'DROP POLICY IF EXISTS "approval_comments_all_authenticated" ON public.approval_comments';
    EXECUTE 'DROP POLICY IF EXISTS "approval_comments_select"            ON public.approval_comments';
    EXECUTE 'DROP POLICY IF EXISTS "approval_comments_insert"            ON public.approval_comments';
    EXECUTE $POL$
      CREATE POLICY "approval_comments_select" ON public.approval_comments FOR SELECT TO authenticated
      USING (public.current_user_role() IN ('super_admin', 'admin', 'finance', 'operations'))
    $POL$;
    EXECUTE $POL$
      CREATE POLICY "approval_comments_insert" ON public.approval_comments FOR INSERT TO authenticated
      WITH CHECK (author_id = auth.uid()
        AND public.current_user_role() IN ('super_admin', 'admin', 'finance', 'operations'))
    $POL$;
  END IF;
END $$;

-- ── 5. REFERRALS ─────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='referrals') THEN
    EXECUTE 'DROP POLICY IF EXISTS "referrals_write"  ON public.referrals';
    EXECUTE 'DROP POLICY IF EXISTS "referrals_read"   ON public.referrals';
    EXECUTE 'DROP POLICY IF EXISTS "referrals_select" ON public.referrals';
    EXECUTE 'DROP POLICY IF EXISTS "referrals_modify" ON public.referrals';
    EXECUTE $POL$
      CREATE POLICY "referrals_select" ON public.referrals FOR SELECT TO authenticated
      USING (referrer_id = auth.uid()
        OR public.current_user_role() IN ('super_admin', 'admin', 'finance'))
    $POL$;
    EXECUTE $POL$
      CREATE POLICY "referrals_modify" ON public.referrals FOR ALL TO authenticated
      USING (referrer_id = auth.uid()
        OR public.current_user_role() IN ('super_admin', 'admin'))
      WITH CHECK (referrer_id = auth.uid()
        OR public.current_user_role() IN ('super_admin', 'admin'))
    $POL$;
  END IF;
END $$;

-- ── 6. VEHICLE MAINTENANCE ───────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='vehicle_maintenance') THEN
    EXECUTE 'DROP POLICY IF EXISTS "vehicle_maintenance_all"               ON public.vehicle_maintenance';
    EXECUTE 'DROP POLICY IF EXISTS "vehicle_maintenance_all_authenticated" ON public.vehicle_maintenance';
    EXECUTE 'DROP POLICY IF EXISTS "vehicle_maintenance_select"            ON public.vehicle_maintenance';
    EXECUTE 'DROP POLICY IF EXISTS "vehicle_maintenance_modify"            ON public.vehicle_maintenance';
    EXECUTE $POL$
      CREATE POLICY "vehicle_maintenance_select" ON public.vehicle_maintenance FOR SELECT TO authenticated
      USING (true)
    $POL$;
    EXECUTE $POL$
      CREATE POLICY "vehicle_maintenance_modify" ON public.vehicle_maintenance FOR ALL TO authenticated
      USING (public.current_user_role() IN ('super_admin', 'admin', 'operations'))
      WITH CHECK (public.current_user_role() IN ('super_admin', 'admin', 'operations'))
    $POL$;
  END IF;
END $$;

-- ── 7. EMPLOYEE DEDUCTIONS ───────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='employee_deductions') THEN
    EXECUTE 'DROP POLICY IF EXISTS "employee_deductions_select"               ON public.employee_deductions';
    EXECUTE 'DROP POLICY IF EXISTS "employee_deductions_select_authenticated" ON public.employee_deductions';
    EXECUTE 'DROP POLICY IF EXISTS "Authenticated can view employee_deductions" ON public.employee_deductions';
    EXECUTE $POL$
      CREATE POLICY "employee_deductions_select" ON public.employee_deductions FOR SELECT TO authenticated
      USING (entity_id = auth.uid()
        OR public.current_user_role() IN ('super_admin', 'admin', 'finance'))
    $POL$;
  END IF;
END $$;

-- ── 8. TAGS — add module column, migrate from global_tags, RLS ──────────
ALTER TABLE public.tags
  ADD COLUMN IF NOT EXISTS module text NOT NULL DEFAULT 'all'
    CHECK (module IN ('all', 'contacts', 'contractors', 'employees', 'tasks', 'documents'));

-- Migrate any rows from global_tags into tags (idempotent — name conflicts
-- are skipped). Only runs if global_tags exists.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='global_tags') THEN
    EXECUTE $MIG$
      INSERT INTO public.tags (name, color, module, created_at)
      SELECT g.name, g.color, g.module, g.created_at
      FROM public.global_tags g
      WHERE NOT EXISTS (
        SELECT 1 FROM public.tags t WHERE t.name = g.name
      )
    $MIG$;
  END IF;
END $$;

ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated can view tags" ON public.tags;
CREATE POLICY "Authenticated can view tags" ON public.tags
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins manage tags" ON public.tags;
CREATE POLICY "Admins manage tags" ON public.tags
  FOR ALL TO authenticated
  USING (public.current_user_role() IN ('super_admin', 'admin'))
  WITH CHECK (public.current_user_role() IN ('super_admin', 'admin'));

-- ── 9. SALARY INCREMENTS ─────────────────────────────────────────────────
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
CREATE POLICY "salary_increments_select" ON public.salary_increments FOR SELECT TO authenticated
  USING (employee_id = auth.uid()
    OR public.current_user_role() IN ('super_admin', 'admin', 'finance'));

DROP POLICY IF EXISTS "salary_increments_modify" ON public.salary_increments;
CREATE POLICY "salary_increments_modify" ON public.salary_increments FOR ALL TO authenticated
  USING (public.current_user_role() IN ('super_admin', 'admin', 'finance'))
  WITH CHECK (public.current_user_role() IN ('super_admin', 'admin', 'finance'));

-- ── 10. REVENUE ENTRIES ──────────────────────────────────────────────────
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
CREATE INDEX IF NOT EXISTS revenue_entries_month_idx ON public.revenue_entries (month);

ALTER TABLE public.revenue_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "revenue_entries_select" ON public.revenue_entries;
CREATE POLICY "revenue_entries_select" ON public.revenue_entries FOR SELECT TO authenticated
  USING (public.current_user_role() IN ('super_admin', 'admin', 'finance'));

DROP POLICY IF EXISTS "revenue_entries_modify" ON public.revenue_entries;
CREATE POLICY "revenue_entries_modify" ON public.revenue_entries FOR ALL TO authenticated
  USING (public.current_user_role() IN ('super_admin', 'admin', 'finance'))
  WITH CHECK (public.current_user_role() IN ('super_admin', 'admin', 'finance'));

-- ── 11. WEBHOOK IDEMPOTENCY ──────────────────────────────────────────────
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
CREATE POLICY "webhook_idempotency_admin_select" ON public.webhook_idempotency FOR SELECT TO authenticated
  USING (public.current_user_role() IN ('super_admin', 'admin'));

NOTIFY pgrst, 'reload schema';
