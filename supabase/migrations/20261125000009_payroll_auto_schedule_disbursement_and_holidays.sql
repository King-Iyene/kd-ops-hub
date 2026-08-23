-- =============================================================================
-- Auto-schedule disbursement on approval.
--
-- The disbursement pipeline itself was already fully automated end to end
-- (schedule_payroll_disbursement -> pg_cron payroll-disburse-tick, every
-- minute -> payroll-disburse edge function sweep -> dispatch). The gap was
-- upstream: nothing ever called schedule_payroll_disbursement() unless a
-- human explicitly did it. approve_payroll_run() now does that automatically,
-- targeting the run's pay_date at a per-schedule configurable local hour.
--
-- Two safety levers, matching what a standard payroll system offers:
--   - Per-run: the existing schedule_payroll_disbursement() /
--     cancel_scheduled_payroll_disbursement() RPCs (already wired to the UI's
--     Schedule/Cancel controls) still work exactly as before on an
--     auto-populated value — calling schedule again reschedules it, cancel
--     clears it (pauses indefinitely until someone reschedules or manually
--     disburses).
--   - Per-schedule: a new auto_schedule_disbursement toggle lets a whole pay
--     schedule opt out of auto-scheduling entirely, reverting every run drawn
--     from it to fully-manual disbursement, without touching individual runs.
--
-- Never overwrites a time a human already chose, and never auto-schedules a
-- moment that's already in the past at approval time (an already-due pay
-- date requires a conscious "Disburse Now" click, not a same-second surprise
-- fire) — mirrors schedule_payroll_disbursement()'s own "must be in the
-- future" guard.
--
-- NOTE: this migration originally also tried to replace next_pay_dates() to
-- add public_holidays support. That attempt used a return type (date[]) that
-- didn't match what's actually live in production (a richer
-- TABLE(pay_date, draft_open_date, cutoff_date, adjusted_from, holiday_name)
-- version that already handles public holidays, per real drift between the
-- migration file history and the live database — see
-- 20261125000010_fix_schedule_auto_draft_next_pay_dates_mismatch.sql for the
-- full story). That statement failed with "cannot change return type of
-- existing function" and rolled back this entire migration file, including
-- the auto-schedule-on-approval feature below, which is the actual point of
-- this file. Removed here; next_pay_dates() is untouched by this migration.
-- =============================================================================

ALTER TABLE public.pay_schedules
  ADD COLUMN IF NOT EXISTS auto_disburse_hour_local smallint NOT NULL DEFAULT 8
    CHECK (auto_disburse_hour_local BETWEEN 0 AND 23),
  ADD COLUMN IF NOT EXISTS auto_schedule_disbursement boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.pay_schedules.auto_disburse_hour_local IS
  'Local hour (Africa/Lagos, 0-23) that approve_payroll_run() targets when '
  'auto-scheduling disbursement for a run drawn from this schedule.';

COMMENT ON COLUMN public.pay_schedules.auto_schedule_disbursement IS
  'Kill switch: false makes every run drawn from this schedule fully manual '
  '(approve_payroll_run() will not auto-populate scheduled_disburse_at). '
  'Existing per-run Schedule/Cancel controls are unaffected either way.';

CREATE OR REPLACE FUNCTION public.approve_payroll_run(p_run_id uuid)
RETURNS public.payroll_runs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run           public.payroll_runs;
  v_caller        uuid := auth.uid();
  v_caller_role   text;
  v_sched         public.pay_schedules%ROWTYPE;
  v_auto_disburse timestamptz;
BEGIN
  SELECT * INTO v_run FROM public.payroll_runs WHERE id = p_run_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payroll run % not found', p_run_id;
  END IF;

  SELECT role INTO v_caller_role FROM public.profiles
   WHERE id = v_caller AND COALESCE(status, 'active') = 'active';
  IF v_caller_role IS NULL THEN
    RAISE EXCEPTION 'Caller is not an active user' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_caller_role NOT IN ('super_admin', 'admin', 'finance') THEN
    RAISE EXCEPTION 'Your role is not permitted to approve payroll runs'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_run.created_by = v_caller AND v_caller_role NOT IN ('admin', 'super_admin') THEN
    RAISE EXCEPTION 'Self-approval is not allowed for your role — the person who drafted this run cannot approve it'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Auto-schedule disbursement for the run's pay date, unless: a human
  -- already picked a time (never clobber it), the run's schedule has opted
  -- out (auto_schedule_disbursement = false), there's no pay_date to target,
  -- or the computed moment is already in the past.
  IF v_run.scheduled_disburse_at IS NULL AND v_run.pay_date IS NOT NULL THEN
    v_sched.auto_disburse_hour_local := 8;
    v_sched.auto_schedule_disbursement := true;
    IF v_run.pay_schedule_id IS NOT NULL THEN
      SELECT * INTO v_sched FROM public.pay_schedules WHERE id = v_run.pay_schedule_id;
    END IF;

    IF COALESCE(v_sched.auto_schedule_disbursement, true) THEN
      v_auto_disburse := (v_run.pay_date::timestamp + make_interval(hours => COALESCE(v_sched.auto_disburse_hour_local, 8)))
                            AT TIME ZONE 'Africa/Lagos';
      IF v_auto_disburse > now() THEN
        v_run.scheduled_disburse_at := v_auto_disburse;
      END IF;
    END IF;
  END IF;

  UPDATE public.payroll_runs
     SET status = 'approved', approved_by = v_caller,
         scheduled_disburse_at = v_run.scheduled_disburse_at,
         updated_at = now()
   WHERE id = p_run_id
   RETURNING * INTO v_run;

  RETURN v_run;
END;
$$;
