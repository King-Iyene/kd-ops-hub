-- =============================================================================
-- Half-day leave support
-- =============================================================================
-- PaidHR migration parity: leave requests can be flagged as a half day, which
-- halves the days deducted from the employee's balance. days_requested and the
-- leave_balances "used" counters move from integer to numeric so 0.5 values
-- round-trip cleanly. carry-over policy (leave_carryover_max_days on
-- company_settings, carryover_days on leave_balances) already exists from the
-- Sprint C migration — this migration only adds the half-day flag on top of it.
-- ADDITIVE, BACKWARD-COMPATIBLE: existing full-day requests are unaffected.
-- =============================================================================

ALTER TABLE public.leave_requests
  ADD COLUMN IF NOT EXISTS is_half_day boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.leave_requests.is_half_day IS
  'True when the request is for half a working day. Only meaningful when start_date = end_date; days_requested is 0.5 in that case.';

-- days_requested was integer; widen to numeric so half-day (0.5) requests can
-- be stored without truncation. Safe no-op if already numeric.
ALTER TABLE public.leave_requests
  ALTER COLUMN days_requested TYPE numeric USING days_requested::numeric;

-- leave_balances "used" counters were integer for the original three leave
-- types (maternity_used/paternity_used/carryover_days are already numeric).
-- Widen them too so a half-day approval can decrement by 0.5.
ALTER TABLE public.leave_balances
  ALTER COLUMN annual_quota TYPE numeric USING annual_quota::numeric,
  ALTER COLUMN annual_used TYPE numeric USING annual_used::numeric,
  ALTER COLUMN sick_used TYPE numeric USING sick_used::numeric,
  ALTER COLUMN unpaid_used TYPE numeric USING unpaid_used::numeric;

-- =============================================================================
-- Leave carry-over
-- =============================================================================
-- company_settings.leave_carryover_max_days and leave_balances.carryover_days
-- already exist (Sprint C). Nothing to add there; this section is a no-op
-- guard kept for forward compatibility in case those columns are missing in
-- an environment that skipped the Sprint C migration.
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS leave_carryover_max_days integer NOT NULL DEFAULT 5;

ALTER TABLE public.leave_balances
  ADD COLUMN IF NOT EXISTS carryover_days numeric NOT NULL DEFAULT 0;

-- leave_balances.carryover_days has existed since Sprint C but was never
-- actually written by process_leave_accruals() — the January rollover folded
-- the carried-over amount straight into annual_quota with no separate record
-- of how much of that quota was carryover vs. this year's accrual. Re-create
-- the function so it also stamps carryover_days, which the Leave page now
-- surfaces as "X days carried over from <year>".
CREATE OR REPLACE FUNCTION public.process_leave_accruals()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period text := to_char(CURRENT_DATE, 'YYYY-MM');
  v_year int := extract(year from CURRENT_DATE)::int;
  v_month int := extract(month from CURRENT_DATE)::int;
  v_annual_policy RECORD;
  v_employees_processed int := 0;
  v_balances_credited int := 0;
  v_balances_reset int := 0;
  v_emp RECORD;
  v_existing RECORD;
  v_monthly_credit numeric;
BEGIN
  IF EXISTS (SELECT 1 FROM public.leave_accrual_runs WHERE period = v_period) THEN
    RETURN jsonb_build_object(
      'period', v_period,
      'skipped', true,
      'reason', 'already ran this month'
    );
  END IF;

  SELECT * INTO v_annual_policy
  FROM public.leave_policies
  WHERE code = 'annual' AND active = true
  LIMIT 1;

  IF v_annual_policy IS NULL THEN
    INSERT INTO public.leave_accrual_runs (period, notes)
    VALUES (v_period, 'skipped — no active annual policy');
    RETURN jsonb_build_object('period', v_period, 'skipped', true, 'reason', 'no annual policy');
  END IF;

  v_monthly_credit := ROUND(COALESCE(v_annual_policy.default_days, 20) / 12.0, 2);

  FOR v_emp IN
    SELECT id, start_date
    FROM public.profiles
    WHERE status = 'active'
      AND role != 'candidate'
  LOOP
    v_employees_processed := v_employees_processed + 1;

    IF v_annual_policy.min_tenure_months > 0 AND v_emp.start_date IS NOT NULL THEN
      IF v_emp.start_date > (CURRENT_DATE - (v_annual_policy.min_tenure_months || ' months')::interval) THEN
        CONTINUE;
      END IF;
    END IF;

    SELECT * INTO v_existing
    FROM public.leave_balances
    WHERE employee_id = v_emp.id AND year = v_year;

    IF NOT FOUND THEN
      INSERT INTO public.leave_balances (employee_id, year, annual_quota, annual_used)
      VALUES (v_emp.id, v_year, v_monthly_credit, 0);
      v_balances_credited := v_balances_credited + 1;
      CONTINUE;
    END IF;

    IF v_month = 1 THEN
      DECLARE
        v_prior RECORD;
        v_carry numeric := 0;
        v_cap numeric;
      BEGIN
        SELECT * INTO v_prior
        FROM public.leave_balances
        WHERE employee_id = v_emp.id AND year = v_year - 1;

        -- company_settings.leave_carryover_max_days is the company-wide cap;
        -- the per-policy carry_over_days can only tighten it further.
        SELECT LEAST(COALESCE(v_annual_policy.carry_over_days, 0), COALESCE(cs.leave_carryover_max_days, 5))
          INTO v_cap
        FROM public.company_settings cs
        WHERE cs.id = '00000000-0000-0000-0000-000000000001';
        v_cap := COALESCE(v_cap, COALESCE(v_annual_policy.carry_over_days, 0));

        IF v_prior IS NOT NULL THEN
          v_carry := LEAST(GREATEST(v_prior.annual_quota - v_prior.annual_used, 0), v_cap);
        END IF;

        UPDATE public.leave_balances
        SET annual_quota   = v_carry + v_monthly_credit,
            annual_used    = 0,
            carryover_days = v_carry,
            updated_at     = now()
        WHERE id = v_existing.id;
        v_balances_reset := v_balances_reset + 1;
      END;
      CONTINUE;
    END IF;

    UPDATE public.leave_balances
    SET annual_quota = annual_quota + v_monthly_credit,
        updated_at = now()
    WHERE id = v_existing.id;
    v_balances_credited := v_balances_credited + 1;
  END LOOP;

  INSERT INTO public.leave_accrual_runs (
    period, employees_processed, balances_credited, balances_reset,
    notes
  ) VALUES (
    v_period, v_employees_processed, v_balances_credited, v_balances_reset,
    'annual policy: ' || v_annual_policy.default_days || 'd/yr, carry-over ' || v_annual_policy.carry_over_days
  );

  RETURN jsonb_build_object(
    'period', v_period,
    'employees_processed', v_employees_processed,
    'balances_credited', v_balances_credited,
    'balances_reset', v_balances_reset,
    'monthly_credit', v_monthly_credit
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_leave_accruals() TO authenticated;
