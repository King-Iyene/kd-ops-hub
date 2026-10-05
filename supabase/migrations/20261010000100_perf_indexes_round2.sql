-- =============================================================================
-- Migration: 20261010000000_perf_indexes_round2.sql
-- Performance indexes — round 2
-- =============================================================================
-- Addresses slow table/page loading across the app. The first perf index
-- migration (20260427) covered payment_batches, expenses, fuel_requests,
-- budgets, and leave_requests. This round targets the gaps identified by a
-- full query audit: flex (database platform), notifications, batch_items
-- joins, and the transactions view.
-- =============================================================================

-- ── flex_records: the /data grid loads ALL records for a table ───────────────
-- Without this index Postgres seq-scans flex_records on every table open.
CREATE INDEX IF NOT EXISTS idx_flex_records_table_id
  ON public.flex_records (table_id);

CREATE INDEX IF NOT EXISTS idx_flex_records_table_created
  ON public.flex_records (table_id, created_at);

-- ── flex_fields: loaded with ORDER BY sort_order on every table open ─────────
CREATE INDEX IF NOT EXISTS idx_flex_fields_table_sort
  ON public.flex_fields (table_id, sort_order);

-- ── flex_forms: loaded per table ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_flex_forms_table_id
  ON public.flex_forms (table_id);

-- ── notifications: every user queries their own on every page load ───────────
CREATE INDEX IF NOT EXISTS idx_notifications_user_id
  ON public.notifications (user_id);

CREATE INDEX IF NOT EXISTS idx_notifications_user_read
  ON public.notifications (user_id, read, created_at DESC);

-- ── batch_items: status filtering + the transactions_view JOIN ───────────────
CREATE INDEX IF NOT EXISTS idx_batch_items_status
  ON public.batch_items (status);

CREATE INDEX IF NOT EXISTS idx_batch_items_batch_status
  ON public.batch_items (batch_id, status);

-- batch_items by employee/contractor for profile pages
CREATE INDEX IF NOT EXISTS idx_batch_items_employee_id
  ON public.batch_items (employee_id)
  WHERE employee_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_batch_items_contractor_id
  ON public.batch_items (contractor_id)
  WHERE contractor_id IS NOT NULL;

-- transactions_view filters on provider references — index for the WHERE clause
CREATE INDEX IF NOT EXISTS idx_batch_items_paystack_ref
  ON public.batch_items (paystack_reference)
  WHERE paystack_reference IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_batch_items_flutterwave_ref
  ON public.batch_items (flutterwave_reference)
  WHERE flutterwave_reference IS NOT NULL;

-- ── expenses: submitted_by with created_at for the main listing query ────────
-- (submitted_by alone was in round 1; this composite covers the ORDER BY)
CREATE INDEX IF NOT EXISTS idx_expenses_submitted_by_created
  ON public.expenses (submitted_by, created_at DESC)
  WHERE deleted_at IS NULL;

-- ── audit_logs: user_id lookups ──────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id
  ON public.audit_logs (user_id)
  WHERE user_id IS NOT NULL;

-- ── payroll_runs: company_id + status for the payroll listing ────────────────
CREATE INDEX IF NOT EXISTS idx_payroll_runs_company_status
  ON public.payroll_runs (company_id, status);

-- ── payment_batches: the main listing query uses deleted_at IS NULL + ORDER ──
CREATE INDEX IF NOT EXISTS idx_payment_batches_active_created
  ON public.payment_batches (created_at DESC)
  WHERE deleted_at IS NULL;

-- ── trip_logs: driver lookups and date ordering ──────────────────────────────
CREATE INDEX IF NOT EXISTS idx_trip_logs_driver_created
  ON public.trip_logs (driver_id, created_at DESC);

-- ── contractors: the main listing orders by full_name ────────────────────────
CREATE INDEX IF NOT EXISTS idx_contractors_full_name
  ON public.contractors (full_name);

-- ── Analyse the most-queried tables so the planner uses the new indexes ──────
ANALYZE public.flex_records;
ANALYZE public.flex_fields;
ANALYZE public.flex_forms;
ANALYZE public.notifications;
ANALYZE public.batch_items;
ANALYZE public.expenses;
ANALYZE public.payment_batches;
ANALYZE public.trip_logs;
ANALYZE public.contractors;
