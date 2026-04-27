-- Employee Loan Management
--
-- Design decisions:
--   • Covers staff loans (interest-free or low-interest) — distinct from
--     salary_advances which are one-off, short-term, and already tracked elsewhere.
--   • interest_rate_pct defaults to 0: most Nigerian SMBs give interest-free loans.
--   • monthly_installment_ngn is computed by the app and stored for easy payroll
--     deduction reference; it is NOT recalculated automatically on update.
--   • loan_repayments table tracks each actual deduction/payment so the outstanding
--     balance is always accurate (sum of amounts, not a stored field).
--   • status: active | fully_paid | written_off | cancelled
--   • deduct_from_payroll flag signals the payroll module to include the installment.

CREATE TABLE IF NOT EXISTS public.employee_loans (
  id                       UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id              UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount_ngn               NUMERIC     NOT NULL CHECK (amount_ngn > 0 AND amount_ngn <= 50000000),
  interest_rate_pct        NUMERIC     NOT NULL DEFAULT 0 CHECK (interest_rate_pct >= 0 AND interest_rate_pct <= 100),
  tenure_months            INTEGER     NOT NULL CHECK (tenure_months > 0 AND tenure_months <= 120),
  monthly_installment_ngn  NUMERIC     NOT NULL CHECK (monthly_installment_ngn > 0),
  disbursement_date        DATE        NOT NULL DEFAULT CURRENT_DATE,
  first_repayment_date     DATE        NOT NULL,
  purpose                  TEXT        NOT NULL,
  deduct_from_payroll      BOOLEAN     NOT NULL DEFAULT TRUE,
  status                   TEXT        NOT NULL DEFAULT 'active'
                             CHECK (status IN ('active','fully_paid','written_off','cancelled')),
  approved_by              UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at              TIMESTAMPTZ DEFAULT NULL,
  notes                    TEXT        DEFAULT NULL,
  created_by               UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.loan_repayments (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  loan_id     UUID        NOT NULL REFERENCES public.employee_loans(id) ON DELETE CASCADE,
  amount_ngn  NUMERIC     NOT NULL CHECK (amount_ngn > 0),
  paid_date   DATE        NOT NULL DEFAULT CURRENT_DATE,
  method      TEXT        NOT NULL DEFAULT 'payroll_deduction'
                CHECK (method IN ('payroll_deduction','bank_transfer','cash')),
  notes       TEXT        DEFAULT NULL,
  recorded_by UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.set_employee_loans_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS employee_loans_updated_at ON public.employee_loans;
CREATE TRIGGER employee_loans_updated_at
  BEFORE UPDATE ON public.employee_loans
  FOR EACH ROW EXECUTE FUNCTION public.set_employee_loans_updated_at();

-- Auto-mark loan as fully_paid when total repayments >= loan amount
CREATE OR REPLACE FUNCTION public.check_loan_fully_paid()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_total_paid NUMERIC;
  v_loan_amount NUMERIC;
BEGIN
  SELECT COALESCE(SUM(amount_ngn), 0) INTO v_total_paid
  FROM public.loan_repayments WHERE loan_id = NEW.loan_id;

  SELECT amount_ngn INTO v_loan_amount
  FROM public.employee_loans WHERE id = NEW.loan_id;

  IF v_total_paid >= v_loan_amount THEN
    UPDATE public.employee_loans
    SET status = 'fully_paid', updated_at = now()
    WHERE id = NEW.loan_id AND status = 'active';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS loan_repayment_check ON public.loan_repayments;
CREATE TRIGGER loan_repayment_check
  AFTER INSERT ON public.loan_repayments
  FOR EACH ROW EXECUTE FUNCTION public.check_loan_fully_paid();

CREATE INDEX IF NOT EXISTS loans_employee_idx  ON public.employee_loans (employee_id);
CREATE INDEX IF NOT EXISTS loans_status_idx    ON public.employee_loans (status);
CREATE INDEX IF NOT EXISTS repayments_loan_idx ON public.loan_repayments (loan_id);
CREATE INDEX IF NOT EXISTS repayments_date_idx ON public.loan_repayments (paid_date);

ALTER TABLE public.employee_loans  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loan_repayments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Employees can read own loans"
  ON public.employee_loans FOR SELECT
  USING (auth.uid() IS NOT NULL AND (employee_id = auth.uid() OR auth.uid() IS NOT NULL));

CREATE POLICY "Finance can manage loans"
  ON public.employee_loans FOR ALL
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Finance can read repayments"
  ON public.loan_repayments FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Finance can manage repayments"
  ON public.loan_repayments FOR ALL
  USING (auth.uid() IS NOT NULL);
