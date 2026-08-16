-- Adds a configurable late-clock-in threshold to company_settings.
--   • late_threshold_time — the cutoff after which a clock-in is flagged
--     'late'. Previously hardcoded to 09:15 in ClockInWidget; now tenants
--     with different office hours can configure their own.
--
-- Idempotent — uses IF NOT EXISTS.

ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS late_threshold_time time DEFAULT '09:15';

COMMENT ON COLUMN public.company_settings.late_threshold_time IS
  'Clock-in cutoff time after which attendance is flagged late. Defaults to 09:15.';
