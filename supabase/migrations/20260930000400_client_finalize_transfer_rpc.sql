-- =============================================================================
-- client_finalize_transfer(): single source of truth for finishing a transfer
--
-- Regression discovered in the payment audit: while a batch was 'processing',
-- BatchDetail's browser poll called Paystack /transfer/verify and, on success
-- or failure, did a raw supabase.from('batch_items').update({...}) — bypassing
-- the idempotency claim in process_paystack_webhook. Two problems:
--
--   1. Duplicate side-effects. Both the browser poll and the Paystack webhook
--      wrote the SAME status change, both called logAudit, both triggered the
--      recipient email (webhook path) + notifyFinance. Real, reproducible:
--      partners were getting "Payment Completed" emails twice if an operator
--      had the batch page open while dispatch finalised.
--
--   2. Multi-tab amplification. Two admins with the same batch open produced
--      three writes for the same event, sometimes three emails.
--
-- This RPC lets any authenticated payments-role caller finalise a transfer
-- via the SAME atomic path the webhook uses. It:
--   • Verifies the caller has an approver role (admin, finance, super_admin,
--     operations — anyone who can be on the batch page during dispatch).
--   • Records into webhook_idempotency, so the FIRST writer wins whether it
--     is the poll or the webhook. All subsequent writers return duplicate.
--   • Applies the same terminal-state precedence rules
--     (see 20260930000200_webhook_terminal_state_precedence.sql).
--
-- The RPC delegates the mutation to process_paystack_webhook so there is a
-- single implementation. That function's SECURITY DEFINER runs it as postgres,
-- so it passes the state-machine trigger's authenticated guard as before.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.client_finalize_transfer(
  p_event             text,
  p_reference         text,
  p_failure_reason    text,
  p_paystack_raw      jsonb,
  p_paystack_fee_ngn  numeric DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role  text;
  v_uid   uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'client_finalize_transfer: not authenticated'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT role INTO v_role
    FROM public.profiles
   WHERE id = v_uid
     AND COALESCE(status, 'active') = 'active';

  IF v_role IS NULL OR v_role NOT IN ('super_admin','admin','finance','operations') THEN
    RAISE EXCEPTION 'client_finalize_transfer: role % is not permitted', COALESCE(v_role, '(none)')
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_event NOT IN ('transfer.success','transfer.failed','transfer.reversed') THEN
    RAISE EXCEPTION 'client_finalize_transfer: unsupported event %', p_event;
  END IF;

  RETURN public.process_paystack_webhook(
    p_event            => p_event,
    p_reference        => p_reference,
    p_failure_reason   => p_failure_reason,
    p_paystack_raw     => p_paystack_raw,
    p_paystack_fee_ngn => p_paystack_fee_ngn,
    p_processed_at     => now()
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.client_finalize_transfer(text,text,text,jsonb,numeric) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.client_finalize_transfer(text,text,text,jsonb,numeric) TO authenticated;

COMMENT ON FUNCTION public.client_finalize_transfer(text,text,text,jsonb,numeric) IS
  'Payments-role callable wrapper around process_paystack_webhook. Lets the '
  'browser-side polling finalise a transfer through the SAME idempotent, '
  'terminal-state-aware path as the Paystack webhook, so the two paths can '
  'race safely — first writer wins, no duplicate emails or audit rows.';
