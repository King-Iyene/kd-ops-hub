-- Scheduled email / SMS / WhatsApp campaigns never sent.
--
-- campaign-scheduler flipped a due campaign 'scheduled' -> 'sending' and then
-- invoked the sender, but the senders refuse any campaign that is already
-- 'sending' (and claim_campaign_for_sending only matched status = 'draft'), so
-- every scheduled campaign sat in 'sending' forever.
--
-- Fix: the claim moves into the sender. These two RPCs are the ONLY place a
-- campaign becomes 'sending'. A single UPDATE ... WHERE ... RETURNING makes the
-- claim atomic, so exactly one caller wins however many scheduler ticks or
-- manual sends overlap. A 'scheduled' campaign can only be claimed once its
-- scheduled_for time has passed (the composer's own "send now" path stays
-- 'draft', unchanged).
--
-- Idempotent: CREATE OR REPLACE only; no data is touched.

CREATE OR REPLACE FUNCTION public.claim_campaign_for_sending(p_campaign_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claimed boolean;
BEGIN
  UPDATE public.email_campaigns
     SET status     = 'sending',
         started_at = now()
   WHERE id = p_campaign_id
     AND (status = 'draft'
          OR (status = 'scheduled' AND scheduled_for IS NOT NULL AND scheduled_for <= now()))
  RETURNING true INTO v_claimed;

  RETURN COALESCE(v_claimed, false);
END;
$$;

COMMENT ON FUNCTION public.claim_campaign_for_sending IS
  'Atomically transitions an email campaign draft -> sending, or scheduled -> sending once scheduled_for has passed. '
  'Returns false if the campaign was already claimed by another caller (or is not yet due).';

CREATE OR REPLACE FUNCTION public.claim_message_campaign_for_sending(p_campaign_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claimed boolean;
BEGIN
  UPDATE public.message_campaigns
     SET status     = 'sending',
         started_at = now()
   WHERE id = p_campaign_id
     AND (status = 'draft'
          OR (status = 'scheduled' AND scheduled_for IS NOT NULL AND scheduled_for <= now()))
  RETURNING true INTO v_claimed;

  RETURN COALESCE(v_claimed, false);
END;
$$;

COMMENT ON FUNCTION public.claim_message_campaign_for_sending IS
  'Atomically transitions an SMS/WhatsApp campaign draft -> sending, or scheduled -> sending once scheduled_for has passed. '
  'Returns false if the campaign was already claimed by another caller (or is not yet due).';

-- Only the edge functions (service role) claim campaigns. A SECURITY DEFINER
-- function is callable by PUBLIC by default, which would let any signed-in
-- user flip somebody else's campaign to 'sending' and block it.
REVOKE ALL ON FUNCTION public.claim_campaign_for_sending(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_message_campaign_for_sending(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_campaign_for_sending(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_message_campaign_for_sending(uuid) TO service_role;
