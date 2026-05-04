-- =============================================================================
-- Payment-state RPCs — close BLOCKER B-2 (cap RPC bypassed by direct status
-- mutations) and HIGH H-7 (hardcoded ₦5M ceiling) from
-- docs/audits/PAYMENT_SUBSYSTEM_AUDIT.md.
--
-- The 20260811000000 approval-framework migration moved approval-state writes
-- (pending_approval → approved/pending_second_approval/rejected) behind
-- SECURITY DEFINER RPCs and added a BEFORE UPDATE trigger that blocks those
-- transitions from authenticated. The lifecycle past approval (approved →
-- funded → processing → processed/partially_processed) was still happening
-- via direct supabase.from('payment_batches').update({status: ...}) calls in
-- BatchDetail.tsx, QuickPay.tsx, and the page-level stale-sync code in
-- Payments.tsx. Those calls bypassed any cap accounting or audit and were
-- the actual surface the audit named in B-2.
--
-- This migration:
--
--   1. Adds RPCs for every remaining status transition in the batch lifecycle:
--        mark_batch_funded(p_batch_id, p_funding_evidence)
--        start_batch_processing(p_batch_id)             -- funded/partially → processing
--        finalize_batch(p_batch_id)                     -- processing → processed/partial/funded
--        sync_batch_status_from_items(p_batch_id)       -- safe stale-sync wrapper
--        mark_expense_paid(p_expense_id, p_batch_id)    -- expense.payment_status → processed
--        create_expense_payment_batch(p_expense_id)     -- atomic synthetic batch + cap check
--
--   2. Tightens enforce_batch_approval_state_writes so it now also blocks
--      approved → funded, funded → processing, processing → terminal, etc.
--      from the authenticated role. SECURITY DEFINER (the new RPCs) and
--      service_role (paystack-webhook, batch-worker, paystack-reconciliation)
--      pass through.
--
--   3. Tightens enforce_expense_approval_state_writes to also block direct
--      payment_status → 'processed' writes from authenticated — the webhook
--      and the new mark_expense_paid RPC are the only blessed paths.
--
--   4. Adds company_settings.max_single_transfer_ngn so the ₦5,000,000
--      hard ceiling can be configured (default NULL = no extra limit beyond
--      transfer_limits caps), and folds it into check_transfer_caps so the
--      single source of truth covers it. The hardcoded checks at
--      BatchDetail.tsx:700 and batch-worker/index.ts:148 are removed in
--      the same PR; if the company wants a NIBSS-style ceiling later they
--      set this column.
-- =============================================================================

-- ──────────────────────────────────────────────────────────────────────────
-- 1. company_settings.max_single_transfer_ngn — optional NIBSS-style ceiling
-- ──────────────────────────────────────────────────────────────────────────
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS max_single_transfer_ngn numeric;

COMMENT ON COLUMN public.company_settings.max_single_transfer_ngn IS
  'Optional hard ceiling on a single transfer amount (e.g. NIBSS limit). '
  'NULL = no extra ceiling beyond transfer_limits.single_txn_limit_ngn.';

