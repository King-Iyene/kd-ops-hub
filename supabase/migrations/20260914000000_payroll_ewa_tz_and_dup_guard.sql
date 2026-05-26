-- =============================================================================
-- Payroll / EWA correctness: Africa/Lagos dates + duplicate-draft guard.
--
--  • EWA accrual and the payroll auto-draft window used CURRENT_DATE / now()
--    which run in UTC. Lagos is UTC+1, so near midnight the "day of month" and
--    the processing-window check were off by one — mis-accruing EWA and
--    opening/closing payroll a day early/late. Both now compute against
--    (now() AT TIME ZONE 'Africa/Lagos').
--
--  • schedule_auto_draft relied only on a CONTINUE-WHEN-EXISTS check to avoid
--    duplicate payroll drafts; two overlapping runs could both pass it. Add a
--    UNIQUE(pay_schedule_id, period) constraint + ON CONFLICT DO NOTHING so the
--    database makes duplicates impossible.
-- =============================================================================

-- ── 1. EWA: accrue against Lagos local date ─────────────────────────────────
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
  v_today           DATE := (now() AT TIME ZONE 'Africa/Lagos')::date;
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

-- Settlement period default should also be Lagos-local (month bucket).
ALTER TABLE public.ewa_requests
  ALTER COLUMN settlement_period
  SET DEFAULT to_char((now() AT TIME ZONE 'Africa/Lagos'), 'YYYY-MM');

-- ── 2. Payroll: unique (schedule, period) so drafts can't duplicate ─────────
DO $$
DECLARE
  v_dupes int;
BEGIN
  SELECT count(*) INTO v_dupes FROM (
    SELECT pay_schedule_id, period
    FROM public.payroll_runs
    WHERE pay_schedule_id IS NOT NULL
    GROUP BY pay_schedule_id, period
    HAVING count(*) > 1
  ) d;
  IF v_dupes > 0 THEN
    RAISE EXCEPTION
      'Cannot add UNIQUE(pay_schedule_id, period): % duplicate payroll_runs already exist — resolve them first.', v_dupes;
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payroll_runs_schedule_period_uniq'
  ) THEN
    ALTER TABLE public.payroll_runs
      ADD CONSTRAINT payroll_runs_schedule_period_uniq UNIQUE (pay_schedule_id, period);
  END IF;
END;
$$;

-- ── 3. Auto-draft: Lagos window + race-safe insert ─────────────────────────
CREATE OR REPLACE FUNCTION schedule_auto_draft()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_sched      pay_schedules%ROWTYPE;
  v_pay_date   date;
  v_cutoff     date;
  v_period     text;
  v_count      integer := 0;
  v_today      date := (now() AT TIME ZONE 'Africa/Lagos')::date;
BEGIN
  FOR v_sched IN
    SELECT * FROM pay_schedules WHERE is_active = true
  LOOP
    -- Get the very next upcoming pay date
    SELECT unnest INTO v_pay_date
    FROM unnest(next_pay_dates(v_sched.id, 1));

    CONTINUE WHEN v_pay_date IS NULL;

    -- Only act when we're inside the processing window (Lagos-local).
    CONTINUE WHEN v_today < (v_pay_date - v_sched.processing_lead_days);

    v_cutoff := v_pay_date - v_sched.cutoff_lead_days;
    v_period := to_char(v_pay_date - interval '1 month', 'YYYY-MM');  -- salary period = prior month

    -- Fast-path skip if a run already exists for this schedule + period.
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM payroll_runs
      WHERE pay_schedule_id = v_sched.id
        AND period = v_period
    );

    -- Race-safe: the unique constraint + ON CONFLICT guarantees one row even if
    -- two invocations slip past the EXISTS check at the same time.
    INSERT INTO payroll_runs (
      period, status, pay_schedule_id, pay_date,
      cutoff_date, is_auto_generated,
      total_contractor_ngn, total_employee_ngn,
      total_expenses_ngn, paye_ngn, pension_ngn,
      nhf_ngn, total_burn_ngn
    ) VALUES (
      v_period,
      CASE WHEN v_sched.auto_approve THEN 'approved' ELSE 'draft' END,
      v_sched.id, v_pay_date,
      v_cutoff, true,
      0, 0, 0, 0, 0, 0, 0
    )
    ON CONFLICT (pay_schedule_id, period) DO NOTHING;

    IF FOUND THEN
      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$;
