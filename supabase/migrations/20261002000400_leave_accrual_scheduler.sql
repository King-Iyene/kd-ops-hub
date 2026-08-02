-- Leave Accrual Scheduler
--
-- Runs monthly on the 1st at 06:00 UTC (07:00 WAT). For every active
-- employee, ensures they have a leave_balances row for the current year
-- and credits monthly accruals per the leave_policies table.
--
-- Scope of this first cut:
--   • ANNUAL leave (accrual_type='entitlement' in leave_policies) —
--     accrues 1/12 of `default_days` each month. If the balance row
--     doesn't exist yet, it's created with annual_quota set from the
--     policy's default_days.
--   • On January of each year, unused annual balance rolls over up to
--     policy.carry_over_days; the rest is dropped.
--   • Sick / maternity / paternity / compassionate / casual / study
--     stay as they were — event-based, deducted at request time, not
--     accrued monthly. No change here.
--
-- Idempotency: each run stamps leave_balances.updated_at. Duplicate runs
-- within the same calendar month are detected and no-op (via the
-- leave_accrual_runs log).
--
-- Safety:
--   • SECURITY DEFINER so cron can bypass RLS
--   • Never touches payroll, payments, RLS policies or profiles
--   • Only INSERTs / UPDATEs leave_balances + a run-log table

CREATE TABLE IF NOT EXISTS public.leave_accrual_runs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period        text NOT NULL,  -- 'YYYY-MM'
  ran_at        timestamptz NOT NULL DEFAULT now(),
  employees_processed int NOT NULL DEFAULT 0,
  balances_credited   int NOT NULL DEFAULT 0,
  balances_reset      int NOT NULL DEFAULT 0,
  notes         text,
  UNIQUE (period)
);

ALTER TABLE public.leave_accrual_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin reads leave_accrual_runs" ON public.leave_accrual_runs;
CREATE POLICY "Admin reads leave_accrual_runs" ON public.leave_accrual_runs
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p
                 WHERE p.id = auth.uid()
                   AND p.role IN ('super_admin', 'admin', 'finance')));

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
  -- Skip if we've already run for this month.
  IF EXISTS (SELECT 1 FROM public.leave_accrual_runs WHERE period = v_period) THEN
    RETURN jsonb_build_object(
      'period', v_period,
      'skipped', true,
      'reason', 'already ran this month'
    );
  END IF;

  -- Look up the active annual leave policy (fallback defaults if missing).
  SELECT * INTO v_annual_policy
  FROM public.leave_policies
  WHERE code = 'annual' AND active = true
  LIMIT 1;

  IF v_annual_policy IS NULL THEN
    -- Nothing to accrue if the annual policy has been removed / deactivated.
    INSERT INTO public.leave_accrual_runs (period, notes)
    VALUES (v_period, 'skipped — no active annual policy');
    RETURN jsonb_build_object('period', v_period, 'skipped', true, 'reason', 'no annual policy');
  END IF;

  v_monthly_credit := ROUND(COALESCE(v_annual_policy.default_days, 20) / 12.0, 2);

  -- Iterate every active employee and ensure their balance row for the
  -- current year exists + is bumped by 1/12 of the annual entitlement.
  FOR v_emp IN
    SELECT id, start_date
    FROM public.profiles
    WHERE status = 'active'
      AND role != 'candidate'
  LOOP
    v_employees_processed := v_employees_processed + 1;

    -- Enforce min_tenure_months from the policy: skip credit if the
    -- employee's start_date is more recent than that.
    IF v_annual_policy.min_tenure_months > 0 AND v_emp.start_date IS NOT NULL THEN
      IF v_emp.start_date > (CURRENT_DATE - (v_annual_policy.min_tenure_months || ' months')::interval) THEN
        CONTINUE;
      END IF;
    END IF;

    -- Get (or create) the current-year balance.
    SELECT * INTO v_existing
    FROM public.leave_balances
    WHERE employee_id = v_emp.id AND year = v_year;

    IF NOT FOUND THEN
      -- New employee (or new calendar year) — create the balance with the
      -- first monthly credit already applied.
      INSERT INTO public.leave_balances (employee_id, year, annual_quota, annual_used)
      VALUES (v_emp.id, v_year, v_monthly_credit, 0);
      v_balances_credited := v_balances_credited + 1;
      CONTINUE;
    END IF;

    -- On January carry-over from the prior year, cap the leftover.
    IF v_month = 1 THEN
      DECLARE
        v_prior RECORD;
        v_carry numeric := 0;
      BEGIN
        SELECT * INTO v_prior
        FROM public.leave_balances
        WHERE employee_id = v_emp.id AND year = v_year - 1;
        IF FOUND THEN
          v_carry := LEAST(
            GREATEST(v_prior.annual_quota - v_prior.annual_used, 0),
            COALESCE(v_annual_policy.carry_over_days, 0)
          );
        END IF;
        -- Reset this year: carried over + first monthly credit.
        UPDATE public.leave_balances
        SET annual_quota = v_carry + v_monthly_credit,
            annual_used  = 0,
            updated_at   = now()
        WHERE id = v_existing.id;
        v_balances_reset := v_balances_reset + 1;
      END;
      CONTINUE;
    END IF;

    -- Regular monthly credit — top up annual_quota.
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

COMMENT ON FUNCTION public.process_leave_accruals IS
  'Monthly leave accrual — credits 1/12 of the annual leave policy default_days to every active employee. Idempotent per period (leave_accrual_runs UNIQUE).';

-- ── Schedule via pg_cron ─────────────────────────────────────────────────
-- Runs on the 1st of every month at 06:00 UTC (07:00 WAT).
-- Requires pg_cron enabled (already enabled by 20260429080000_recurring_scheduler_cron.sql).

-- Idempotent unschedule/reschedule (safe re-run of this migration).
SELECT cron.unschedule('kdops_leave_accrual')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'kdops_leave_accrual');

SELECT cron.schedule(
  'kdops_leave_accrual',
  '0 6 1 * *',                 -- minute 0, hour 6, day 1, any month, any weekday
  $$SELECT public.process_leave_accruals()$$
);
