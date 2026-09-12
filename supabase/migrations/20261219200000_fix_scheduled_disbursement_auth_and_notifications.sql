-- Root-cause fix for scheduled/automatic payroll disbursement having NEVER
-- worked, for any tenant: confirmed live (2026-09-12) — a real run was
-- scheduled correctly (scheduled_disburse_at set to the right UTC instant),
-- the pg_cron tick fired on time, cleared the schedule per the documented
-- "one automatic attempt" design in payroll-disburse/index.ts, then failed
-- with zero visible trace anywhere (no payment_batches row, no
-- notification, no audit log entry).
--
-- Root cause: lock_payroll_run_for_disbursement() gates on
-- current_user_role(), which is `SELECT role FROM profiles WHERE id =
-- auth.uid()`. The payroll-disburse edge function's cron sweep path (the
-- ONLY way scheduled disbursement ever runs) calls this RPC using the
-- Supabase SERVICE ROLE KEY with no user JWT — auth.uid() is NULL in that
-- context, so v_caller_role is NULL, so the function unconditionally raised
-- 'Not authorized to disburse payroll' on every single cron-triggered
-- attempt, for every run, since this was built. The manual "Disburse Now"
-- button (a real user JWT) was never affected — only the cron path was
-- broken, which is exactly why this went unnoticed: manual disbursement
-- always worked, so nobody had reason to distrust the "Schedule for later"
-- feature until someone actually let a schedule fire unattended.
--
-- Fix: only enforce the role gate when a real user is calling (auth.uid()
-- IS NOT NULL) — a service-role call already crossed its own authorization
-- boundary (the cron edge function's X-Cron-Secret check, see
-- supabase/functions/payroll-disburse/index.ts) before ever reaching here,
-- and has no "current user" to hold to a role standard in the first place.

CREATE OR REPLACE FUNCTION public.lock_payroll_run_for_disbursement(p_run_id uuid)
RETURNS public.payroll_runs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run          public.payroll_runs;
  v_caller_role  text;
BEGIN
  v_caller_role := public.current_user_role();
  IF auth.uid() IS NOT NULL
     AND (v_caller_role IS NULL OR v_caller_role <> ALL (ARRAY['super_admin','admin','finance'])) THEN
    RAISE EXCEPTION 'Not authorized to disburse payroll' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_run FROM public.payroll_runs WHERE id = p_run_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payroll run % not found', p_run_id;
  END IF;

  -- Self-heal a run orphaned by a crashed/closed tab mid-disbursement so it
  -- isn't stuck in 'processing' forever.
  IF v_run.status = 'processing' AND v_run.updated_at < now() - interval '15 minutes' THEN
    v_run.status := 'approved';
  END IF;

  IF v_run.status <> 'approved' THEN
    RAISE EXCEPTION 'Payroll run is not ready for disbursement (current status: %)', v_run.status
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  UPDATE public.payroll_runs
     SET status = 'processing', updated_at = now()
   WHERE id = p_run_id
   RETURNING * INTO v_run;

  RETURN v_run;
END;
$$;

COMMENT ON FUNCTION public.lock_payroll_run_for_disbursement IS
  'Claims a payroll run for disbursement: row-locks it, verifies status = '
  '''approved'', and atomically flips it to ''processing''. Call before '
  'creating any payment_batches/batch_items rows so two concurrent '
  'doDisburse invocations cannot both proceed. A run stuck in ''processing'' '
  'for >15 minutes (crashed tab) self-heals back to ''approved''. The role '
  'gate only applies to real user callers (auth.uid() IS NOT NULL) — a '
  'service-role caller (the payroll-disburse cron sweep) is authorized by '
  'its own X-Cron-Secret check before it ever reaches this function.';
