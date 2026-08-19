-- =============================================================================
-- Fix: annual leave carry-over was structurally unreachable
-- =============================================================================
-- Bug: process_leave_accruals() checked for an existing balance row for the
-- current year BEFORE checking whether it was January.  In January, the first
-- run finds no row, takes the "new employee, no carry-over" branch (insert
-- with just the monthly credit), and CONTINUEs — so the carry-over block
-- (which required the row to already exist) was dead code.
--
-- Fix: when creating the first balance row of a new year in January, look up
-- the prior year's balance, compute capped carry-over, and fold it into the
-- INSERT that creates the row.  Non-January months and non-first-run January
-- months are unaffected.  Business rules (cap logic, policy lookup, tenure
-- check) are unchanged.
-- =============================================================================

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
      -- ---------------------------------------------------------------
      -- First balance row of the year.  If it's January, compute
      -- carry-over from the prior year and include it in the insert.
      -- ---------------------------------------------------------------
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

          INSERT INTO public.leave_balances (employee_id, year, annual_quota, annual_used, carryover_days)
          VALUES (v_emp.id, v_year, v_carry + v_monthly_credit, 0, v_carry);
          v_balances_reset := v_balances_reset + 1;
        END;
      ELSE
        -- Non-January first row: new employee mid-year, no carry-over.
        INSERT INTO public.leave_balances (employee_id, year, annual_quota, annual_used)
        VALUES (v_emp.id, v_year, v_monthly_credit, 0);
        v_balances_credited := v_balances_credited + 1;
      END IF;

      CONTINUE;
    END IF;

    -- Row already exists — this is a subsequent monthly accrual.
    -- In January, if we reach here, the row was already created (and
    -- carry-over already applied) by the NOT FOUND branch above in a
    -- prior run this month — the accrual_runs guard at the top of the
    -- function prevents that, so this path is a normal monthly credit.
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
