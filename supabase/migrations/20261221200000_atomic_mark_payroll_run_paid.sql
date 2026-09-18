-- ═══════════════════════════════════════════════════════════════════════════════
-- "Record as manually paid" must be atomic
-- ─────────────────────────────────────────────────────────────────────────────
-- Recording a payroll run as manually paid (for a transfer done outside
-- KDOps) did two things from the browser, as two separate round-trips:
--
--   1. UPDATE payroll_runs SET status='paid' WHERE id=? AND status='approved'
--   2. rpc('settle_payroll_run_deductions', ...)
--
-- Step 2 is what actually reduces what employees owe: recurring
-- employee_deductions, employee_advances.outstanding_ngn, and any linked
-- staff_loans. If it failed, the client tried to undo step 1 with
--
--   UPDATE payroll_runs SET status='approved' WHERE id=?
--
-- and told the operator "Settlement failed — reverted to Approved".
--
-- That revert CANNOT succeed. trg_fn_lock_paid_payroll_run (added in
-- 20260824104643) raises insufficient_privilege on any status change out of
-- 'paid' — which is correct and deliberate: a paid run is immutable. The
-- client never checked that update's error, so the failure was invisible.
--
-- Confirmed by executing exactly this sequence against PostgreSQL 16 with
-- the real trigger: the revert is blocked and the run is still 'paid'
-- afterwards.
--
-- The consequence is the bad part. The run stays 'paid' with balances
-- unsettled, while the operator is told it was rolled back and to retry —
-- and a retry immediately returns "Already marked paid" because the run is
-- paid. So settlement silently never happens: advance and staff-loan
-- outstanding balances stay overstated, and an employee can be deducted
-- again next month for money they have already repaid.
--
-- The real disbursement path never had this problem. Its two steps live
-- inside one plpgsql function (finalize_payroll_run_disbursement), so a
-- settlement failure rolls the status change back automatically. The manual
-- path just wasn't given the same treatment.
--
-- This migration gives it one. Both steps now happen in a single
-- transaction: if settlement raises, the status change rolls back with it,
-- the run is genuinely still 'approved', and retrying actually works.
-- No impossible revert, and no toast claiming something that did not happen.
--
-- Authorization is unchanged. The function is SECURITY DEFINER (it must be,
-- to call settle_payroll_run_deductions), so it re-checks the caller
-- against the same roles the payroll_write RLS policy allows —
-- super_admin / admin / finance — rather than inheriting a wider reach by
-- virtue of running as the definer.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.mark_payroll_run_paid(p_run_id uuid)
RETURNS public.payroll_runs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run         public.payroll_runs;
  v_caller      uuid := auth.uid();
  v_caller_role text;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT role INTO v_caller_role FROM public.profiles
   WHERE id = v_caller AND COALESCE(status, 'active') = 'active';
  IF v_caller_role IS NULL THEN
    RAISE EXCEPTION 'Caller is not an active user' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_caller_role NOT IN ('super_admin', 'admin', 'finance') THEN
    RAISE EXCEPTION 'Your role is not permitted to record a payroll run as paid'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_run FROM public.payroll_runs WHERE id = p_run_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payroll run % not found', p_run_id;
  END IF;

  -- Same precondition the client's guarded UPDATE used, now enforced under a
  -- row lock so two operators clicking at once cannot both settle.
  IF v_run.status <> 'approved' THEN
    RAISE EXCEPTION 'Only an approved payroll run can be recorded as paid (current status: %)', v_run.status
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  UPDATE public.payroll_runs
     SET status = 'paid', updated_at = now()
   WHERE id = p_run_id
   RETURNING * INTO v_run;

  -- If this raises, the UPDATE above rolls back with it — which is the whole
  -- point. settle_payroll_run_deductions is itself idempotent via
  -- payroll_runs.deductions_settled_at, so the disbursement path calling it
  -- for the same run stays a no-op.
  PERFORM public.settle_payroll_run_deductions(p_run_id);

  RETURN v_run;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mark_payroll_run_paid(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.mark_payroll_run_paid(uuid) TO authenticated, service_role;
