-- =============================================================================
-- Payroll run stage timestamps + status audit trail — contract tests
--
-- Run against a database that has had all migrations applied (in particular
-- 20261221000000_payroll_run_stage_timestamps_and_audit.sql):
--
--   psql "$DATABASE_URL" -f supabase/tests/payroll_run_stage_timestamps.sql
--
-- Everything runs inside one transaction and ROLLS BACK at the end, so the
-- database is left untouched: the fixture payroll run never persists, and no
-- disbursement is ever triggered (approve_payroll_run only sets a status —
-- it does not move money).
--
-- Covered:
--   1. A fresh draft carries no stage timestamps.
--   2. draft -> pending_approval stamps submitted_at and logs it.
--   3. approve_payroll_run() stamps approved_at and logs the approver.
--   4. REGRESSION: payroll-disburse rolling a failed attempt back to
--      'approved' must NOT overwrite approved_at, and must not be recorded
--      as an approval nobody performed.
--   5. -> paid stamps paid_at and logs it.
--   6. A paid run is still immutable (the pre-existing lock is intact).
--   7. Recall to draft clears downstream stamps and is logged exactly once.
--   8. draft -> approved (the RPC allows it) stamps approved_at without
--      inventing a submitted_at.
--
-- Two existing active profiles are needed: one to draft and a DIFFERENT one
-- with an approving role (super_admin/admin/finance). No profiles are
-- created, because profiles.id is tied to auth.users.
-- =============================================================================

BEGIN;

DO $$
DECLARE
  v_co       uuid;
  v_drafter  uuid;
  v_approver uuid;
  v_run      uuid;
  v_run2     uuid;
  v_sub      timestamptz;
  v_app      timestamptz;
  v_app2     timestamptz;
  v_paid     timestamptz;
  v_actor    uuid;
  v_n        int;
  v_before   int;
  v_after    int;
