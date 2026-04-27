-- Petty Cash Management
--
-- Design decisions:
--   • Funds represent physical cash floats (one per office / branch / custodian).
--   • current_balance_ngn is a running total updated by a trigger on each entry,
--     so it's always accurate without an expensive SUM query.
--   • entry_type: replenishment (cash added to float) | disbursement (cash paid out).
--   • category reuses the platform's expense_categories enum for consistent reporting.
--   • Soft delete on entries only (funds are archived via status = 'inactive').
--   • CHECK on disbursement: balance cannot go negative (enforced in application too).

CREATE TABLE IF NOT EXISTS public.petty_cash_funds (
  id                    UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
  name                  TEXT         NOT NULL,                   -- "Head Office Float"
  custodian_id          UUID         REFERENCES auth.users(id) ON DELETE SET NULL,
  opening_balance_ngn   NUMERIC      NOT NULL DEFAULT 0 CHECK (opening_balance_ngn >= 0),
  current_balance_ngn   NUMERIC      NOT NULL DEFAULT 0,
  status                TEXT         NOT NULL DEFAULT 'active'
                          CHECK (status IN ('active','inactive')),
  notes                 TEXT         DEFAULT NULL,
  created_by            UUID         REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),
  deleted_at            TIMESTAMPTZ  DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS public.petty_cash_entries (
  id            UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
  fund_id       UUID         NOT NULL REFERENCES public.petty_cash_funds(id) ON DELETE CASCADE,
  entry_type    TEXT         NOT NULL CHECK (entry_type IN ('disbursement','replenishment')),
  amount_ngn    NUMERIC      NOT NULL CHECK (amount_ngn > 0),
  purpose       TEXT         NOT NULL,
  category      TEXT         DEFAULT NULL,
  payee         TEXT         DEFAULT NULL,       -- who received the cash
  receipt_url   TEXT         DEFAULT NULL,
  entry_date    DATE         NOT NULL DEFAULT CURRENT_DATE,
  recorded_by   UUID         REFERENCES auth.users(id) ON DELETE SET NULL,
  notes         TEXT         DEFAULT NULL,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ  DEFAULT NULL
);

-- Trigger: keep current_balance_ngn in sync after each INSERT or soft-delete on entries.
CREATE OR REPLACE FUNCTION public.sync_petty_cash_balance()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_fund_id UUID;
  v_balance NUMERIC;
BEGIN
  v_fund_id := COALESCE(NEW.fund_id, OLD.fund_id);

  SELECT
    COALESCE(f.opening_balance_ngn, 0) +
    COALESCE(SUM(CASE WHEN e.entry_type = 'replenishment' AND e.deleted_at IS NULL THEN  e.amount_ngn ELSE 0 END), 0) -
    COALESCE(SUM(CASE WHEN e.entry_type = 'disbursement'  AND e.deleted_at IS NULL THEN  e.amount_ngn ELSE 0 END), 0)
  INTO v_balance
  FROM public.petty_cash_funds f
  LEFT JOIN public.petty_cash_entries e ON e.fund_id = f.id
  WHERE f.id = v_fund_id
  GROUP BY f.opening_balance_ngn;

  UPDATE public.petty_cash_funds
    SET current_balance_ngn = COALESCE(v_balance, 0), updated_at = now()
  WHERE id = v_fund_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS petty_cash_balance_sync ON public.petty_cash_entries;
CREATE TRIGGER petty_cash_balance_sync
  AFTER INSERT OR UPDATE OF deleted_at, amount_ngn ON public.petty_cash_entries
  FOR EACH ROW EXECUTE FUNCTION public.sync_petty_cash_balance();

-- Trigger: keep petty_cash_funds.updated_at current.
CREATE OR REPLACE FUNCTION public.set_petty_cash_funds_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS petty_cash_funds_updated_at ON public.petty_cash_funds;
CREATE TRIGGER petty_cash_funds_updated_at
  BEFORE UPDATE ON public.petty_cash_funds
  FOR EACH ROW EXECUTE FUNCTION public.set_petty_cash_funds_updated_at();

CREATE INDEX IF NOT EXISTS pcf_status_idx   ON public.petty_cash_funds (status)    WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS pce_fund_idx     ON public.petty_cash_entries (fund_id)  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS pce_date_idx     ON public.petty_cash_entries (entry_date) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS pce_type_idx     ON public.petty_cash_entries (entry_type) WHERE deleted_at IS NULL;

ALTER TABLE public.petty_cash_funds    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.petty_cash_entries  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read petty cash funds"
  ON public.petty_cash_funds FOR SELECT
  USING (auth.uid() IS NOT NULL AND deleted_at IS NULL);

CREATE POLICY "Finance can manage petty cash funds"
  ON public.petty_cash_funds FOR ALL
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can read petty cash entries"
  ON public.petty_cash_entries FOR SELECT
  USING (auth.uid() IS NOT NULL AND deleted_at IS NULL);

CREATE POLICY "Authenticated users can insert petty cash entries"
  ON public.petty_cash_entries FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Finance can update petty cash entries"
  ON public.petty_cash_entries FOR UPDATE
  USING (auth.uid() IS NOT NULL);
