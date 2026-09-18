-- =============================================================================
-- upsert_payroll_draft() — overwrite guard contract tests
--
--   psql "$DATABASE_URL" -f supabase/tests/payroll_draft_overwrite_guard.sql
--
-- Wrapped in a transaction that ROLLS BACK. No run is left behind and nothing
-- here moves money.
--
-- The bug this guards (see 20261221300000): the function is find-or-create on
-- (company_id, period, payroll_segment_id), and when it found an existing row
-- it rewrote every money column and forced status back to 'draft' without
-- checking what that row's status was. Starting a "new payroll run" for a
-- period that already had one therefore silently un-approved it and replaced
-- its figures — including while it was mid-disbursement.
--
-- Needs one company and one active profile with an approving role.
-- =============================================================================

BEGIN;

DO $$
DECLARE
  v_co     uuid;
  v_actor  uuid;
  v_run    uuid;
  v_id     uuid;
  v_status text;
  v_burn   numeric;
  v_st     text;
  v_blocked boolean;
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

  IF auth.uid() IS NULL THEN
    RAISE NOTICE 'SKIPPED: no auth.uid() in this session — run via an authenticated connection.';
    RETURN;
  END IF;

  -- ── 1. An existing DRAFT may still be rewritten in place ─────────────────
  -- This is the legitimate case: re-running the wizard over your own draft.
  INSERT INTO public.payroll_runs (company_id, period, payroll_segment_id, status,
                                   total_burn_ngn, employee_count)
  VALUES (v_co, '2099-06', NULL, 'draft', 4_477_000, 23)
  RETURNING id INTO v_run;

  SELECT public.upsert_payroll_draft(
    '2099-06', NULL, 0, 99, 0, 0, 0, 0, 0, 99, v_actor, v_co,
    NULL, 'monthly', 1, NULL, NULL
  ) INTO v_id;

  ASSERT v_id = v_run, '1: should have reused the existing draft row';
  SELECT status, total_burn_ngn INTO v_status, v_burn
    FROM public.payroll_runs WHERE id = v_run;
  ASSERT v_status = 'draft' AND v_burn = 99,
    format('1: draft should have been updated in place, got %s / %s', v_status, v_burn);

  -- ── 2. Anything past draft is refused, with its figures intact ───────────
  FOREACH v_st IN ARRAY ARRAY['pending_approval', 'approved', 'processing']
  LOOP
    UPDATE public.payroll_runs
       SET status = v_st, total_burn_ngn = 4_477_000
     WHERE id = v_run;

    v_blocked := false;
    BEGIN
      PERFORM public.upsert_payroll_draft(
        '2099-06', NULL, 0, 1, 0, 0, 0, 0, 0, 1, v_actor, v_co,
        NULL, 'monthly', 1, NULL, NULL
      );
    EXCEPTION WHEN invalid_parameter_value THEN
      v_blocked := true;
    END;

    ASSERT v_blocked,
      format('2: a run in %s was silently overwritten by a new draft', v_st);

    SELECT status, total_burn_ngn INTO v_status, v_burn
      FROM public.payroll_runs WHERE id = v_run;
    ASSERT v_status = v_st,
      format('2: %s run was reset to %s', v_st, v_status);
    ASSERT v_burn = 4_477_000,
      format('2: %s run had its figures rewritten to %s', v_st, v_burn);
  END LOOP;

  -- ── 3. A different period is unaffected ──────────────────────────────────
  -- The guard must not block drafting a genuinely new period just because
  -- some other run exists for this pay group.
  SELECT public.upsert_payroll_draft(
    '2099-07', NULL, 0, 500, 0, 0, 0, 0, 0, 500, v_actor, v_co,
    NULL, 'monthly', 2, NULL, NULL
  ) INTO v_id;
  ASSERT v_id IS NOT NULL AND v_id <> v_run,
    '3: drafting a different period should create its own run';

  RAISE NOTICE 'ALL DRAFT-OVERWRITE-GUARD ASSERTIONS PASSED';
END $$;

ROLLBACK;
