-- ─────────────────────────────────────────────────────────────────
-- mfa_required_for_all_users — platform-wide 2FA policy.
--
-- super_admin can toggle this in Settings → Security. When ON,
-- every user is required to enrol an authenticator-app TOTP factor;
-- the front-end shows a non-dismissible banner pointing to
-- /profile until they comply. Backend enforcement (e.g. blocking
-- sensitive RPCs) can be layered on top later — this migration
-- only adds the policy bit.
--
-- Default OFF so the column is additive and pre-existing tenants
-- aren't surprised.
-- ─────────────────────────────────────────────────────────────────

ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS mfa_required_for_all_users boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.company_settings.mfa_required_for_all_users IS
  'When TRUE, every user is required to enrol a TOTP MFA factor. '
  'super_admin only can toggle. Front-end shows a non-dismissible '
  'banner pointing to /profile when enabled and the user has no '
  'enrolled factor. RLS / RPC enforcement may be added in a follow-'
  'up; this column is the policy declaration.';

NOTIFY pgrst, 'reload schema';
