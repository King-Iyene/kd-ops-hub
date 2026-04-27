-- Performance indexes for high-traffic approval queries.
--
-- The Approvals page filters all of these tables by `status = 'pending'`
-- (or `pending_approval`) and orders by created_at desc.  Without these
-- indexes the planner falls back to a sequential scan as soon as the
-- tables grow past a few thousand rows, which causes noticeable lag on
-- the approver UI and slows the dashboard counts query.
--
-- expenses.submitted_by is also indexed because the self-approval guard
-- checks `submitted_by = auth.uid()` on every approval click, and the
-- "My Expenses" filter uses the same column.
--
-- All indexes use IF NOT EXISTS so this migration is safe to re-run.

CREATE INDEX IF NOT EXISTS idx_payment_batches_status
  ON public.payment_batches (status);

CREATE INDEX IF NOT EXISTS idx_payment_batches_status_created_at
  ON public.payment_batches (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_expenses_status
  ON public.expenses (status);

CREATE INDEX IF NOT EXISTS idx_expenses_status_created_at
  ON public.expenses (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_expenses_submitted_by
  ON public.expenses (submitted_by);

CREATE INDEX IF NOT EXISTS idx_fuel_requests_status_created_at
  ON public.fuel_requests (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_budgets_status_created_at
  ON public.budgets (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_leave_requests_status_created_at
  ON public.leave_requests (status, created_at DESC);

-- Date-range queries used by Payroll.draftRun (period filter).
CREATE INDEX IF NOT EXISTS idx_expenses_status_date
  ON public.expenses (status, date);

CREATE INDEX IF NOT EXISTS idx_payment_batches_status_payment_date
  ON public.payment_batches (status, payment_date);
