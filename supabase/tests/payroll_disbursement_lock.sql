-- =============================================================================
-- Payroll disbursement lock contract tests
-- Run against a clean Supabase DB after migration
-- 20261003000400_payroll_disbursement_lock.sql is applied:
--
--   psql "$DATABASE_URL" -f supabase/tests/payroll_disbursement_lock.sql
--
-- Wrapped in ROLLBACK so the database is left untouched.
-- =============================================================================

BEGIN;

DO $tests$
DECLARE
  v_finance   uuid;
  v_employee  uuid;
  v_run_id    uuid;
  v_run       public.payroll_runs;
  v_caught    boolean;
BEGIN
  SELECT id INTO v_finance  FROM public.profiles WHERE role = 'finance'  ORDER BY id LIMIT 1;
  SELECT id INTO v_employee FROM public.profiles WHERE role = 'employee' ORDER BY id LIMIT 1;

  IF v_finance IS NULL OR v_employee IS NULL THEN
    RAISE NOTICE 'SKIP: need finance + employee profiles';
    RETURN;
  END IF;

  INSERT INTO public.payroll_runs (period, status, created_by)
  VALUES ('2099-01', 'approved', v_finance)
  RETURNING id INTO v_run_id;

  SET LOCAL ROLE authenticated;

  -- ── Test 1: a non-approver cannot claim a run for disbursement ────────────
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_employee)::text, true);
  v_caught := false;
  BEGIN
    PERFORM public.lock_payroll_run_for_disbursement(v_run_id);
  EXCEPTION WHEN OTHERS THEN v_caught := true;
  END;
  ASSERT v_caught, 'Test 1 — non-approver should not be able to claim a payroll run';
  RAISE NOTICE '✓ Test 1 — non-approver claim blocked';

  -- ── Test 2: an approver claims the run: approved -> processing ────────────
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_finance)::text, true);
  SELECT * INTO v_run FROM public.lock_payroll_run_for_disbursement(v_run_id);
  ASSERT v_run.status = 'processing',
    format('Test 2 — expected status=processing after claim, got %s', v_run.status);
  RAISE NOTICE '✓ Test 2 — approver claim flips approved -> processing';

  -- ── Test 3: a second concurrent claim on the same run is rejected ─────────
  -- (This is the actual double-disbursement bug: two doDisburse calls both
  -- reading status='approved' from stale client state. The row lock + status
  -- guard means only the first caller can ever succeed.)
  v_caught := false;
  BEGIN
    PERFORM public.lock_payroll_run_for_disbursement(v_run_id);
  EXCEPTION WHEN OTHERS THEN v_caught := true;
  END;
  ASSERT v_caught, 'Test 3 — a second concurrent claim must be rejected';
  RAISE NOTICE '✓ Test 3 — concurrent double-claim rejected (double-disbursement closed)';

  -- ── Test 4: finalize with 'paid' moves processing -> paid ──────────────────
  SELECT * INTO v_run FROM public.finalize_payroll_run_disbursement(v_run_id, 'paid');
  ASSERT v_run.status = 'paid',
    format('Test 4 — expected status=paid, got %s', v_run.status);
  RAISE NOTICE '✓ Test 4 — finalize(paid) moves processing -> paid';

  -- ── Test 5: finalize cannot be called twice (no longer 'processing') ──────
  v_caught := false;
  BEGIN
    PERFORM public.finalize_payroll_run_disbursement(v_run_id, 'paid');
  EXCEPTION WHEN OTHERS THEN v_caught := true;
  END;
  ASSERT v_caught, 'Test 5 — finalize on an already-paid run must be rejected';
  RAISE NOTICE '✓ Test 5 — double-finalize rejected';

  -- ── Test 6: a failed disbursement (0 successes) reverts to 'approved' ─────
  INSERT INTO public.payroll_runs (period, status, created_by)
  VALUES ('2099-02', 'approved', v_finance)
  RETURNING id INTO v_run_id;

  PERFORM public.lock_payroll_run_for_disbursement(v_run_id);
  SELECT * INTO v_run FROM public.finalize_payroll_run_disbursement(v_run_id, 'approved');
  ASSERT v_run.status = 'approved',
    format('Test 6 — expected status=approved after all-failed finalize, got %s', v_run.status);
  RAISE NOTICE '✓ Test 6 — all-failed disbursement reverts to approved for retry';

  -- ── Test 7: a stale 'processing' run (>15 min) self-heals and can reclaim ──
  PERFORM public.lock_payroll_run_for_disbursement(v_run_id);
  UPDATE public.payroll_runs SET updated_at = now() - interval '16 minutes' WHERE id = v_run_id;

  SELECT * INTO v_run FROM public.lock_payroll_run_for_disbursement(v_run_id);
  ASSERT v_run.status = 'processing',
    format('Test 7 — expected stale processing run to self-heal and reclaim, got %s', v_run.status);
  RAISE NOTICE '✓ Test 7 — stale processing run self-heals after 15 minutes';

  RESET ROLE;
  RAISE NOTICE '── all payroll disbursement lock tests passed ──';
END
$tests$;

ROLLBACK;
