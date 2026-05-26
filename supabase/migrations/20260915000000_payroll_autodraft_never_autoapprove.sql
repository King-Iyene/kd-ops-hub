-- =============================================================================
-- Payroll auto-draft must never auto-APPROVE an empty run.
--
-- schedule_auto_draft() inserts a payroll_run with all totals = 0 (figures are
-- only computed later when an operator opens the run and clicks Draft). If the
-- schedule had auto_approve = true, it inserted that ₦0 shell as 'approved' —
-- i.e. a ₦0 payroll could be approved with no human review and no real figures.
--
-- Auto-generated runs now always start as 'draft'. Approval still requires a
-- human (or a future step that computes figures first). Everything else
-- (Africa/Lagos window, ON CONFLICT dedup) is preserved from 20260914000000.
-- =============================================================================

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
    SELECT unnest INTO v_pay_date
    FROM unnest(next_pay_dates(v_sched.id, 1));

    CONTINUE WHEN v_pay_date IS NULL;
    CONTINUE WHEN v_today < (v_pay_date - v_sched.processing_lead_days);

    v_cutoff := v_pay_date - v_sched.cutoff_lead_days;
    v_period := to_char(v_pay_date - interval '1 month', 'YYYY-MM');

    CONTINUE WHEN EXISTS (
      SELECT 1 FROM payroll_runs
      WHERE pay_schedule_id = v_sched.id
        AND period = v_period
    );

    -- Always 'draft': an auto-generated run has ₦0 computed figures, so it must
    -- be reviewed (and its figures computed) before anyone approves it.
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
    )
    ON CONFLICT (pay_schedule_id, period) DO NOTHING;

    IF FOUND THEN
      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$;
