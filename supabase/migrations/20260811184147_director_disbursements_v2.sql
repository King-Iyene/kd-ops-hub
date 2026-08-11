-- ═══════════════════════════════════════════════════════════════════════
-- Director Disbursements
-- ═══════════════════════════════════════════════════════════════════════
--
-- Two hard-separated transaction types for the director/super_admin to move
-- money out via Paystack, modeled on how Raenest/Brass sit their own
-- ledger on top of Paystack-as-rail:
--
-- 1. COMPANY DISBURSEMENT (director salary, drawings, loan repayments) —
--    reuses payment_batches/batch_items verbatim. It is NOT a new table:
--    it's the exact same money-movement plumbing every other payment
--    batch uses (approval/funding/processing state machine, immutability
--    triggers, batch-worker chunking/dispatch, transactions_view
--    reporting) with three new payment_category values that are new,
--    additional-restricted via RLS to super_admin only. This is
--    deliberate reuse per the "don't rebuild the plumbing" brief — every
--    protection payment_batches already has (cap checks, state-machine
--    immutability, orphan-recovery watchdog) applies to these for free.
--
-- 2. PERSONAL TRANSFER (post-salary, director's own money) — a wholly
--    separate new table, personal_transfers, with NO foreign key to
--    payment_batches/batch_items/expenses/budgets or any other
--    reporting-surface table. Paystack is used as a pure utility (same
--    edge function, same recipient/transfer primitives) but the record of
--    what happened lives in a table nothing else in the schema
--    references, queries, or joins against. transactions_view,
--    cfo-dashboard, board-report, expenses reporting, and every payables
--    view are all built against payment_batches/batch_items/expenses —
--    none of them can see personal_transfers because the table doesn't
--    exist in any of their FROM/JOIN clauses, not because of a runtime
--    check. That's the "structurally incapable" requirement.
--
-- Visibility: both are restricted to super_admin only.
--
-- ───────────────────────────────────────────────────────────────────────
-- PART 1 — Company Disbursement: restrict 3 new payment_category values
--          on the EXISTING payment_batches/batch_items tables to
--          super_admin only, via RESTRICTIVE policies layered on top of
--          the existing permissive ones (AND'd, not OR'd — this can only
--          narrow access for these 3 categories, never widen it for any
--          other category).
-- ───────────────────────────────────────────────────────────────────────

-- payment_category is free text (no CHECK constraint — confirmed against
-- the live schema before writing this), so these three new values need no
-- column/constraint change. They're recognised app-side by
-- src/lib/director-disbursements.ts and never appear in the general
-- Quick Pay category dropdown (src/lib/payment-categories.ts), so a
-- finance/admin/operations user has no UI path to create one even before
-- RLS is considered — the RLS layer below is the enforcement backstop,
-- not the only line of defense.
--   director_salary          — recurring/ad-hoc director salary payment
--   director_drawings        — owner's drawings
--   director_loan_repayment  — company repaying a director loan

CREATE POLICY "batches_director_disbursement_restrict_select" ON public.payment_batches
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    payment_category NOT IN ('director_salary', 'director_drawings', 'director_loan_repayment')
    OR public.current_user_role() = 'super_admin'
  );

CREATE POLICY "batches_director_disbursement_restrict_insert" ON public.payment_batches
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (
    payment_category NOT IN ('director_salary', 'director_drawings', 'director_loan_repayment')
    OR public.current_user_role() = 'super_admin'
  );

CREATE POLICY "batches_director_disbursement_restrict_update" ON public.payment_batches
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (
    payment_category NOT IN ('director_salary', 'director_drawings', 'director_loan_repayment')
    OR public.current_user_role() = 'super_admin'
  );

CREATE POLICY "batches_director_disbursement_restrict_delete" ON public.payment_batches
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING (
    payment_category NOT IN ('director_salary', 'director_drawings', 'director_loan_repayment')
    OR public.current_user_role() = 'super_admin'
  );

CREATE POLICY "batch_items_director_disbursement_restrict_select" ON public.batch_items
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    NOT EXISTS (
      SELECT 1 FROM public.payment_batches b
      WHERE b.id = batch_items.batch_id
        AND b.payment_category IN ('director_salary', 'director_drawings', 'director_loan_repayment')
    )
    OR public.current_user_role() = 'super_admin'
  );

CREATE POLICY "batch_items_director_disbursement_restrict_insert" ON public.batch_items
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (
    NOT EXISTS (
      SELECT 1 FROM public.payment_batches b
      WHERE b.id = batch_items.batch_id
        AND b.payment_category IN ('director_salary', 'director_drawings', 'director_loan_repayment')
    )
    OR public.current_user_role() = 'super_admin'
  );

CREATE POLICY "batch_items_director_disbursement_restrict_update" ON public.batch_items
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (
    NOT EXISTS (
      SELECT 1 FROM public.payment_batches b
      WHERE b.id = batch_items.batch_id
        AND b.payment_category IN ('director_salary', 'director_drawings', 'director_loan_repayment')
    )
    OR public.current_user_role() = 'super_admin'
  );

CREATE POLICY "batch_items_director_disbursement_restrict_delete" ON public.batch_items
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING (
    NOT EXISTS (
      SELECT 1 FROM public.payment_batches b
      WHERE b.id = batch_items.batch_id
        AND b.payment_category IN ('director_salary', 'director_drawings', 'director_loan_repayment')
    )
    OR public.current_user_role() = 'super_admin'
  );

-- Note on "feeds the existing expense/payables reporting": transactions_view,
-- Reports.tsx, FinanceDashboard, etc. all query payment_batches/batch_items
-- under the CALLING user's own role via normal RLS — so a super_admin
-- running those exact same reports sees director disbursements included
-- (same tables, same view definitions, no schema change needed there);
-- a finance/admin user running the same report simply doesn't see those
-- specific rows, consistent with "visibility gated to super_admin."

