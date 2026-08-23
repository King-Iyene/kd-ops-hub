-- =============================================================================
-- Re-fix: schedule_auto_draft() must never auto-APPROVE a newly created run.
--
-- 20260915000000_payroll_autodraft_never_autoapprove.sql fixed this once
-- already (auto-generated runs have all totals = 0 at insert time, so
-- auto-approving one approves an unreviewed, unvalidated ₦0 payroll). That fix
-- was silently undone by 20261028000000_pay_schedules_phase1_extended_cadences.sql,
-- which reintroduced the `CASE WHEN v_sched.auto_approve THEN 'approved' ...`
-- branch while adding weekly/biweekly period support.
--
-- This migration re-applies the 20260915000000 fix on top of the current
-- (20261028000000) function body, preserving everything else unchanged:
-- weekly/biweekly ISO-week period keys, current_date window check, plain
-- INSERT. Auto-drafting always means auto-creating a DRAFT, full stop,
-- regardless of pay_schedules.auto_approve.
-- =============================================================================

CREATE OR REPLACE FUNCTION schedule_auto_draft()
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
    SELECT unnest INTO v_pay_date
    FROM unnest(next_pay_dates(v_sched.id, 1));

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
