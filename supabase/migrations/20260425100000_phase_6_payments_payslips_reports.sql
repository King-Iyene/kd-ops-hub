-- =============================================================================
-- KDOps — Phase 6: live payments, payslips, reports, settings, goals,
-- rejection flow.
--
--   • Extend company_settings with cash-on-hand, SMTP, Paystack mode toggle,
--     session timeout, fuel-weekly-budget overrides.
--   • payslips table + payslips Storage bucket.
--   • bank_statements table + bank-statements Storage bucket + statement_entries
--     with a per-entry match record.
--   • Resubmission support on the four rejectable entities
--     (expenses, fuel_requests, budgets, leave_requests) — a rejection_reason
--     column and a nullable resubmitted_from_id backref.
--   • paystack transfer code + reference columns on batch_items.
--
-- Idempotent — safe under supabase db push.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- company_settings extensions
-- -----------------------------------------------------------------------------
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS website text;
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS cash_on_hand_ngn numeric DEFAULT 0;
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS fiscal_year_preset text
  CHECK (fiscal_year_preset IN ('jan_dec', 'apr_mar')) DEFAULT 'jan_dec';

-- Paystack live/test mode toggle + display flags (no secret key is ever
-- persisted in a plain column — only a boolean confirming one is configured
-- via the env vars, plus the webhook URL we display in Settings).
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS paystack_mode text
  CHECK (paystack_mode IN ('test', 'live')) DEFAULT 'test';
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS paystack_webhook_url text;

-- Airtable integration display
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS airtable_base_id text;
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS airtable_income_table_id text;
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS airtable_expenses_table_id text;
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS airtable_sync_enabled boolean DEFAULT false;

-- SMTP config (username only for display; actual creds live in env vars).
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS smtp_host text;
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS smtp_port integer;
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS smtp_username text;
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS smtp_from_address text;

-- Security
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS session_timeout_minutes integer DEFAULT 120;

-- Per-department fuel weekly budget overrides (jsonb map).
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS fuel_weekly_budgets jsonb NOT NULL DEFAULT '{}'::jsonb;

-- -----------------------------------------------------------------------------
-- payslips — one row per run/employee, stored PDF-ish HTML or signed link.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payslips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_run_id uuid NOT NULL REFERENCES public.payroll_runs(id) ON DELETE CASCADE,
  employee_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  employee_name text NOT NULL,
  employee_email text,
  period text NOT NULL,
  gross_ngn numeric NOT NULL DEFAULT 0,
  paye_ngn numeric NOT NULL DEFAULT 0,
  pension_ngn numeric NOT NULL DEFAULT 0,
  nhf_ngn numeric NOT NULL DEFAULT 0,
  net_ngn numeric NOT NULL DEFAULT 0,
  storage_path text,
  generated_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payslips_employee_idx ON public.payslips (employee_id);
CREATE INDEX IF NOT EXISTS payslips_run_idx ON public.payslips (payroll_run_id);

ALTER TABLE public.payslips ENABLE ROW LEVEL SECURITY;

-- Employees see their own payslips; managers see everyone's.
DROP POLICY IF EXISTS "payslips_read" ON public.payslips;
CREATE POLICY "payslips_read" ON public.payslips
  FOR SELECT TO authenticated USING (
    employee_id = auth.uid()
    OR public.get_my_role() IN ('super_admin', 'admin', 'finance')
  );

DROP POLICY IF EXISTS "payslips_write" ON public.payslips;
CREATE POLICY "payslips_write" ON public.payslips
  FOR ALL TO authenticated USING (
    public.get_my_role() IN ('super_admin', 'admin', 'finance')
  );

-- Payslips Storage bucket.
INSERT INTO storage.buckets (id, name, public)
VALUES ('payslips', 'payslips', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "payslips_read_storage" ON storage.objects;
CREATE POLICY "payslips_read_storage" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'payslips');

DROP POLICY IF EXISTS "payslips_write_storage" ON storage.objects;
CREATE POLICY "payslips_write_storage" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'payslips'
    AND public.get_my_role() IN ('super_admin', 'admin', 'finance')
  );

