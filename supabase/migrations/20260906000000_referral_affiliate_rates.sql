-- =============================================================================
-- Finance Phase 2a — referral & affiliate commission rates (USD per account).
--
-- Referrals and affiliates are DISTINCT programmes with separate per-account USD
-- rates (fintech-standard CPA, not a percentage). These two "universal" fields
-- drive every payout calc; editing one updates what we owe across that
-- programme. NGN is derived from the active fx_rate at calculation time.
--
-- "How many accounts" is counted from the existing referrals table (qualifying =
-- status 'active'), split by is_affiliate — so nobody hand-counts. Additive only.
-- =============================================================================

ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS referral_rate_usd_minor  bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS affiliate_rate_usd_minor bigint NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.company_settings.referral_rate_usd_minor IS
  'Pay per qualifying REFERRED account, in USD minor units (cents). Applied to '
  'referrals where is_affiliate = false.';
COMMENT ON COLUMN public.company_settings.affiliate_rate_usd_minor IS
  'Pay per qualifying AFFILIATE account, in USD minor units (cents). Applied to '
  'referrals where is_affiliate = true.';
