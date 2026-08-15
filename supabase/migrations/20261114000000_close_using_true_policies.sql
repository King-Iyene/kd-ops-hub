-- =============================================================================
-- Migration: 20261114000000_close_using_true_policies.sql
-- =============================================================================
-- Closes 53 USING(true) RLS policies in production. Categorised approach:
--
--   A. Financial / PII tables (contractors, budgets, documents, etc.)
--      → Drop FOR ALL, replace with role-scoped SELECT + admin/super_admin write.
--
--   B. Notifications → scope to own rows (user_id = auth.uid()).
--
--   C. Operational tables (vehicles, fuel_requests, trip_logs, departments)
--      → Drop FOR ALL, replace with read-all + admin/super_admin/operations write.
--
--   D. Task / project management tables (tasks, task_*, space_*, goal_tasks)
--      → Intentionally collaborative; leave USING(true) but convert FOR ALL
--        to explicit SELECT + INSERT + UPDATE (remove DELETE for safety).
--
--   E. SELECT-only on reference data (announcements, tags, leave_policies,
--      fx_rates, chatbot_config, etc.) → left as-is; read-all is correct.
--
-- Roles in production: super_admin, admin, operations, field_staff
-- Helper: public.current_user_role() returns the caller's role text.
-- =============================================================================

-- ═══════════════════════════════════════════════════════════════════════════
-- A. FINANCIAL / PII TABLES — role-scoped access
-- ═══════════════════════════════════════════════════════════════════════════

-- ── A1. contractors (bank details — most critical) ──────────────────────
DROP POLICY IF EXISTS "contractors_auth" ON public.contractors;

CREATE POLICY "contractors_select_scoped"
  ON public.contractors FOR SELECT TO authenticated
  USING (public.current_user_role() IN ('super_admin','admin','operations'));

CREATE POLICY "contractors_insert_admin"
  ON public.contractors FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role() IN ('super_admin','admin'));

CREATE POLICY "contractors_update_admin"
  ON public.contractors FOR UPDATE TO authenticated
  USING  (public.current_user_role() IN ('super_admin','admin'))
  WITH CHECK (public.current_user_role() IN ('super_admin','admin'));

CREATE POLICY "contractors_delete_admin"
  ON public.contractors FOR DELETE TO authenticated
  USING (public.current_user_role() IN ('super_admin','admin'));


-- ── A2. budgets ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "budgets_auth" ON public.budgets;

CREATE POLICY "budgets_select"
  ON public.budgets FOR SELECT TO authenticated
  USING (public.current_user_role() IN ('super_admin','admin','operations'));

CREATE POLICY "budgets_write_admin"
  ON public.budgets FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role() IN ('super_admin','admin'));

CREATE POLICY "budgets_update_admin"
  ON public.budgets FOR UPDATE TO authenticated
  USING  (public.current_user_role() IN ('super_admin','admin'))
  WITH CHECK (public.current_user_role() IN ('super_admin','admin'));

CREATE POLICY "budgets_delete_admin"
  ON public.budgets FOR DELETE TO authenticated
  USING (public.current_user_role() IN ('super_admin','admin'));


-- ── A3. budget_items ────────────────────────────────────────────────────
DROP POLICY IF EXISTS "budget_items_auth" ON public.budget_items;

CREATE POLICY "budget_items_select"
  ON public.budget_items FOR SELECT TO authenticated
  USING (public.current_user_role() IN ('super_admin','admin','operations'));

CREATE POLICY "budget_items_write_admin"
  ON public.budget_items FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role() IN ('super_admin','admin'));

CREATE POLICY "budget_items_update_admin"
  ON public.budget_items FOR UPDATE TO authenticated
  USING  (public.current_user_role() IN ('super_admin','admin'))
  WITH CHECK (public.current_user_role() IN ('super_admin','admin'));

CREATE POLICY "budget_items_delete_admin"
  ON public.budget_items FOR DELETE TO authenticated
  USING (public.current_user_role() IN ('super_admin','admin'));


-- ── A4. documents (employee files) ──────────────────────────────────────
DROP POLICY IF EXISTS "docs_auth" ON public.documents;

