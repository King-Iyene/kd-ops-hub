-- =============================================================================
-- KDOps — API key storage columns on company_settings.
--
-- Keys are stored with a _enc suffix to signal they should be treated as
-- sensitive. In production, enable Supabase Vault or pgcrypto for at-rest
-- encryption. The application masks these fields in the UI (shows last 4
-- chars only after save).
-- =============================================================================

ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS paystack_secret_key_enc text;
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS paystack_public_key text;
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS resend_api_key_enc text;
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS termii_api_key_enc text;
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS smtp_password_enc text;
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS airtable_api_key_enc text;
