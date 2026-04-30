-- ----------------------------------------------------------------------------
-- Earned Wage Access (EWA) — let employees draw a portion of salary they have
-- already accrued, before payday.
--
-- Why: monthly payroll cycles trap employees into predatory short-term loans
-- (Lagos & Abuja markets average 20-30% interest) for emergencies that arrive
-- mid-month. EWA lets them tap money they have *already earned* with no
-- interest, and the company recovers it from the next payslip — so there is
-- zero credit risk to the employer.
--
-- Eligibility rules (encoded in compute_ewa_eligibility):
--   • Active employee with a non-zero salary_ngn on profiles
--   • Has accrued at least min_draw_amount worth this month
--     (accrual = days_into_month / days_in_month × monthly_salary)
--   • Total drawn this month + new request ≤ max_draw_percent × monthly_salary
--     (default 50%)
--   • No pending/approved-but-not-disbursed prior request
--
-- Settlement: generatePayslips() in Payroll.tsx settles every disbursed-but-
-- not-settled request for the period by adding it to the employee's
-- deductions and flipping status to 'settled'.
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.ewa_requests (
  id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id            UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount_ngn             NUMERIC     NOT NULL CHECK (amount_ngn > 0),
  reason                 TEXT        DEFAULT NULL,
  status                 TEXT        NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending','approved','rejected','disbursed','settled','cancelled')),
  approved_by            UUID        REFERENCES public.profiles(id),
  approved_at            TIMESTAMPTZ,
  rejection_reason       TEXT        DEFAULT NULL,
  disbursed_batch_item_id UUID       REFERENCES public.batch_items(id) ON DELETE SET NULL,
  disbursed_at           TIMESTAMPTZ,
  settled_payroll_run_id UUID        REFERENCES public.payroll_runs(id) ON DELETE SET NULL,
  settled_at             TIMESTAMPTZ,
  notes                  TEXT        DEFAULT NULL,
  -- The accrual snapshot at time of request — preserved for audit even if
  -- the employee's salary later changes.
  salary_at_request_ngn  NUMERIC     NOT NULL DEFAULT 0,
  accrued_at_request_ngn NUMERIC     NOT NULL DEFAULT 0,
  -- Period the request will be settled against (yyyy-mm). Defaults to current
  -- month at insert time but admin can override (e.g. cross-month draws).
  settlement_period      TEXT        NOT NULL DEFAULT to_char(now(), 'YYYY-MM'),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ewa_employee_idx          ON public.ewa_requests (employee_id);
CREATE INDEX IF NOT EXISTS ewa_status_idx            ON public.ewa_requests (status);
CREATE INDEX IF NOT EXISTS ewa_settlement_period_idx ON public.ewa_requests (settlement_period);
CREATE INDEX IF NOT EXISTS ewa_outstanding_idx       ON public.ewa_requests (employee_id, settlement_period)
  WHERE status IN ('approved','disbursed');

CREATE OR REPLACE FUNCTION public.set_ewa_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS ewa_updated_at ON public.ewa_requests;
CREATE TRIGGER ewa_updated_at
  BEFORE UPDATE ON public.ewa_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_ewa_updated_at();

ALTER TABLE public.ewa_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ewa_self_select ON public.ewa_requests;
CREATE POLICY ewa_self_select ON public.ewa_requests
  FOR SELECT TO authenticated
  USING (
    employee_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin','finance','super_admin','hr')
    )
  );

DROP POLICY IF EXISTS ewa_self_insert ON public.ewa_requests;
CREATE POLICY ewa_self_insert ON public.ewa_requests
  FOR INSERT TO authenticated
  WITH CHECK (employee_id = auth.uid());

DROP POLICY IF EXISTS ewa_finance_update ON public.ewa_requests;
CREATE POLICY ewa_finance_update ON public.ewa_requests
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin','finance','super_admin')
    )
    -- Or the employee cancelling their OWN pending request:
    OR (employee_id = auth.uid() AND status = 'pending')
  );

-- ----------------------------------------------------------------------------
-- Tunables — could be moved to company_settings later, but constants here
-- keep the math transparent and unit-testable.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ewa_max_draw_percent() RETURNS NUMERIC
  LANGUAGE sql IMMUTABLE AS $$ SELECT 0.50::NUMERIC $$;
CREATE OR REPLACE FUNCTION public.ewa_min_draw_amount() RETURNS NUMERIC
  LANGUAGE sql IMMUTABLE AS $$ SELECT 5000::NUMERIC $$;

