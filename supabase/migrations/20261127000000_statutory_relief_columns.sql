-- Add columns needed for full statutory relief deductions in PAYE schedules.
--
-- payroll_run_items: add nhis_ngn and avc_ngn so statutory exporters can
-- include NHIS and AVC (Additional Voluntary Contribution) when computing
-- chargeable income. Previously these lived only on the payslips table.
--
-- profiles: add annual_rent_ngn and annual_life_assurance_ngn so that
-- rent relief (s.5 NTA / s.33 PITA) and life-assurance premiums
-- (s.33(4) PITA) can be captured per employee and included in the
-- chargeable income calculation for statutory filings.

ALTER TABLE public.payroll_run_items
  ADD COLUMN IF NOT EXISTS nhis_ngn numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS avc_ngn  numeric NOT NULL DEFAULT 0;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS annual_rent_ngn           numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS annual_life_assurance_ngn  numeric DEFAULT 0;

COMMENT ON COLUMN public.payroll_run_items.nhis_ngn IS 'Employee NHIS contribution for this run period';
COMMENT ON COLUMN public.payroll_run_items.avc_ngn  IS 'Additional Voluntary Contribution (AVC) deducted for this run period';
COMMENT ON COLUMN public.profiles.annual_rent_ngn          IS 'Annual rent paid — used for rent relief in PAYE chargeable income';
COMMENT ON COLUMN public.profiles.annual_life_assurance_ngn IS 'Annual life assurance/annuity premiums — deductible per s.33(4) PITA';
