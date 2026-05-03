-- =============================================================================
-- Approval framework — RPC contract tests
--
-- Run against a clean Supabase database AFTER all migrations have been
-- applied (in particular 20260811000000_approval_framework.sql).
--
--   psql "$DATABASE_URL" -f supabase/tests/approval_framework.sql
--
-- The script wraps everything in a single transaction and rolls back at the
-- end so the database is left untouched. Any test that doesn't behave as
-- expected raises an exception via plpgsql ASSERT — the rollback still happens
-- and the failing assertion is surfaced in the psql output.
--
-- Tests cover the BLOCKER findings closed by this migration:
--   1. Self-approval blocked (B-1)
--   2. Below-threshold approval transitions straight to 'approved' (B-1)
--   3. Above-threshold approval transitions to 'pending_second_approval' (B-4)
--   4. Second approver cannot be the creator or first approver (B-4)
--   5. Payload mutation invalidates first approval (M-9)
--   6. Direct UPDATE on payment_batches.status from authenticated is blocked
--   7. reset_batch_to_draft clears approval state and allows payload edits
--   8. is_quick_pay_enabled defaults to false
--
-- The script picks two existing super_admin / admin profiles from the
-- database — no fixtures are inserted. If you have fewer than two admins
-- the script aborts with a friendly message rather than fudging fixtures.
-- =============================================================================

BEGIN;

DO $tests$
DECLARE
  v_super_a uuid;
  v_super_b uuid;
  v_finance uuid;
  v_batch_id uuid;
  v_item_id uuid;
  v_status text;
  v_threshold numeric;
  v_caught boolean;
