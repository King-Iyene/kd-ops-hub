-- =============================================================================
-- Reset transactional data — KEEPS master data (employees, contractors,
-- vehicles, budgets, subscriptions, settings, documents, KB, etc.).
-- Run this in the Supabase SQL editor.
--
-- WHAT GETS WIPED:
--   • Expenses, payment batches + line items, payroll runs + payslips
--   • Fuel requests, trip logs (incl. breadcrumbs and events), fuel level logs
--   • Audit logs, notifications, approval comments
--   • Salary advances and deductions, leave requests
--   • Bank statement uploads + reconciliation lines
--   • Vehicle maintenance records
--   • Revenue entries (manual P&L revenue, if the table exists)
--
-- WHAT IS PRESERVED (master data):
--   • profiles (employees + their bank/salary details)
--   • contractors, contractor_applications
--   • vehicles
--   • budgets + budget_items (the plans, not the actuals)
--   • subscriptions (active recurring services)
--   • company_settings, departments, global_tags
--   • documents, knowledge_articles, announcements
--   • compliance_filings, contacts + activities, whatsapp_groups
--   • tasks, goals (operational, not financial)
--   • leave_balances (quotas) — annual_used is reset to 0 since requests are wiped
--   • notification_preferences, pending_invites, virtual_cards, recurring_schedules
--   • fleet_budget_cycles, referrals
--
-- HOW TO RUN:
--   1. Wrap in BEGIN;...ROLLBACK; first to dry-run if you want.
--   2. When ready, run as-is (BEGIN;...COMMIT;).
--   3. Cannot be undone — there is no Free-tier backup to restore from.
-- =============================================================================

BEGIN;

-- Disable triggers temporarily so audit-on-delete triggers (if any) don't
-- repopulate audit_logs while we're trying to clear it.
SET session_replication_role = replica;

-- ── Children first (FK-dependent tables) ────────────────────────────────────
TRUNCATE TABLE
  public.payslips,
  public.payroll_run_items,
  public.batch_items,
  public.statement_entries,
  public.trip_breadcrumbs,
  public.trip_events,
  public.fuel_level_logs,
  public.approval_comments
RESTART IDENTITY CASCADE;

-- ── Top-level transactional tables ─────────────────────────────────────────
TRUNCATE TABLE
  public.expenses,
  public.payment_batches,
  public.payroll_runs,
  public.fuel_requests,
  public.trip_logs,
  public.bank_statements,
  public.vehicle_maintenance,
  public.employee_advances,
  public.employee_deductions,
  public.leave_requests,
  public.audit_logs,
  public.notifications
RESTART IDENTITY CASCADE;

-- ── Optional tables (only wipe if they exist in this schema) ───────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'revenue_entries') THEN
    EXECUTE 'TRUNCATE TABLE public.revenue_entries RESTART IDENTITY CASCADE';
  END IF;
END $$;

-- ── Reset leave usage (we wiped the requests, so usage must zero out too) ──
UPDATE public.leave_balances
SET annual_used = 0
WHERE annual_used IS DISTINCT FROM 0;

-- ── Re-enable triggers ──────────────────────────────────────────────────────
SET session_replication_role = DEFAULT;

-- ── Sanity check: verify the wipe ──────────────────────────────────────────
SELECT 'expenses' AS table_name,        COUNT(*) AS remaining FROM public.expenses
UNION ALL SELECT 'payment_batches',     COUNT(*) FROM public.payment_batches
UNION ALL SELECT 'batch_items',         COUNT(*) FROM public.batch_items
UNION ALL SELECT 'payroll_runs',        COUNT(*) FROM public.payroll_runs
UNION ALL SELECT 'payslips',            COUNT(*) FROM public.payslips
UNION ALL SELECT 'fuel_requests',       COUNT(*) FROM public.fuel_requests
UNION ALL SELECT 'trip_logs',           COUNT(*) FROM public.trip_logs
UNION ALL SELECT 'audit_logs',          COUNT(*) FROM public.audit_logs
UNION ALL SELECT 'employee_advances',   COUNT(*) FROM public.employee_advances
UNION ALL SELECT 'employee_deductions', COUNT(*) FROM public.employee_deductions
UNION ALL SELECT 'leave_requests',      COUNT(*) FROM public.leave_requests
UNION ALL SELECT 'profiles (kept)',     COUNT(*) FROM public.profiles
UNION ALL SELECT 'contractors (kept)',  COUNT(*) FROM public.contractors
UNION ALL SELECT 'vehicles (kept)',     COUNT(*) FROM public.vehicles
UNION ALL SELECT 'budgets (kept)',      COUNT(*) FROM public.budgets
ORDER BY 1;

COMMIT;
-- ROLLBACK;  -- swap COMMIT for ROLLBACK to dry-run without persisting changes
