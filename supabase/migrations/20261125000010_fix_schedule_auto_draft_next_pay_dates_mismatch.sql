-- =============================================================================
-- URGENT FIX: schedule_auto_draft() has been broken in production since
-- 20261125000008_payroll_autodraft_never_autoapprove_v2.sql deployed.
--
-- That migration (and the 20261028000000 migration file it was based on)
-- assumed next_pay_dates(uuid, integer) returns date[], reading it via
-- `SELECT unnest INTO v_pay_date FROM unnest(next_pay_dates(...))`.
--
-- The migration FILES do not match what is actually live. The real deployed
-- next_pay_dates() (verified directly via pg_get_functiondef against
-- production) returns TABLE(pay_date date, draft_open_date date,
-- cutoff_date date, adjusted_from date, holiday_name text) — a richer
-- function that already handles public holidays (the live version tracks
-- which date a pay date was shifted from and which named holiday caused it,
-- and correctly re-checks for a new weekend after shifting past a holiday).
-- This is real, undocumented drift between the migration history and
-- production, not something introduced by this fix.
--
-- Confirmed broken by direct test against production:
--   SELECT unnest FROM unnest(next_pay_dates('<a real schedule id>', 1));
--   -> ERROR: 42883: function unnest(record) does not exist
--
-- This means the daily payroll-scheduler cron (which calls
-- schedule_auto_draft()) has been failing on every run since the prior
-- migration deployed. Fix: read pay_date directly from the tabular
-- function's output instead of unnest()'ing it. Nothing else in this
-- function changes.
--
-- NOTE: this fix intentionally does NOT touch next_pay_dates() itself —
-- production's version already does more than what this session's holiday-
-- wiring task set out to build. That part of the original task is void;
-- the actual gap was this mismatch, not missing holiday support.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.schedule_auto_draft()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_sched      pay_schedules%ROWTYPE;
  v_pay_date   date;
  v_cutoff     date;
  v_period     text;
  v_count      integer := 0;
BEGIN
  FOR v_sched IN
    SELECT * FROM pay_schedules WHERE is_active = true
  LOOP
    SELECT pay_date INTO v_pay_date
    FROM next_pay_dates(v_sched.id, 1)
    LIMIT 1;

    CONTINUE WHEN v_pay_date IS NULL;
    CONTINUE WHEN current_date < (v_pay_date - v_sched.processing_lead_days);

    v_cutoff := v_pay_date - v_sched.cutoff_lead_days;

    IF v_sched.frequency IN ('weekly', 'biweekly') THEN
      v_period := to_char(v_pay_date, 'IYYY-"W"IW');
    ELSE
      v_period := to_char(v_pay_date - interval '1 month', 'YYYY-MM');
    END IF;

    CONTINUE WHEN EXISTS (
      SELECT 1 FROM payroll_runs
      WHERE pay_schedule_id = v_sched.id
        AND period = v_period
    );

    -- Always 'draft': an auto-generated run has ₦0 computed figures, so it
    -- must be reviewed (and its figures computed) before anyone approves it.
    -- pay_schedules.auto_approve does not apply to run creation.
    INSERT INTO payroll_runs (
      period, status, pay_schedule_id, pay_date,
      cutoff_date, is_auto_generated,
      total_contractor_ngn, total_employee_ngn,
      total_expenses_ngn, paye_ngn, pension_ngn,
      nhf_ngn, total_burn_ngn
    ) VALUES (
      v_period,
      'draft',
      v_sched.id, v_pay_date,
      v_cutoff, true,
      0, 0, 0, 0, 0, 0, 0
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;
