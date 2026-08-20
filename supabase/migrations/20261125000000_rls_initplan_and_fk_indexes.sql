-- Performance: fix auth_rls_initplan warnings + add missing FK indexes on
-- pages users hit constantly (profiles, trip_logs, fuel_requests,
-- timesheets, tasks, audit_logs, payment_batches, batch_items, vehicles).
--
-- auth_rls_initplan: RLS predicates calling auth.uid() / current_user_role()
-- / current_user_is_hr_admin() directly force Postgres to re-evaluate them
-- on every row scanned, instead of once per statement. Wrapping the call in
-- a scalar subquery — e.g. `auth.uid()` -> `(select auth.uid())` — lets the
-- planner hoist it into an InitPlan evaluated a single time. This is the
-- standard, behavior-preserving fix documented by Supabase's own advisor
-- (https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select).
-- Every USING/WITH CHECK expression below is byte-for-byte the same
-- predicate as before, only the wrapping changes — no access-control
-- logic is altered. current_user_role()/current_user_is_hr_admin() are
-- STABLE SECURITY DEFINER functions that internally look up
-- public.profiles by auth.uid(), so they carry the exact same per-row cost
-- and get the same fix.
--
-- Scope is deliberately non-payment: profiles, trip_logs, fuel_requests,
-- timesheets, tasks, audit_logs. payment_batches/batch_items RLS is left
-- untouched here (only indexed) — no initplan issue was flagged on them
-- and payment-authorization policies stay exactly as they are.

-- ── profiles ────────────────────────────────────────────────────────────
ALTER POLICY "profiles_insert_self" ON public.profiles
  WITH CHECK ((select auth.uid()) = id);

ALTER POLICY "profiles_read_managers" ON public.profiles
  USING ((select public.current_user_role()) = ANY (ARRAY['super_admin','admin','finance','operations']));

ALTER POLICY "profiles_read_own" ON public.profiles
  USING ((select auth.uid()) = id);

ALTER POLICY "profiles_update_admins" ON public.profiles
  USING ((select public.current_user_role()) = ANY (ARRAY['super_admin','admin']));

ALTER POLICY "profiles_update_finance_payroll_fields" ON public.profiles
  USING ((select public.current_user_role()) = 'finance')
  WITH CHECK ((select public.current_user_role()) = 'finance');

ALTER POLICY "profiles_update_self" ON public.profiles
  USING ((select auth.uid()) = id);

-- ── tasks ───────────────────────────────────────────────────────────────
ALTER POLICY "tasks_delete" ON public.tasks
  USING (
    (created_by = (select auth.uid()))
    OR ((select public.current_user_role()) = ANY (ARRAY['super_admin','admin']))
  );

CREATE INDEX IF NOT EXISTS idx_tasks_created_by ON public.tasks (created_by);

-- ── timesheets ──────────────────────────────────────────────────────────
ALTER POLICY "timesheets_insert" ON public.timesheets
  WITH CHECK (employee_id = (select auth.uid()));

ALTER POLICY "timesheets_select" ON public.timesheets
  USING (
    (employee_id = (select auth.uid()))
    OR (select public.current_user_is_hr_admin())
  );

ALTER POLICY "timesheets_update" ON public.timesheets
  USING (
    ((employee_id = (select auth.uid())) AND (status = 'draft'))
    OR (select public.current_user_is_hr_admin())
  );

CREATE INDEX IF NOT EXISTS idx_timesheets_approved_by ON public.timesheets (approved_by);

-- ── trip_logs ───────────────────────────────────────────────────────────
ALTER POLICY "Admins can manage trip logs" ON public.trip_logs
  USING ((select public.current_user_role()) = ANY (ARRAY['admin','super_admin','operations']));

ALTER POLICY "Drivers can update own trip logs" ON public.trip_logs
  USING (driver_id = (select auth.uid()))
  WITH CHECK (driver_id = (select auth.uid()));

ALTER POLICY "Employees can create trip logs" ON public.trip_logs
  WITH CHECK (driver_id = (select auth.uid()));

ALTER POLICY "Employees can view own trip logs" ON public.trip_logs
  USING (driver_id = (select auth.uid()));

