-- =============================================================================
-- Email Campaigns: bulk + single email composer with delivery audit.
--
-- Schema:
--   email_campaigns           — one row per send (draft / sending / sent / failed).
--                                Tracks the body source (template_key OR custom),
--                                subject, html_body, totals, who sent it.
--   email_campaign_recipients — one row per (campaign × recipient_email),
--                                with status, resend_id, error, sent_at.
--
-- A "send" is initiated from the bulk-email-sender edge function which:
--   1. Inserts the campaign + recipient rows in a single transaction.
--   2. Iterates recipients in chunks (respecting Resend rate limits).
--   3. Updates each recipient row with the Resend response.
--   4. Rolls up campaign totals + status when finished.
--
-- RLS: super_admin / admin / finance can read + create. Service role updates
-- (the edge fn writes per-recipient progress).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.email_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Campaign-level descriptors.
  name text,
  -- Either a templated send (template_key set) or a one-off (custom subject + body).
  template_key text REFERENCES public.email_templates(key) ON DELETE SET NULL,
  subject text NOT NULL,
  html_body text NOT NULL,
  text_body text,
  -- Variables passed to the renderer when template_key is set.
  template_vars jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Audit fields.
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','sending','sent','partially_sent','failed','cancelled')),
  test_mode boolean NOT NULL DEFAULT false,
  total_recipients integer NOT NULL DEFAULT 0,
  total_sent integer NOT NULL DEFAULT 0,
  total_failed integer NOT NULL DEFAULT 0,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS email_campaigns_status_idx ON public.email_campaigns(status, created_at DESC);
CREATE INDEX IF NOT EXISTS email_campaigns_created_by_idx ON public.email_campaigns(created_by, created_at DESC);

CREATE TABLE IF NOT EXISTS public.email_campaign_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.email_campaigns(id) ON DELETE CASCADE,
  email text NOT NULL,
  -- Optional name & per-recipient vars (for personalisation).
  name text,
  vars jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','sent','failed','skipped')),
  resend_id text,
  error text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- One recipient per campaign — dedupe at insert.
CREATE UNIQUE INDEX IF NOT EXISTS email_campaign_recipients_uniq
  ON public.email_campaign_recipients(campaign_id, lower(email));
CREATE INDEX IF NOT EXISTS email_campaign_recipients_campaign_idx
  ON public.email_campaign_recipients(campaign_id, status);

ALTER TABLE public.email_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_campaign_recipients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS email_campaigns_admin_all ON public.email_campaigns;
CREATE POLICY email_campaigns_admin_all ON public.email_campaigns
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

DROP POLICY IF EXISTS email_campaign_recipients_admin_read ON public.email_campaign_recipients;
CREATE POLICY email_campaign_recipients_admin_read ON public.email_campaign_recipients
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles p
             WHERE p.id = auth.uid()
               AND p.role IN ('super_admin','admin','finance'))
  );

-- Inserts to recipients only via campaign owner (the composer attaches them
-- before invoking the edge function). Service role bypasses RLS entirely.
DROP POLICY IF EXISTS email_campaign_recipients_owner_insert ON public.email_campaign_recipients;
CREATE POLICY email_campaign_recipients_owner_insert ON public.email_campaign_recipients
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.email_campaigns c
             WHERE c.id = campaign_id AND c.created_by = auth.uid())
  );
