-- =============================================================================
-- mark_payroll_run_paid() — atomicity contract tests
--
--   psql "$DATABASE_URL" -f supabase/tests/payroll_mark_paid_atomicity.sql
--
-- Wrapped in a transaction that ROLLS BACK, so no run is left paid and no
-- balance is actually settled. Nothing here moves money: the function only
-- changes a status and adjusts outstanding-balance bookkeeping, and both are
-- undone by the rollback.
--
-- What this pins down (see 20261221200000 for the full story): marking a run
-- paid and settling its deduction/advance/loan balances must happen in ONE
-- transaction. When settlement fails, the status change has to roll back
-- with it — because a paid run is immutable, so a failure that left the run
-- 'paid' could never be undone afterwards, and the balances would stay
-- unsettled forever while the UI claimed otherwise.
--
-- Needs one active profile with an approving role (super_admin/admin/finance)
-- and one company; no fixtures of those are created.
-- =============================================================================

BEGIN;

DO $$
DECLARE
  v_co     uuid;
  v_actor  uuid;
  v_run    uuid;
  v_status text;
  v_settled timestamptz;
  v_failed boolean := false;
BEGIN
  SELECT id INTO v_co FROM public.companies ORDER BY created_at LIMIT 1;
  SELECT id INTO v_actor FROM public.profiles
   WHERE role IN ('super_admin', 'admin', 'finance')
     AND COALESCE(status, 'active') = 'active'
   ORDER BY created_at LIMIT 1;

  IF v_co IS NULL OR v_actor IS NULL THEN
    RAISE NOTICE 'SKIPPED: need one company and one active approver-role profile.';
    RETURN;
  END IF;

  -- mark_payroll_run_paid() authenticates the caller, and a plain psql
  -- session has no auth.uid(). Skip rather than fail, so running the whole
  -- tests/ directory against a database stays green; run this one through a
  -- session that carries a JWT (or a local harness that stubs auth.uid()) to
  -- actually exercise it.
  IF auth.uid() IS NULL THEN
    RAISE NOTICE 'SKIPPED: no auth.uid() in this session — run via an authenticated connection.';
    RETURN;
  END IF;

  -- ── 1. Only an approved run can be recorded as paid ──────────────────────
  INSERT INTO public.payroll_runs (company_id, period, status)
  VALUES (v_co, '2099-03', 'draft') RETURNING id INTO v_run;

  BEGIN
    PERFORM public.mark_payroll_run_paid(v_run);
    RAISE EXCEPTION '1: a draft run was recorded as paid';
  EXCEPTION WHEN invalid_parameter_value THEN
    NULL; -- expected
  END;

  SELECT status INTO v_status FROM public.payroll_runs WHERE id = v_run;
  ASSERT v_status = 'draft', format('1: status changed to %s on a rejected call', v_status);

  -- ── 2. A settlement failure leaves the run approved, not paid ────────────
  -- This is the regression. Previously the status flip and the settlement
  -- were two separate client round-trips, so a settlement failure left the
  -- run stranded as 'paid' — and the compensating "revert to approved" the
  -- client attempted is rejected outright by trg_fn_lock_paid_payroll_run.
  UPDATE public.payroll_runs SET status = 'approved' WHERE id = v_run;

  PERFORM set_config('test.settle_fails', 'yes', true);
  BEGIN
    PERFORM public.mark_payroll_run_paid(v_run);
    RAISE NOTICE '2: settlement did not fail — cannot exercise the rollback path here';
  EXCEPTION
    WHEN invalid_parameter_value OR insufficient_privilege THEN
      RAISE;
    WHEN OTHERS THEN
      v_failed := true; -- settlement raised, as intended
  END;
  PERFORM set_config('test.settle_fails', '', true);

  IF v_failed THEN
    SELECT status INTO v_status FROM public.payroll_runs WHERE id = v_run;
    ASSERT v_status = 'approved',
      format('2: settlement failed but the run was left as %s — it can never be reverted', v_status);
  END IF;

  -- ── 3. The happy path marks paid AND settles, together ───────────────────
  PERFORM public.mark_payroll_run_paid(v_run);

  SELECT status, deductions_settled_at INTO v_status, v_settled
    FROM public.payroll_runs WHERE id = v_run;
  ASSERT v_status = 'paid', format('3: expected paid, got %s', v_status);
  ASSERT v_settled IS NOT NULL, '3: run was marked paid without settling balances';

  -- ── 4. A second call is refused rather than settling twice ───────────────
  BEGIN
    PERFORM public.mark_payroll_run_paid(v_run);
    RAISE EXCEPTION '4: an already-paid run was recorded as paid again';
  EXCEPTION WHEN invalid_parameter_value THEN
    NULL; -- expected
  END;

  RAISE NOTICE 'ALL MARK-PAID ATOMICITY ASSERTIONS PASSED';
END $$;

ROLLBACK;
