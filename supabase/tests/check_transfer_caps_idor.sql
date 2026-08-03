-- =============================================================================
-- check_transfer_caps IDOR fix contract tests
-- Run against a clean Supabase DB after migration
-- 20261003000300_fix_check_transfer_caps_idor.sql is applied:
--
--   psql "$DATABASE_URL" -f supabase/tests/check_transfer_caps_idor.sql
--
-- Wrapped in ROLLBACK so the database is left untouched. Uses
-- `SET LOCAL ROLE authenticated` so current_user is 'authenticated' (not
-- the psql superuser), matching how the RPC is actually reached from a
-- browser session.
-- =============================================================================

BEGIN;

DO $tests$
DECLARE
  v_super_admin uuid;
  v_finance     uuid;
  v_employee_a  uuid;
  v_employee_b  uuid;
  v_cap         record;
  v_caught      boolean;
BEGIN
  SELECT id INTO v_super_admin FROM public.profiles WHERE role = 'super_admin' ORDER BY id LIMIT 1;
  SELECT id INTO v_finance     FROM public.profiles WHERE role = 'finance'     ORDER BY id LIMIT 1;
  SELECT id INTO v_employee_a  FROM public.profiles WHERE role = 'employee'    ORDER BY id LIMIT 1;
  SELECT id INTO v_employee_b  FROM public.profiles WHERE role = 'employee' AND id <> v_employee_a ORDER BY id LIMIT 1;

  IF v_super_admin IS NULL OR v_finance IS NULL OR v_employee_a IS NULL OR v_employee_b IS NULL THEN
    RAISE NOTICE 'SKIP: need super_admin + finance + 2 employee profiles';
    RETURN;
  END IF;

  SET LOCAL ROLE authenticated;

  -- ── Test 1: a plain user checking their OWN caps is allowed ───────────────
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_employee_a)::text, true);
  v_caught := false;
  BEGIN
    SELECT * INTO v_cap FROM public.check_transfer_caps(v_employee_a, 10000, false);
  EXCEPTION WHEN OTHERS THEN v_caught := true;
  END;
  ASSERT NOT v_caught, 'Test 1 — self cap-check should be allowed';
  RAISE NOTICE '✓ Test 1 — self cap-check allowed';

  -- ── Test 2: a plain user checking ANOTHER user's caps is blocked (IDOR) ────
  v_caught := false;
  BEGIN
    PERFORM public.check_transfer_caps(v_employee_b, 10000, false);
  EXCEPTION WHEN OTHERS THEN v_caught := true;
  END;
  ASSERT v_caught, 'Test 2 — cross-user cap-check by a non-approver must be blocked';
  RAISE NOTICE '✓ Test 2 — cross-user cap-check blocked for plain employee';

  -- ── Test 3: a plain user cannot plant a bogus intent row on another user ──
  v_caught := false;
  BEGIN
    PERFORM public.check_transfer_caps(v_employee_b, 10000, true);
  EXCEPTION WHEN OTHERS THEN v_caught := true;
  END;
  ASSERT v_caught, 'Test 3 — cross-user intent write by a non-approver must be blocked';
  RAISE NOTICE '✓ Test 3 — cross-user ledger pollution (p_intent=true) blocked';

  -- ── Test 4: an approver role (finance) MAY check another user's caps ──────
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_finance)::text, true);
  v_caught := false;
  BEGIN
    SELECT * INTO v_cap FROM public.check_transfer_caps(v_employee_a, 10000, false);
  EXCEPTION WHEN OTHERS THEN v_caught := true;
  END;
  ASSERT NOT v_caught, 'Test 4 — finance approver should be able to check another user''s caps';
  RAISE NOTICE '✓ Test 4 — approver role (finance) allowed cross-user check';

  RESET ROLE;
  RAISE NOTICE '── all check_transfer_caps IDOR tests passed ──';
END
$tests$;

ROLLBACK;
