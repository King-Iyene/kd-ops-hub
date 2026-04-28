-- Add platform-wide timezone setting to company_settings.
-- Default: Africa/Lagos (WAT, UTC+1) — the correct timezone for Nigeria.
-- All date/time displays in the UI read this value via localStorage cache.
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'Africa/Lagos';
