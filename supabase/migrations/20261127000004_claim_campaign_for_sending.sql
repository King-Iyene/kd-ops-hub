-- Atomic campaign claim RPC — eliminates the read-then-write race in
-- bulk-email-sender where two concurrent invocations could both see
-- status = 'draft' and both proceed to send.
--
-- Returns TRUE if this caller successfully claimed the campaign,
-- FALSE if someone else already did (status was no longer 'draft').

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

COMMENT ON FUNCTION public.claim_campaign_for_sending IS
  'Atomically transitions an email campaign from draft → sending. '
  'Returns false if the campaign was already claimed by another caller.';