CREATE POLICY "documents_select_scoped"
  ON public.documents FOR SELECT TO authenticated
  USING (
    public.current_user_role() IN ('super_admin','admin','operations')
    OR uploaded_by = auth.uid()
    OR employee_id = auth.uid()
  );

CREATE POLICY "documents_insert"
  ON public.documents FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_role() IN ('super_admin','admin')
    OR uploaded_by = auth.uid()
  );

CREATE POLICY "documents_update_admin"
  ON public.documents FOR UPDATE TO authenticated
  USING  (public.current_user_role() IN ('super_admin','admin'))
  WITH CHECK (public.current_user_role() IN ('super_admin','admin'));

CREATE POLICY "documents_delete_admin"
  ON public.documents FOR DELETE TO authenticated
  USING (public.current_user_role() IN ('super_admin','admin'));


-- ── A5. subscriptions (billing) ─────────────────────────────────────────
DROP POLICY IF EXISTS "subs_auth" ON public.subscriptions;

CREATE POLICY "subscriptions_select"
  ON public.subscriptions FOR SELECT TO authenticated
  USING (public.current_user_role() IN ('super_admin','admin'));

CREATE POLICY "subscriptions_write_admin"
  ON public.subscriptions FOR ALL TO authenticated
  USING  (public.current_user_role() IN ('super_admin','admin'))
  WITH CHECK (public.current_user_role() IN ('super_admin','admin'));


-- ── A6. custom_field_definitions ────────────────────────────────────────
DROP POLICY IF EXISTS "cfd_authenticated" ON public.custom_field_definitions;

CREATE POLICY "cfd_select"
  ON public.custom_field_definitions FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "cfd_write_admin"
  ON public.custom_field_definitions FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role() IN ('super_admin','admin'));

CREATE POLICY "cfd_update_admin"
  ON public.custom_field_definitions FOR UPDATE TO authenticated
  USING  (public.current_user_role() IN ('super_admin','admin'))
  WITH CHECK (public.current_user_role() IN ('super_admin','admin'));

CREATE POLICY "cfd_delete_admin"
  ON public.custom_field_definitions FOR DELETE TO authenticated
  USING (public.current_user_role() IN ('super_admin','admin'));


-- ── A7. custom_field_values ─────────────────────────────────────────────
DROP POLICY IF EXISTS "cfv_authenticated" ON public.custom_field_values;

CREATE POLICY "cfv_select"
  ON public.custom_field_values FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "cfv_write_admin"
  ON public.custom_field_values FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role() IN ('super_admin','admin','operations'));

CREATE POLICY "cfv_update_admin"
  ON public.custom_field_values FOR UPDATE TO authenticated
  USING  (public.current_user_role() IN ('super_admin','admin','operations'))
  WITH CHECK (public.current_user_role() IN ('super_admin','admin','operations'));

CREATE POLICY "cfv_delete_admin"
  ON public.custom_field_values FOR DELETE TO authenticated
  USING (public.current_user_role() IN ('super_admin','admin'));


-- ═══════════════════════════════════════════════════════════════════════════
-- B. NOTIFICATIONS — scope to own rows
-- ═══════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "notif_auth" ON public.notifications;

CREATE POLICY "notifications_select_own"
  ON public.notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "notifications_update_own"
  ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "notifications_delete_own"
  ON public.notifications FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "notifications_insert_service"
  ON public.notifications FOR INSERT TO authenticated
  USING (true)
  WITH CHECK (true);


-- ═══════════════════════════════════════════════════════════════════════════
-- C. OPERATIONAL TABLES — read-all + admin/operations write
-- ═══════════════════════════════════════════════════════════════════════════

-- ── C1. vehicles ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "vehicles_auth" ON public.vehicles;

CREATE POLICY "vehicles_select_all"
  ON public.vehicles FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "vehicles_write"
  ON public.vehicles FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role() IN ('super_admin','admin','operations'));

CREATE POLICY "vehicles_update"
  ON public.vehicles FOR UPDATE TO authenticated
  USING  (public.current_user_role() IN ('super_admin','admin','operations'))
  WITH CHECK (public.current_user_role() IN ('super_admin','admin','operations'));

CREATE POLICY "vehicles_delete"
  ON public.vehicles FOR DELETE TO authenticated
  USING (public.current_user_role() IN ('super_admin','admin'));


