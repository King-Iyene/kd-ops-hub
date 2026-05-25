-- =============================================================================
-- Finance Phase 2c — earning RULES (retention-gated referral, tiered affiliate).
--
-- Two programmes, two distinct rules (per the business):
--
--   REFERRAL  — ONE-TIME bonus. A referred account that stays active for at
--               least `referral_qualifying_days` (default 30) earns the referrer
--               the referral rate ONCE for that account. The clock runs from a
--               per-referral `account_start_date` (custom, falls back to
--               converted_at then created_at for legacy rows).
--
--   AFFILIATE — RECURRING (monthly) per active account, TIERED. Each affiliate
--               earns the base rate per active account; once they reach
--               `affiliate_tier_threshold` (default 50) active accounts, the
--               increased rate applies. `affiliate_tier_mode` decides whether the
--               higher rate is MARGINAL (only accounts above the threshold) or
--               WHOLE-tier (every account). Default 'marginal' per the owner.
--
-- All amounts stay in USD minor units (cents); NGN derives from the live fx_rate.
-- Additive only — no drops, safe defaults so existing rows keep working.
-- =============================================================================

-- Per-referral custom start date for the retention clock (one-time referral bonus).
ALTER TABLE public.referrals
  ADD COLUMN IF NOT EXISTS account_start_date date;

COMMENT ON COLUMN public.referrals.account_start_date IS
  'Custom date the referred account went live; start of the retention clock for '
  'the one-time referral bonus. Falls back to converted_at then created_at when null.';

-- Programme rule parameters on the singleton company_settings row.
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS referral_qualifying_days      integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS affiliate_rate_tier2_usd_minor bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS affiliate_tier_threshold      integer NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS affiliate_tier_mode           text    NOT NULL DEFAULT 'marginal';

-- Guard rails (non-negative parameters; mode is one of the two known shapes).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'company_settings_referral_qualifying_days_chk') THEN
    ALTER TABLE public.company_settings
      ADD CONSTRAINT company_settings_referral_qualifying_days_chk CHECK (referral_qualifying_days >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'company_settings_affiliate_tier_threshold_chk') THEN
    ALTER TABLE public.company_settings
      ADD CONSTRAINT company_settings_affiliate_tier_threshold_chk CHECK (affiliate_tier_threshold >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'company_settings_affiliate_tier_mode_chk') THEN
    ALTER TABLE public.company_settings
      ADD CONSTRAINT company_settings_affiliate_tier_mode_chk CHECK (affiliate_tier_mode IN ('marginal', 'whole'));
  END IF;
END;
$$;

COMMENT ON COLUMN public.company_settings.referral_qualifying_days IS
  'Days a referred account must stay active before the one-time referral bonus is earned (default 30).';
COMMENT ON COLUMN public.company_settings.affiliate_rate_tier2_usd_minor IS
  'Increased affiliate recurring rate per account (USD minor units), applied once the affiliate '
  'reaches affiliate_tier_threshold active accounts. 0 = not configured (treat as base rate).';
COMMENT ON COLUMN public.company_settings.affiliate_tier_threshold IS
  'Active-account count at which an affiliate moves to the increased rate (default 50).';
COMMENT ON COLUMN public.company_settings.affiliate_tier_mode IS
  'How the increased affiliate rate applies at/above the threshold: '
  '''marginal'' = only accounts above the threshold; ''whole'' = every account. Default ''marginal''.';
