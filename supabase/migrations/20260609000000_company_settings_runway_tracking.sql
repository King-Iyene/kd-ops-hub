-- Adds finance-runway tracking to company_settings.
--   • external_monthly_burn_ngn — manual estimate of recurring spend that
--     happens OUTSIDE the platform (rent, utilities, off-platform contractors,
--     etc.). Added to in-platform burn for accurate runway computation.
--   • cash_updated_at — timestamp of the last cash-on-hand update so the UI
--     can warn finance when the figure has gone stale (>7 days old).
--   • monthly_revenue_estimate_ngn — optional rough monthly revenue to
--     compute net burn (burn − revenue) for a more honest runway.
--
-- Idempotent — uses IF NOT EXISTS.

ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS external_monthly_burn_ngn   numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monthly_revenue_estimate_ngn numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cash_updated_at             timestamptz;

COMMENT ON COLUMN public.company_settings.external_monthly_burn_ngn IS
  'Manual estimate of recurring monthly spend that does not flow through the platform (rent, utilities, off-platform contractors). Added to in-platform burn for runway calculations.';

COMMENT ON COLUMN public.company_settings.monthly_revenue_estimate_ngn IS
  'Optional rough monthly revenue figure used to compute net burn. Leave 0 if revenue is volatile or unknown.';

COMMENT ON COLUMN public.company_settings.cash_updated_at IS
  'When cash_on_hand_ngn was last updated. UI warns finance when stale (>7 days).';