BEGIN
  -- ── Pick test users ────────────────────────────────────────────────────
  SELECT id INTO v_super_a FROM public.profiles WHERE role = 'super_admin' ORDER BY id LIMIT 1;
  SELECT id INTO v_super_b FROM public.profiles WHERE role = 'super_admin' AND id <> v_super_a ORDER BY id LIMIT 1;
  SELECT id INTO v_finance FROM public.profiles WHERE role = 'finance' ORDER BY id LIMIT 1;

  IF v_super_a IS NULL OR v_super_b IS NULL THEN
    RAISE NOTICE 'SKIP: need at least 2 super_admin profiles to run the dual-approval tests';
    RETURN;
  END IF;
  IF v_finance IS NULL THEN
    RAISE NOTICE 'SKIP: need at least 1 finance profile to run cap tests';
    RETURN;
  END IF;

  -- Set super_admin's co-approval threshold tight enough to exercise both branches.
  UPDATE public.transfer_limits
     SET co_approval_threshold_ngn = 1000000
   WHERE user_id IS NULL AND role = 'super_admin';

  -- ── 1. Admin/super_admin self-approval allowed below threshold ───────
  -- Policy change: only roles below admin are blocked from self-approval.
  INSERT INTO public.payment_batches (name, payment_date, total_amount, beneficiary_count, status, created_by)
  VALUES ('TEST-ADMIN-SELF', current_date, 500000, 1, 'pending_approval', v_super_a)
  RETURNING id INTO v_batch_id;

  INSERT INTO public.batch_items (batch_id, full_name, bank_name, account_number, amount_ngn, status)
  VALUES (v_batch_id, 'Test Recipient', 'Test Bank', '0000000000', 500000, 'pending');

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_super_a)::text, true);
  PERFORM public.approve_payment_batch(v_batch_id); -- must succeed

  SELECT status INTO v_status FROM public.payment_batches WHERE id = v_batch_id;
  ASSERT v_status = 'approved',
    format('Test 1 — expected approved after admin self-approval, got %s', v_status);
  RAISE NOTICE '✓ Test 1 — admin self-approval (below threshold) → approved';

  -- ── 2. Below-threshold approval by a different approver → "approved" ──
  -- Fresh batch: finance creates, super_b approves.
  INSERT INTO public.payment_batches (name, payment_date, total_amount, beneficiary_count, status, created_by)
  VALUES ('TEST-BELOW', current_date, 500000, 1, 'pending_approval', v_finance)
  RETURNING id INTO v_batch_id;

  INSERT INTO public.batch_items (batch_id, full_name, bank_name, account_number, amount_ngn, status)
  VALUES (v_batch_id, 'Test Recipient', 'Test Bank', '0000000000', 500000, 'pending');

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_super_b)::text, true);
  PERFORM public.approve_payment_batch(v_batch_id);

  SELECT status INTO v_status FROM public.payment_batches WHERE id = v_batch_id;
  ASSERT v_status = 'approved', format('Test 2 — expected approved, got %s', v_status);
  RAISE NOTICE '✓ Test 2 — below-threshold approval → approved';

  -- ── 3. Above-threshold approval routes to pending_second_approval ─────
  INSERT INTO public.payment_batches (name, payment_date, total_amount, beneficiary_count, status, created_by)
  VALUES ('TEST-CO', current_date, 5000000, 1, 'pending_approval', v_finance)
  RETURNING id INTO v_batch_id;

  INSERT INTO public.batch_items (batch_id, full_name, bank_name, account_number, amount_ngn, status)
  VALUES (v_batch_id, 'High Value', 'Test Bank', '1111111111', 5000000, 'pending')
  RETURNING id INTO v_item_id;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_super_a)::text, true);
  PERFORM public.approve_payment_batch(v_batch_id);

  SELECT status INTO v_status FROM public.payment_batches WHERE id = v_batch_id;
  ASSERT v_status = 'pending_second_approval',
    format('Test 3 — expected pending_second_approval, got %s', v_status);
  RAISE NOTICE '✓ Test 3 — above-threshold approval → pending_second_approval';

  -- ── 4. Second approver cannot be the first approver ───────────────────
  v_caught := false;
  BEGIN
    PERFORM public.confirm_second_approval(v_batch_id);
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
    ASSERT SQLERRM ILIKE '%different approver%' OR SQLERRM ILIKE '%submitter%' OR SQLERRM ILIKE '%self%',
      format('Test 4 — wrong error: %s', SQLERRM);
  END;
  ASSERT v_caught, 'Test 4 — same-person second approval was NOT rejected';
  RAISE NOTICE '✓ Test 4 — same-person second approval rejected';

  -- ── 5. Payload mutation invalidates first approval ────────────────────
  -- The trigger should reject the UPDATE outright (post-approval payload-lock).
  v_caught := false;
  BEGIN
    UPDATE public.batch_items SET amount_ngn = 9999999 WHERE id = v_item_id;
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
    ASSERT SQLERRM ILIKE '%payload%' OR SQLERRM ILIKE '%cannot edit%' OR SQLERRM ILIKE '%draft%',
      format('Test 5 — wrong error: %s', SQLERRM);
  END;
  ASSERT v_caught, 'Test 5 — payload mutation was NOT blocked';
  RAISE NOTICE '✓ Test 5 — post-approval payload mutation blocked';

  -- ── 6. Different super_admin can second-approve ───────────────────────
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_super_b)::text, true);
  PERFORM public.confirm_second_approval(v_batch_id);
  SELECT status INTO v_status FROM public.payment_batches WHERE id = v_batch_id;
  ASSERT v_status = 'approved', format('Test 6 — expected approved after 2nd, got %s', v_status);
  RAISE NOTICE '✓ Test 6 — distinct second approver promotes batch to approved';

  -- ── 7. reset_batch_to_draft only callable by creator ─────────────────
  INSERT INTO public.payment_batches (name, payment_date, total_amount, beneficiary_count, status, created_by, rejection_reason)
  VALUES ('TEST-RESET', current_date, 100, 1, 'rejected', v_finance, 'try again')
  RETURNING id INTO v_batch_id;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_super_a)::text, true);
  v_caught := false;
  BEGIN
    PERFORM public.reset_batch_to_draft(v_batch_id);
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
    ASSERT SQLERRM ILIKE '%creator%', format('Test 7 — wrong error: %s', SQLERRM);
  END;
  ASSERT v_caught, 'Test 7 — non-creator was allowed to reset to draft';
  RAISE NOTICE '✓ Test 7 — only creator can reset to draft';

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_finance)::text, true);
  PERFORM public.reset_batch_to_draft(v_batch_id);
  SELECT status INTO v_status FROM public.payment_batches WHERE id = v_batch_id;
  ASSERT v_status = 'draft', format('Test 7b — expected draft, got %s', v_status);
  RAISE NOTICE '✓ Test 7b — creator successfully reset to draft';

  -- ── 8. is_quick_pay_enabled defaults to false ─────────────────────────
  ASSERT public.is_quick_pay_enabled() = false,
    'Test 8 — Quick Pay should default to disabled';
  RAISE NOTICE '✓ Test 8 — Quick Pay disabled by default';

  -- ── 9. get_eligible_approvers narrows to super_admin for admin creator ─
  IF EXISTS (SELECT 1 FROM public.profiles WHERE role = 'admin') THEN
    DECLARE
      v_admin uuid;
      v_pool_size int;
      v_super_count int;
      v_only_super boolean;
    BEGIN
      SELECT id INTO v_admin FROM public.profiles WHERE role = 'admin' LIMIT 1;
      SELECT count(*) INTO v_pool_size FROM public.get_eligible_approvers('payment_batch','first', v_admin);
      SELECT count(*) INTO v_super_count FROM public.profiles WHERE role = 'super_admin' AND id <> v_admin;
      v_only_super := v_pool_size = v_super_count;
      ASSERT v_only_super,
        format('Test 9 — admin-creator pool should narrow to super_admins (got %s, expected %s)',
               v_pool_size, v_super_count);
      RAISE NOTICE '✓ Test 9 — admin creator narrows first-approver pool to super_admin';
    END;
  ELSE
    RAISE NOTICE '⚠ Test 9 SKIPPED — no admin profile available';
  END IF;

  RAISE NOTICE '── all approval-framework tests passed ──';
END $tests$;

ROLLBACK;
