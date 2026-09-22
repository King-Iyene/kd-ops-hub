-- NDI Finance — standalone tables for Niger Delta Innovate's financial
-- tracking. Completely independent from Principal Disbursements.
-- These tables share NO foreign keys or views with Principal Disbursements.

-- NDI dedicated virtual account registration
CREATE TABLE IF NOT EXISTS ndi_dedicated_account (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES companies(id),
  paystack_customer_code text NOT NULL,
  account_number text NOT NULL,
  bank_name    text NOT NULL,
  account_name text,
  currency     text NOT NULL DEFAULT 'NGN',
  created_by   uuid REFERENCES auth.users(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id)
);

ALTER TABLE ndi_dedicated_account ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ndi_dedicated_account_admin_read"
  ON ndi_dedicated_account FOR SELECT
  TO authenticated
  USING (
    (auth.jwt() ->> 'user_role') IN ('super_admin', 'admin')
  );

CREATE POLICY "ndi_dedicated_account_admin_write"
  ON ndi_dedicated_account FOR ALL
  TO authenticated
  USING (
    (auth.jwt() ->> 'user_role') IN ('super_admin', 'admin')
  )
  WITH CHECK (
    (auth.jwt() ->> 'user_role') IN ('super_admin', 'admin')
  );

-- NDI wallet ledger — immutable, append-only
CREATE TABLE IF NOT EXISTS ndi_wallet_ledger (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES companies(id),
  direction   text NOT NULL CHECK (direction IN ('credit', 'debit')),
  amount_ngn  numeric(15,2) NOT NULL CHECK (amount_ngn > 0),
  category    text NOT NULL,
  description text,
  reference   text,
  created_by  uuid REFERENCES auth.users(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ndi_wallet_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ndi_wallet_ledger_admin_read"
  ON ndi_wallet_ledger FOR SELECT
  TO authenticated
  USING (
    (auth.jwt() ->> 'user_role') IN ('super_admin', 'admin')
  );

CREATE POLICY "ndi_wallet_ledger_admin_insert"
  ON ndi_wallet_ledger FOR INSERT
  TO authenticated
  WITH CHECK (
    (auth.jwt() ->> 'user_role') IN ('super_admin', 'admin')
  );

-- NDI beneficiaries — people/orgs NDI sends money to
CREATE TABLE IF NOT EXISTS ndi_beneficiaries (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES companies(id),
  name            text NOT NULL,
  bank_name       text NOT NULL,
  account_number  text NOT NULL,
  bank_code       text,
  paystack_recipient_code text,
  is_active       boolean NOT NULL DEFAULT true,
  created_by      uuid REFERENCES auth.users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ndi_beneficiaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ndi_beneficiaries_admin_all"
  ON ndi_beneficiaries FOR ALL
  TO authenticated
  USING (
    (auth.jwt() ->> 'user_role') IN ('super_admin', 'admin')
  )
  WITH CHECK (
    (auth.jwt() ->> 'user_role') IN ('super_admin', 'admin')
  );

-- NDI transfers — each disbursement from NDI's account
CREATE TABLE IF NOT EXISTS ndi_transfers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES companies(id),
  beneficiary_id  uuid REFERENCES ndi_beneficiaries(id),
  amount_ngn      numeric(15,2) NOT NULL CHECK (amount_ngn > 0),
  category        text NOT NULL,
  description     text,
  narration       text,
  paystack_reference text,
  paystack_transfer_code text,
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'success', 'failed', 'reversed')),
  created_by      uuid REFERENCES auth.users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz
);

ALTER TABLE ndi_transfers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ndi_transfers_admin_read"
  ON ndi_transfers FOR SELECT
  TO authenticated
  USING (
    (auth.jwt() ->> 'user_role') IN ('super_admin', 'admin')
  );

CREATE POLICY "ndi_transfers_admin_insert"
  ON ndi_transfers FOR INSERT
  TO authenticated
  WITH CHECK (
    (auth.jwt() ->> 'user_role') IN ('super_admin', 'admin')
  );

CREATE POLICY "ndi_transfers_admin_update"
  ON ndi_transfers FOR UPDATE
  TO authenticated
  USING (
    (auth.jwt() ->> 'user_role') IN ('super_admin', 'admin')
  )
  WITH CHECK (
    (auth.jwt() ->> 'user_role') IN ('super_admin', 'admin')
  );

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ndi_wallet_ledger_company
  ON ndi_wallet_ledger(company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ndi_transfers_company
  ON ndi_transfers(company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ndi_transfers_status
  ON ndi_transfers(status);

CREATE INDEX IF NOT EXISTS idx_ndi_beneficiaries_company
  ON ndi_beneficiaries(company_id);
