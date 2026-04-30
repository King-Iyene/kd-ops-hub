-- ----------------------------------------------------------------------------
-- Compliance Autopilot — auto-populate compliance_filings from payroll runs.
--
-- Today the compliance calendar shows deadlines but the amount field is empty
-- until someone types it in. That's error-prone and time-wasting. This
-- migration links each payroll run to the statutory filings it generates and
-- writes the amounts automatically the moment payroll is approved.
--
-- Columns added to compliance_filings:
--   payroll_run_id        — source of the auto-calculated amount (nullable so
--                            manually-entered filings still work)
--   auto_calculated_at    — when the amount was last refreshed from payroll
--   breakdown_json        — per-PFA / per-employee detail for ops who need
--                            to remit against multiple beneficiary accounts
--                            (e.g. pension goes to N different PFAs)
--
-- The auto_populate_filings_from_payroll(payroll_run_id) RPC is invoked from
-- the React app whenever a payroll run is approved. It is idempotent: calling
-- twice for the same run produces the same result.
-- ----------------------------------------------------------------------------

ALTER TABLE public.compliance_filings
  ADD COLUMN IF NOT EXISTS payroll_run_id UUID
    REFERENCES public.payroll_runs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS auto_calculated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS breakdown_json JSONB;

CREATE INDEX IF NOT EXISTS compliance_filings_payroll_run_idx
  ON public.compliance_filings (payroll_run_id)
  WHERE payroll_run_id IS NOT NULL;

COMMENT ON COLUMN public.compliance_filings.payroll_run_id IS
  'Payroll run that generated this filing amount. NULL for manually entered filings (e.g. VAT, CAC).';
COMMENT ON COLUMN public.compliance_filings.auto_calculated_at IS
  'Timestamp of the last auto-population from the source payroll run.';
COMMENT ON COLUMN public.compliance_filings.breakdown_json IS
  'Beneficiary-level breakdown (e.g. per-PFA pension totals) used to generate one remittance batch per beneficiary.';

