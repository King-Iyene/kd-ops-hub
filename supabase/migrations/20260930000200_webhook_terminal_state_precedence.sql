-- =============================================================================
-- process_paystack_webhook: honour terminal states on out-of-order replays
--
-- Regression discovered in the payment audit: webhook idempotency is keyed on
-- (reference, event_type). A legit lifecycle is transfer.success followed by
-- transfer.reversed — different event_types, so each is accepted once.
--
-- The gap: Paystack sometimes RETRIES an older event (their retry queue is
-- best-effort, not ordered). If transfer.success is retried AFTER a reversal
-- for the same reference has already been processed, the current RPC sets
-- kdops.allow_state_override=true and blindly flips the item back to
-- 'succeeded'. Real-money impact: a reversed item silently reappears as paid
-- in the ledger, batch totals shift back up, and the partner's transaction
-- history now shows a payment that isn't there.
--
-- Fix: after claiming idempotency but BEFORE writing the status change,
-- check the current status. If the item is already in a state that is
-- financially heavier than what the incoming event would set, keep the
-- current state and record a 'stale_event' outcome. The idempotency claim
-- still stands so Paystack stops retrying.
--
-- Precedence (higher = more final for our ledger):
--   reversed    3   money went out then came back — must not be overwritten
--   succeeded   2   money went out
--   failed      2   money did not go out
--   pending     1   not decided
--
-- Rules:
--   - transfer.success into a 'reversed' row  → REJECT (stale event).
--   - transfer.failed  into 'succeeded' row   → REJECT (stale event).
--   - transfer.failed  into 'reversed' row    → REJECT (stale event).
--   - transfer.reversed is always accepted (reversed is the terminal state
--     of the whole lifecycle; if we didn't have the preceding success on
--     record, reversed still lands correctly).
--   - Anything into a matching current status → idempotency layer catches it,
--     but if it somehow bypasses (different event, same status) we no-op.
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
         amount_ngn, employee_id, contractor_id, status
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

  -- ── Terminal-state precedence guard ────────────────────────────────────
  -- Don't let a replayed / late event overwrite a heavier terminal state.
  -- The idempotency claim stays in place so Paystack stops retrying, but
  -- the batch_item is not mutated and no downstream notify / email runs.
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
    'outcome',   'processed',
    'reference', p_reference,
    'event',     p_event,
    'status',    v_target_status,
    'batch_id',  v_item.batch_id,
    'item_id',   v_item.id
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.process_paystack_webhook(text,text,text,jsonb,numeric,timestamptz) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.process_paystack_webhook(text,text,text,jsonb,numeric,timestamptz) TO service_role;

COMMENT ON FUNCTION public.process_paystack_webhook(text,text,text,jsonb,numeric,timestamptz) IS
  'Atomic webhook processor. Claims idempotency, applies terminal-state '
  'precedence (a replayed success cannot overwrite a reversed / failed cannot '
  'overwrite succeeded), updates the batch_item, then re-derives the parent '
  'batch status. All within one transaction with kdops.allow_state_override.';
