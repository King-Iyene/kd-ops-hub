-- Extend process_paystack_webhook() to also resolve personal_transfers.
--
-- Root cause of a real stuck-pending Personal Transfer found in production
-- (id 5183ad7c-5e81-4046-9619-6f05cf032cd6, ref kdopspt_5183ad7c5e8140469619):
-- personal_transfers uses its own kdopspt_ reference prefix, but the
-- webhook RPC only ever looked up batch_items — a kdopspt_ reference finds
-- nothing there, so the function returns outcome='no_match' and the real
-- Paystack transfer.success/failed/reversed event is silently dropped.
-- The row is written 'pending' at send time and nothing ever updates it
-- again (no webhook path, no cron reconciliation for this table).
--
-- Fix: when the batch_items lookup finds nothing, ALSO check
-- personal_transfers before giving up. This is purely additive — the
-- existing batch_items branch (the vast majority of real payment/payroll
-- traffic) is byte-for-byte unchanged above the `IF NOT FOUND` check, and
-- today that check's ELSE path always returns 'no_match' immediately, so
-- there is no existing behavior to regress. A NEW outcome value
-- ('processed_personal_transfer') is used rather than reusing 'processed'
-- so the calling edge function's existing batch-shaped downstream logic
-- (contractor/employee notification, sync_batch_status_from_items, etc.)
-- can never accidentally run against a personal_transfers row — it takes
-- its own minimal, separate branch in the edge function instead.
CREATE OR REPLACE FUNCTION public.process_paystack_webhook(p_event text, p_reference text, p_failure_reason text, p_paystack_raw jsonb, p_paystack_fee_ngn numeric DEFAULT 0, p_processed_at timestamp with time zone DEFAULT now())
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_item          record;
  v_pt            record;
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
    -- No batch_item — check personal_transfers before giving up (see
    -- migration header for why this is here).
    SELECT id, status
      INTO v_pt
      FROM public.personal_transfers
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

    -- Same terminal-state precedence guard as the batch_items path.
    IF (v_target_status = 'succeeded' AND v_pt.status = 'reversed')
       OR (v_target_status = 'failed' AND v_pt.status IN ('succeeded','reversed'))
    THEN
      RETURN jsonb_build_object(
        'outcome',        'stale_event',
        'reference',      p_reference,
        'event',          p_event,
        'current_status', v_pt.status,
        'reason',         format('%s ignored — personal transfer already %s', p_event, v_pt.status)
      );
    END IF;

    UPDATE public.personal_transfers SET
      status         = v_target_status,
      failure_reason = CASE WHEN v_target_status = 'succeeded' THEN NULL ELSE p_failure_reason END,
      processed_at   = CASE WHEN v_target_status = 'succeeded' THEN p_processed_at ELSE processed_at END,
      paystack_raw   = p_paystack_raw
    WHERE id = v_pt.id;

    RETURN jsonb_build_object(
      'outcome',   'processed_personal_transfer',
      'reference', p_reference,
      'event',     p_event,
      'status',    v_target_status
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
$function$;
