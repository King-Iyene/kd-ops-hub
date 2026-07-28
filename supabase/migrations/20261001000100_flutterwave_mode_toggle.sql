-- =============================================================================
-- Migration: 20261001000100_flutterwave_mode_toggle.sql
-- =============================================================================
-- Adds company_settings.flutterwave_mode so the flutterwave-* edge functions
-- know which set of secrets (TEST vs LIVE) to read at request time.
--
-- Why this is a separate column (not derived from the key prefix):
--   We store BOTH sets of Flutterwave secrets in Supabase simultaneously —
--   FLUTTERWAVE_SECRET_KEY_TEST / _LIVE, PUBLIC_KEY_TEST / _LIVE,
--   WEBHOOK_HASH_TEST / _LIVE — so that a mode flip is a single database
--   write and does not require re-uploading secrets during the cutover.
--   The mode column is the single source of truth the edge functions
--   consult to decide which suffix to append.
--
-- Same discipline as active_payment_provider: writes go through the
-- provider-switch edge function (super_admin only), audited into
-- provider_switches. In-flight batches are unaffected — they keep the
-- provider they were stamped with at dispatch time. Because provider is
-- paystack | flutterwave (not test | live), the mode flip only affects
-- future batches routed through Flutterwave; it does not change which
-- provider is active.
-- =============================================================================

ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS flutterwave_mode text NOT NULL DEFAULT 'test'
    CHECK (flutterwave_mode IN ('test','live'));

COMMENT ON COLUMN public.company_settings.flutterwave_mode IS
  'Selects which set of Flutterwave secrets the edge functions read: test uses FLUTTERWAVE_*_TEST, live uses FLUTTERWAVE_*_LIVE. Default test; flip only after a live smoke test succeeds.';

NOTIFY pgrst, 'reload schema';