-- ───────────────────────────────────────────────────────────────────────
-- PART 2 — Personal Transfer: a wholly separate table, no FK to any
--          reporting-surface table. Only public.profiles(id) is
--          referenced, for the initiator's identity — profiles is not a
--          reporting/ledger table, so this does not create a path into
--          company financials.
-- ───────────────────────────────────────────────────────────────────────

CREATE TABLE public.personal_transfers (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  initiated_by             uuid NOT NULL REFERENCES public.profiles(id),
  recipient_name           text NOT NULL,
  recipient_account_number text NOT NULL,
  recipient_bank_code      text NOT NULL,
  recipient_bank_name      text,
  -- Paystack-verified echo of the account name (from resolve_account /
  -- create_recipient), never user-entered — same discipline as
  -- batch_items.account_name.
  recipient_account_name   text,
  amount_ngn               numeric NOT NULL CHECK (amount_ngn > 0 AND amount_ngn <= 100000000),
  -- Private memo for the director's own reference (e.g. "parent allowance
  -- - bulk pay"). Deliberately NOT called "narration" or "description" to
  -- avoid this table visually resembling a ledger entry.
  memo                     text,
  status                   text NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending', 'succeeded', 'failed', 'reversed')),
  paystack_recipient_code  text,
  paystack_transfer_code   text,
  paystack_reference       text UNIQUE,
  paystack_raw             jsonb,
  failure_reason           text,
  created_at               timestamptz NOT NULL DEFAULT now(),
  processed_at             timestamptz
);

COMMENT ON TABLE public.personal_transfers IS
  'Director''s own post-salary money, moved via Paystack as a pure transfer utility. '
  'Deliberately has NO foreign key to payment_batches, batch_items, expenses, budgets, '
  'or any other company-ledger/reporting table — this is the structural wall, not an '
  'application-level filter. Nothing in transactions_view, cfo-dashboard, board-report, '
  'or expense/payables reporting can reference this table because none of them join or '
  'select from it.';

CREATE INDEX personal_transfers_initiated_by_idx ON public.personal_transfers (initiated_by, created_at DESC);

ALTER TABLE public.personal_transfers ENABLE ROW LEVEL SECURITY;

-- Super_admin only, and scoped to the initiator's own rows (in case there
-- is ever more than one super_admin — one director's personal transfers
-- are not another director's business, even among super_admins).
CREATE POLICY "personal_transfers_select" ON public.personal_transfers
  FOR SELECT TO authenticated
  USING (public.current_user_role() = 'super_admin' AND initiated_by = auth.uid());

CREATE POLICY "personal_transfers_insert" ON public.personal_transfers
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role() = 'super_admin' AND initiated_by = auth.uid());

-- UPDATE is intentionally narrow: only the dispatch path (setting status/
-- paystack_* columns/processed_at after send) should ever touch a row.
-- Enforced structurally by the state-machine trigger below, not just this
-- policy — the policy controls WHO can attempt a write, the trigger
-- controls WHAT write is legal, mirroring the batch_items pattern.
CREATE POLICY "personal_transfers_update" ON public.personal_transfers
  FOR UPDATE TO authenticated
  USING (public.current_user_role() = 'super_admin' AND initiated_by = auth.uid());

-- No DELETE policy at all — a personal transfer, once created, can never
-- be deleted by any authenticated client, matching "no editing sent
-- records ever" (and extending it to "no deleting", sent or not).

-- Immutability / state-machine trigger — same discipline as
-- enforce_batch_item_state_machine, scaled down to this table's simpler
-- lifecycle: pending -> succeeded/failed, succeeded -> reversed (Paystack
-- can reverse a completed transfer), failed is terminal (retries create a
-- new row, they don't resurrect a failed one), reversed is terminal.
-- Every non-status column is also frozen once a transfer leaves 'pending'
-- except the Paystack result columns being written by the dispatch path
-- itself.
CREATE OR REPLACE FUNCTION public.enforce_personal_transfer_state_machine()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_allowed boolean;
BEGIN
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

  -- Once a transfer has left 'pending', the recipient/amount/memo fields
  -- are frozen — only status/paystack_*/failure_reason/processed_at may
  -- move, matching "no editing sent records ever, correction entries only"
  -- (a correction here means a brand-new row, not a mutation).
  IF OLD.status <> 'pending' THEN
    IF NEW.recipient_name           IS DISTINCT FROM OLD.recipient_name
       OR NEW.recipient_account_number IS DISTINCT FROM OLD.recipient_account_number
       OR NEW.recipient_bank_code      IS DISTINCT FROM OLD.recipient_bank_code
       OR NEW.amount_ngn               IS DISTINCT FROM OLD.amount_ngn
       OR NEW.memo                     IS DISTINCT FROM OLD.memo
       OR NEW.initiated_by             IS DISTINCT FROM OLD.initiated_by
    THEN
      RAISE EXCEPTION 'Cannot edit a personal transfer once it has left pending status'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER personal_transfers_state_machine
  BEFORE UPDATE ON public.personal_transfers
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_personal_transfer_state_machine();

-- Defence in depth: explicitly revoke direct EXECUTE from anon/public on
-- the trigger function (it should only ever fire via the trigger itself,
-- never be callable directly over PostgREST) — matches the codebase's
-- established convention (see 20260811140631, 20260811000000-era fixes).
REVOKE EXECUTE ON FUNCTION public.enforce_personal_transfer_state_machine() FROM PUBLIC, anon, authenticated;