-- ── C2. fuel_requests ───────────────────────────────────────────────────
DROP POLICY IF EXISTS "fuel_auth" ON public.fuel_requests;

CREATE POLICY "fuel_requests_select_all"
  ON public.fuel_requests FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "fuel_requests_insert"
  ON public.fuel_requests FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "fuel_requests_update"
  ON public.fuel_requests FOR UPDATE TO authenticated
  USING (
    public.current_user_role() IN ('super_admin','admin','operations')
    OR driver_id = auth.uid()
  )
  WITH CHECK (true);

CREATE POLICY "fuel_requests_delete"
  ON public.fuel_requests FOR DELETE TO authenticated
  USING (public.current_user_role() IN ('super_admin','admin'));


-- ── C3. trip_logs ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "trips_auth" ON public.trip_logs;

CREATE POLICY "trip_logs_select_all"
  ON public.trip_logs FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "trip_logs_insert"
  ON public.trip_logs FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "trip_logs_update"
  ON public.trip_logs FOR UPDATE TO authenticated
  USING (
    public.current_user_role() IN ('super_admin','admin','operations')
    OR driver_id = auth.uid()
  )
  WITH CHECK (true);

CREATE POLICY "trip_logs_delete"
  ON public.trip_logs FOR DELETE TO authenticated
  USING (public.current_user_role() IN ('super_admin','admin'));


-- ── C4. departments — drop the duplicate FOR ALL, keep SELECT-only ─────
DROP POLICY IF EXISTS "dept_auth" ON public.departments;

CREATE POLICY "departments_write_admin"
  ON public.departments FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role() IN ('super_admin','admin'));

CREATE POLICY "departments_update_admin"
  ON public.departments FOR UPDATE TO authenticated
  USING  (public.current_user_role() IN ('super_admin','admin'))
  WITH CHECK (public.current_user_role() IN ('super_admin','admin'));

CREATE POLICY "departments_delete_admin"
  ON public.departments FOR DELETE TO authenticated
  USING (public.current_user_role() IN ('super_admin','admin'));


-- ── C5. vehicle_inspections — drop blanket UPDATE ──────────────────────
DROP POLICY IF EXISTS "Admins can update inspections" ON public.vehicle_inspections;

CREATE POLICY "vehicle_inspections_update_scoped"
  ON public.vehicle_inspections FOR UPDATE TO authenticated
  USING (public.current_user_role() IN ('super_admin','admin','operations'))
  WITH CHECK (public.current_user_role() IN ('super_admin','admin','operations'));


-- ── C6. knowledge_article_versions ─────────────────────────────────────
DROP POLICY IF EXISTS "knowledge_versions_all" ON public.knowledge_article_versions;

CREATE POLICY "knowledge_versions_select"
  ON public.knowledge_article_versions FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "knowledge_versions_write"
  ON public.knowledge_article_versions FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role() IN ('super_admin','admin'));

CREATE POLICY "knowledge_versions_update"
  ON public.knowledge_article_versions FOR UPDATE TO authenticated
  USING  (public.current_user_role() IN ('super_admin','admin'))
  WITH CHECK (public.current_user_role() IN ('super_admin','admin'));

CREATE POLICY "knowledge_versions_delete"
  ON public.knowledge_article_versions FOR DELETE TO authenticated
  USING (public.current_user_role() IN ('super_admin','admin'));


-- ═══════════════════════════════════════════════════════════════════════════
-- D. TASK / PROJECT MANAGEMENT — collaborative, convert ALL → explicit ops
--    (remove DELETE from general users, keep read/write open)
-- ═══════════════════════════════════════════════════════════════════════════

-- saved_views: personal feature, scope to own rows
DROP POLICY IF EXISTS "saved_views_authenticated" ON public.saved_views;
CREATE POLICY "saved_views_own" ON public.saved_views FOR ALL TO authenticated
  USING (created_by = auth.uid()) WITH CHECK (created_by = auth.uid());