-- -----------------------------------------------------------------------------
-- bank_statements + statement_entries
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bank_statements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_name text NOT NULL,
  account_number text,
  period_start date,
  period_end date,
  storage_path text,
  uploaded_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.bank_statements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bank_statements_all" ON public.bank_statements;
CREATE POLICY "bank_statements_all" ON public.bank_statements
  FOR ALL TO authenticated USING (
    public.get_my_role() IN ('super_admin', 'admin', 'finance')
  );

CREATE TABLE IF NOT EXISTS public.statement_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  statement_id uuid NOT NULL REFERENCES public.bank_statements(id) ON DELETE CASCADE,
  entry_date date NOT NULL,
  description text,
  amount_ngn numeric NOT NULL,
  reference text,
  direction text NOT NULL CHECK (direction IN ('debit', 'credit')),
  -- Matching decision
  matched_type text CHECK (matched_type IN ('batch', 'expense', 'other', null)),
  matched_id uuid,
  matched_at timestamptz,
  matched_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS statement_entries_statement_idx
  ON public.statement_entries (statement_id);
CREATE INDEX IF NOT EXISTS statement_entries_date_idx
  ON public.statement_entries (entry_date);

ALTER TABLE public.statement_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "statement_entries_all" ON public.statement_entries;
CREATE POLICY "statement_entries_all" ON public.statement_entries
  FOR ALL TO authenticated USING (
    public.get_my_role() IN ('super_admin', 'admin', 'finance')
  );

-- Bank statements Storage bucket (private).
INSERT INTO storage.buckets (id, name, public)
VALUES ('bank-statements', 'bank-statements', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "bank_statements_storage_read" ON storage.objects;
CREATE POLICY "bank_statements_storage_read" ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id = 'bank-statements'
    AND public.get_my_role() IN ('super_admin', 'admin', 'finance')
  );

DROP POLICY IF EXISTS "bank_statements_storage_write" ON storage.objects;
CREATE POLICY "bank_statements_storage_write" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'bank-statements'
    AND public.get_my_role() IN ('super_admin', 'admin', 'finance')
  );

-- -----------------------------------------------------------------------------
-- Resubmission flow on rejectable entities
-- -----------------------------------------------------------------------------
ALTER TABLE public.expenses        ADD COLUMN IF NOT EXISTS rejection_reason text;
ALTER TABLE public.expenses        ADD COLUMN IF NOT EXISTS resubmitted_from_id uuid REFERENCES public.expenses(id) ON DELETE SET NULL;

ALTER TABLE public.fuel_requests   ADD COLUMN IF NOT EXISTS rejection_reason text;
ALTER TABLE public.fuel_requests   ADD COLUMN IF NOT EXISTS resubmitted_from_id uuid REFERENCES public.fuel_requests(id) ON DELETE SET NULL;

-- leave_requests already has rejection_reason from phase 3; add resubmit
ALTER TABLE public.leave_requests  ADD COLUMN IF NOT EXISTS resubmitted_from_id uuid REFERENCES public.leave_requests(id) ON DELETE SET NULL;

-- budgets already has rejection_reason; add resubmit.
ALTER TABLE public.budgets         ADD COLUMN IF NOT EXISTS resubmitted_from_id uuid REFERENCES public.budgets(id) ON DELETE SET NULL;

-- -----------------------------------------------------------------------------
-- Paystack transfer tracking on batch_items
-- -----------------------------------------------------------------------------
ALTER TABLE public.batch_items ADD COLUMN IF NOT EXISTS paystack_recipient_code text;
ALTER TABLE public.batch_items ADD COLUMN IF NOT EXISTS paystack_transfer_code text;
ALTER TABLE public.batch_items ADD COLUMN IF NOT EXISTS paystack_reference text;
ALTER TABLE public.batch_items ADD COLUMN IF NOT EXISTS paystack_raw jsonb;
ALTER TABLE public.batch_items ADD COLUMN IF NOT EXISTS processed_at timestamptz;

CREATE INDEX IF NOT EXISTS batch_items_reference_idx ON public.batch_items (paystack_reference);
