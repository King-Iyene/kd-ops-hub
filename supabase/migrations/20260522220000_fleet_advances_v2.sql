-- Phase 1 — vehicle_id on fuel_requests (budget guardrail tracking)
ALTER TABLE public.fuel_requests
  ADD COLUMN IF NOT EXISTS vehicle_id uuid REFERENCES public.vehicles(id) ON DELETE SET NULL;

-- Phase 2 — batch_id on fuel_requests (auto-pay linkage)
ALTER TABLE public.fuel_requests
  ADD COLUMN IF NOT EXISTS batch_id uuid REFERENCES public.payment_batches(id) ON DELETE SET NULL;

-- Phase 3 — repayment_months on payment_batches (advance repayment plan)
ALTER TABLE public.payment_batches
  ADD COLUMN IF NOT EXISTS repayment_months int NOT NULL DEFAULT 1;

-- Phase 3 — employee_advances: tracks outstanding salary advances and
-- their monthly repayment deduction schedule.
CREATE TABLE IF NOT EXISTS public.employee_advances (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id          uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  source_batch_id      uuid REFERENCES public.payment_batches(id) ON DELETE SET NULL,
  source_batch_item_id uuid REFERENCES public.batch_items(id) ON DELETE SET NULL,
  amount_ngn           numeric NOT NULL DEFAULT 0,
  outstanding_ngn      numeric NOT NULL DEFAULT 0,
  repayment_months     int NOT NULL DEFAULT 3,
  -- deduction_per_month is computed; updated on outstanding_ngn changes
  deduction_per_month  numeric GENERATED ALWAYS AS (
    CASE WHEN repayment_months > 0
         THEN ROUND(amount_ngn / repayment_months, 2)
         ELSE 0 END
  ) STORED,
  start_period         text,
  status               text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'settled', 'cancelled')),
  notes                text,
  created_at           timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.employee_advances ENABLE ROW LEVEL SECURITY;

-- Employees see their own advances; managers see all.
DROP POLICY IF EXISTS "advances_select" ON public.employee_advances;
CREATE POLICY "advances_select" ON public.employee_advances
  FOR SELECT USING (
    employee_id = auth.uid()
    OR public.current_user_role() IN ('super_admin', 'admin', 'finance', 'operations')
  );

DROP POLICY IF EXISTS "advances_insert" ON public.employee_advances;
CREATE POLICY "advances_insert" ON public.employee_advances
  FOR INSERT WITH CHECK (
    public.current_user_role() IN ('super_admin', 'admin', 'finance')
  );

DROP POLICY IF EXISTS "advances_update" ON public.employee_advances;
CREATE POLICY "advances_update" ON public.employee_advances
  FOR UPDATE USING (
    public.current_user_role() IN ('super_admin', 'admin', 'finance')
  );

COMMENT ON TABLE public.employee_advances IS
  'Outstanding salary advances. deduction_per_month is auto-computed from amount_ngn / repayment_months.';
