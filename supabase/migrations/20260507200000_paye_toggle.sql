-- Add PAYE tax as a toggleable statutory benefit, parallel to pension /
-- NHF / NHIS. Defaults ON because PAYE is the legal default in Nigeria
-- (Personal Income Tax Act applies to every employee in formal
-- employment unless explicitly exempt — e.g. consultants on a 1099-style
-- contract billed via withholding tax instead).
--
-- The `tax_id` column also gives finance a place to store the
-- employee's PIN / TIN for FIRS filings.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS paye_enabled boolean DEFAULT true;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS tax_id text;

NOTIFY pgrst, 'reload schema';
