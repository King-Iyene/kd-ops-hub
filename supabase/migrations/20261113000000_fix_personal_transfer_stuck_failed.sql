-- ═══════════════════════════════════════════════════════════════════════
-- Fix: a Personal Transfer can get permanently stuck showing the wrong
-- status even after Paystack resolves it correctly.
-- ═══════════════════════════════════════════════════════════════════════
--
-- Two compounding bugs, found by a forensic audit of the webhook path:
--
-- Bug 1 — process_paystack_webhook() lost its personal_transfers branch.
-- Migration 20260811213000 added a fallback lookup into personal_transfers
-- when a batch_items match isn't found (personal_transfers uses its own
-- kdopspt_ reference prefix, so it never matches batch_items). But three
-- later migrations (20260815000000, 20260930000200, 20260930001200) each
-- redefined process_paystack_webhook() with CREATE OR REPLACE from an
-- older base that predates that fix, silently dropping the
-- personal_transfers branch again. Today, a kdopspt_ webhook always hits
-- `IF NOT FOUND ... RETURN outcome='no_match'` and Paystack's real
-- transfer.success/failed/reversed event is discarded — the row is frozen
-- at whatever status was written synchronously at send time.
--
-- Bug 2 — enforce_personal_transfer_state_machine has no override bypass.
-- Every sibling state-machine trigger (enforce_batch_item_state_machine,
-- enforce_payment_batch_state_machine) opens with a check on the
-- `kdops.allow_state_override` session flag that process_paystack_webhook()
-- sets before writing, so a webhook-driven correction can always land.
-- enforce_personal_transfer_state_machine never got that check, so even
-- with Bug 1 fixed, a genuine transfer.success arriving after an earlier
-- (transient, since-corrected) transfer.failed write would still hit
-- `RAISE EXCEPTION 'Invalid personal_transfers state transition: failed
-- -> succeeded'`, abort the whole webhook RPC, and return a 500 —
-- Paystack retries, gets the same 500 forever, and the row never corrects.
--
-- Fix: restore the personal_transfers branch (byte-for-byte from
-- 20260811213000, layered onto the current account_name-aware base from
-- 20260930001200), and add the same override bypass every other
-- state-machine trigger already has.
-- ═══════════════════════════════════════════════════════════════════════

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
    -- migration header: this is Bug 1's fix).
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
$$;

REVOKE EXECUTE ON FUNCTION public.process_paystack_webhook(text,text,text,jsonb,numeric,timestamptz) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.process_paystack_webhook(text,text,text,jsonb,numeric,timestamptz) TO service_role;

-- Bug 2's fix: give enforce_personal_transfer_state_machine the same
-- kdops.allow_state_override bypass every sibling trigger already has, so
-- a webhook-driven correction (e.g. failed -> succeeded, once Bug 1 lets
-- the event reach this table again) can actually land instead of raising.
-- Manual/direct writers outside the webhook still can't skip the state
-- machine — the bypass only applies while process_paystack_webhook() has
-- explicitly set the session flag.
CREATE OR REPLACE FUNCTION public.enforce_personal_transfer_state_machine()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_override text;
  v_allowed  boolean;
BEGIN
  v_override := current_setting('kdops.allow_state_override', true);
  IF v_override = 'true' THEN
    RETURN NEW;
  END IF;

  v_allowed := CASE OLD.status
    WHEN 'pending'   THEN NEW.status IN ('pending', 'succeeded', 'failed')
    WHEN 'succeeded' THEN NEW.status IN ('succeeded', 'reversed')
    WHEN 'failed'    THEN NEW.status = 'failed'
    WHEN 'reversed'  THEN false
    ELSE false
  END;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Invalid personal_transfers state transition: % -> %', OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.status <> 'pending' THEN
    IF NEW.recipient_name           IS DISTINCT FROM OLD.recipient_name
       OR NEW.recipient_account_number IS DISTINCT FROM OLD.recipient_account_number
       OR NEW.recipient_bank_code      IS DISTINCT FROM OLD.recipient_bank_code
       OR NEW.amount_ngn               IS DISTINCT FROM OLD.amount_ngn
       OR NEW.memo                     IS DISTINCT FROM OLD.memo
       OR NEW.initiated_by             IS DISTINCT FROM OLD.initiated_by
       OR NEW.beneficiary_id           IS DISTINCT FROM OLD.beneficiary_id
       OR NEW.batch_label              IS DISTINCT FROM OLD.batch_label
    THEN
      RAISE EXCEPTION 'Cannot edit a personal transfer once it has left pending status'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enforce_personal_transfer_state_machine() FROM PUBLIC, anon, authenticated;
