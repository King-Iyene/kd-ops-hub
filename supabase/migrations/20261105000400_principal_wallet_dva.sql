-- ═══════════════════════════════════════════════════════════════════════
-- Principal Disbursements wallet — a real Paystack Dedicated Virtual
-- Account (Wema Bank, created by the director on Aug 11 2026) now funds a
-- ring-fenced internal ledger. Paystack itself doesn't segregate DVA
-- funds from the rest of the merchant balance — this is an internal
-- accounting wall, tracked and enforced by KDOps, matching exactly the
-- "director's own account, own balance" pattern the module was already
-- built around for Personal Transfer.
--
-- principal_wallet_dva     — the DVA's identifying details (one row).
-- principal_wallet_ledger  — append-only credit/debit ledger.
--   credit: written ONLY by the webhook's SECURITY DEFINER RPC (service
--           role bypasses RLS anyway; the RESTRICTIVE policy below also
--           blocks a client-side insert of direction='credit' so a
--           super_admin can't fabricate funds by hand).
--   debit:  written by the webhook when a transfer tied to a director-
--           only Company Disbursement batch or a Personal Transfer
--           reaches CONFIRMED success (transfer.success) — not at send
--           time — so a failed/pending send never touches the wallet,
--           and a later transfer.reversed compensates with a matching
--           credit. This mirrors "webhook is the only thing allowed to
--           mark something succeeded", the same rule everything else in
--           this payment stack already follows.
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE public.principal_wallet_dva (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  paystack_customer_code  text NOT NULL,
  account_number          text NOT NULL UNIQUE,
  bank_name               text NOT NULL,
  account_name            text,
  currency                text NOT NULL DEFAULT 'NGN',
  created_at              timestamptz NOT NULL DEFAULT now(),
  created_by              uuid REFERENCES public.profiles(id)
);

COMMENT ON TABLE public.principal_wallet_dva IS
  'The Paystack Dedicated Virtual Account (Wema/Titan/Providus) that funds '
  'the Principal Disbursements wallet. Matching incoming charge.success '
  'webhook events by account_number credits principal_wallet_ledger.';

ALTER TABLE public.principal_wallet_dva ENABLE ROW LEVEL SECURITY;

CREATE POLICY "principal_wallet_dva_select" ON public.principal_wallet_dva
  FOR SELECT TO authenticated
  USING (public.current_user_role() = 'super_admin');

CREATE POLICY "principal_wallet_dva_insert" ON public.principal_wallet_dva
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role() = 'super_admin');

CREATE POLICY "principal_wallet_dva_delete" ON public.principal_wallet_dva
  FOR DELETE TO authenticated
  USING (public.current_user_role() = 'super_admin');

-- No UPDATE policy — replacing the account is delete + re-add, so there's
-- never an ambiguous "was this edited or is it the original" record.

CREATE TABLE public.principal_wallet_ledger (
  id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  direction                     text NOT NULL CHECK (direction IN ('credit', 'debit')),
  amount_ngn                    numeric NOT NULL CHECK (amount_ngn > 0),
  source                        text NOT NULL CHECK (source IN ('dva_funding', 'company_disbursement', 'personal_transfer', 'reversal_refund')),
  reference                     text,
  related_batch_item_id         uuid REFERENCES public.batch_items(id),
  related_personal_transfer_id  uuid REFERENCES public.personal_transfers(id),
  paystack_raw                  jsonb,
  created_at                    timestamptz NOT NULL DEFAULT now(),
  created_by                    uuid REFERENCES public.profiles(id)
);

COMMENT ON TABLE public.principal_wallet_ledger IS
  'Append-only. Balance = SUM(credit) - SUM(debit). Credits come only from '
  'the DVA funding webhook (charge.success); debits come only from the '
  'transfer-success webhook path for director-only batches/personal '
  'transfers. No UPDATE/DELETE policy — corrections are new rows.';

CREATE INDEX principal_wallet_ledger_created_at_idx ON public.principal_wallet_ledger (created_at DESC);

ALTER TABLE public.principal_wallet_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "principal_wallet_ledger_select" ON public.principal_wallet_ledger
  FOR SELECT TO authenticated
  USING (public.current_user_role() = 'super_admin');

CREATE POLICY "principal_wallet_ledger_insert" ON public.principal_wallet_ledger
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role() = 'super_admin');

-- Narrows the permissive insert above: an authenticated client (even
-- super_admin, via their own session key rather than the webhook's
-- service-role key) may only ever insert a 'debit' row directly. Credits
-- can only be written by credit_principal_wallet() below, which is
-- REVOKEd from authenticated/anon entirely and only reachable via the
-- webhook's service-role connection (which bypasses RLS regardless, so
-- this policy exists purely to stop a client from faking a credit).
CREATE POLICY "principal_wallet_ledger_client_debit_only" ON public.principal_wallet_ledger
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (direction = 'debit');

