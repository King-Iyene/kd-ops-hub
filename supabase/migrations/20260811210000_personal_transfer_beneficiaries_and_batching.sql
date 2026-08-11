-- ═══════════════════════════════════════════════════════════════════════
-- Personal Transfer — saved beneficiaries + batch sending
-- ═══════════════════════════════════════════════════════════════════════
--
-- Two additions to the Personal Transfer side of Director Disbursements
-- (see 20260811184147_director_disbursements_v2.sql), both staying
-- entirely inside the same walled-off world — no new links into
-- payment_batches/batch_items/expenses or any other company-ledger table.
--
-- 1. personal_transfer_beneficiaries — saved recipients (Paystack's own
--    documented best practice is "save recipient_code to your database
--    and retrieve it from there rather than repeatedly calling the API" —
--    this mirrors the profiles.paystack_recipient_code cache pattern
--    already used elsewhere in this schema, scoped to the personal-
--    transfer world instead of company payees). Same super_admin +
--    owner-only RLS shape as personal_transfers itself.
--
-- 2. personal_transfers gains two nullable columns:
--      beneficiary_id — optional link to a saved beneficiary (nullable FK
--        WITHIN this same walled-off table group, not into any reporting
--        table — set null on delete so removing a saved beneficiary never
--        destroys a historical transfer record).
--      batch_label — free-text grouping key so multiple transfers sent
--        together in one "batch send" action share a label in the list
--        view (e.g. "August family transfers"). Deliberately NOT a new
--        batch table with its own FK graph — a plain grouping column is
--        enough for this table's simple lifecycle and keeps the wall
--        exactly as narrow as it was.

CREATE TABLE public.personal_transfer_beneficiaries (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id          uuid NOT NULL REFERENCES public.profiles(id),
  label             text NOT NULL,
  account_number    text NOT NULL,
  bank_code         text NOT NULL,
  bank_name         text,
  account_name      text,
  paystack_recipient_code text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.personal_transfer_beneficiaries IS
  'Saved recipients for Personal Transfer, scoped to their owning super_admin. '
  'Caches paystack_recipient_code per Paystack''s own documented guidance '
  '(save it once, reuse from your own database) — same pattern as '
  'profiles.paystack_recipient_code, applied to the personal-transfer world '
  'instead of company payees. No link to any company-ledger/reporting table.';

CREATE INDEX personal_transfer_beneficiaries_owner_idx ON public.personal_transfer_beneficiaries (owner_id, label);

ALTER TABLE public.personal_transfer_beneficiaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "personal_transfer_beneficiaries_select" ON public.personal_transfer_beneficiaries
  FOR SELECT TO authenticated
  USING (public.current_user_role() = 'super_admin' AND owner_id = auth.uid());

CREATE POLICY "personal_transfer_beneficiaries_insert" ON public.personal_transfer_beneficiaries
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role() = 'super_admin' AND owner_id = auth.uid());

CREATE POLICY "personal_transfer_beneficiaries_update" ON public.personal_transfer_beneficiaries
  FOR UPDATE TO authenticated
  USING (public.current_user_role() = 'super_admin' AND owner_id = auth.uid());

CREATE POLICY "personal_transfer_beneficiaries_delete" ON public.personal_transfer_beneficiaries
  FOR DELETE TO authenticated
  USING (public.current_user_role() = 'super_admin' AND owner_id = auth.uid());

ALTER TABLE public.personal_transfers
  ADD COLUMN beneficiary_id uuid REFERENCES public.personal_transfer_beneficiaries(id) ON DELETE SET NULL,
  ADD COLUMN batch_label text;

-- Extend the immutability trigger's frozen-field list to cover the two new
-- columns — a sent transfer's beneficiary link and batch label are part of
-- "what this transfer was" just as much as recipient_name/amount_ngn, so
-- they freeze the same way once the row leaves 'pending'.
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
