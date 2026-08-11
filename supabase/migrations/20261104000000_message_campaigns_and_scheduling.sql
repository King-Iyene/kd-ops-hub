-- =============================================================================
-- SMS / WhatsApp bulk campaigns + cross-channel scheduling.
--
-- The Termii SMS/WhatsApp send path already exists (send-email edge fn,
-- channel: 'sms'|'whatsapp', used today by notifyChannels() in
-- src/lib/notify.ts for one-off transactional pings). What's missing is a
-- bulk "compose a message, pick recipients, send" campaign feature — the
-- SMS/WhatsApp equivalent of email_campaigns.
--
-- Deliberately NOT reusing email_campaigns for this: that table's schema is
-- tightly coupled to email specifics (NOT NULL subject/html_body, a unique
-- index on recipient email, a template_key FK to email_templates). Bending
-- those constraints to also fit a phone-number recipient with no subject
-- would mean altering a table the working, tested email flow depends on.
-- A parallel, additive table is lower risk — same pattern, just simpler
-- (single `message` field, phone recipients), and existing email campaigns
-- are untouched.
--
-- Schema:
--   message_campaigns           — one row per SMS/WhatsApp send.
--   message_campaign_recipients — one row per (campaign × phone number).
--
-- Both email_campaigns and message_campaigns also gain a `scheduled_for`
-- timestamp + 'scheduled' status, dispatched by the new campaign-scheduler
-- cron job below (mirrors the payroll-scheduler / batch-worker pattern).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.message_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  channel text NOT NULL CHECK (channel IN ('sms','whatsapp')),
  message text NOT NULL,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','scheduled','sending','sent','partially_sent','failed','cancelled')),
  test_mode boolean NOT NULL DEFAULT false,
  total_recipients integer NOT NULL DEFAULT 0,
  total_sent integer NOT NULL DEFAULT 0,
  total_failed integer NOT NULL DEFAULT 0,
  scheduled_for timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS message_campaigns_status_idx ON public.message_campaigns(status, created_at DESC);
CREATE INDEX IF NOT EXISTS message_campaigns_created_by_idx ON public.message_campaigns(created_by, created_at DESC);
CREATE INDEX IF NOT EXISTS message_campaigns_due_idx ON public.message_campaigns(scheduled_for)
  WHERE status = 'scheduled';

CREATE TABLE IF NOT EXISTS public.message_campaign_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.message_campaigns(id) ON DELETE CASCADE,
  to_address text NOT NULL, -- Termii-form phone number (see src/lib/phone.ts)
  name text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','sent','failed','skipped')),
  provider_id text,
  error text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS message_campaign_recipients_uniq
  ON public.message_campaign_recipients(campaign_id, to_address);
CREATE INDEX IF NOT EXISTS message_campaign_recipients_campaign_idx
  ON public.message_campaign_recipients(campaign_id, status);

ALTER TABLE public.message_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_campaign_recipients ENABLE ROW LEVEL SECURITY;

-- Same access shape as email_campaigns: super_admin/admin/finance manage,
-- service role (edge functions) bypasses RLS entirely.
DROP POLICY IF EXISTS message_campaigns_admin_all ON public.message_campaigns;
CREATE POLICY message_campaigns_admin_all ON public.message_campaigns
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles p
             WHERE p.id = auth.uid()
               AND p.role IN ('super_admin','admin','finance'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p
             WHERE p.id = auth.uid()
               AND p.role IN ('super_admin','admin','finance'))
  );

DROP POLICY IF EXISTS message_campaign_recipients_admin_read ON public.message_campaign_recipients;
CREATE POLICY message_campaign_recipients_admin_read ON public.message_campaign_recipients
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles p
             WHERE p.id = auth.uid()
               AND p.role IN ('super_admin','admin','finance'))
  );

DROP POLICY IF EXISTS message_campaign_recipients_owner_insert ON public.message_campaign_recipients;
CREATE POLICY message_campaign_recipients_owner_insert ON public.message_campaign_recipients
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.message_campaigns c
             WHERE c.id = campaign_id AND c.created_by = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- Cross-channel scheduling: email_campaigns gets the same scheduled_for +
-- 'scheduled' status. Additive only — existing rows/behaviour unaffected.
-- ---------------------------------------------------------------------------

ALTER TABLE public.email_campaigns
  ADD COLUMN IF NOT EXISTS scheduled_for timestamptz;

ALTER TABLE public.email_campaigns DROP CONSTRAINT IF EXISTS email_campaigns_status_check;
ALTER TABLE public.email_campaigns ADD CONSTRAINT email_campaigns_status_check
  CHECK (status IN ('draft','scheduled','sending','sent','partially_sent','failed','cancelled'));

CREATE INDEX IF NOT EXISTS email_campaigns_due_idx ON public.email_campaigns(scheduled_for)
  WHERE status = 'scheduled';

-- ---------------------------------------------------------------------------
-- campaign-scheduler cron job — fires due 'scheduled' campaigns on both
-- tables. Mirrors the payroll-scheduler pattern exactly: Vault-stored URL +
-- shared secret so nothing sensitive lives in this migration or cron.job's
-- stored command text.
--
-- Setup required after this migration runs (one-time):
--   1. supabase functions deploy campaign-scheduler --no-verify-jwt
--   2. CRON_SHARED_SECRET already exists (reused from batch-worker etc.)
--   3. In SQL Editor:
--        select vault.create_secret(
--          'https://<project-ref>.supabase.co/functions/v1/campaign-scheduler',
--          'campaign_scheduler_url'
--        );
-- ---------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.tick_campaign_scheduler()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_url    text;
  v_secret text;
BEGIN
  SELECT decrypted_secret INTO v_url    FROM vault.decrypted_secrets WHERE name = 'campaign_scheduler_url';
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'cron_shared_secret';

  IF v_url IS NULL OR v_secret IS NULL THEN
    RAISE NOTICE 'tick_campaign_scheduler: Vault secrets not configured yet — skipping';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'X-Cron-Secret', v_secret
               ),
    body    := '{}'::jsonb
  );
END;
$$;

COMMENT ON FUNCTION public.tick_campaign_scheduler() IS
  'Invoked by pg_cron every 5 minutes. Calls the campaign-scheduler edge '
  'function, which dispatches any email_campaigns / message_campaigns row '
  'whose status=scheduled and scheduled_for has passed.';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'campaign-scheduler-tick') THEN
    PERFORM cron.unschedule('campaign-scheduler-tick');
  END IF;
END;
$$;

SELECT cron.schedule(
  'campaign-scheduler-tick',
  '*/5 * * * *',
  $$ SELECT public.tick_campaign_scheduler(); $$
);

INSERT INTO public.cron_job_expectations (job_name, description, max_gap_minutes)
VALUES ('campaign-scheduler-tick', 'Dispatch scheduled email/SMS/WhatsApp campaigns (every 5 min)', 20)
ON CONFLICT (job_name) DO UPDATE
  SET description = EXCLUDED.description,
      max_gap_minutes = EXCLUDED.max_gap_minutes;

COMMENT ON TABLE public.message_campaigns IS
  'Bulk SMS/WhatsApp sends via Termii — the SMS/WhatsApp equivalent of email_campaigns.';
