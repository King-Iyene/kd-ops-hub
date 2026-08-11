-- Real DVA funding test (₦199, reference 110006260811232446101912418001,
-- processed 2026-08-11 23:25:21 UTC per webhook_idempotency) confirmed the
-- webhook fires correctly, but the credit was silently skipped —
-- credit_principal_wallet() only matched on
-- data.authorization.receiver_bank_account_number, a field name guessed
-- from search results (WebFetch to Paystack's own docs was blocked by this
-- sandbox's egress policy) that evidently doesn't match the real live
-- payload closely enough (different nesting, or the account number is
-- formatted differently there).
--
-- Fix: also match on the charge's customer_code, a well-documented,
-- always-present top-level field (data.customer.customer_code) that this
-- system already stores independently on principal_wallet_dva at link
-- time — a much more reliable identifier than guessing the exact path to
-- an account number. A charge now credits the wallet if EITHER the
-- receiver account number OR the customer code matches what's registered.

CREATE OR REPLACE FUNCTION public.credit_principal_wallet(
  p_reference text,
  p_amount_ngn numeric,
  p_receiver_account_number text,
  p_paystack_raw jsonb,
  p_customer_code text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account_exists boolean;
BEGIN
  BEGIN
    INSERT INTO public.webhook_idempotency (reference, event_type)
    VALUES (p_reference, 'charge.success');
  EXCEPTION
    WHEN unique_violation THEN
      RETURN jsonb_build_object('outcome', 'duplicate', 'reference', p_reference);
  END;

  SELECT EXISTS (
    SELECT 1 FROM public.principal_wallet_dva
    WHERE account_number = p_receiver_account_number
       OR (p_customer_code IS NOT NULL AND paystack_customer_code = p_customer_code)
  ) INTO v_account_exists;

  IF NOT v_account_exists THEN
    RETURN jsonb_build_object('outcome', 'not_our_account', 'reference', p_reference);
  END IF;

  INSERT INTO public.principal_wallet_ledger (direction, amount_ngn, source, reference, paystack_raw)
  VALUES ('credit', p_amount_ngn, 'dva_funding', p_reference, p_paystack_raw);

  RETURN jsonb_build_object('outcome', 'credited', 'reference', p_reference, 'amount_ngn', p_amount_ngn);
END;
$$;

-- Backfill the one credit that was silently missed under the old, too-
-- narrow matching logic. This is a one-time manual correction backed by
-- concrete evidence: the webhook_idempotency row already proves Paystack
-- delivered this exact charge.success (ref 110006260811232446101912418001)
-- for ₦199, and the Paystack dashboard screenshot confirms a "Dedicated
-- Nuban" transaction of NGN 199.00 landed the same day. Not a
-- hypothetical reconciliation — the event objectively happened and was
-- acknowledged with a 200, so its credit belongs in the ledger.
INSERT INTO public.principal_wallet_ledger (direction, amount_ngn, source, reference)
SELECT 'credit', 199, 'dva_funding', '110006260811232446101912418001'
WHERE EXISTS (
  SELECT 1 FROM public.webhook_idempotency
  WHERE reference = '110006260811232446101912418001' AND event_type = 'charge.success'
)
AND NOT EXISTS (
  SELECT 1 FROM public.principal_wallet_ledger WHERE reference = '110006260811232446101912418001'
);
