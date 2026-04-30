-- ----------------------------------------------------------------------------
-- WhatsApp + SMS notification scaffolding (Phase 10D — Termii integration).
--
-- The send-email edge function already speaks to Termii. This migration adds
-- the user-facing preference columns and a delivery log so:
--   1. Users can opt in/out per category and per channel
--   2. Ops can audit every outbound SMS / WhatsApp without trusting the
--      provider's dashboard alone
--   3. Re-sends are idempotent — if a payslip notification is queued twice,
--      the second one short-circuits when it sees a 'sent' record from the
--      same template + recipient + idempotency_key in the last 24h.
-- ----------------------------------------------------------------------------

ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS whatsapp_payslip   BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS whatsapp_payments  BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS whatsapp_ewa       BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS whatsapp_leave     BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS whatsapp_approvals BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS whatsapp_compliance BOOLEAN NOT NULL DEFAULT FALSE,
  -- SMS defaults to FALSE because it costs more per message than WhatsApp;
  -- ops can flip these on per-user where mobile data is unreliable.
  ADD COLUMN IF NOT EXISTS sms_payslip        BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS sms_payments       BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS sms_ewa            BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS sms_leave          BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS sms_approvals      BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS sms_compliance     BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.notification_preferences.whatsapp_payslip IS
  'Send a WhatsApp message when a new payslip is generated for the user.';
COMMENT ON COLUMN public.notification_preferences.whatsapp_ewa IS
  'Send WhatsApp updates when an EWA request is approved, rejected, or settled.';
COMMENT ON COLUMN public.notification_preferences.sms_ewa IS
  'Belt-and-braces SMS for EWA decisions — defaults ON because EWA carries cash.';

-- ----------------------------------------------------------------------------
-- notifications_log — every outbound message, regardless of channel.
--
-- Columns:
--   user_id        — the human recipient (NULL if the recipient is external)
--   channel        — 'in_app' | 'email' | 'sms' | 'whatsapp'
--   template_kind  — the renderTemplate() key, e.g. 'payslip_ready'
--   payload        — raw template input for replay / debugging
--   to_address     — phone (E.164 string) or email; useful when user_id is NULL
--   status         — 'queued' | 'sent' | 'failed'
--   provider_id    — Termii / Resend message_id where applicable
--   idempotency_key — caller-supplied key to dedup re-sends (24h window)
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.notifications_log (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  channel         TEXT        NOT NULL CHECK (channel IN ('in_app','email','sms','whatsapp')),
  template_kind   TEXT        NOT NULL,
  payload         JSONB,
  to_address      TEXT,
  status          TEXT        NOT NULL DEFAULT 'queued'
                    CHECK (status IN ('queued','sent','failed','skipped')),
  provider_id     TEXT,
  error_message   TEXT,
  idempotency_key TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at         TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS notifications_log_user_idx
  ON public.notifications_log (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS notifications_log_template_idx
  ON public.notifications_log (template_kind, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS notifications_log_idempotency_uidx
  ON public.notifications_log (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

ALTER TABLE public.notifications_log ENABLE ROW LEVEL SECURITY;

-- Users see their own delivery log (trust + transparency).
DROP POLICY IF EXISTS notif_log_self ON public.notifications_log;
CREATE POLICY notif_log_self ON public.notifications_log
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin','finance','super_admin')
    )
  );

-- Inserts: any authenticated user (typically the calling Edge Function or a
-- server-action under service_role); RLS only constrains direct client calls.
DROP POLICY IF EXISTS notif_log_insert ON public.notifications_log;
CREATE POLICY notif_log_insert ON public.notifications_log
  FOR INSERT TO authenticated WITH CHECK (true);

-- Updates: only admins (e.g. retry tooling) — clients shouldn't edit history.
DROP POLICY IF EXISTS notif_log_admin_update ON public.notifications_log;
CREATE POLICY notif_log_admin_update ON public.notifications_log
  FOR UPDATE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin','super_admin')
    )
  );

COMMENT ON TABLE public.notifications_log IS
  'Append-only log of every outbound notification (in-app / email / SMS / WhatsApp). Source of truth for delivery audit and idempotent re-send protection.';
