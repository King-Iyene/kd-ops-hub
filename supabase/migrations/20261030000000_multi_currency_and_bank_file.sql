-- =============================================================================
-- Phase 7 & 8: Multi-currency support + bank payment file generation
--
-- Phase 7: Adds per-employee pay_currency so some roles can be paid in USD
-- while most are paid in NGN. Payslips gain a currency column to persist
-- which currency each payslip was computed in.
--
-- Phase 8: Adds a bank_payment_files table for tracking generated payment
-- files (NIBSS, CSV) and their disbursement status.
--
-- Idempotent — safe under supabase db push.
-- =============================================================================

-- ── Phase 7: per-employee pay currency ──────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS pay_currency text NOT NULL DEFAULT 'NGN'
    CHECK (pay_currency IN ('NGN', 'USD'));

-- Payslips already have gross_ngn/net_ngn — add currency to clarify which
-- currency the amounts are denominated in (for USD employees, amounts are
-- still stored as-is but tagged with the currency).
ALTER TABLE public.payslips
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'NGN';

-- ── Phase 8: bank payment files ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bank_payment_files (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_run_id    uuid        REFERENCES public.payroll_runs(id),
  file_format       text        NOT NULL CHECK (file_format IN ('nibss', 'csv', 'excel')),
  file_name         text        NOT NULL,
  file_url          text,
  total_amount_ngn  numeric     NOT NULL DEFAULT 0,
  currency          text        NOT NULL DEFAULT 'NGN',
  record_count      integer     NOT NULL DEFAULT 0,
  status            text        NOT NULL DEFAULT 'generated'
                      CHECK (status IN ('generated', 'submitted', 'processed', 'failed')),
  generated_by      uuid        REFERENCES public.profiles(id),
  generated_at      timestamptz NOT NULL DEFAULT now(),
  submitted_at      timestamptz,
  processed_at      timestamptz
);

ALTER TABLE public.bank_payment_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "finance_manage_bank_payment_files"
  ON public.bank_payment_files FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('super_admin', 'admin', 'finance')
    )
  );