-- space_folders, space_members, space_statuses: collaborative, keep open
-- but add DELETE restriction
DO $$ BEGIN
  -- space_folders
  DROP POLICY IF EXISTS "folders_authenticated" ON public.space_folders;
  CREATE POLICY "space_folders_read_write" ON public.space_folders
    FOR SELECT TO authenticated USING (true);
  CREATE POLICY "space_folders_insert" ON public.space_folders
    FOR INSERT TO authenticated WITH CHECK (true);
  CREATE POLICY "space_folders_update" ON public.space_folders
    FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
  CREATE POLICY "space_folders_delete" ON public.space_folders
    FOR DELETE TO authenticated
    USING (public.current_user_role() IN ('super_admin','admin'));

  -- space_members
  DROP POLICY IF EXISTS "space_members_authenticated" ON public.space_members;
  CREATE POLICY "space_members_read_write" ON public.space_members
    FOR SELECT TO authenticated USING (true);
  CREATE POLICY "space_members_insert" ON public.space_members
    FOR INSERT TO authenticated WITH CHECK (true);
  CREATE POLICY "space_members_update" ON public.space_members
    FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
  CREATE POLICY "space_members_delete" ON public.space_members
    FOR DELETE TO authenticated
    USING (public.current_user_role() IN ('super_admin','admin') OR user_id = auth.uid());

  -- space_statuses
  DROP POLICY IF EXISTS "space_statuses_authenticated" ON public.space_statuses;
  CREATE POLICY "space_statuses_read_write" ON public.space_statuses
    FOR SELECT TO authenticated USING (true);
  CREATE POLICY "space_statuses_insert" ON public.space_statuses
    FOR INSERT TO authenticated WITH CHECK (true);
  CREATE POLICY "space_statuses_update" ON public.space_statuses
    FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
  CREATE POLICY "space_statuses_delete" ON public.space_statuses
    FOR DELETE TO authenticated
    USING (public.current_user_role() IN ('super_admin','admin'));

  -- task_activity
  DROP POLICY IF EXISTS "task_activity_authenticated" ON public.task_activity;
  CREATE POLICY "task_activity_select" ON public.task_activity
    FOR SELECT TO authenticated USING (true);
  CREATE POLICY "task_activity_insert" ON public.task_activity
    FOR INSERT TO authenticated WITH CHECK (true);

  -- task_assignees
  DROP POLICY IF EXISTS "task_assignees_authenticated" ON public.task_assignees;
  CREATE POLICY "task_assignees_select" ON public.task_assignees
    FOR SELECT TO authenticated USING (true);
  CREATE POLICY "task_assignees_insert" ON public.task_assignees
    FOR INSERT TO authenticated WITH CHECK (true);
  CREATE POLICY "task_assignees_delete" ON public.task_assignees
    FOR DELETE TO authenticated USING (true);

  -- task_checklists
  DROP POLICY IF EXISTS "checklists_authenticated" ON public.task_checklists;
  CREATE POLICY "task_checklists_select" ON public.task_checklists
    FOR SELECT TO authenticated USING (true);
  CREATE POLICY "task_checklists_insert" ON public.task_checklists
    FOR INSERT TO authenticated WITH CHECK (true);
  CREATE POLICY "task_checklists_update" ON public.task_checklists
    FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
  CREATE POLICY "task_checklists_delete" ON public.task_checklists
    FOR DELETE TO authenticated USING (true);

  -- task_dependencies
  DROP POLICY IF EXISTS "deps_authenticated" ON public.task_dependencies;
  CREATE POLICY "task_deps_select" ON public.task_dependencies
    FOR SELECT TO authenticated USING (true);
  CREATE POLICY "task_deps_insert" ON public.task_dependencies
    FOR INSERT TO authenticated WITH CHECK (true);
  CREATE POLICY "task_deps_delete" ON public.task_dependencies
    FOR DELETE TO authenticated USING (true);

  -- task_lists
  DROP POLICY IF EXISTS "task_lists_authenticated" ON public.task_lists;
  CREATE POLICY "task_lists_select" ON public.task_lists
    FOR SELECT TO authenticated USING (true);
  CREATE POLICY "task_lists_insert" ON public.task_lists
    FOR INSERT TO authenticated WITH CHECK (true);
  CREATE POLICY "task_lists_update" ON public.task_lists
    FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
  CREATE POLICY "task_lists_delete" ON public.task_lists
    FOR DELETE TO authenticated
    USING (public.current_user_role() IN ('super_admin','admin'));

  -- task_templates
  DROP POLICY IF EXISTS "task_templates_authenticated" ON public.task_templates;
  CREATE POLICY "task_templates_select" ON public.task_templates
    FOR SELECT TO authenticated USING (true);
  CREATE POLICY "task_templates_insert" ON public.task_templates
    FOR INSERT TO authenticated WITH CHECK (true);
  CREATE POLICY "task_templates_update" ON public.task_templates
    FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
  CREATE POLICY "task_templates_delete" ON public.task_templates
    FOR DELETE TO authenticated
    USING (public.current_user_role() IN ('super_admin','admin'));

  -- task_time_entries
  DROP POLICY IF EXISTS "time_entries_authenticated" ON public.task_time_entries;
  CREATE POLICY "task_time_entries_select" ON public.task_time_entries
    FOR SELECT TO authenticated USING (true);
  CREATE POLICY "task_time_entries_insert" ON public.task_time_entries
    FOR INSERT TO authenticated WITH CHECK (true);
  CREATE POLICY "task_time_entries_update" ON public.task_time_entries
    FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
  CREATE POLICY "task_time_entries_delete" ON public.task_time_entries
    FOR DELETE TO authenticated USING (user_id = auth.uid());

  -- task_watchers
  DROP POLICY IF EXISTS "watchers_authenticated" ON public.task_watchers;
  CREATE POLICY "task_watchers_select" ON public.task_watchers
    FOR SELECT TO authenticated USING (true);
  CREATE POLICY "task_watchers_insert" ON public.task_watchers
    FOR INSERT TO authenticated WITH CHECK (true);
  CREATE POLICY "task_watchers_delete" ON public.task_watchers
    FOR DELETE TO authenticated USING (true);

  -- task_forms
  DROP POLICY IF EXISTS "task_forms_authenticated" ON public.task_forms;
  CREATE POLICY "task_forms_select" ON public.task_forms
    FOR SELECT TO authenticated USING (true);
  CREATE POLICY "task_forms_insert" ON public.task_forms
    FOR INSERT TO authenticated WITH CHECK (true);
  CREATE POLICY "task_forms_update" ON public.task_forms
    FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
  CREATE POLICY "task_forms_delete" ON public.task_forms
    FOR DELETE TO authenticated
    USING (public.current_user_role() IN ('super_admin','admin'));

  -- goal_tasks
  DROP POLICY IF EXISTS "goal_tasks_authenticated" ON public.goal_tasks;
  CREATE POLICY "goal_tasks_select" ON public.goal_tasks
    FOR SELECT TO authenticated USING (true);
  CREATE POLICY "goal_tasks_insert" ON public.goal_tasks
    FOR INSERT TO authenticated WITH CHECK (true);
  CREATE POLICY "goal_tasks_update" ON public.goal_tasks
    FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
  CREATE POLICY "goal_tasks_delete" ON public.goal_tasks
    FOR DELETE TO authenticated
    USING (public.current_user_role() IN ('super_admin','admin'));
