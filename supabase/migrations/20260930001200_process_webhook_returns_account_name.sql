-- =============================================================================
-- process_paystack_webhook: include account_name in the item lookup
--
-- The webhook Edge Function reads the item's account_name from the RPC's
-- return payload to seed the recipient email's greeting (audit v2 Bug C:
-- prefer bank-verified name over profile / typed name). The current RPC's
-- SELECT list omits it, so it never reaches the email builder.
--
-- Additive: adds account_name to the SELECT and returns it verbatim in the
-- 'no_match' + 'processed' payloads. No behaviour change to the state
-- transitions or idempotency claim. Regenerated from the 20260930000200
-- terminal-state-precedence version so ordering stays intact.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.process_paystack_webhook(
  p_event             text,
  p_reference         text,
  p_failure_reason    text,
  p_paystack_raw      jsonb,
  p_paystack_fee_ngn  numeric DEFAULT 0,
  p_processed_at      timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item          record;
  v_target_status text;
BEGIN
  PERFORM set_config('kdops.allow_state_override', 'true', true);

  BEGIN
    INSERT INTO public.webhook_idempotency (reference, event_type)
    VALUES (p_reference, p_event);
  EXCEPTION
    WHEN unique_violation THEN
      RETURN jsonb_build_object(
        'outcome',   'duplicate',
        'reference', p_reference,
        'event',     p_event
      );
  END;

  SELECT id, batch_id, full_name, account_number, bank_name,
         amount_ngn, employee_id, contractor_id, status, account_name
    INTO v_item
    FROM public.batch_items
   WHERE paystack_reference = p_reference
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'outcome',   'no_match',
      'reference', p_reference,
      'event',     p_event
    );
  END IF;

  IF p_event = 'transfer.success' THEN
    v_target_status := 'succeeded';
  ELSIF p_event = 'transfer.failed' THEN
    v_target_status := 'failed';
  ELSIF p_event = 'transfer.reversed' THEN
    v_target_status := 'reversed';
  ELSE
    RAISE EXCEPTION 'Unsupported event type: %', p_event;
  END IF;

  -- Terminal-state precedence guard (kept from 20260930000200).
  IF (v_target_status = 'succeeded' AND v_item.status = 'reversed')
     OR (v_target_status = 'failed' AND v_item.status IN ('succeeded','reversed'))
  THEN
    RETURN jsonb_build_object(
      'outcome',        'stale_event',
      'reference',      p_reference,
      'event',          p_event,
      'current_status', v_item.status,
      'reason',         format('%s ignored — item already %s', p_event, v_item.status)
    );
  END IF;

  IF v_target_status = 'succeeded' THEN
    UPDATE public.batch_items SET
      status           = 'succeeded',
      failure_reason   = NULL,
      processed_at     = p_processed_at,
      paystack_raw     = p_paystack_raw,
      paystack_fee_ngn = p_paystack_fee_ngn
    WHERE id = v_item.id;
  ELSE
    UPDATE public.batch_items SET
      status         = v_target_status,
      failure_reason = p_failure_reason,
      processed_at   = p_processed_at,
      paystack_raw   = p_paystack_raw
    WHERE id = v_item.id;
  END IF;

  PERFORM public.sync_batch_status_from_items(v_item.batch_id);

  RETURN jsonb_build_object(
    'outcome',        'processed',
    'reference',      p_reference,
    'event',          p_event,
    'status',         v_target_status,
    'batch_id',       v_item.batch_id,
    'item_id',        v_item.id,
    'full_name',      v_item.full_name,
    'account_name',   v_item.account_name,
    'account_number', v_item.account_number,
    'bank_name',      v_item.bank_name,
    'amount_ngn',     v_item.amount_ngn,
    'employee_id',    v_item.employee_id,
    'contractor_id',  v_item.contractor_id
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.process_paystack_webhook(text,text,text,jsonb,numeric,timestamptz) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.process_paystack_webhook(text,text,text,jsonb,numeric,timestamptz) TO service_role;
