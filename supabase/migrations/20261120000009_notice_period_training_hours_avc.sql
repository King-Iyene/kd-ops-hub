-- HR compliance improvements:
-- 1. notice_period_days on profiles (Labour Act s.11 — statutory notice)
-- 2. duration_hours on training_records (ISO 30414 — training intensity metric)
-- 3. voluntary_pension_pct on profiles (PRA 2014 — Additional Voluntary Contribution)

-- 1. Notice period — defaults to 30 days per Labour Act s.11(2) for monthly-paid staff.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS notice_period_days INTEGER DEFAULT 30;

COMMENT ON COLUMN public.profiles.notice_period_days IS
  'Contractual notice period in calendar days. Nigerian Labour Act s.11 minimum: '
  '1 day (daily), 1 week (weekly), 1 month (monthly paid). Default 30 for monthly.';

-- 2. Training duration in hours — ISO 30414 requires "average training hours per employee".
ALTER TABLE public.training_records
  ADD COLUMN IF NOT EXISTS duration_hours NUMERIC;

COMMENT ON COLUMN public.training_records.duration_hours IS
  'Duration of the training/certification in hours. Used for ISO 30414 reporting '
  '(average training hours per employee per year).';

-- 3. Additional Voluntary Contribution — PRA 2014 s.4(3) allows employees to
--    contribute above the mandatory 8% into their RSA. Stored as a percentage
--    of the pension base (basic+housing+transport when components are used).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS voluntary_pension_pct NUMERIC DEFAULT 0;

COMMENT ON COLUMN public.profiles.voluntary_pension_pct IS
  'Additional Voluntary Contribution (AVC) as a percentage of pension base. '
  'PRA 2014 s.4(3) — employee may exceed the statutory 8% minimum.';