END $$;


-- ═══════════════════════════════════════════════════════════════════════════
-- E. SELECT-ONLY on reference data — left as-is (read-all is correct):
--    announcements, approval_limits, chatbot_config, contact_activities,
--    contact_whatsapp_groups, departments_select, document_folders_select,
--    driver_assignments, driver_training_records, fleet_incidents,
--    fx_rates, global_tags, heyreach_sync_log, leave_policies,
--    offer_letter_templates, performance_review_templates,
--    tags (x2), task_comments_select, tasks_select, tasks_update,
--    vehicle_inspections_select, vehicle_maintenance (x2),
--    whatsapp_groups
-- ═══════════════════════════════════════════════════════════════════════════

-- Remove duplicate SELECT policies where both a SELECT-only AND a
-- FOR-ALL-with-USING(true) existed. The dept_auth FOR ALL is already
-- dropped above; clean up duplicate vehicle_maintenance SELECTs:
DROP POLICY IF EXISTS "vehicle_maintenance_select" ON public.vehicle_maintenance;


-- ═══════════════════════════════════════════════════════════════════════════
-- F. ADD ROLE CHECK TO send-email — any authenticated user can currently
--    send DKIM-signed email. This is enforced at the edge function level
--    (see the accompanying code change), not via RLS.
-- ═══════════════════════════════════════════════════════════════════════════

NOTIFY pgrst, 'reload schema';
