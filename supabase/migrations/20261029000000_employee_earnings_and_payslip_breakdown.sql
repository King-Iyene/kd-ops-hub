-- =============================================================================
-- Phase 2: Structured Earnings & Deductions
--
-- Adds an employee_earnings table for recurring named allowances (meal,
-- utility, phone, etc.) that auto-apply each pay run — mirrors the existing
-- employee_deductions table. Also adds earnings_json to payslips so the
-- itemised breakdown is persisted alongside the totals.
--
-- Idempotent — safe under supabase db push.
-- =============================================================================

-- ── 1. employee_earnings — recurring allowances per employee ────────────────
CREATE TABLE IF NOT EXISTS public.employee_earnings (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id               uuid        NOT NULL,
  entity_type             text        NOT NULL CHECK (entity_type IN ('employee', 'contractor')),
  description             text        NOT NULL,
  amount_ngn              numeric     NOT NULL CHECK (amount_ngn > 0),
  currency                text        NOT NULL DEFAULT 'NGN',
  frequency               text        NOT NULL DEFAULT 'monthly'
                            CHECK (frequency IN ('monthly', 'per_payroll_run', 'one_time')),
  -- Categorises the earning for statutory treatment. "allowance" is added to
  -- gross but does not affect pension/NHF bases (same as other_allowances_ngn
  -- in computePayslip). "basic_component" means it should be treated as part
  -- of basic for statutory purposes — use sparingly.
  earning_type            text        NOT NULL DEFAULT 'allowance'
                            CHECK (earning_type IN ('allowance', 'basic_component', 'bonus', 'overtime', 'commission')),
  is_taxable              boolean     NOT NULL DEFAULT true,
  start_date              date        NOT NULL,
  end_date                date,
  status                  text        NOT NULL DEFAULT 'active'
                            CHECK (status IN ('active', 'paused', 'completed')),
  created_by              uuid        REFERENCES public.profiles(id),
  created_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS employee_earnings_entity_idx
  ON public.employee_earnings (entity_id, entity_type, status);

ALTER TABLE public.employee_earnings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read earnings"
  ON public.employee_earnings
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Finance roles can manage earnings"
  ON public.employee_earnings
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

-- ── 2. Persist itemised earnings on payslips ────────────────────────────────
ALTER TABLE public.payslips
  ADD COLUMN IF NOT EXISTS earnings_json jsonb;
