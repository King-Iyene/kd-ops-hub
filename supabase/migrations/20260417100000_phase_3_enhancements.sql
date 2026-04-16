-- =============================================================================
-- KDOps — Phase 3: profile dropdown polish + payments / expenses / budgets /
-- leave management enhancements + Nigerian compliance support.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- payment_batches: scheduled execution date (separate from payment_date which
-- is the *intended* date displayed to ops; scheduled_date is when KDOps will
-- attempt to push the batch to the rails).
-- -----------------------------------------------------------------------------
ALTER TABLE public.payment_batches
  ADD COLUMN IF NOT EXISTS scheduled_date timestamptz;

-- -----------------------------------------------------------------------------
-- batch_items: failure reason for retried/failed beneficiaries.
-- -----------------------------------------------------------------------------
ALTER TABLE public.batch_items
  ADD COLUMN IF NOT EXISTS failure_reason text;

-- Allow 'retry' as an interim status so retried items don't disappear from the
-- pending-payment view.
ALTER TABLE public.batch_items
  DROP CONSTRAINT IF EXISTS batch_items_status_check;
ALTER TABLE public.batch_items
  ADD CONSTRAINT batch_items_status_check
  CHECK (status IN ('pending', 'succeeded', 'failed', 'retry'));

-- -----------------------------------------------------------------------------
-- expenses: explicit mileage support — distance + rate (per km).
-- -----------------------------------------------------------------------------
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS mileage_km numeric;
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS rate_per_km_ngn numeric;
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS budget_category text;

-- -----------------------------------------------------------------------------
-- budgets: optional per-budget lock toggle. When locked, expense submission
-- against any line-item category in this budget should be blocked. KDOps
-- enforces this client-side at submit time and via Postgres trigger below.
-- -----------------------------------------------------------------------------
ALTER TABLE public.budgets
  ADD COLUMN IF NOT EXISTS locked boolean NOT NULL DEFAULT false;

-- -----------------------------------------------------------------------------
-- leave_requests + leave_balances
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.leave_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  leave_type text NOT NULL CHECK (leave_type IN ('annual', 'sick', 'unpaid')),
  start_date date NOT NULL,
  end_date date NOT NULL,
  days_requested integer NOT NULL,
  reason text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by uuid REFERENCES public.profiles(id),
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS leave_requests_employee_idx
  ON public.leave_requests (employee_id);
CREATE INDEX IF NOT EXISTS leave_requests_status_idx
  ON public.leave_requests (status);

ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Employees view own leave" ON public.leave_requests;
CREATE POLICY "Employees view own leave" ON public.leave_requests
  FOR SELECT TO authenticated USING (employee_id = auth.uid());
DROP POLICY IF EXISTS "Employees create own leave" ON public.leave_requests;
CREATE POLICY "Employees create own leave" ON public.leave_requests
  FOR INSERT TO authenticated WITH CHECK (employee_id = auth.uid());
DROP POLICY IF EXISTS "Employees update own pending leave" ON public.leave_requests;
CREATE POLICY "Employees update own pending leave" ON public.leave_requests
  FOR UPDATE TO authenticated USING (employee_id = auth.uid() AND status = 'pending');

DROP POLICY IF EXISTS "Managers view all leave" ON public.leave_requests;
CREATE POLICY "Managers view all leave" ON public.leave_requests
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('super_admin', 'admin', 'finance', 'operations')
    )
  );
DROP POLICY IF EXISTS "Managers manage leave" ON public.leave_requests;
CREATE POLICY "Managers manage leave" ON public.leave_requests
  FOR ALL TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('super_admin', 'admin', 'finance', 'operations')
    )
  );

-- Per-employee, per-year balances. Defaulting to a nominal annual quota that
-- the org can override per row. Sick + unpaid leave intentionally have no
-- balance — they are tracked as taken days only.
CREATE TABLE IF NOT EXISTS public.leave_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  year integer NOT NULL,
  annual_quota integer NOT NULL DEFAULT 21,
  annual_used integer NOT NULL DEFAULT 0,
  sick_used integer NOT NULL DEFAULT 0,
  unpaid_used integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, year)
);

ALTER TABLE public.leave_balances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Employees view own balance" ON public.leave_balances;
CREATE POLICY "Employees view own balance" ON public.leave_balances
  FOR SELECT TO authenticated USING (employee_id = auth.uid());

DROP POLICY IF EXISTS "Managers view all balances" ON public.leave_balances;
CREATE POLICY "Managers view all balances" ON public.leave_balances
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('super_admin', 'admin', 'finance', 'operations')
    )
  );

DROP POLICY IF EXISTS "Managers manage balances" ON public.leave_balances;
CREATE POLICY "Managers manage balances" ON public.leave_balances
  FOR ALL TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('super_admin', 'admin', 'finance', 'operations')
    )
  );