ALTER POLICY "trip_logs_delete" ON public.trip_logs
  USING ((select public.current_user_role()) = ANY (ARRAY['super_admin','admin']));

ALTER POLICY "trip_logs_select_all" ON public.trip_logs
  USING (
    ((select public.current_user_role()) = ANY (ARRAY['super_admin','admin','operations']))
    OR (driver_id = (select auth.uid()))
  );

ALTER POLICY "trip_logs_update" ON public.trip_logs
  USING (
    ((select public.current_user_role()) = ANY (ARRAY['super_admin','admin','operations']))
    OR (driver_id = (select auth.uid()))
  );

CREATE INDEX IF NOT EXISTS idx_trip_logs_anomaly_reviewed_by ON public.trip_logs (anomaly_reviewed_by) WHERE anomaly_reviewed_by IS NOT NULL;

-- ── fuel_requests ───────────────────────────────────────────────────────
ALTER POLICY "Admins and finance can manage fuel requests" ON public.fuel_requests
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (select auth.uid()) AND p.role = ANY (ARRAY['admin','finance'])
    )
  );

ALTER POLICY "Employees can create fuel requests" ON public.fuel_requests
  WITH CHECK (driver_id = (select auth.uid()));

ALTER POLICY "Employees can view own fuel requests" ON public.fuel_requests
  USING (driver_id = (select auth.uid()));

ALTER POLICY "Staff can manage fuel requests" ON public.fuel_requests
  USING ((select public.current_user_role()) = ANY (ARRAY['super_admin','admin','finance']))
  WITH CHECK ((select public.current_user_role()) = ANY (ARRAY['super_admin','admin','finance']));

ALTER POLICY "fuel_requests_delete" ON public.fuel_requests
  USING ((select public.current_user_role()) = ANY (ARRAY['super_admin','admin']));

ALTER POLICY "fuel_requests_update" ON public.fuel_requests
  USING (
    ((select public.current_user_role()) = ANY (ARRAY['super_admin','admin','operations']))
    OR (driver_id = (select auth.uid()))
  );

CREATE INDEX IF NOT EXISTS idx_fuel_requests_batch_id ON public.fuel_requests (batch_id) WHERE batch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fuel_requests_anomaly_reviewed_by ON public.fuel_requests (anomaly_reviewed_by) WHERE anomaly_reviewed_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fuel_requests_budget_exception_by ON public.fuel_requests (budget_exception_by) WHERE budget_exception_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fuel_requests_resubmitted_from_id ON public.fuel_requests (resubmitted_from_id) WHERE resubmitted_from_id IS NOT NULL;

-- ── audit_logs ──────────────────────────────────────────────────────────
ALTER POLICY "audit_logs_insert_self_only" ON public.audit_logs
  WITH CHECK ((performed_by = (select auth.uid())) OR (performed_by IS NULL));

ALTER POLICY "audit_logs_select_managers" ON public.audit_logs
  USING ((select public.current_user_role()) = ANY (ARRAY['super_admin','admin','finance','operations']));

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON public.audit_logs (user_id) WHERE user_id IS NOT NULL;

-- ── vehicles ────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_vehicles_assigned_driver_id ON public.vehicles (assigned_driver_id) WHERE assigned_driver_id IS NOT NULL;

-- ── payment_batches / batch_items (index-only, RLS untouched) ────────────
CREATE INDEX IF NOT EXISTS idx_payment_batches_approved_by ON public.payment_batches (approved_by) WHERE approved_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payment_batches_created_by ON public.payment_batches (created_by) WHERE created_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payment_batches_deleted_by ON public.payment_batches (deleted_by) WHERE deleted_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payment_batches_funded_by ON public.payment_batches (funded_by) WHERE funded_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payment_batches_recurring_schedule_id ON public.payment_batches (recurring_schedule_id) WHERE recurring_schedule_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payment_batches_second_approver_id ON public.payment_batches (second_approver_id) WHERE second_approver_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_batch_items_contractor_id ON public.batch_items (contractor_id) WHERE contractor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_batch_items_manual_resolution_by ON public.batch_items (manual_resolution_by) WHERE manual_resolution_by IS NOT NULL;