BEGIN
  SELECT id INTO v_co FROM public.companies ORDER BY created_at LIMIT 1;
  IF v_co IS NULL THEN
    RAISE NOTICE 'SKIPPED: no companies exist yet — run the companies migration first.';
    RETURN;
  END IF;

  SELECT id INTO v_approver FROM public.profiles
   WHERE role IN ('super_admin', 'admin', 'finance')
     AND COALESCE(status, 'active') = 'active'
   ORDER BY created_at LIMIT 1;

  SELECT id INTO v_drafter FROM public.profiles
   WHERE COALESCE(status, 'active') = 'active'
     AND id <> v_approver
   ORDER BY created_at LIMIT 1;

  IF v_approver IS NULL OR v_drafter IS NULL THEN
    RAISE NOTICE 'SKIPPED: need one approver-role profile and one other active profile.';
    RETURN;
  END IF;

  -- Fixture run. period is deliberately far in the future so it can never
  -- collide with a real period if this somehow escaped the rollback.
  INSERT INTO public.payroll_runs (company_id, period, status, created_by, employee_count, total_burn_ngn)
  VALUES (v_co, '2099-01', 'draft', v_drafter, 3, 1000)
  RETURNING id INTO v_run;

  -- 1 ────────────────────────────────────────────────────────────────────────
  SELECT submitted_at, approved_at, paid_at INTO v_sub, v_app, v_paid
    FROM public.payroll_runs WHERE id = v_run;
  ASSERT v_sub IS NULL AND v_app IS NULL AND v_paid IS NULL,
    '1: a new draft must have no stage timestamps';

  -- 2 ────────────────────────────────────────────────────────────────────────
  UPDATE public.payroll_runs SET status = 'pending_approval' WHERE id = v_run;
  SELECT submitted_at INTO v_sub FROM public.payroll_runs WHERE id = v_run;
  ASSERT v_sub IS NOT NULL, '2: submitting must stamp submitted_at';

  SELECT count(*) INTO v_n FROM public.audit_logs
   WHERE entity_id = v_run AND action_type = 'payroll_run_submitted';
  ASSERT v_n = 1, format('2: expected 1 submitted audit row, got %s', v_n);

  -- 3 ────────────────────────────────────────────────────────────────────────
  -- Note: run as a session whose auth.uid() is the approver. Under psql
  -- auth.uid() is NULL, so approve_payroll_run() would refuse; drive the
  -- transition directly and assert the trigger's behaviour, which is what
  -- this migration owns. (The RPC's own authz is covered by
  -- supabase/tests/approval_framework.sql.)
  UPDATE public.payroll_runs
     SET status = 'approved', approved_by = v_approver
   WHERE id = v_run;

  SELECT approved_at, approved_by INTO v_app, v_actor
    FROM public.payroll_runs WHERE id = v_run;
  ASSERT v_app IS NOT NULL, '3: approving must stamp approved_at';
  ASSERT v_actor = v_approver, '3: approved_by must be the approver';

  SELECT count(*) INTO v_n FROM public.audit_logs
   WHERE entity_id = v_run AND action_type = 'payroll_run_approved';
  ASSERT v_n = 1, format('3: expected 1 approved audit row, got %s', v_n);

  -- 4 ── the regression ─────────────────────────────────────────────────────
  UPDATE public.payroll_runs SET status = 'processing' WHERE id = v_run;
  UPDATE public.payroll_runs SET status = 'approved'   WHERE id = v_run;

  SELECT approved_at INTO v_app2 FROM public.payroll_runs WHERE id = v_run;
  ASSERT v_app2 = v_app,
    format('4: approved_at overwritten by a disbursement rollback (%s -> %s)', v_app, v_app2);

  SELECT count(*) INTO v_n FROM public.audit_logs
   WHERE entity_id = v_run AND action_type = 'payroll_run_approved';
  ASSERT v_n = 1, format('4: rollback fabricated a second approval row (%s total)', v_n);

  SELECT count(*) INTO v_n FROM public.audit_logs
   WHERE entity_id = v_run AND action_type = 'payroll_run_disbursement_reverted';
  ASSERT v_n = 1, format('4: rollback must log a reversion, got %s rows', v_n);

  -- 5 ────────────────────────────────────────────────────────────────────────
  UPDATE public.payroll_runs SET status = 'processing' WHERE id = v_run;
  UPDATE public.payroll_runs SET status = 'paid'       WHERE id = v_run;

  SELECT paid_at INTO v_paid FROM public.payroll_runs WHERE id = v_run;
  ASSERT v_paid IS NOT NULL, '5: paying must stamp paid_at';

  SELECT count(*) INTO v_n FROM public.audit_logs
   WHERE entity_id = v_run AND action_type = 'payroll_run_paid';
  ASSERT v_n = 1, format('5: expected 1 paid audit row, got %s', v_n);

  -- 6 ── the pre-existing paid-run lock must still bite ─────────────────────
  BEGIN
    UPDATE public.payroll_runs SET total_burn_ngn = 1 WHERE id = v_run;
    RAISE EXCEPTION '6: a paid run accepted a money edit — the lock is broken';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL; -- expected
  END;

  -- 7 ────────────────────────────────────────────────────────────────────────
  INSERT INTO public.payroll_runs (company_id, period, status, created_by)
  VALUES (v_co, '2099-02', 'draft', v_drafter) RETURNING id INTO v_run2;

  UPDATE public.payroll_runs SET status = 'pending_approval' WHERE id = v_run2;
  UPDATE public.payroll_runs SET status = 'approved', approved_by = v_approver WHERE id = v_run2;

  SELECT count(*) INTO v_before FROM public.audit_logs WHERE entity_id = v_run2;
  UPDATE public.payroll_runs SET status = 'draft' WHERE id = v_run2;
  SELECT count(*) INTO v_after  FROM public.audit_logs WHERE entity_id = v_run2;

  ASSERT v_after = v_before + 1,
    format('7: recall must write exactly one audit row, wrote %s', v_after - v_before);

  SELECT count(*) INTO v_n FROM public.audit_logs
   WHERE entity_id = v_run2 AND action_type = 'payroll_run_recalled';
  ASSERT v_n = 1, format('7: expected 1 recall audit row, got %s', v_n);

  SELECT submitted_at, approved_at INTO v_sub, v_app
    FROM public.payroll_runs WHERE id = v_run2;
  ASSERT v_sub IS NULL AND v_app IS NULL,
    '7: recall to draft must clear submitted_at/approved_at';

  -- 8 ────────────────────────────────────────────────────────────────────────
  UPDATE public.payroll_runs SET status = 'approved', approved_by = v_approver WHERE id = v_run2;
  SELECT submitted_at, approved_at INTO v_sub, v_app
    FROM public.payroll_runs WHERE id = v_run2;
  ASSERT v_app IS NOT NULL, '8: draft -> approved must still stamp approved_at';
  ASSERT v_sub IS NULL,     '8: draft -> approved must not invent a submitted_at';

  RAISE NOTICE 'ALL STAGE-TIMESTAMP ASSERTIONS PASSED';
END $$;

ROLLBACK;
