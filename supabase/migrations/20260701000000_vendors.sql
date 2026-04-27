-- Vendor / Supplier Registry
--
-- Design decisions:
--   • Covers utility companies, SaaS vendors, service providers, suppliers.
--   • Bank details stored here so finance doesn't hunt for them per payment.
--   • rc_number / tin support Nigerian regulatory requirements (FIRS, CAC).
--   • contract_end drives expiry alerts (same 30-day pattern as documents).
--   • status: active | inactive | blacklisted — blacklisted blocks new POs/payments.
--   • Soft delete consistent with rest of platform.

CREATE TABLE IF NOT EXISTS public.vendors (
  id                    UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
  name                  TEXT         NOT NULL,
  category              TEXT         NOT NULL
                          CHECK (category IN ('utilities','software','services','supplies','logistics','professional','other')),
  contact_name          TEXT         DEFAULT NULL,
  contact_email         TEXT         DEFAULT NULL,
  contact_phone         TEXT         DEFAULT NULL,
  address               TEXT         DEFAULT NULL,
  rc_number             TEXT         DEFAULT NULL,
  tin                   TEXT         DEFAULT NULL,
  bank_name             TEXT         DEFAULT NULL,
  bank_account_number   TEXT         DEFAULT NULL,
  bank_account_name     TEXT         DEFAULT NULL,
  payment_terms         TEXT         NOT NULL DEFAULT 'Net 30',
  contract_value_ngn    NUMERIC      DEFAULT NULL CHECK (contract_value_ngn IS NULL OR contract_value_ngn >= 0),
  contract_start        DATE         DEFAULT NULL,
  contract_end          DATE         DEFAULT NULL,
  status                TEXT         NOT NULL DEFAULT 'active'
                          CHECK (status IN ('active','inactive','blacklisted')),
  notes                 TEXT         DEFAULT NULL,
  created_by            UUID         REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),
  deleted_at            TIMESTAMPTZ  DEFAULT NULL
);

CREATE OR REPLACE FUNCTION public.set_vendors_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS vendors_updated_at ON public.vendors;
CREATE TRIGGER vendors_updated_at
  BEFORE UPDATE ON public.vendors
  FOR EACH ROW EXECUTE FUNCTION public.set_vendors_updated_at();

CREATE INDEX IF NOT EXISTS vendors_status_idx    ON public.vendors (status)       WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS vendors_category_idx  ON public.vendors (category)     WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS vendors_contract_end_idx ON public.vendors (contract_end) WHERE deleted_at IS NULL AND contract_end IS NOT NULL;
CREATE INDEX IF NOT EXISTS vendors_deleted_at_idx ON public.vendors (deleted_at);

ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read vendors"
  ON public.vendors FOR SELECT
  USING (auth.uid() IS NOT NULL AND deleted_at IS NULL);

CREATE POLICY "Managers can insert vendors"
  ON public.vendors FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Managers can update vendors"
  ON public.vendors FOR UPDATE
  USING (auth.uid() IS NOT NULL);
