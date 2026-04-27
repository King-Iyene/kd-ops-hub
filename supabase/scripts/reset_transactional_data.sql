-- =============================================================================
-- Reset transactional data — KEEPS master data (employees, contractors,
-- vehicles, budgets, subscriptions, settings, documents, KB, etc.).
-- Run this in the Supabase SQL editor.
--
-- WHAT GETS WIPED (skipped silently if the table doesn't exist):
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

-- ── Defensive truncate: only wipes tables that actually exist in this DB ────
DO $$
DECLARE
  t TEXT;
  -- Order matters: child tables first, then parents. CASCADE handles the rest.
  tables TEXT[] := ARRAY[
    -- Children (FK-dependent)
    'payslips',
    'payroll_run_items',
    'batch_items',
    'statement_entries',
    'trip_breadcrumbs',
    'trip_events',
    'fuel_level_logs',
    'approval_comments',
    'task_comments',
    -- Top-level transactional
    'expenses',
    'payment_batches',
    'payroll_runs',
    'fuel_requests',
    'trip_logs',
    'bank_statements',
    'vehicle_maintenance',
    'employee_advances',
    'employee_deductions',
    'leave_requests',
    'audit_logs',
    'notifications',
    'revenue_entries'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      EXECUTE format('TRUNCATE TABLE public.%I RESTART IDENTITY CASCADE', t);
      RAISE NOTICE 'Truncated %', t;
    ELSE
      RAISE NOTICE 'Skipped (not present in this DB): %', t;
    END IF;
  END LOOP;
END $$;

-- ── Reset leave usage if leave_balances exists ──────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'leave_balances'
  ) THEN
    UPDATE public.leave_balances
    SET annual_used = 0
    WHERE annual_used IS DISTINCT FROM 0;
  END IF;
END $$;

-- ── Re-enable triggers ──────────────────────────────────────────────────────
SET session_replication_role = DEFAULT;

-- ── Sanity check: counts after wipe (only for tables that exist) ───────────
DO $$
DECLARE
  rec RECORD;
  cnt BIGINT;
  result TEXT := '';
  check_tables TEXT[] := ARRAY[
    'expenses', 'payment_batches', 'batch_items', 'payroll_runs',
    'payslips', 'fuel_requests', 'trip_logs', 'audit_logs',
    'employee_advances', 'employee_deductions', 'leave_requests',
    'profiles', 'contractors', 'vehicles', 'budgets', 'subscriptions'
  ];
  t TEXT;
BEGIN
  FOREACH t IN ARRAY check_tables LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      EXECUTE format('SELECT COUNT(*) FROM public.%I', t) INTO cnt;
      result := result || rpad(t, 24) || ': ' || cnt || E'\n';
    END IF;
  END LOOP;
  RAISE NOTICE E'\n=== Row counts after reset ===\n%', result;
END $$;

COMMIT;
-- ROLLBACK;  -- swap COMMIT for ROLLBACK to dry-run without persisting changes
