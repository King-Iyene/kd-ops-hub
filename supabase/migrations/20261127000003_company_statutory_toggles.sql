-- Company-level master switches for statutory deductions.
-- When a company toggle is OFF, the deduction is skipped for ALL employees
-- regardless of their per-employee profile flag.  When ON, the per-employee
-- flag still controls whether that individual participates.
--
-- nsitf_enabled and itf_enabled already exist (defaults TRUE).
-- We add the remaining four.

ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS pension_enabled  boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS nhf_enabled      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS nhis_enabled     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS paye_enabled     boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS development_levy_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.company_settings.pension_enabled  IS 'Master switch: employee pension deduction (8%) + employer contribution (10%)';
COMMENT ON COLUMN public.company_settings.nhf_enabled      IS 'Master switch: National Housing Fund (2.5%)';
COMMENT ON COLUMN public.company_settings.nhis_enabled     IS 'Master switch: National Health Insurance (5% employee + 5% employer)';
COMMENT ON COLUMN public.company_settings.paye_enabled     IS 'Master switch: Pay-As-You-Earn income tax';
COMMENT ON COLUMN public.company_settings.development_levy_enabled IS 'Master switch: Development Levy (flat annual charge)';

ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS development_levy_annual_ngn numeric NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.company_settings.development_levy_annual_ngn IS 'Annual Development Levy amount per employee in NGN (varies by state, typically ₦100–₦500)';
