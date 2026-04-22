-- Add Nigerian statutory identity fields to profiles.
-- All nullable text — existing rows remain unchanged.
-- NOTE: pension_pin already exists (used as RSA PIN for pension fund).

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS nin          text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS nhf_number   text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS nhis_number  text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS tin          text;

-- Opt-in flags so HR can turn statutory deductions on/off per employee
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS pension_enabled boolean DEFAULT true;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS nhf_enabled     boolean DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS nhis_enabled    boolean DEFAULT false;

COMMENT ON COLUMN profiles.nin          IS '11-digit National Identification Number';
COMMENT ON COLUMN profiles.nhf_number   IS 'National Housing Fund contribution number';
COMMENT ON COLUMN profiles.nhis_number  IS 'National Health Insurance / HMO enrollment number';
COMMENT ON COLUMN profiles.tin          IS 'Tax Identification Number (FIRS)';
