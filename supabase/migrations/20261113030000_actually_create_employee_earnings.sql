-- ═══════════════════════════════════════════════════════════════════════
-- Fix: employee_earnings was never actually created despite
-- schema_migrations recording 20261029000000 as applied.
-- ═══════════════════════════════════════════════════════════════════════
--
-- Discovered while tightening RLS on employee_earnings (second forensic
-- pass): the table doesn't exist in the live database at all, and
-- payslips.earnings_json is also missing — meaning the ENTIRE
-- 20261029000000_employee_earnings_and_payslip_breakdown.sql migration
-- never actually ran, even though its version is present in
-- supabase_migrations.schema_migrations (confirmed: payslips.deductions_ngn
-- /deductions_json from the earlier 20260425120000 migration DO exist, so
-- this isn't a payslips-table problem — specifically the 20261029000000
-- migration's own DDL silently never executed before its version got
-- reconciled). Net effect: the "Structured Earnings" feature (recurring
-- allowances that auto-apply each pay run, same as employee_deductions)
-- has been completely non-functional in production — every
-- .from('employee_earnings') call in EmployeeProfile.tsx/Payroll.tsx has
-- been failing with a "relation does not exist" error.
--
-- Fix: re-run the original table-creation DDL now (safe — CREATE TABLE IF
-- NOT EXISTS / ADD COLUMN IF NOT EXISTS throughout, nothing to clobber
-- since nothing exists yet), with the tightened RLS policy from
-- 20261113020000 applied directly (not the original broad USING (true))
-- since that's already been identified as the wrong policy to ship.
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.employee_earnings (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id               uuid        NOT NULL,
  entity_type             text        NOT NULL CHECK (entity_type IN ('employee', 'contractor')),
  description             text        NOT NULL,
  amount_ngn              numeric     NOT NULL CHECK (amount_ngn > 0),
  currency                text        NOT NULL DEFAULT 'NGN',
  frequency               text        NOT NULL DEFAULT 'monthly'
                            CHECK (frequency IN ('monthly', 'per_payroll_run', 'one_time')),
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

-- Tightened policy from the start (see 20261113020000) — never shipped the
-- broad USING (true) version since the table itself never existed until now.
CREATE POLICY "employee_earnings_read_own_or_finance"
  ON public.employee_earnings
  FOR SELECT
  TO authenticated
  USING (
    entity_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('super_admin', 'admin', 'finance')
        AND status = 'active'
    )
  );

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

ALTER TABLE public.payslips
  ADD COLUMN IF NOT EXISTS earnings_json jsonb;