-- ----------------------------------------------------------------------------
-- RPC: auto_populate_filings_from_payroll(payroll_run_id)
--
-- Reads totals + per-employee detail from payroll_run_items and upserts
-- compliance_filings rows for every kind that the payroll triggers:
--
--   paye    — total PAYE deducted from staff
--   pension — employee 8% + employer 10% (pension_ngn already holds the
--             aggregated employee share; employer is computed as 1.25× of it)
--   nhf     — employee 2.5% (where enabled)
--   nsitf   — employer 1% of total monthly payroll
--
-- For pension, breakdown_json is filled with one entry per PFA:
--   [
--     { "pfa": "Stanbic IBTC Pension", "rsa_count": 5,
--       "employee_amount_ngn": 80000, "employer_amount_ngn": 100000 },
--     ...
--   ]
-- This lets the UI later turn each entry into its own payment_batch row.
--
-- Returns a JSONB summary of what was written so the caller can display it.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.auto_populate_filings_from_payroll(
  p_payroll_run_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run               RECORD;
  v_period            TEXT;
  v_paye_due_date     DATE;
  v_pension_due_date  DATE;
  v_nhf_due_date      DATE;
  v_nsitf_due_date    DATE;
  v_year              INT;
  v_month             INT;
  v_next_month        DATE;
  v_pension_breakdown JSONB;
  v_paye_breakdown    JSONB;
  v_nsitf_amount      NUMERIC;
  v_pension_employer  NUMERIC;
  v_summary           JSONB;
BEGIN
  -- Authorisation: only admin/finance/super_admin may invoke. Everyone else
  -- gets a clear error so the UI can fall back to a manual flow.
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin', 'finance', 'super_admin')
  ) THEN
    RAISE EXCEPTION 'Only admin or finance roles can populate compliance filings'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_run FROM public.payroll_runs WHERE id = p_payroll_run_id;
  IF v_run IS NULL THEN
    RAISE EXCEPTION 'Payroll run % not found', p_payroll_run_id;
  END IF;

  v_period := v_run.period;  -- "YYYY-MM"
  v_year   := split_part(v_period, '-', 1)::INT;
  v_month  := split_part(v_period, '-', 2)::INT;
  v_next_month := make_date(v_year, v_month, 1) + INTERVAL '1 month';

  -- Statutory deadlines (state IRS / FMBN / PFA / NSITF). The compliance page
  -- already has a dueDateFor() helper but we duplicate the rules in SQL so
  -- the RPC works whether or not the row exists yet.
  v_paye_due_date    := (v_next_month + INTERVAL '9 days')::DATE;   -- 10th
  v_pension_due_date := (v_next_month + INTERVAL '6 days')::DATE;   -- 7th
  v_nhf_due_date     := (v_next_month + INTERVAL '14 days')::DATE;  -- ~mid
  v_nsitf_due_date   := (v_next_month + INTERVAL '14 days')::DATE;  -- 15th

  -- Per-employee PAYE breakdown (lightweight audit trail, capped to keep the
  -- JSON small for huge payrolls).
  SELECT jsonb_agg(jsonb_build_object(
    'employee_id', employee_id,
    'paye_ngn', paye_ngn,
    'pension_ngn', pension_ngn,
    'nhf_ngn', nhf_ngn,
    'gross_ngn', gross_ngn
  ) ORDER BY paye_ngn DESC)
  INTO v_paye_breakdown
  FROM public.payroll_run_items
  WHERE payroll_run_id = p_payroll_run_id;

  -- Per-PFA pension breakdown. Joins payroll_run_items → employee_benefits
  -- (where benefit_type='pension_pfa') so we can produce ONE remittance per
  -- PFA instead of asking finance to manually slice the total by hand.
  SELECT jsonb_agg(row_to_json(g))
  INTO v_pension_breakdown
  FROM (
    SELECT
      COALESCE(eb.provider, 'Unknown PFA')                AS pfa,
      COUNT(DISTINCT pri.employee_id)                     AS rsa_count,
      ROUND(SUM(pri.pension_ngn))                         AS employee_amount_ngn,
      ROUND(SUM(pri.pension_ngn) * 1.25)                  AS employer_amount_ngn,
      ROUND(SUM(pri.pension_ngn) * 2.25)                  AS total_amount_ngn
    FROM public.payroll_run_items pri
    LEFT JOIN public.employee_benefits eb
           ON eb.employee_id = pri.employee_id
          AND eb.benefit_type = 'pension_pfa'
          AND eb.status = 'active'
    WHERE pri.payroll_run_id = p_payroll_run_id
      AND pri.pension_ngn > 0
    GROUP BY COALESCE(eb.provider, 'Unknown PFA')
    ORDER BY total_amount_ngn DESC
  ) g;

  -- NSITF: 1% of total monthly payroll (employer-only).
  v_nsitf_amount := ROUND(COALESCE(v_run.total_employee_ngn, 0) * 0.01);

  -- Pension employer share = 10/8 × employee share = employee × 1.25.
  v_pension_employer := ROUND(COALESCE(v_run.pension_ngn, 0) * 1.25);

  -- ---- Upsert each filing kind ---------------------------------------------

  -- PAYE
  INSERT INTO public.compliance_filings (
    kind, period, due_date, amount_ngn, status,
    payroll_run_id, auto_calculated_at, breakdown_json, notes
  )
  VALUES (
    'paye', v_period, v_paye_due_date, v_run.paye_ngn,
    CASE WHEN v_paye_due_date < CURRENT_DATE THEN 'overdue'
         WHEN v_paye_due_date <= CURRENT_DATE + 3 THEN 'due'
         ELSE 'upcoming' END,
    p_payroll_run_id, now(), v_paye_breakdown,
    'Auto-populated from payroll ' || v_period
  )
  ON CONFLICT (kind, period) DO UPDATE SET
    amount_ngn = EXCLUDED.amount_ngn,
    payroll_run_id = EXCLUDED.payroll_run_id,
    auto_calculated_at = now(),
    breakdown_json = EXCLUDED.breakdown_json,
    -- Don't downgrade due_date if a human set a custom one.
    due_date = COALESCE(public.compliance_filings.due_date, EXCLUDED.due_date)
  WHERE public.compliance_filings.filed_at IS NULL;  -- never overwrite filed rows

  -- Pension (employee + employer share, with per-PFA breakdown)
  INSERT INTO public.compliance_filings (
    kind, period, due_date, amount_ngn, status,
    payroll_run_id, auto_calculated_at, breakdown_json, notes
  )
  VALUES (
    'pension', v_period, v_pension_due_date,
    COALESCE(v_run.pension_ngn, 0) + v_pension_employer,
    CASE WHEN v_pension_due_date < CURRENT_DATE THEN 'overdue'
         WHEN v_pension_due_date <= CURRENT_DATE + 3 THEN 'due'
         ELSE 'upcoming' END,
    p_payroll_run_id, now(), v_pension_breakdown,
    'Employee 8% + employer 10% — split per PFA in breakdown'
  )
  ON CONFLICT (kind, period) DO UPDATE SET
    amount_ngn = EXCLUDED.amount_ngn,
    payroll_run_id = EXCLUDED.payroll_run_id,
    auto_calculated_at = now(),
    breakdown_json = EXCLUDED.breakdown_json,
    due_date = COALESCE(public.compliance_filings.due_date, EXCLUDED.due_date)
  WHERE public.compliance_filings.filed_at IS NULL;

  -- NHF (only if anyone in the run had NHF deducted)
  IF COALESCE(v_run.nhf_ngn, 0) > 0 THEN
    INSERT INTO public.compliance_filings (
      kind, period, due_date, amount_ngn, status,
      payroll_run_id, auto_calculated_at, notes
    )
    VALUES (
      'nhf', v_period, v_nhf_due_date, v_run.nhf_ngn,
      CASE WHEN v_nhf_due_date < CURRENT_DATE THEN 'overdue'
           WHEN v_nhf_due_date <= CURRENT_DATE + 3 THEN 'due'
           ELSE 'upcoming' END,
      p_payroll_run_id, now(),
      'Auto-populated NHF from payroll ' || v_period
    )
    ON CONFLICT (kind, period) DO UPDATE SET
      amount_ngn = EXCLUDED.amount_ngn,
      payroll_run_id = EXCLUDED.payroll_run_id,
      auto_calculated_at = now(),
      due_date = COALESCE(public.compliance_filings.due_date, EXCLUDED.due_date)
    WHERE public.compliance_filings.filed_at IS NULL;
  END IF;

  -- NSITF (employer-only, 1% of total payroll)
  IF v_nsitf_amount > 0 THEN
    INSERT INTO public.compliance_filings (
      kind, period, due_date, amount_ngn, status,
      payroll_run_id, auto_calculated_at, notes
    )
    VALUES (
      'nsitf', v_period, v_nsitf_due_date, v_nsitf_amount,
      CASE WHEN v_nsitf_due_date < CURRENT_DATE THEN 'overdue'
           WHEN v_nsitf_due_date <= CURRENT_DATE + 3 THEN 'due'
           ELSE 'upcoming' END,
      p_payroll_run_id, now(),
      'Auto-populated 1% NSITF (employer) from payroll ' || v_period
    )
    ON CONFLICT (kind, period) DO UPDATE SET
      amount_ngn = EXCLUDED.amount_ngn,
      payroll_run_id = EXCLUDED.payroll_run_id,
      auto_calculated_at = now(),
      due_date = COALESCE(public.compliance_filings.due_date, EXCLUDED.due_date)
    WHERE public.compliance_filings.filed_at IS NULL;
  END IF;

  v_summary := jsonb_build_object(
    'period', v_period,
    'payroll_run_id', p_payroll_run_id,
    'paye_ngn', v_run.paye_ngn,
    'pension_employee_ngn', v_run.pension_ngn,
    'pension_employer_ngn', v_pension_employer,
    'pension_total_ngn', COALESCE(v_run.pension_ngn, 0) + v_pension_employer,
    'pfa_count', COALESCE(jsonb_array_length(v_pension_breakdown), 0),
    'nhf_ngn', COALESCE(v_run.nhf_ngn, 0),
    'nsitf_ngn', v_nsitf_amount
  );

  RETURN v_summary;
END;
$$;

GRANT EXECUTE ON FUNCTION public.auto_populate_filings_from_payroll(UUID)
  TO authenticated;

COMMENT ON FUNCTION public.auto_populate_filings_from_payroll IS
  'Idempotently populates compliance_filings (PAYE, pension, NHF, NSITF) for the given payroll run with per-PFA pension breakdown. Never overwrites filings that have already been marked filed. Returns a JSON summary.';
