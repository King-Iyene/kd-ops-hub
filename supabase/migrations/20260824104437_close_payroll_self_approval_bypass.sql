-- approve_payroll_run() exempted admin/super_admin from the self-approval
-- block, meaning the roles most likely to hold disbursement authority could
-- draft AND approve their own payroll run with no maker-checker at all.
-- 7 users hold admin/super_admin/finance today, so requiring a second
-- approver doesn't block anyone operationally.

CREATE OR REPLACE FUNCTION public.approve_payroll_run(p_run_id uuid)
RETURNS public.payroll_runs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

  IF v_run.created_by = v_caller THEN
    RAISE EXCEPTION 'Self-approval is not allowed — the person who drafted this run cannot approve it, regardless of role'
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
$function$;
