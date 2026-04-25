-- Employee / contractor deductions scheduling
-- Deductions are applied automatically per payroll run based on the
-- eligibility criteria below. After a run is marked paid, each qualifying
-- deduction's amount_deducted_to_date is incremented, and the status is
-- auto-set to 'completed' once the total_deductible_amount cap is reached.

CREATE TABLE IF NOT EXISTS public.employee_deductions (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id               uuid        NOT NULL,
  entity_type             text        NOT NULL CHECK (entity_type IN ('employee', 'contractor')),
  description             text        NOT NULL,
  amount_ngn              numeric     NOT NULL CHECK (amount_ngn > 0),
  frequency               text        NOT NULL DEFAULT 'monthly'
                            CHECK (frequency IN ('monthly', 'per_payroll_run', 'one_time')),
  start_date              date        NOT NULL,
  end_date                date,
  total_deductible_amount numeric,
  amount_deducted_to_date numeric      NOT NULL DEFAULT 0,
  status                  text        NOT NULL DEFAULT 'active'
                            CHECK (status IN ('active', 'paused', 'completed')),
  created_by              uuid        REFERENCES public.profiles(id),
  created_at              timestamptz NOT NULL DEFAULT now()
);

-- Indexes for the per-payroll eligibility query
CREATE INDEX IF NOT EXISTS employee_deductions_entity_idx
  ON public.employee_deductions (entity_id, entity_type, status);

CREATE INDEX IF NOT EXISTS employee_deductions_start_date_idx
  ON public.employee_deductions (start_date);

ALTER TABLE public.employee_deductions ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read (payroll view needs all employees' deductions)
CREATE POLICY "Authenticated can read deductions"
  ON public.employee_deductions
  FOR SELECT
  TO authenticated
  USING (true);

-- Only admin / super_admin / finance can create / update / delete
CREATE POLICY "Finance roles can manage deductions"
  ON public.employee_deductions
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('super_admin', 'admin', 'finance')
        AND status = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('super_admin', 'admin', 'finance')
        AND status = 'active'
    )
  );

-- Add deductions_ngn and deductions_json columns to payslips if they don't exist
-- (best-effort; silently ignored if already present)
ALTER TABLE public.payslips
  ADD COLUMN IF NOT EXISTS deductions_ngn  numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deductions_json jsonb;
