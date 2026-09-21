-- ═══════════════════════════════════════════════════════════════════════
-- Company-scoped Principal Wallet + NDI dedicated account support
--
-- Extends the existing Principal Disbursements wallet system to support
-- multiple companies (KD Squares, NDI, future entities). Each company
-- gets its own DVA, its own ledger entries, and its own wallet balance.
--
-- Backward compatibility: all existing rows are backfilled to KD Squares.
-- The RPC signatures add company_id as an optional parameter so the
-- webhook can tag entries correctly, while existing calls without a
-- company_id still work (defaulting to KD Squares).
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. Add company_id to principal_wallet_dva ──────────────────────────

ALTER TABLE public.principal_wallet_dva
  ADD COLUMN company_id uuid REFERENCES public.companies(id);

COMMENT ON COLUMN public.principal_wallet_dva.company_id IS
  'Which company this DVA belongs to. NULL = legacy (treated as KD Squares).';

-- Backfill existing DVA row(s) to KD Squares
UPDATE public.principal_wallet_dva
SET company_id = (SELECT id FROM public.companies WHERE short_code = 'KDS' LIMIT 1)
WHERE company_id IS NULL;

-- Make NOT NULL going forward
ALTER TABLE public.principal_wallet_dva
  ALTER COLUMN company_id SET NOT NULL;

-- Index for webhook lookups
CREATE INDEX IF NOT EXISTS idx_principal_wallet_dva_company
  ON public.principal_wallet_dva (company_id);

-- ── 2. Add company_id to principal_wallet_ledger ───────────────────────

ALTER TABLE public.principal_wallet_ledger
  ADD COLUMN company_id uuid REFERENCES public.companies(id);

COMMENT ON COLUMN public.principal_wallet_ledger.company_id IS
  'Which company this ledger entry belongs to. Balance per company = '
  'SUM(credit) - SUM(debit) WHERE company_id = X.';

-- Backfill existing ledger rows to KD Squares
UPDATE public.principal_wallet_ledger
SET company_id = (SELECT id FROM public.companies WHERE short_code = 'KDS' LIMIT 1)
WHERE company_id IS NULL;

ALTER TABLE public.principal_wallet_ledger
  ALTER COLUMN company_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_principal_wallet_ledger_company
  ON public.principal_wallet_ledger (company_id);

-- ── 3. Add company_id to personal_transfers ────────────────────────────

ALTER TABLE public.personal_transfers
  ADD COLUMN company_id uuid REFERENCES public.companies(id);

UPDATE public.personal_transfers
SET company_id = (SELECT id FROM public.companies WHERE short_code = 'KDS' LIMIT 1)
WHERE company_id IS NULL;

-- personal_transfers.company_id stays nullable for backward compat with
-- truly personal transfers that predate multi-company support.

-- ── 4. Add company_id to personal_transfer_beneficiaries ───────────────

ALTER TABLE public.personal_transfer_beneficiaries
  ADD COLUMN company_id uuid REFERENCES public.companies(id);

-- Existing beneficiaries are personal (owner-scoped), not company-scoped.
-- New company-scoped beneficiaries will have company_id set.

-- ── 5. Replace credit_principal_wallet to tag company_id ───────────────

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
  v_dva_row record;
BEGIN
  BEGIN
    INSERT INTO public.webhook_idempotency (reference, event_type)
    VALUES (p_reference, 'charge.success');
  EXCEPTION
    WHEN unique_violation THEN
      RETURN jsonb_build_object('outcome', 'duplicate', 'reference', p_reference);
  END;

  SELECT id, company_id INTO v_dva_row
  FROM public.principal_wallet_dva
  WHERE account_number = p_receiver_account_number
     OR (p_customer_code IS NOT NULL AND paystack_customer_code = p_customer_code)
  LIMIT 1;

  IF v_dva_row IS NULL THEN
    RETURN jsonb_build_object('outcome', 'not_our_account', 'reference', p_reference);
  END IF;

  INSERT INTO public.principal_wallet_ledger
    (direction, amount_ngn, source, reference, paystack_raw, company_id)
  VALUES
    ('credit', p_amount_ngn, 'dva_funding', p_reference, p_paystack_raw, v_dva_row.company_id);

  RETURN jsonb_build_object(
    'outcome', 'credited',
    'reference', p_reference,
    'amount_ngn', p_amount_ngn,
    'company_id', v_dva_row.company_id
  );
END;
$$;

-- ── 6. Replace debit_principal_wallet with company_id param ────────────