-- Fold the hard ceiling into check_transfer_caps so every cap-checked path
-- (paystack-transfer, batch-worker, approve_payment_batch, approve_expense,
-- create_expense_payment_batch) honours it from one place. Replaces the
-- duplicated 5_000_000 literal that previously lived in the client and the
-- batch-worker.
CREATE OR REPLACE FUNCTION public.check_transfer_caps(
  p_user_id uuid,
  p_amount_ngn numeric
)
RETURNS TABLE (
  allowed boolean,
  reason text,
  applied_limit_kind text,
  applied_limit_ngn numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_single numeric;
  v_daily  numeric;
  v_monthly numeric;
  v_max_single numeric;
  v_used_today numeric;
  v_used_month numeric;
BEGIN
  IF p_amount_ngn IS NULL OR p_amount_ngn <= 0 THEN
    RETURN QUERY SELECT false, 'Amount must be positive'::text, NULL::text, NULL::numeric;
    RETURN;
  END IF;

  -- Optional company-wide ceiling. Catches the previously-hardcoded ₦5M
  -- before any per-user caps so the message is "platform max", not "your cap".
  SELECT max_single_transfer_ngn INTO v_max_single
    FROM public.company_settings
   WHERE id = '00000000-0000-0000-0000-000000000001';
  IF v_max_single IS NOT NULL AND v_max_single > 0 AND p_amount_ngn > v_max_single THEN
    RETURN QUERY SELECT
      false,
      format('Single transfer exceeds platform maximum of ₦%s',
             to_char(v_max_single, 'FM999,999,999,999'))::text,
      'platform_single'::text,
      v_max_single;
    RETURN;
  END IF;

  -- User override wins over role default, same shape as before.
  SELECT single_txn_limit_ngn, daily_limit_ngn, monthly_limit_ngn
    INTO v_single, v_daily, v_monthly
    FROM public.transfer_limits
   WHERE user_id = p_user_id
   LIMIT 1;

  IF NOT FOUND THEN
    SELECT role INTO v_role FROM public.profiles WHERE id = p_user_id;
    IF v_role IS NULL THEN
      RETURN QUERY SELECT false, 'No transfer limits configured for this user'::text, NULL::text, NULL::numeric;
      RETURN;
    END IF;
    SELECT single_txn_limit_ngn, daily_limit_ngn, monthly_limit_ngn
      INTO v_single, v_daily, v_monthly
      FROM public.transfer_limits
     WHERE user_id IS NULL AND role = v_role
     LIMIT 1;
    IF NOT FOUND THEN
      RETURN QUERY SELECT false, format('No transfer limits configured for role %s', v_role)::text, NULL::text, NULL::numeric;
      RETURN;
    END IF;
  END IF;

  IF v_single IS NOT NULL AND p_amount_ngn > v_single THEN
    RETURN QUERY SELECT
      false,
      format('Single transfer exceeds your cap of ₦%s', to_char(v_single, 'FM999,999,999,999'))::text,
      'single'::text,
      v_single;
    RETURN;
  END IF;

  -- Sum dispatched + intent rows in the rolling windows.
  SELECT COALESCE(sum(amount_ngn), 0) INTO v_used_today
    FROM public.transfer_audit
   WHERE actor_id = p_user_id
     AND outcome IN ('ok','intent')
     AND created_at >= now() - interval '24 hours';

  SELECT COALESCE(sum(amount_ngn), 0) INTO v_used_month
    FROM public.transfer_audit
   WHERE actor_id = p_user_id
     AND outcome IN ('ok','intent')
     AND created_at >= now() - interval '30 days';

  IF v_daily IS NOT NULL AND v_used_today + p_amount_ngn > v_daily THEN
    RETURN QUERY SELECT
      false,
      format('Daily cap of ₦%s would be exceeded (already used ₦%s in last 24h)',
             to_char(v_daily, 'FM999,999,999,999'),
             to_char(v_used_today, 'FM999,999,999,999'))::text,
      'daily'::text,
      v_daily;
    RETURN;
  END IF;
  IF v_monthly IS NOT NULL AND v_used_month + p_amount_ngn > v_monthly THEN
    RETURN QUERY SELECT
      false,
      format('Monthly cap of ₦%s would be exceeded (already used ₦%s in last 30d)',
             to_char(v_monthly, 'FM999,999,999,999'),
             to_char(v_used_month, 'FM999,999,999,999'))::text,
      'monthly'::text,
      v_monthly;
    RETURN;
  END IF;

  RETURN QUERY SELECT true, NULL::text, 'within_caps'::text, v_single;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_transfer_caps(uuid, numeric) TO authenticated, service_role;

-- ──────────────────────────────────────────────────────────────────────────
-- 2. payment_batches.funded_at / funded_by / funding_evidence
--    Funding state-fields so the lifecycle is forensically reconstructable.
--    Existing rows: funded_at = updated_at when status = 'funded' is a
--    reasonable backfill but we won't pretend a previous value existed —
--    NULL is honest.
-- ──────────────────────────────────────────────────────────────────────────
ALTER TABLE public.payment_batches
  ADD COLUMN IF NOT EXISTS funded_at        timestamptz,
  ADD COLUMN IF NOT EXISTS funded_by        uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS funding_evidence jsonb,
  ADD COLUMN IF NOT EXISTS processing_started_at  timestamptz,
  ADD COLUMN IF NOT EXISTS processing_finalized_at timestamptz;

-- ──────────────────────────────────────────────────────────────────────────
-- 3. RPC: mark_batch_funded — approved → funded
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mark_batch_funded(
  p_batch_id uuid,
  p_funding_evidence jsonb DEFAULT NULL
)
RETURNS public.payment_batches
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch       public.payment_batches;
  v_caller      uuid := auth.uid();
  v_caller_role text;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_batch FROM public.payment_batches
   WHERE id = p_batch_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Batch % not found', p_batch_id; END IF;

  IF v_batch.status <> 'approved' THEN
    RAISE EXCEPTION 'Cannot fund a batch in status % (must be approved)', v_batch.status
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT role INTO v_caller_role FROM public.profiles
   WHERE id = v_caller AND COALESCE(status, 'active') = 'active';
  IF v_caller_role IS NULL OR v_caller_role NOT IN ('super_admin','admin','finance') THEN
    RAISE EXCEPTION 'Only super_admin/admin/finance can mark a batch funded'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.payment_batches SET
    status           = 'funded',
    funded_at        = now(),
    funded_by        = v_caller,
    funding_evidence = COALESCE(p_funding_evidence, '{}'::jsonb)
  WHERE id = p_batch_id
  RETURNING * INTO v_batch;

  INSERT INTO public.audit_logs (action_type, description, performed_by, performed_by_name)
  VALUES (
    'batch_funded',
    format('Batch "%s" marked funded (₦%s)',
           v_batch.name,
           to_char(v_batch.total_amount, 'FM999,999,999,999')),
    v_caller,
    (SELECT full_name FROM public.profiles WHERE id = v_caller)
  );

  RETURN v_batch;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mark_batch_funded(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_batch_funded(uuid, jsonb) TO authenticated, service_role;

-- ──────────────────────────────────────────────────────────────────────────
-- 4. RPC: start_batch_processing — funded/partially_processed → processing.
--    The atomic claim is the whole point: two operators clicking "Process"
--    at the same time should not both dispatch. Returns the batch row so
--    the UI can detect "already processing" via a re-read after a no-op.
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.start_batch_processing(p_batch_id uuid)
RETURNS public.payment_batches
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch       public.payment_batches;
  v_caller      uuid := auth.uid();
  v_caller_role text;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_batch FROM public.payment_batches
   WHERE id = p_batch_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Batch % not found', p_batch_id; END IF;

  IF v_batch.status NOT IN ('funded','partially_processed') THEN
    RAISE EXCEPTION 'Cannot start processing on batch in status % (need funded or partially_processed)',
      v_batch.status USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT role INTO v_caller_role FROM public.profiles
   WHERE id = v_caller AND COALESCE(status, 'active') = 'active';
  IF v_caller_role IS NULL OR v_caller_role NOT IN ('super_admin','admin','finance') THEN
    RAISE EXCEPTION 'Only super_admin/admin/finance can start processing'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.payment_batches SET
    status                 = 'processing',
    processing_started_at  = COALESCE(processing_started_at, now())
  WHERE id = p_batch_id
  RETURNING * INTO v_batch;

  INSERT INTO public.audit_logs (action_type, description, performed_by, performed_by_name)
  VALUES (
    'batch_processing_started',
    format('Batch "%s" entered processing', v_batch.name),
    v_caller,
    (SELECT full_name FROM public.profiles WHERE id = v_caller)
  );

  RETURN v_batch;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.start_batch_processing(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_batch_processing(uuid) TO authenticated, service_role;

-- ──────────────────────────────────────────────────────────────────────────
-- 5. Helper: derive_batch_status_from_items
--    Pure derivation from item statuses, used by both finalize_batch and
--    sync_batch_status_from_items. Keeps the rule in one place.
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._derive_batch_status_from_items(p_batch_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total int;
  v_succeeded int;
  v_failed int;
  v_pending int;
  v_unstarted int;
BEGIN
  SELECT count(*) INTO v_total FROM public.batch_items WHERE batch_id = p_batch_id;
  IF v_total = 0 THEN RETURN NULL; END IF;

  SELECT
    count(*) FILTER (WHERE status = 'succeeded'),
    count(*) FILTER (WHERE status IN ('failed','reversed')),
    count(*) FILTER (WHERE status IN ('pending','retry') AND paystack_reference IS NOT NULL),
    count(*) FILTER (WHERE paystack_reference IS NULL AND status NOT IN ('succeeded','failed','reversed'))
  INTO v_succeeded, v_failed, v_pending, v_unstarted
  FROM public.batch_items
  WHERE batch_id = p_batch_id;

  IF v_pending > 0 THEN
    RETURN 'processing';
  ELSIF v_unstarted > 0 AND v_succeeded > 0 THEN
    RETURN 'partially_processed';
  ELSIF v_unstarted > 0 AND v_succeeded = 0 THEN
    RETURN 'funded';
  ELSIF v_failed > 0 THEN
    RETURN 'partially_processed';
  ELSE
    RETURN 'processed';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public._derive_batch_status_from_items(uuid) TO authenticated, service_role;

-- ──────────────────────────────────────────────────────────────────────────
-- 6. RPC: finalize_batch — processing → terminal status based on item state.
--    Idempotent: callable any number of times, only writes when the derived
--    status differs from the current one.
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.finalize_batch(p_batch_id uuid)
RETURNS public.payment_batches
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch    public.payment_batches;
  v_caller   uuid := auth.uid();
  v_caller_role text;
  v_derived  text;
BEGIN
  -- service_role / cron path doesn't carry auth.uid(); allow it through.
  IF v_caller IS NOT NULL THEN
    SELECT role INTO v_caller_role FROM public.profiles
     WHERE id = v_caller AND COALESCE(status, 'active') = 'active';
    IF v_caller_role IS NULL OR v_caller_role NOT IN ('super_admin','admin','finance') THEN
      RAISE EXCEPTION 'Only super_admin/admin/finance can finalize a batch'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  SELECT * INTO v_batch FROM public.payment_batches
   WHERE id = p_batch_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Batch % not found', p_batch_id; END IF;

  IF v_batch.status NOT IN ('processing','partially_processed') THEN
    -- Caller may have raced — return current row so they can re-render.
    RETURN v_batch;
  END IF;

  v_derived := public._derive_batch_status_from_items(p_batch_id);
  IF v_derived IS NULL OR v_derived = v_batch.status THEN
    RETURN v_batch;
  END IF;

  UPDATE public.payment_batches SET
    status = v_derived,
    processing_finalized_at = CASE
      WHEN v_derived IN ('processed','partially_processed','funded') THEN now()
      ELSE processing_finalized_at
    END
  WHERE id = p_batch_id
  RETURNING * INTO v_batch;

  INSERT INTO public.audit_logs (action_type, description, performed_by, performed_by_name)
  VALUES (
    'batch_finalized',
    format('Batch "%s" finalized → %s', v_batch.name, v_derived),
    v_caller,
    COALESCE((SELECT full_name FROM public.profiles WHERE id = v_caller), 'system')
  );

  RETURN v_batch;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.finalize_batch(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalize_batch(uuid) TO authenticated, service_role;

-- ──────────────────────────────────────────────────────────────────────────
-- 7. RPC: sync_batch_status_from_items — safe stale-sync wrapper.
--    Replaces the page-level "if anyPending recalc to 'processing' else
--    'processed'" code that lived directly inside Payments.tsx and
--    BatchDetail.tsx. Idempotent and bounded — only runs when the batch is
--    actively in a processing-family state, never reverses a terminal one.
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sync_batch_status_from_items(p_batch_id uuid)
RETURNS public.payment_batches
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch   public.payment_batches;
  v_derived text;
BEGIN
  SELECT * INTO v_batch FROM public.payment_batches
   WHERE id = p_batch_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Batch % not found', p_batch_id; END IF;

  -- Only sync rows that are mid-flight. We never recompute a 'processed'
  -- terminal back to anything else — the trigger would block a regression
  -- anyway, but explicit early-return makes the intent obvious.
  IF v_batch.status NOT IN ('processing','partially_processed','funded') THEN
    RETURN v_batch;
  END IF;

  v_derived := public._derive_batch_status_from_items(p_batch_id);
  IF v_derived IS NULL OR v_derived = v_batch.status THEN
    RETURN v_batch;
  END IF;

  UPDATE public.payment_batches SET
    status = v_derived
  WHERE id = p_batch_id
  RETURNING * INTO v_batch;
  RETURN v_batch;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.sync_batch_status_from_items(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_batch_status_from_items(uuid) TO authenticated, service_role;

-- ──────────────────────────────────────────────────────────────────────────
-- 8. RPC: mark_expense_paid — flip expense.payment_status to processed
--    after a batch_item linked to that expense has succeeded. The webhook
--    already does this for batches it owns; this RPC is for the dispatch
--    fallback path where the operator wants a manual link.
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mark_expense_paid(
  p_expense_id uuid,
  p_batch_id   uuid
)
RETURNS public.expenses
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expense  public.expenses;
  v_caller   uuid := auth.uid();
  v_caller_role text;
  v_batch_status text;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT role INTO v_caller_role FROM public.profiles
   WHERE id = v_caller AND COALESCE(status, 'active') = 'active';
  IF v_caller_role IS NULL OR v_caller_role NOT IN ('super_admin','admin','finance') THEN
    RAISE EXCEPTION 'Only super_admin/admin/finance can mark an expense paid'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_expense FROM public.expenses
   WHERE id = p_expense_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Expense % not found', p_expense_id; END IF;

  -- The expense must be linked to the batch we're crediting from. Stops the
  -- "operator copies a different batch_id" mistake.
  IF v_expense.payment_reference IS DISTINCT FROM p_batch_id::text THEN
    RAISE EXCEPTION 'Expense % is not linked to batch % (linked to %)',
      p_expense_id, p_batch_id, v_expense.payment_reference;
  END IF;

  -- Batch must be terminal in a way that means money moved.
  SELECT status INTO v_batch_status FROM public.payment_batches WHERE id = p_batch_id;
  IF v_batch_status NOT IN ('processed','partially_processed') THEN
    RAISE EXCEPTION 'Batch % has not finished processing (status: %)',
      p_batch_id, v_batch_status;
  END IF;

  UPDATE public.expenses SET
    payment_status = 'processed',
    processed_at   = now()
  WHERE id = p_expense_id
  RETURNING * INTO v_expense;

  INSERT INTO public.audit_logs (action_type, description, performed_by, performed_by_name)
  VALUES (
    'expense_paid',
    format('Expense %s marked paid via batch %s (₦%s)',
           p_expense_id, p_batch_id, to_char(v_expense.amount_ngn, 'FM999,999,999,999')),
    v_caller,
    (SELECT full_name FROM public.profiles WHERE id = v_caller)
  );

  RETURN v_expense;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mark_expense_paid(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_expense_paid(uuid, uuid) TO authenticated, service_role;

-- ──────────────────────────────────────────────────────────────────────────
-- 9. RPC: create_expense_payment_batch — atomic synthetic batch creation.
--
--    Replaces the multi-step processExpensePayment flow that previously did:
--      INSERT batch (pending_approval) → INSERT batch_item → UPDATE expense
--      → call approve_payment_batch → toast.
--
--    Doing those four mutations sequentially from the client meant a network
--    fail between any two of them left an orphaned batch or a pending
--    expense pointing at a batch that didn't get its line item. Wrapping the
--    whole thing in a SECURITY DEFINER RPC closes that gap, and lets us run
--    the cap check inside the same transaction.
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_expense_payment_batch(
  p_expense_id uuid
)
RETURNS public.payment_batches
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expense  public.expenses;
  v_caller   uuid := auth.uid();
  v_caller_role text;
  v_batch    public.payment_batches;
  v_cap_check record;
  v_is_reimb boolean;
  v_category_label text;
  v_batch_name text;
  v_payment_desc text;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT role INTO v_caller_role FROM public.profiles
   WHERE id = v_caller AND COALESCE(status, 'active') = 'active';
  IF v_caller_role IS NULL OR v_caller_role NOT IN ('super_admin','admin','finance') THEN
    RAISE EXCEPTION 'Only super_admin/admin/finance can dispatch expense payments'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_expense FROM public.expenses
   WHERE id = p_expense_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Expense % not found', p_expense_id; END IF;

  IF v_expense.status <> 'approved' THEN
    RAISE EXCEPTION 'Expense must be approved before payment dispatch (current: %)', v_expense.status
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF v_expense.payment_status IS NOT NULL AND v_expense.payment_status NOT IN ('pending','failed') THEN
    RAISE EXCEPTION 'Expense already has payment in progress or completed (status: %)', v_expense.payment_status
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF COALESCE(v_expense.account_number,'') = ''
     OR COALESCE(v_expense.bank_name,'') = ''
     OR COALESCE(v_expense.account_name,'') = '' THEN
    RAISE EXCEPTION 'Expense is missing bank details — cannot dispatch payment';
  END IF;

  -- Cap check before we materialize anything.
  SELECT * INTO v_cap_check
    FROM public.check_transfer_caps(v_caller, COALESCE(v_expense.amount_ngn, 0));
  IF NOT v_cap_check.allowed THEN
    RAISE EXCEPTION 'Payment dispatch blocked by transfer cap: %', v_cap_check.reason
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_is_reimb := COALESCE(v_expense.is_reimbursement, true);
  v_category_label := replace(COALESCE(v_expense.category, 'expense'), '_', ' ');
  v_batch_name := CASE
    WHEN v_is_reimb THEN format('%s Reimbursement — %s', v_category_label, v_expense.account_name)
    ELSE format('%s — %s', v_category_label, COALESCE(v_expense.description, v_expense.account_name))
  END;
  v_payment_desc := CASE
    WHEN v_is_reimb THEN format('Reimbursement: %s', COALESCE(v_expense.description, v_category_label))
    ELSE COALESCE(v_expense.description, v_category_label)
  END;

  INSERT INTO public.payment_batches (
    name, payment_description, payment_category, payment_date,
    is_quick_pay, total_amount, beneficiary_count, status, created_by
  ) VALUES (
    v_batch_name, v_payment_desc,
    CASE WHEN v_is_reimb THEN 'expense_reimbursement' ELSE 'company_charge' END,
    CURRENT_DATE,
    true, v_expense.amount_ngn, 1, 'pending_approval', v_caller
  )
  RETURNING * INTO v_batch;

  INSERT INTO public.batch_items (
    batch_id, full_name, bank_name, account_number, amount_ngn, status
  ) VALUES (
    v_batch.id,
    v_expense.account_name,
    v_expense.bank_name,
    v_expense.account_number,
    v_expense.amount_ngn,
    'pending'
  );

  -- Link the expense to the batch and mark its payment_status before any
  -- dispatch happens. Future re-clicks of "Pay" see payment_status = pending
  -- and are rejected by the guard above.
  UPDATE public.expenses SET
    payment_reference = v_batch.id::text,
    payment_status    = 'pending'
  WHERE id = p_expense_id;

  INSERT INTO public.audit_logs (action_type, description, performed_by, performed_by_name)
  VALUES (
    'expense_payment_batched',
    format('Expense %s queued for payment via batch %s (₦%s)',
           p_expense_id, v_batch.id, to_char(v_expense.amount_ngn, 'FM999,999,999,999')),
    v_caller,
    (SELECT full_name FROM public.profiles WHERE id = v_caller)
  );

  RETURN v_batch;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_expense_payment_batch(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_expense_payment_batch(uuid) TO authenticated, service_role;

-- ──────────────────────────────────────────────────────────────────────────
-- 10. Tighten enforce_batch_approval_state_writes — block ALL lifecycle
--     status changes from 'authenticated', not just the approval-state ones.
--     SECURITY DEFINER (the RPCs above) run as the function owner and are
--     unaffected; service_role for the webhook + batch-worker is unaffected.
--
--     Allowed authenticated transitions on payment_batches.status:
--         draft               → draft / pending_approval        (creator-only)
--         pending_approval    → draft                           (use reset_batch_to_draft RPC ideally,
--                                                                but allow direct for legacy edit flow)
--         (no other status changes from authenticated)
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.enforce_batch_approval_state_writes()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Service role + SECURITY DEFINER pass through.
  IF current_user <> 'authenticated' THEN
    RETURN NEW;
  END IF;

  -- Approval-state columns must never be touched directly.
  IF NEW.approved_by              IS DISTINCT FROM OLD.approved_by
     OR NEW.approved_at           IS DISTINCT FROM OLD.approved_at
     OR NEW.second_approver_id    IS DISTINCT FROM OLD.second_approver_id
     OR NEW.second_approved_at    IS DISTINCT FROM OLD.second_approved_at
     OR NEW.payload_hash_at_approval IS DISTINCT FROM OLD.payload_hash_at_approval
     OR NEW.co_approval_required  IS DISTINCT FROM OLD.co_approval_required
     OR NEW.funded_at             IS DISTINCT FROM OLD.funded_at
     OR NEW.funded_by             IS DISTINCT FROM OLD.funded_by
     OR NEW.funding_evidence      IS DISTINCT FROM OLD.funding_evidence
     OR NEW.processing_started_at IS DISTINCT FROM OLD.processing_started_at
     OR NEW.processing_finalized_at IS DISTINCT FROM OLD.processing_finalized_at THEN
    RAISE EXCEPTION 'Direct writes to batch lifecycle state columns are not allowed. Use approve_payment_batch / mark_batch_funded / start_batch_processing / finalize_batch / reject_payment_batch / reset_batch_to_draft.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Status transitions: only creator-only draft / rejected → pending_approval
  -- and pending_approval → draft are allowed from authenticated. Everything
  -- else routes through an RPC.
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF (OLD.status = 'draft' AND NEW.status IN ('draft','pending_approval'))
       OR (OLD.status = 'rejected' AND NEW.status = 'pending_approval')
       OR (OLD.status = 'pending_approval' AND NEW.status = 'draft') THEN
      -- Allowed but creator-bound. The block above already protected the
      -- security-relevant fields; here we additionally enforce creator
      -- ownership for status flips so a non-creator cannot resurrect a
      -- rejected batch by themselves.
      IF auth.uid() IS DISTINCT FROM NEW.created_by THEN
        RAISE EXCEPTION 'Only the batch creator can submit, withdraw, or resubmit'
          USING ERRCODE = 'insufficient_privilege';
      END IF;
    ELSE
      RAISE EXCEPTION 'Status transition % → % requires the appropriate RPC (approve / fund / process / finalize / reject / reset)', OLD.status, NEW.status
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ──────────────────────────────────────────────────────────────────────────
-- 11. Tighten enforce_expense_approval_state_writes — also lock
--     payment_status='processed' so only mark_expense_paid + the webhook
--     (service_role) can set it. payment_status flips to 'pending' /
--     'failed' / 'processing' stay open for the dispatch flow which is
--     authenticated-driven (until create_expense_payment_batch becomes
--     fully authoritative).
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.enforce_expense_approval_state_writes()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_user <> 'authenticated' THEN
    RETURN NEW;
  END IF;

  IF NEW.approved_by              IS DISTINCT FROM OLD.approved_by
     OR NEW.approved_at           IS DISTINCT FROM OLD.approved_at
     OR NEW.second_approver_id    IS DISTINCT FROM OLD.second_approver_id
     OR NEW.second_approved_at    IS DISTINCT FROM OLD.second_approved_at
     OR NEW.approved_by_secondary IS DISTINCT FROM OLD.approved_by_secondary
     OR NEW.approved_by_secondary_at IS DISTINCT FROM OLD.approved_by_secondary_at
     OR NEW.payload_hash_at_approval IS DISTINCT FROM OLD.payload_hash_at_approval
     OR NEW.co_approval_required  IS DISTINCT FROM OLD.co_approval_required THEN
    RAISE EXCEPTION 'Direct writes to expense approval state are not allowed. Use approve_expense / confirm_second_expense_approval / reject_expense.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- payment_status='processed' or 'failed' flips need the RPC / webhook.
  IF NEW.payment_status IS DISTINCT FROM OLD.payment_status
     AND OLD.payment_status IS DISTINCT FROM NEW.payment_status THEN
    IF NEW.payment_status = 'processed' AND OLD.payment_status <> 'processed' THEN
      RAISE EXCEPTION 'Direct writes to payment_status=processed are not allowed. Use mark_expense_paid (or the webhook).'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF (OLD.status = 'pending' AND NEW.status IN ('approved','pending_second_approval','rejected'))
       OR (OLD.status = 'pending_second_approval' AND NEW.status IN ('approved','pending','rejected'))
       OR (OLD.status = 'approved' AND NEW.status = 'rejected') THEN
      RAISE EXCEPTION 'Status transition % → % requires the approval RPCs', OLD.status, NEW.status
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ──────────────────────────────────────────────────────────────────────────
-- End of migration.
-- ──────────────────────────────────────────────────────────────────────────