-- ----------------------------------------------------------------------------
-- compute_ewa_eligibility(employee_id) — JSON snapshot used by the UI.
-- Anyone can call it for themselves; finance/admin can call it for anyone.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.compute_ewa_eligibility(
  p_employee_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_employee_id     UUID;
  v_salary          NUMERIC;
  v_today           DATE := CURRENT_DATE;
  v_days_in_month   INT;
  v_day_of_month    INT;
  v_accrued         NUMERIC;
  v_already_drawn   NUMERIC;
  v_max_pct         NUMERIC := public.ewa_max_draw_percent();
  v_min_amt         NUMERIC := public.ewa_min_draw_amount();
  v_max_for_month   NUMERIC;
  v_available       NUMERIC;
  v_open_request    UUID;
  v_period          TEXT := to_char(v_today, 'YYYY-MM');
  v_blockers        JSONB := '[]'::JSONB;
BEGIN
  v_employee_id := COALESCE(p_employee_id, auth.uid());
  IF v_employee_id <> auth.uid() THEN
    -- Cross-employee lookups require finance/admin role.
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin','finance','super_admin','hr')
    ) THEN
      RAISE EXCEPTION 'Cannot inspect another employee''s EWA eligibility' USING ERRCODE='42501';
    END IF;
  END IF;

  SELECT COALESCE(salary_ngn, 0) INTO v_salary
  FROM public.profiles WHERE id = v_employee_id;

  IF v_salary IS NULL OR v_salary <= 0 THEN
    v_blockers := v_blockers || to_jsonb('No monthly salary on file — ask HR to set one'::TEXT);
  END IF;

  v_days_in_month := EXTRACT(DAY FROM (date_trunc('month', v_today) + INTERVAL '1 month - 1 day'))::INT;
  v_day_of_month  := EXTRACT(DAY FROM v_today)::INT;
  v_accrued       := ROUND(LEAST(v_day_of_month, v_days_in_month)::NUMERIC / v_days_in_month * COALESCE(v_salary, 0));
  v_max_for_month := ROUND(COALESCE(v_salary, 0) * v_max_pct);

  -- Already drawn this period = sum of approved/disbursed requests not yet settled.
  SELECT COALESCE(SUM(amount_ngn), 0)
  INTO v_already_drawn
  FROM public.ewa_requests
  WHERE employee_id = v_employee_id
    AND settlement_period = v_period
    AND status IN ('approved','disbursed');

  v_available := GREATEST(0, LEAST(v_accrued, v_max_for_month) - v_already_drawn);

  -- Open request (pending) blocks new requests until resolved.
  SELECT id INTO v_open_request
  FROM public.ewa_requests
  WHERE employee_id = v_employee_id
    AND status = 'pending'
  LIMIT 1;

  IF v_open_request IS NOT NULL THEN
    v_blockers := v_blockers || to_jsonb('You already have a pending request — wait for finance to approve or reject it'::TEXT);
  END IF;

  IF v_available < v_min_amt THEN
    v_blockers := v_blockers || to_jsonb(
      ('Available amount is below the ₦' || v_min_amt::INT || ' minimum for this period')::TEXT
    );
  END IF;

  RETURN jsonb_build_object(
    'employee_id',         v_employee_id,
    'period',              v_period,
    'monthly_salary_ngn',  v_salary,
    'days_in_month',       v_days_in_month,
    'day_of_month',        v_day_of_month,
    'accrued_to_date_ngn', v_accrued,
    'max_for_month_ngn',   v_max_for_month,
    'already_drawn_ngn',   v_already_drawn,
    'available_now_ngn',   v_available,
    'min_draw_ngn',        v_min_amt,
    'max_draw_percent',    v_max_pct,
    'open_request_id',     v_open_request,
    'can_request',         (jsonb_array_length(v_blockers) = 0),
    'blockers',            v_blockers
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.compute_ewa_eligibility(UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- request_ewa(amount_ngn, reason) — creates a pending request after running
-- the same eligibility checks server-side (defence-in-depth — never trust the
-- client's idea of what's available).
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.request_ewa(
  p_amount_ngn NUMERIC,
  p_reason     TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_eligibility JSONB;
  v_available   NUMERIC;
  v_min         NUMERIC;
  v_id          UUID;
  v_salary      NUMERIC;
  v_accrued     NUMERIC;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE='42501';
  END IF;
  IF p_amount_ngn IS NULL OR p_amount_ngn <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;

  v_eligibility := public.compute_ewa_eligibility(auth.uid());
  v_available   := (v_eligibility ->> 'available_now_ngn')::NUMERIC;
  v_min         := (v_eligibility ->> 'min_draw_ngn')::NUMERIC;
  v_salary      := (v_eligibility ->> 'monthly_salary_ngn')::NUMERIC;
  v_accrued     := (v_eligibility ->> 'accrued_to_date_ngn')::NUMERIC;

  IF NOT (v_eligibility ->> 'can_request')::BOOLEAN THEN
    RAISE EXCEPTION 'Not eligible: %', v_eligibility -> 'blockers';
  END IF;
  IF p_amount_ngn < v_min THEN
    RAISE EXCEPTION 'Below the minimum draw of ₦%', v_min::INT;
  END IF;
  IF p_amount_ngn > v_available THEN
    RAISE EXCEPTION 'Exceeds available balance of ₦% for this period', v_available::INT;
  END IF;

  INSERT INTO public.ewa_requests (
    employee_id, amount_ngn, reason,
    salary_at_request_ngn, accrued_at_request_ngn
  )
  VALUES (
    auth.uid(), p_amount_ngn, p_reason,
    v_salary, v_accrued
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_ewa(NUMERIC, TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- approve_ewa / reject_ewa / cancel_ewa
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.approve_ewa(p_request_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.ewa_requests%ROWTYPE;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin','finance','super_admin')
  ) THEN
    RAISE EXCEPTION 'Only finance or admin can approve EWA' USING ERRCODE='42501';
  END IF;

  SELECT * INTO v_row FROM public.ewa_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF v_row.status <> 'pending' THEN
    RAISE EXCEPTION 'Cannot approve a request in status %', v_row.status;
  END IF;

  UPDATE public.ewa_requests
     SET status = 'approved',
         approved_by = auth.uid(),
         approved_at = now()
   WHERE id = p_request_id;

  RETURN jsonb_build_object('id', p_request_id, 'status', 'approved');
END;
$$;
GRANT EXECUTE ON FUNCTION public.approve_ewa(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.reject_ewa(
  p_request_id UUID,
  p_reason     TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.ewa_requests%ROWTYPE;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin','finance','super_admin')
  ) THEN
    RAISE EXCEPTION 'Only finance or admin can reject EWA' USING ERRCODE='42501';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 5 THEN
    RAISE EXCEPTION 'Provide a rejection reason (≥ 5 characters)';
  END IF;

  SELECT * INTO v_row FROM public.ewa_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF v_row.status <> 'pending' THEN
    RAISE EXCEPTION 'Cannot reject a request in status %', v_row.status;
  END IF;

  UPDATE public.ewa_requests
     SET status = 'rejected',
         approved_by = auth.uid(),
         approved_at = now(),
         rejection_reason = p_reason
   WHERE id = p_request_id;

  RETURN jsonb_build_object('id', p_request_id, 'status', 'rejected');
END;
$$;
GRANT EXECUTE ON FUNCTION public.reject_ewa(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.cancel_ewa(p_request_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.ewa_requests%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.ewa_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;

  IF v_row.employee_id <> auth.uid() AND NOT EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin','finance','super_admin')
  ) THEN
    RAISE EXCEPTION 'You can only cancel your own request' USING ERRCODE='42501';
  END IF;

  IF v_row.status <> 'pending' THEN
    RAISE EXCEPTION 'Cannot cancel a request in status %', v_row.status;
  END IF;

  UPDATE public.ewa_requests
     SET status = 'cancelled'
   WHERE id = p_request_id;

  RETURN jsonb_build_object('id', p_request_id, 'status', 'cancelled');
END;
$$;
GRANT EXECUTE ON FUNCTION public.cancel_ewa(UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- get_outstanding_ewa_for_period(employee_id, period)
-- Returns the total amount of approved-or-disbursed-but-not-settled EWA for
-- the employee in the given period. Used by Payroll.tsx generatePayslips()
-- to apply the deduction automatically.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_outstanding_ewa_for_period(
  p_employee_id UUID,
  p_period      TEXT
)
RETURNS NUMERIC
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(amount_ngn), 0)
    FROM public.ewa_requests
   WHERE employee_id = p_employee_id
     AND settlement_period = p_period
     AND status IN ('approved','disbursed');
$$;

GRANT EXECUTE ON FUNCTION public.get_outstanding_ewa_for_period(UUID, TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- settle_ewa_for_payroll(payroll_run_id) — flips every approved/disbursed
-- request whose settlement_period matches the run's period to 'settled', and
-- stamps the payroll_run_id. Called from Payroll.tsx generatePayslips() AFTER
-- the deductions have been written to payslips.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.settle_ewa_for_payroll(
  p_payroll_run_id UUID
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period TEXT;
  v_count  INT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin','finance','super_admin')
  ) THEN
    RAISE EXCEPTION 'Only finance or admin can settle EWA' USING ERRCODE='42501';
  END IF;

  SELECT period INTO v_period FROM public.payroll_runs WHERE id = p_payroll_run_id;
  IF v_period IS NULL THEN
    RAISE EXCEPTION 'Payroll run not found';
  END IF;

  UPDATE public.ewa_requests
     SET status = 'settled',
         settled_payroll_run_id = p_payroll_run_id,
         settled_at = now()
   WHERE settlement_period = v_period
     AND status IN ('approved','disbursed');

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
GRANT EXECUTE ON FUNCTION public.settle_ewa_for_payroll(UUID) TO authenticated;

COMMENT ON TABLE public.ewa_requests IS
  'Earned Wage Access requests — employees draw a portion of accrued salary mid-month, repaid via the next payroll run.';