CREATE OR REPLACE FUNCTION public.debit_principal_wallet(
  p_amount_ngn numeric,
  p_source text,
  p_reference text,
  p_related_batch_item_id uuid,
  p_related_personal_transfer_id uuid,
  p_company_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
BEGIN
  -- Resolve company_id: explicit param > from KD Squares default
  v_company_id := COALESCE(
    p_company_id,
    (SELECT id FROM public.companies WHERE short_code = 'KDS' LIMIT 1)
  );

  INSERT INTO public.principal_wallet_ledger
    (direction, amount_ngn, source, reference, related_batch_item_id, related_personal_transfer_id, company_id)
  VALUES
    ('debit', p_amount_ngn, p_source, p_reference, p_related_batch_item_id, p_related_personal_transfer_id, v_company_id);

  RETURN jsonb_build_object('outcome', 'debited', 'reference', p_reference, 'amount_ngn', p_amount_ngn, 'company_id', v_company_id);
END;
$$;

-- ── 7. Replace credit_back_principal_wallet with company_id ────────────

CREATE OR REPLACE FUNCTION public.credit_back_principal_wallet(
  p_amount_ngn numeric,
  p_reference text,
  p_company_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
BEGIN
  -- Try to derive company from the original debit entry
  SELECT company_id INTO v_company_id
  FROM public.principal_wallet_ledger
  WHERE reference = p_reference AND direction = 'debit'
  LIMIT 1;

  v_company_id := COALESCE(v_company_id, p_company_id,
    (SELECT id FROM public.companies WHERE short_code = 'KDS' LIMIT 1));

  INSERT INTO public.principal_wallet_ledger (direction, amount_ngn, source, reference, company_id)
  VALUES ('credit', p_amount_ngn, 'reversal_refund', p_reference, v_company_id);

  RETURN jsonb_build_object('outcome', 'refunded', 'reference', p_reference, 'amount_ngn', p_amount_ngn);
END;
$$;

-- ── 8. Company-scoped wallet balance RPC ───────────────────────────────

CREATE OR REPLACE FUNCTION public.principal_wallet_balance(
  p_company_id uuid DEFAULT NULL
)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(SUM(
    CASE WHEN direction = 'credit' THEN amount_ngn ELSE -amount_ngn END
  ), 0)
  FROM public.principal_wallet_ledger
  WHERE (p_company_id IS NULL OR company_id = p_company_id);
$$;

-- ── 9. Fix overdraft trigger to be company-scoped ──────────────────────

CREATE OR REPLACE FUNCTION public.enforce_principal_wallet_no_overdraft()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_balance numeric;
BEGIN
  IF NEW.direction <> 'debit' THEN
    RETURN NEW;
  END IF;

  -- Lock per company to avoid race conditions
  PERFORM pg_advisory_xact_lock(hashtext('pwb_' || COALESCE(NEW.company_id::text, 'global')));

  SELECT COALESCE(SUM(
    CASE WHEN direction = 'credit' THEN amount_ngn ELSE -amount_ngn END
  ), 0) - NEW.amount_ngn
    INTO v_balance
    FROM public.principal_wallet_ledger
    WHERE company_id = NEW.company_id;

  IF v_balance < 0 THEN
    RAISE EXCEPTION 'Insufficient wallet balance for company %. Available: %, Requested: %',
      NEW.company_id, v_balance + NEW.amount_ngn, NEW.amount_ngn
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

-- ── 10. NDI disbursement categories ────────────────────────────────────
-- These are stored as payment_category free-text on payment_batches.
-- We define them in the app code (Phase 4), but for documentation:
-- ndi_program_expense, ndi_admin, ndi_payroll, ndi_grant_disbursement

-- ── 11. Company financial summary view ─────────────────────────────────

CREATE OR REPLACE VIEW public.company_wallet_summary AS
SELECT
  c.id AS company_id,
  c.name AS company_name,
  c.short_code,
  c.color,
  dva.account_number,
  dva.bank_name,
  dva.account_name,
  dva.paystack_customer_code,
  COALESCE(bal.balance, 0) AS wallet_balance,
  COALESCE(bal.total_credits, 0) AS total_credits,
  COALESCE(bal.total_debits, 0) AS total_debits,
  COALESCE(bal.entry_count, 0) AS entry_count
FROM public.companies c
LEFT JOIN public.principal_wallet_dva dva ON dva.company_id = c.id
LEFT JOIN LATERAL (
  SELECT
    SUM(CASE WHEN direction = 'credit' THEN amount_ngn ELSE 0 END) AS total_credits,
    SUM(CASE WHEN direction = 'debit' THEN amount_ngn ELSE 0 END) AS total_debits,
    SUM(CASE WHEN direction = 'credit' THEN amount_ngn ELSE -amount_ngn END) AS balance,
    COUNT(*) AS entry_count
  FROM public.principal_wallet_ledger l
  WHERE l.company_id = c.id
) bal ON true
WHERE c.is_active = true;

COMMENT ON VIEW public.company_wallet_summary IS
  'Per-company wallet overview: DVA details + balance from the ledger. '
  'Used by the company-scoped financial dashboard.';