-- No UPDATE/DELETE policy at all — append-only, matching audit_logs and
-- personal_transfers' own "no editing sent records ever" discipline.

-- Overdraft guard — applies regardless of what inserts the debit (webhook
-- RPC or a direct client insert), so it's a real backstop, not just a
-- convention. Plain (non-SECURITY DEFINER) trigger: whoever is allowed to
-- INSERT a debit (super_admin, or the webhook's service-role connection,
-- which bypasses RLS anyway) already has SELECT rights on this same
-- table, so the balance check below sees real data either way.
CREATE OR REPLACE FUNCTION public.enforce_principal_wallet_no_overdraft()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_balance numeric;
BEGIN
  IF NEW.direction = 'debit' THEN
    SELECT COALESCE(SUM(CASE WHEN direction = 'credit' THEN amount_ngn ELSE -amount_ngn END), 0)
      INTO v_balance
      FROM public.principal_wallet_ledger;
    IF v_balance - NEW.amount_ngn < 0 THEN
      RAISE EXCEPTION 'Principal Disbursements wallet balance (%) is insufficient for a debit of %', v_balance, NEW.amount_ngn
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER principal_wallet_no_overdraft
  BEFORE INSERT ON public.principal_wallet_ledger
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_principal_wallet_no_overdraft();

REVOKE EXECUTE ON FUNCTION public.enforce_principal_wallet_no_overdraft() FROM PUBLIC, anon, authenticated;

-- ── credit_principal_wallet — called ONLY by the webhook (service role) ──
-- Idempotency reuses webhook_idempotency exactly like process_paystack_webhook,
-- keyed on (charge reference, 'charge.success') so a redelivered webhook
-- event can never double-credit.
CREATE OR REPLACE FUNCTION public.credit_principal_wallet(
  p_reference text,
  p_amount_ngn numeric,
  p_receiver_account_number text,
  p_paystack_raw jsonb
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
    SELECT 1 FROM public.principal_wallet_dva WHERE account_number = p_receiver_account_number
  ) INTO v_account_exists;

  IF NOT v_account_exists THEN
    RETURN jsonb_build_object('outcome', 'not_our_account', 'reference', p_reference);
  END IF;

  INSERT INTO public.principal_wallet_ledger (direction, amount_ngn, source, reference, paystack_raw)
  VALUES ('credit', p_amount_ngn, 'dva_funding', p_reference, p_paystack_raw);

  RETURN jsonb_build_object('outcome', 'credited', 'reference', p_reference, 'amount_ngn', p_amount_ngn);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.credit_principal_wallet(text, numeric, text, jsonb) FROM PUBLIC, anon, authenticated;

-- ── debit_principal_wallet — called ONLY by the webhook, on confirmed  ──
-- transfer.success for a director-only batch_item or a personal_transfer.
-- Best-effort from the webhook's side (wrapped in try/catch there) — if
-- this raises (e.g. overdraft guard), the real Paystack transfer has
-- already succeeded regardless; only the internal ledger is affected.
CREATE OR REPLACE FUNCTION public.debit_principal_wallet(
  p_amount_ngn numeric,
  p_source text,
  p_reference text,
  p_related_batch_item_id uuid,
  p_related_personal_transfer_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.principal_wallet_ledger
    (direction, amount_ngn, source, reference, related_batch_item_id, related_personal_transfer_id)
  VALUES
    ('debit', p_amount_ngn, p_source, p_reference, p_related_batch_item_id, p_related_personal_transfer_id);

  RETURN jsonb_build_object('outcome', 'debited', 'reference', p_reference, 'amount_ngn', p_amount_ngn);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.debit_principal_wallet(numeric, text, text, uuid, uuid) FROM PUBLIC, anon, authenticated;

-- ── credit_back_principal_wallet — called ONLY by the webhook, when a   ──
-- previously-succeeded transfer is later reversed by Paystack.
CREATE OR REPLACE FUNCTION public.credit_back_principal_wallet(
  p_amount_ngn numeric,
  p_reference text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.principal_wallet_ledger (direction, amount_ngn, source, reference)
  VALUES ('credit', p_amount_ngn, 'reversal_refund', p_reference);

  RETURN jsonb_build_object('outcome', 'refunded', 'reference', p_reference, 'amount_ngn', p_amount_ngn);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.credit_back_principal_wallet(numeric, text) FROM PUBLIC, anon, authenticated;
