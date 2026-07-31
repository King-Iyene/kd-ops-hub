-- Statutory export fields (additive, non-breaking).
--
-- Adds the identifiers required by LIRS eTax, FIRS TaxPro Max, PenCom PSSP,
-- NHF, NSITF and ITF filing schedules that KDOps generates from an approved
-- payroll run. All columns are nullable so existing rows are unaffected.
--
-- No changes to payments, payroll, RLS or any existing behaviour.

-- Per-employee identifiers used across state IRS returns.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS state_of_residence text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS staff_number       text;

-- Per-employee PFA code (used by PenCom PSSP schedule). Human PFA name is
-- already captured in employee_benefits.provider — this holds the numeric
-- code required by the schedule file.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS pfa_code text;

COMMENT ON COLUMN profiles.state_of_residence IS 'State whose SIRS receives PAYE for this employee (e.g. Lagos, FCT, Rivers).';
COMMENT ON COLUMN profiles.staff_number       IS 'Employer-assigned staff/payroll number for statutory schedules.';
COMMENT ON COLUMN profiles.pfa_code           IS 'PenCom PSSP Pension Fund Administrator code (required by PSSP schedule).';

-- Employer identifiers used on the header of every statutory return.
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS employer_tin           text;
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS employer_rc_number     text;
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS state_of_business      text;
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS pencom_employer_code   text;
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS nhf_employer_code      text;
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS nsitf_employer_code    text;
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS itf_employer_code      text;

COMMENT ON COLUMN company_settings.employer_tin         IS 'Federal Inland Revenue Service Tax Identification Number.';
COMMENT ON COLUMN company_settings.employer_rc_number   IS 'CAC registration (RC) number.';
COMMENT ON COLUMN company_settings.state_of_business    IS 'Default state for filings when profile.state_of_residence is blank.';
COMMENT ON COLUMN company_settings.pencom_employer_code IS 'PenCom-issued employer code for PSSP submissions.';
COMMENT ON COLUMN company_settings.nhf_employer_code    IS 'FMBN-issued employer code for NHF remittance.';
COMMENT ON COLUMN company_settings.nsitf_employer_code  IS 'NSITF-issued employer code for ECS remittance.';
COMMENT ON COLUMN company_settings.itf_employer_code    IS 'ITF-issued employer code for annual return.';
