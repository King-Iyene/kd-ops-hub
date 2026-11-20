-- Rolls back 20261431000000_campaign_claim_scheduled.sql.
-- Restores the draft-only email claim and drops the SMS/WhatsApp claim.
-- NOTE: rolling back also needs the campaign-scheduler / sender edge functions
-- reverted, otherwise scheduled campaigns stop sending again.
DROP FUNCTION IF EXISTS public.claim_message_campaign_for_sending(uuid);

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
   WHERE id     = p_campaign_id
     AND status = 'draft'
  RETURNING true INTO v_claimed;

  RETURN COALESCE(v_claimed, false);
END;
$$;
GRANT EXECUTE ON FUNCTION public.claim_campaign_for_sending(uuid) TO PUBLIC;
