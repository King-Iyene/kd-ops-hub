-- Web Push notifications (PWA push subscriptions + per-user category prefs).
--
-- Architecture:
--   1. Browser asks the OS for permission and gets a PushSubscription
--      ({ endpoint, keys: { p256dh, auth } }) from the platform push service.
--   2. We store that subscription on push_subscriptions, scoped to the user.
--   3. The send-push edge function reads them, signs payloads with VAPID
--      keys (held in company_settings), and POSTs to each endpoint.
--   4. A user can have multiple subscriptions (laptop + phone). Per-category
--      opt-outs live on push_preferences so finance can mute "anomaly"
--      notifications without losing approval pings.
--
-- VAPID keys are stored in company_settings, NOT env vars, so each tenant
-- can rotate them from the dashboard without redeploying the edge function.

-- ── 1. Push subscriptions (one per device) ─────────────────────────────────

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  endpoint    text        NOT NULL,
  p256dh_key  text        NOT NULL,
  auth_key    text        NOT NULL,
  user_agent  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, endpoint)
);

CREATE INDEX IF NOT EXISTS push_subs_user_idx ON public.push_subscriptions (user_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS push_subs_self_read ON public.push_subscriptions;
CREATE POLICY push_subs_self_read ON public.push_subscriptions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS push_subs_self_write ON public.push_subscriptions;
CREATE POLICY push_subs_self_write ON public.push_subscriptions
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS push_subs_self_update ON public.push_subscriptions;
CREATE POLICY push_subs_self_update ON public.push_subscriptions
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS push_subs_self_delete ON public.push_subscriptions;
CREATE POLICY push_subs_self_delete ON public.push_subscriptions
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- ── 2. Per-user category preferences ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.push_preferences (
  user_id        uuid        PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  approvals      boolean     NOT NULL DEFAULT true,   -- approvals you need to review
  transfers      boolean     NOT NULL DEFAULT true,   -- transfers you initiated
  anomalies      boolean     NOT NULL DEFAULT true,   -- platform anomalies
  schedules      boolean     NOT NULL DEFAULT true,   -- pay schedule reminders
  announcements  boolean     NOT NULL DEFAULT true,   -- platform announcements
  updated_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.push_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS push_prefs_self_rw ON public.push_preferences;
CREATE POLICY push_prefs_self_rw ON public.push_preferences
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ── 3. VAPID keys on company_settings ──────────────────────────────────────
-- Stored encrypted via the same pgcrypto-based pattern used for Paystack
-- secrets. NULL until the operator generates them in Settings → Notifications.

ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS vapid_public_key  text,
  ADD COLUMN IF NOT EXISTS vapid_private_key text,
  ADD COLUMN IF NOT EXISTS vapid_subject     text DEFAULT 'mailto:support@kdsquares.com';

COMMENT ON COLUMN public.company_settings.vapid_public_key IS
  'VAPID public key (base64url, P-256) — sent to browsers when subscribing.';
COMMENT ON COLUMN public.company_settings.vapid_private_key IS
  'VAPID private key (base64url, P-256) — held server-side, signs push payloads.';
COMMENT ON COLUMN public.company_settings.vapid_subject IS
  'Contact mailto: or https URL — required by RFC 8292 so push services can ' ||
  'reach the platform owner if a subscription is misbehaving.';
