-- Add bank_code column to profiles for Paystack transfers.
-- Mirrors contractors.bank_code. Derived from bank_name via NIGERIAN_BANKS.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS bank_code text;

COMMENT ON COLUMN profiles.bank_code IS 'Paystack bank code (e.g. 999992 for OPay). Derived from bank_name.';
