-- =============================================================================
-- B-7 / H-4 / H-6 / H-8 contract tests.
--
--   psql "$DATABASE_URL" -f supabase/tests/audit_state_webhook_hardening.sql
--
-- Wrapped in ROLLBACK so the database is left untouched.
-- =============================================================================

BEGIN;

DO $tests$
DECLARE
  v_super_a    uuid;
  v_finance    uuid;
  v_audit_id   uuid;
  v_actor      uuid;
  v_actor_name text;
  v_caught     boolean;
  v_purged     bigint;
  v_batch_id   uuid;
  v_item_id    uuid;
  v_rpc        jsonb;
  v_status     text;
BEGIN
  SELECT id INTO v_super_a FROM public.profiles WHERE role = 'super_admin' ORDER BY id LIMIT 1;
  SELECT id INTO v_finance FROM public.profiles WHERE role = 'finance' ORDER BY id LIMIT 1;

  IF v_super_a IS NULL OR v_finance IS NULL THEN
    RAISE NOTICE 'SKIP: need 1 super_admin + 1 finance profile';
    RETURN;
  END IF;

  -- ── Test 1: log_audit RPC sets performed_by to auth.uid() ────────────────
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_super_a)::text, true);
  v_audit_id := public.log_audit(
    'profile_updated',
    'unit-test: log_audit RPC sets performed_by',
    '{"k":"v"}'::jsonb
  );
  SELECT performed_by, performed_by_name INTO v_actor, v_actor_name
    FROM public.audit_logs WHERE id = v_audit_id;
  ASSERT v_actor = v_super_a,
    format('Test 1 — performed_by should be the caller (%s), got %s', v_super_a, v_actor);
  ASSERT v_actor_name IS NOT NULL,
    'Test 1 — performed_by_name should be looked up from profiles';
  RAISE NOTICE '✓ Test 1 — log_audit RPC sets performed_by from auth.uid()';

  -- ── Test 2: client-supplied performed_by is overwritten by trigger ───────
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_finance)::text, true);
  INSERT INTO public.audit_logs (action_type, description, performed_by, performed_by_name)
  VALUES ('profile_updated', 'spoof attempt', v_super_a, 'I Am Super Admin')
  RETURNING id INTO v_audit_id;
  SELECT performed_by, performed_by_name INTO v_actor, v_actor_name
    FROM public.audit_logs WHERE id = v_audit_id;
  ASSERT v_actor = v_finance,
    format('Test 2 — trigger should rewrite performed_by to caller (%s), got %s', v_finance, v_actor);
  RAISE NOTICE '✓ Test 2 — trigger overwrites client-supplied performed_by';

  -- ── Test 3: service-role insert leaves performed_by intact ───────────────
  -- In psql we run as superuser, so auth.uid() is NULL — trigger should leave
  -- performed_by_name = 'Paystack Webhook' alone.
  PERFORM set_config('request.jwt.claims', NULL, true);
  INSERT INTO public.audit_logs (action_type, description, performed_by, performed_by_name)
  VALUES ('paystack_transfer_succeeded', 'webhook test', NULL, 'Paystack Webhook')
  RETURNING id INTO v_audit_id;
  SELECT performed_by, performed_by_name INTO v_actor, v_actor_name
    FROM public.audit_logs WHERE id = v_audit_id;
  ASSERT v_actor IS NULL, 'Test 3 — service-role performed_by should remain NULL';
  ASSERT v_actor_name = 'Paystack Webhook',
    format('Test 3 — service-role performed_by_name should remain %s, got %s', 'Paystack Webhook', v_actor_name);
  RAISE NOTICE '✓ Test 3 — trigger does not override service-role values when auth.uid() is NULL';

  -- ── Test 4: state machine blocks regression from terminal status ─────────
  INSERT INTO public.payment_batches (name, payment_date, total_amount, beneficiary_count, status, created_by)
  VALUES ('TEST-STATE-1', current_date, 1000, 1, 'pending_approval', v_finance)
  RETURNING id INTO v_batch_id;

  -- Bypass other triggers + advance to processed via the GUC.
  PERFORM set_config('kdops.allow_state_override', 'true', true);
  UPDATE public.payment_batches SET status = 'processed' WHERE id = v_batch_id;
  PERFORM set_config('kdops.allow_state_override', 'false', true);

  v_caught := false;
  BEGIN
    UPDATE public.payment_batches SET status = 'pending_approval' WHERE id = v_batch_id;
  EXCEPTION WHEN OTHERS THEN v_caught := true;
  END;
  ASSERT v_caught,
    'Test 4 — state machine should block processed -> pending_approval regression';
  RAISE NOTICE '✓ Test 4 — backward transition processed -> pending_approval blocked';

  -- ── Test 5: state machine allows GUC bypass ──────────────────────────────
  PERFORM set_config('kdops.allow_state_override', 'true', true);
  UPDATE public.payment_batches SET status = 'pending_approval' WHERE id = v_batch_id;
  SELECT status INTO v_status FROM public.payment_batches WHERE id = v_batch_id;
  ASSERT v_status = 'pending_approval',
    format('Test 5 — GUC bypass should allow any transition, got %s', v_status);
  PERFORM set_config('kdops.allow_state_override', 'false', true);
  RAISE NOTICE '✓ Test 5 — kdops.allow_state_override=true bypasses state machine';

  -- ── Test 6: state machine on batch_items blocks reversed -> succeeded ────
  INSERT INTO public.batch_items (batch_id, full_name, bank_name, account_number, amount_ngn, status, paystack_reference)
  VALUES (v_batch_id, 'R', 'Bank', '0000000000', 1000, 'pending', 'kdops_test_state_ref')
  RETURNING id INTO v_item_id;

  PERFORM set_config('kdops.allow_state_override', 'true', true);
  UPDATE public.batch_items SET status = 'reversed' WHERE id = v_item_id;
  PERFORM set_config('kdops.allow_state_override', 'false', true);

  v_caught := false;
  BEGIN
    UPDATE public.batch_items SET status = 'succeeded' WHERE id = v_item_id;
  EXCEPTION WHEN OTHERS THEN v_caught := true;
  END;
  ASSERT v_caught,
    'Test 6 — batch_item reversed -> succeeded should be blocked';
  RAISE NOTICE '✓ Test 6 — batch_item terminal state regression blocked';

  -- ── Test 7: process_paystack_webhook returns duplicate on second call ────
  -- Reset item to pending so the first call can land.
  PERFORM set_config('kdops.allow_state_override', 'true', true);
  UPDATE public.batch_items SET status = 'pending' WHERE id = v_item_id;
  PERFORM set_config('kdops.allow_state_override', 'false', true);

  v_rpc := public.process_paystack_webhook(
    'transfer.success',
    'kdops_test_state_ref',
    NULL,
    '{"status":"success"}'::jsonb,
    50,
    now()
  );
  ASSERT v_rpc->>'outcome' = 'processed',
    format('Test 7 — first call should be processed, got %s', v_rpc->>'outcome');

  v_rpc := public.process_paystack_webhook(
    'transfer.success',
    'kdops_test_state_ref',
    NULL,
    '{"status":"success"}'::jsonb,
    50,
    now()
  );
  ASSERT v_rpc->>'outcome' = 'duplicate',
    format('Test 7 — second call should be duplicate, got %s', v_rpc->>'outcome');
  RAISE NOTICE '✓ Test 7 — process_paystack_webhook returns processed then duplicate';

  -- ── Test 8: process_paystack_webhook returns no_match for unknown ref ────
  v_rpc := public.process_paystack_webhook(
    'transfer.success',
    'kdops_no_such_ref_xyz_12345',
    NULL,
    '{"status":"success"}'::jsonb,
    0,
    now()
  );
  ASSERT v_rpc->>'outcome' = 'no_match',
    format('Test 8 — unknown ref should return no_match, got %s', v_rpc->>'outcome');
  RAISE NOTICE '✓ Test 8 — process_paystack_webhook returns no_match for unknown reference';

  -- ── Test 9: webhook_idempotency cleanup ──────────────────────────────────
  -- Insert a row from 100 days ago and verify purge picks it up.
  INSERT INTO public.webhook_idempotency (reference, event_type, processed_at)
  VALUES ('kdops_test_purge_ref', 'transfer.success', now() - interval '100 days')
  ON CONFLICT DO NOTHING;

  v_purged := public.purge_old_webhook_idempotency();
  ASSERT v_purged >= 1,
    format('Test 9 — should purge >= 1 old idempotency row, got %s', v_purged);

  ASSERT NOT EXISTS (
    SELECT 1 FROM public.webhook_idempotency
     WHERE reference = 'kdops_test_purge_ref'
       AND event_type = 'transfer.success'
  ), 'Test 9 — old idempotency row should be gone';
  RAISE NOTICE '✓ Test 9 — purge_old_webhook_idempotency removes >90d rows';

  -- ── Test 10: webhook_idempotency_metrics view returns rows ──────────────
  PERFORM 1 FROM public.webhook_idempotency_metrics LIMIT 1;
  RAISE NOTICE '✓ Test 10 — webhook_idempotency_metrics view queryable';

  -- ── Test 11: triggers wired up ──────────────────────────────────────────
  ASSERT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'enforce_payment_batch_state_machine'
       AND tgrelid = 'public.payment_batches'::regclass
  ), 'Test 11 — payment_batches state-machine trigger missing';
  ASSERT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'enforce_batch_item_state_machine'
       AND tgrelid = 'public.batch_items'::regclass
  ), 'Test 11 — batch_items state-machine trigger missing';
  ASSERT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'enforce_audit_logs_actor'
       AND tgrelid = 'public.audit_logs'::regclass
  ), 'Test 11 — audit_logs actor-rewrite trigger missing';
  RAISE NOTICE '✓ Test 11 — all three new triggers wired up';

  RAISE NOTICE '── all audit/state/webhook hardening tests passed ──';
END
$tests$;

ROLLBACK;
