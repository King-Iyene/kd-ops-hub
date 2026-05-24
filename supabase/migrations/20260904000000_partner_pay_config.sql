-- =============================================================================
-- Finance Phase 1a — partner pay configuration (USD-denominated).
--
-- Partners are priced in USD (the business's thinking currency) and paid in NGN
-- at the locked FX rate (see fx_rates / Phase 0). This adds:
--   * company_settings.partner_pay_usd_minor — the GLOBAL default amount paid to
--     one partner, in USD minor units (cents). e.g. $500.00 = 50000.
--   * contractors.pay_amount_usd_minor — optional PER-PARTNER override (cents);
--     NULL means "use the global default".
--
-- Storing USD in integer minor units (never floats) keeps the math exact; the
-- NGN figure is always derived at calculation time from the active rate and is
-- never hand-entered. Additive only — no existing column or flow changes.
-- =============================================================================

ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS partner_pay_usd_minor bigint NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.company_settings.partner_pay_usd_minor IS
  'Global default pay for one partner, in USD minor units (cents). The Partner '
  'Pay calculator multiplies this by the active-partner count and converts to '
  'NGN at the active fx_rate.';

ALTER TABLE public.contractors
  ADD COLUMN IF NOT EXISTS pay_amount_usd_minor bigint;

COMMENT ON COLUMN public.contractors.pay_amount_usd_minor IS
  'Optional per-partner pay override in USD minor units (cents). NULL = use '
  'company_settings.partner_pay_usd_minor.';
