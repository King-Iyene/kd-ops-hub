-- Fix: payroll disbursement (Payroll.tsx doDisburse) had no server-side
-- lock at all. The only guard was a client-side check of stale React state
-- (`if (run.status === 'paid') return`), and the eventual
-- `UPDATE payroll_runs SET status='paid'` at the end of doDisburse had no
-- `WHERE status = 'approved'` guard. Two concurrent doDisburse calls (double
-- click, two tabs, two admins) both read status='approved' before either
-- commits, both create a brand-new payment_batches row + batch_items, and
-- both fire duplicate Paystack/Flutterwave transfers to every employee —
-- the whole run gets paid twice.
--
-- Mirrors the SELECT ... FOR UPDATE + status-guard pattern already used by
-- approve_payment_batch (20261001000500_admin_can_approve_any_batch.sql):
-- a SECURITY DEFINER RPC takes the row lock and flips the status inside a
-- single transaction, so a second concurrent caller blocks on the lock and
-- then fails the status check instead of racing past it.
--
-- Two RPCs:
--   lock_payroll_run_for_disbursement  — approved -> processing (the "claim")
--   finalize_payroll_run_disbursement  — processing -> paid | approved
--
-- 'processing' is added as a valid status. A stale 'processing' run (the
-- browser tab crashed/closed mid-disbursement before finalizing) self-heals
-- back to 'approved' after 15 minutes so it isn't stuck forever, matching
-- the orphan-recovery posture batch-worker already uses for payment_batches.

ALTER TABLE public.payroll_runs DROP CONSTRAINT IF EXISTS payroll_runs_status_check;
ALTER TABLE public.payroll_runs ADD CONSTRAINT payroll_runs_status_check
  CHECK (status IN ('draft', 'pending_approval', 'approved', 'processing', 'paid'));

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
  IF v_caller_role IS NULL OR v_caller_role <> ALL (ARRAY['super_admin','admin','finance']) THEN
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
  'for >15 minutes (crashed tab) self-heals back to ''approved''.';

CREATE OR REPLACE FUNCTION public.finalize_payroll_run_disbursement(
  p_run_id uuid,
  p_new_status text
)
RETURNS public.payroll_runs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run public.payroll_runs;
BEGIN
  IF p_new_status NOT IN ('paid', 'approved') THEN
    RAISE EXCEPTION 'Invalid target status %', p_new_status USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT * INTO v_run FROM public.payroll_runs WHERE id = p_run_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payroll run % not found', p_run_id;
  END IF;

  IF v_run.status <> 'processing' THEN
    RAISE EXCEPTION 'Payroll run is not in processing state (current status: %)', v_run.status
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  UPDATE public.payroll_runs
     SET status = p_new_status, updated_at = now()
   WHERE id = p_run_id
   RETURNING * INTO v_run;

  RETURN v_run;
END;
$$;

COMMENT ON FUNCTION public.finalize_payroll_run_disbursement IS
  'Releases the ''processing'' lock taken by lock_payroll_run_for_disbursement. '
  'Pass ''paid'' when at least one transfer succeeded, ''approved'' to put the '
  'run back so a failed disbursement (0 successful transfers) can be retried.';

REVOKE EXECUTE ON FUNCTION public.lock_payroll_run_for_disbursement(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.lock_payroll_run_for_disbursement(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.finalize_payroll_run_disbursement(uuid, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.finalize_payroll_run_disbursement(uuid, text) TO authenticated, service_role;
