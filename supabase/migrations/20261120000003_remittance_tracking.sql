-- ----------------------------------------------------------------------------
-- Payroll tax remittance tracking.
--
-- compliance_filings already tracks *filing* deadlines (submitting the return
-- to FIRS/LIRS/PenCom/FMBN). This table tracks the separate step of actually
-- *paying* (remitting) the withheld PAYE/pension/NHF to those authorities —
-- something the app previously had no record of at all.
--
-- One row per (org, remittance_type, period_month). Rows are auto-created as
-- 'pending' from completed payroll runs by the React app (see Compliance.tsx)
-- the same way compliance_filings rows are auto-populated by the RPC in
-- 20260802000000_compliance_autopilot.sql.
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.tax_remittances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid,
  remittance_type text NOT NULL
    CHECK (remittance_type IN ('paye', 'pension', 'nhf', 'nsitf', 'itf', 'nhis')),
  period_month date NOT NULL,
  amount_ngn numeric NOT NULL DEFAULT 0,
  due_date date,
  remitted_at timestamptz,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'remitted', 'confirmed', 'late')),
  receipt_url text,
  provider_reference text,
  payroll_run_id uuid REFERENCES public.payroll_runs(id) ON DELETE SET NULL,
  notes text,
  created_by uuid REFERENCES public.profiles(id),
  remitted_by uuid REFERENCES public.profiles(id),
  confirmed_by uuid REFERENCES public.profiles(id),
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, remittance_type, period_month)
);

CREATE INDEX IF NOT EXISTS tax_remittances_period_idx
  ON public.tax_remittances (period_month);
CREATE INDEX IF NOT EXISTS tax_remittances_status_idx
  ON public.tax_remittances (status);
CREATE INDEX IF NOT EXISTS tax_remittances_payroll_run_idx
  ON public.tax_remittances (payroll_run_id)
  WHERE payroll_run_id IS NOT NULL;

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.tax_remittances
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.tax_remittances ENABLE ROW LEVEL SECURITY;

-- Same visibility rules as compliance_filings: finance/ops/admin roles read,
-- only admin/finance/super_admin can mutate.
DROP POLICY IF EXISTS "tax_remittances_read" ON public.tax_remittances;
CREATE POLICY "tax_remittances_read" ON public.tax_remittances
  FOR SELECT TO authenticated USING (
    public.current_user_role() IN ('super_admin', 'admin', 'finance', 'operations')
  );

DROP POLICY IF EXISTS "tax_remittances_write" ON public.tax_remittances;
CREATE POLICY "tax_remittances_write" ON public.tax_remittances
  FOR ALL TO authenticated USING (
    public.current_user_role() IN ('super_admin', 'admin', 'finance')
  ) WITH CHECK (
    public.current_user_role() IN ('super_admin', 'admin', 'finance')
  );

COMMENT ON TABLE public.tax_remittances IS
  'Tracks actual remittance of withheld PAYE/pension/NHF/NSITF/ITF/NHIS to the relevant authority, separate from compliance_filings (which tracks the filing/return deadline).';
COMMENT ON COLUMN public.tax_remittances.period_month IS
  'First-of-month date for the payroll period this remittance covers, e.g. 2026-04-01.';
COMMENT ON COLUMN public.tax_remittances.status IS
  'pending: not yet paid. remitted: paid, awaiting confirmation. confirmed: verified by an admin against the receipt. late: still pending/remitted past its due_date.';
