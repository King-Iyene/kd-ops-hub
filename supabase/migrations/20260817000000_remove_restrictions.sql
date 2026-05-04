-- =============================================================================
-- Remove restrictions migration
--
-- Removes:
--   A.  Step-up TOTP authentication (tables, RPCs, approval RPC overloads)
--   B2. batches_distinct_approvers CHECK constraint
--   B6. payment_batches_approval_state_lock + expenses_approval_state_lock
--       triggers and enforce_batch_approval_state_writes function
--   C5. Super-admin self-edit/self-delete blocks in set_transfer_limit /
--       delete_transfer_limit
--   C6. 90-day hard limit on user-level override expiry in set_transfer_limit
--
-- Recreates the 6 approval RPCs with their original (uuid, text) signatures
-- (no step-up token parameter).
-- Recreates set_transfer_limit and delete_transfer_limit without C5/C6.
-- All other business logic is preserved unchanged.
-- =============================================================================


-- =============================================================================
-- Part 1 — Remove step-up tables and RPCs
-- =============================================================================

-- Drop step-up approval RPC overloads (uuid, uuid, text) — added by 20260816.
DROP FUNCTION IF EXISTS public.approve_payment_batch(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.confirm_second_approval(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.reject_payment_batch(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.approve_expense(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.confirm_second_expense_approval(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.reject_expense(uuid, uuid, text);

-- Drop step-up helper RPCs.
DROP FUNCTION IF EXISTS public.create_step_up_session(text, text, text, uuid, text, text);
DROP FUNCTION IF EXISTS public.consume_step_up_token(uuid, text, uuid);

-- Drop step-up tables.
DROP TABLE IF EXISTS public.step_up_sessions;
DROP TABLE IF EXISTS public.step_up_failures;


-- =============================================================================
-- Part 2 — Remove B2: distinct-approver CHECK constraint
-- =============================================================================

ALTER TABLE public.payment_batches
  DROP CONSTRAINT IF EXISTS batches_distinct_approvers;


-- =============================================================================
-- Part 3 — Remove B6: approval-state-write triggers and function
-- =============================================================================

DROP TRIGGER IF EXISTS payment_batches_approval_state_lock ON public.payment_batches;
DROP TRIGGER IF EXISTS expenses_approval_state_lock        ON public.expenses;
DROP FUNCTION IF EXISTS public.enforce_batch_approval_state_writes();


-- =============================================================================
-- Part 4 — Recreate approval RPCs (original signatures, no step-up)
--
-- Business logic is identical to the pre-step-up version from migrations
-- 20260811000000 and 20260811100000.  The only change is that
-- consume_step_up_token calls are removed from each function.
-- =============================================================================

-- ── approve_payment_batch ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.approve_payment_batch(
  p_batch_id        uuid,
  p_idempotency_key text DEFAULT NULL
)
RETURNS public.payment_batches
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch          public.payment_batches;
  v_caller         uuid := auth.uid();
  v_caller_role    text;
  v_eligible_roles jsonb;
  v_threshold      numeric;
  v_co_required    boolean;
  v_hash           text;
  v_cap_check      record;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_batch FROM public.payment_batches
   WHERE id = p_batch_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Batch % not found', p_batch_id;
  END IF;

  IF v_batch.status <> 'pending_approval' THEN
    RAISE EXCEPTION 'Batch is not pending approval (current status: %)', v_batch.status
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT role INTO v_caller_role FROM public.profiles
   WHERE id = v_caller AND COALESCE(status, 'active') = 'active';
  IF v_caller_role IS NULL THEN
    RAISE EXCEPTION 'Caller is not an active user' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_batch.created_by = v_caller THEN
    IF v_caller_role NOT IN ('admin', 'super_admin') THEN
      RAISE EXCEPTION 'Self-approval is not allowed for your role'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSE
    SELECT eligible_roles INTO v_eligible_roles
      FROM public.approver_pools
     WHERE action_type = 'payment_batch' AND tier = 'first';
    IF EXISTS (SELECT 1 FROM public.profiles
                WHERE id = v_batch.created_by AND role IN ('admin','super_admin')) THEN
      v_eligible_roles := '["super_admin"]'::jsonb;
    END IF;
    IF NOT (v_eligible_roles ? v_caller_role) THEN
      RAISE EXCEPTION 'Your role (%) is not eligible as first approver for this batch', v_caller_role
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  SELECT * INTO v_cap_check
    FROM public.check_transfer_caps(v_caller, COALESCE(v_batch.total_amount, 0));
  IF NOT v_cap_check.allowed THEN
    RAISE EXCEPTION 'Approval blocked by transfer cap: %', v_cap_check.reason
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_hash      := public.canonical_batch_payload_hash(p_batch_id);
  v_threshold := public.effective_co_approval_threshold(v_caller);
  v_co_required := (v_threshold IS NOT NULL AND v_batch.total_amount > v_threshold);

  IF v_co_required THEN
    UPDATE public.payment_batches SET
      approved_by              = v_caller,
      approved_at              = now(),
      payload_hash_at_approval = v_hash,
      co_approval_required     = true,
      status                   = 'pending_second_approval'
    WHERE id = p_batch_id
    RETURNING * INTO v_batch;

    INSERT INTO public.notifications (user_id, type, module, priority, title, body, link)
    SELECT a.id,
           'payment_approval_pending', 'payments', 'high',
           'Batch awaiting your second approval',
           format('"%s" — ₦%s — first-approved by %s',
                  v_batch.name,
                  to_char(v_batch.total_amount, 'FM999,999,999,999'),
                  COALESCE((SELECT full_name FROM public.profiles WHERE id = v_caller), 'an approver')),
           format('/payments/%s', p_batch_id)
      FROM public.get_eligible_approvers('payment_batch','second',v_batch.created_by, v_caller) a;
  ELSE
    UPDATE public.payment_batches SET
      approved_by              = v_caller,
      approved_at              = now(),
      payload_hash_at_approval = v_hash,
      co_approval_required     = false,
      status                   = 'approved'
    WHERE id = p_batch_id
    RETURNING * INTO v_batch;
  END IF;

  INSERT INTO public.transfer_audit (
    actor_id, actor_role, action, outcome, amount_ngn, reference, metadata
  ) VALUES (
    v_caller, v_caller_role, 'batch_approved', 'ok', v_batch.total_amount, p_batch_id::text,
    jsonb_build_object(
      'batch_id', p_batch_id, 'co_required', v_co_required,
      'threshold_ngn', v_threshold, 'self_approval', v_batch.created_by = v_caller,
      'idempotency_key', p_idempotency_key
    )
  );
  INSERT INTO public.audit_logs (action_type, description, performed_by, performed_by_name)
  VALUES (
    'batch_approved',
    format('Batch "%s" first-approved (₦%s) — co_required=%s, self_approval=%s',
           v_batch.name, to_char(v_batch.total_amount, 'FM999,999,999,999'),
           v_co_required, v_batch.created_by = v_caller),
    v_caller,
    (SELECT full_name FROM public.profiles WHERE id = v_caller)
  );

  RETURN v_batch;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.approve_payment_batch(uuid, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.approve_payment_batch(uuid, text)
  TO authenticated, service_role;


-- ── confirm_second_approval ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.confirm_second_approval(
  p_batch_id        uuid,
  p_idempotency_key text DEFAULT NULL
)
RETURNS public.payment_batches
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch          public.payment_batches;
  v_caller         uuid := auth.uid();
  v_caller_role    text;
  v_eligible_roles jsonb;
  v_current_hash   text;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_batch FROM public.payment_batches
   WHERE id = p_batch_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Batch % not found', p_batch_id;
  END IF;

  IF v_batch.status <> 'pending_second_approval' THEN
    RAISE EXCEPTION 'Batch is not awaiting second approval (current status: %)', v_batch.status
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF v_caller = v_batch.created_by THEN
    RAISE EXCEPTION 'Submitter cannot second-approve their own batch'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_caller = v_batch.approved_by THEN
    RAISE EXCEPTION 'Second approval must come from a different approver'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT role INTO v_caller_role FROM public.profiles
   WHERE id = v_caller AND COALESCE(status, 'active') = 'active';
  IF v_caller_role IS NULL THEN
    RAISE EXCEPTION 'Caller is not an active user' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT eligible_roles INTO v_eligible_roles
    FROM public.approver_pools
   WHERE action_type = 'payment_batch' AND tier = 'second';
  IF NOT (v_eligible_roles ? v_caller_role) THEN
    RAISE EXCEPTION 'Your role (%) is not eligible as second approver', v_caller_role
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_current_hash := public.canonical_batch_payload_hash(p_batch_id);
  IF v_current_hash IS DISTINCT FROM v_batch.payload_hash_at_approval THEN
    UPDATE public.payment_batches SET
      status                   = 'pending_approval',
      approved_by              = NULL, approved_at = NULL,
      payload_hash_at_approval = NULL, co_approval_required = false
    WHERE id = p_batch_id;
    INSERT INTO public.transfer_audit (
      actor_id, actor_role, action, outcome, amount_ngn, reference, metadata, reason
    ) VALUES (
      v_caller, v_caller_role, 'batch_approval_invalidated', 'denied',
      v_batch.total_amount, p_batch_id::text,
      jsonb_build_object('batch_id', p_batch_id),
      'Payload changed since first approval'
    );
    RAISE EXCEPTION 'Batch payload changed since first approval. Re-approval required.'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  UPDATE public.payment_batches SET
    second_approver_id = v_caller,
    second_approved_at = now(),
    status             = 'approved'
  WHERE id = p_batch_id
  RETURNING * INTO v_batch;

  INSERT INTO public.transfer_audit (
    actor_id, actor_role, action, outcome, amount_ngn, reference, metadata
  ) VALUES (
    v_caller, v_caller_role, 'batch_second_approved', 'ok', v_batch.total_amount, p_batch_id::text,
    jsonb_build_object('batch_id', p_batch_id, 'idempotency_key', p_idempotency_key)
  );
  INSERT INTO public.audit_logs (action_type, description, performed_by, performed_by_name)
  VALUES (
    'batch_second_approved',
    format('Batch "%s" second-approved by %s (₦%s)',
           v_batch.name, (SELECT full_name FROM public.profiles WHERE id = v_caller),
           to_char(v_batch.total_amount, 'FM999,999,999,999')),
    v_caller,
    (SELECT full_name FROM public.profiles WHERE id = v_caller)
  );

  IF v_batch.created_by IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, type, module, priority, title, body, link)
    VALUES (
      v_batch.created_by, 'batch_approved', 'payments', 'normal',
      'Your batch was fully approved',
      format('"%s" — ₦%s', v_batch.name, to_char(v_batch.total_amount, 'FM999,999,999,999')),
      format('/payments/%s', p_batch_id)
    );
  END IF;

  RETURN v_batch;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.confirm_second_approval(uuid, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.confirm_second_approval(uuid, text)
  TO authenticated, service_role;


-- ── reject_payment_batch ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reject_payment_batch(
  p_batch_id uuid,
  p_reason   text
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
  v_pool_first  jsonb;
  v_pool_second jsonb;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) < 5 THEN
    RAISE EXCEPTION 'Rejection reason is required (min 5 chars)';
  END IF;

  SELECT * INTO v_batch FROM public.payment_batches
   WHERE id = p_batch_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Batch % not found', p_batch_id;
  END IF;

  IF v_batch.status NOT IN ('pending_approval','pending_second_approval') THEN
    RAISE EXCEPTION 'Cannot reject batch in status %', v_batch.status;
  END IF;

  SELECT role INTO v_caller_role FROM public.profiles
   WHERE id = v_caller AND COALESCE(status, 'active') = 'active';
  IF v_caller_role IS NULL THEN
    RAISE EXCEPTION 'Caller is not an active user' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT eligible_roles INTO v_pool_first  FROM public.approver_pools
   WHERE action_type='payment_batch' AND tier='first';
  SELECT eligible_roles INTO v_pool_second FROM public.approver_pools
   WHERE action_type='payment_batch' AND tier='second';
  IF NOT (v_pool_first ? v_caller_role OR v_pool_second ? v_caller_role) THEN
    RAISE EXCEPTION 'Your role is not eligible to reject payment batches'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.payment_batches SET
    status                   = 'rejected',
    rejection_reason         = trim(p_reason),
    approved_by              = NULL, approved_at = NULL,
    second_approver_id       = NULL, second_approved_at = NULL,
    payload_hash_at_approval = NULL, co_approval_required = false
  WHERE id = p_batch_id
  RETURNING * INTO v_batch;

  INSERT INTO public.transfer_audit (
    actor_id, actor_role, action, outcome, amount_ngn, reference, metadata, reason
  ) VALUES (
    v_caller, v_caller_role, 'batch_rejected', 'denied', v_batch.total_amount, p_batch_id::text,
    jsonb_build_object('batch_id', p_batch_id), trim(p_reason)
  );
  INSERT INTO public.audit_logs (action_type, description, performed_by, performed_by_name)
  VALUES (
    'batch_rejected',
    format('Batch "%s" rejected: %s', v_batch.name, trim(p_reason)),
    v_caller,
    (SELECT full_name FROM public.profiles WHERE id = v_caller)
  );

  RETURN v_batch;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reject_payment_batch(uuid, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.reject_payment_batch(uuid, text)
  TO authenticated, service_role;


-- ── approve_expense ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.approve_expense(
  p_expense_id      uuid,
  p_idempotency_key text DEFAULT NULL
)
RETURNS public.expenses
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expense        public.expenses;
  v_caller         uuid := auth.uid();
  v_caller_role    text;
  v_eligible_roles jsonb;
  v_threshold      numeric;
  v_co_required    boolean;
  v_dual_threshold numeric;
  v_hash           text;
  v_cap_check      record;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_expense FROM public.expenses
   WHERE id = p_expense_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Expense % not found', p_expense_id; END IF;

  IF v_expense.status <> 'pending' THEN
    RAISE EXCEPTION 'Expense is not pending (current status: %)', v_expense.status;
  END IF;

  SELECT role INTO v_caller_role FROM public.profiles
   WHERE id = v_caller AND COALESCE(status, 'active') = 'active';
  IF v_caller_role IS NULL THEN
    RAISE EXCEPTION 'Caller is not an active user' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_expense.submitted_by = v_caller THEN
    IF v_caller_role NOT IN ('super_admin', 'admin') THEN
      RAISE EXCEPTION 'Self-approval is not allowed for your role'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSE
    SELECT eligible_roles INTO v_eligible_roles
      FROM public.approver_pools
     WHERE action_type = 'expense_payment' AND tier = 'first';
    IF EXISTS (SELECT 1 FROM public.profiles
                WHERE id = v_expense.submitted_by AND role IN ('admin','super_admin')) THEN
      v_eligible_roles := '["super_admin"]'::jsonb;
    END IF;
    IF NOT (v_eligible_roles ? v_caller_role) THEN
      RAISE EXCEPTION 'Your role (%) is not eligible as first approver for expenses', v_caller_role
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  SELECT * INTO v_cap_check
    FROM public.check_transfer_caps(v_caller, COALESCE(v_expense.amount_ngn, 0));
  IF NOT v_cap_check.allowed THEN
    RAISE EXCEPTION 'Approval blocked by transfer cap: %', v_cap_check.reason
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_hash := public.canonical_expense_payload_hash(p_expense_id);

  SELECT dual_approval_threshold_ngn INTO v_dual_threshold
    FROM public.company_settings WHERE id = '00000000-0000-0000-0000-000000000001';
  v_threshold   := public.effective_co_approval_threshold(v_caller);
  v_co_required := (
    (v_dual_threshold IS NOT NULL AND v_dual_threshold > 0
       AND v_expense.amount_ngn >= v_dual_threshold)
    OR (v_threshold IS NOT NULL AND v_expense.amount_ngn > v_threshold)
  );

  IF v_co_required THEN
    UPDATE public.expenses SET
      status                   = 'pending_second_approval',
      approved_by              = v_caller, approved_at = now(),
      payload_hash_at_approval = v_hash, co_approval_required = true
    WHERE id = p_expense_id
    RETURNING * INTO v_expense;

    INSERT INTO public.notifications (user_id, type, module, priority, title, body, link)
    SELECT a.id, 'expense_approval_pending', 'expenses', 'high',
           'Expense awaiting your second approval',
           format('₦%s — first-approved by %s',
                  to_char(v_expense.amount_ngn, 'FM999,999,999,999'),
                  COALESCE((SELECT full_name FROM public.profiles WHERE id = v_caller), 'an approver')),
           '/expenses'
      FROM public.get_eligible_approvers('expense_payment','second',v_expense.submitted_by, v_caller) a;
  ELSE
    UPDATE public.expenses SET
      status                   = 'approved',
      approved_by              = v_caller, approved_at = now(),
      payload_hash_at_approval = v_hash, co_approval_required = false
    WHERE id = p_expense_id
    RETURNING * INTO v_expense;
  END IF;

  INSERT INTO public.transfer_audit (
    actor_id, actor_role, action, outcome, amount_ngn, reference, metadata
  ) VALUES (
    v_caller, v_caller_role, 'expense_approved', 'ok', v_expense.amount_ngn, p_expense_id::text,
    jsonb_build_object(
      'expense_id', p_expense_id, 'co_required', v_co_required,
      'self_approval', v_expense.submitted_by = v_caller,
      'idempotency_key', p_idempotency_key
    )
  );
  INSERT INTO public.audit_logs (action_type, description, performed_by, performed_by_name)
  VALUES (
    'expense_approved',
    format('Expense %s first-approved (₦%s) — co_required=%s, self_approval=%s',
           p_expense_id, to_char(v_expense.amount_ngn, 'FM999,999,999,999'),
           v_co_required, v_expense.submitted_by = v_caller),
    v_caller,
    (SELECT full_name FROM public.profiles WHERE id = v_caller)
  );

  RETURN v_expense;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.approve_expense(uuid, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.approve_expense(uuid, text)
  TO authenticated, service_role;


-- ── confirm_second_expense_approval ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.confirm_second_expense_approval(
  p_expense_id      uuid,
  p_idempotency_key text DEFAULT NULL
)
RETURNS public.expenses
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expense        public.expenses;
  v_caller         uuid := auth.uid();
  v_caller_role    text;
  v_eligible_roles jsonb;
  v_current_hash   text;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_expense FROM public.expenses
   WHERE id = p_expense_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Expense % not found', p_expense_id; END IF;

  IF v_expense.status <> 'pending_second_approval' THEN
    RAISE EXCEPTION 'Expense is not awaiting second approval (status: %)', v_expense.status;
  END IF;

  IF v_caller = v_expense.submitted_by THEN
    RAISE EXCEPTION 'Submitter cannot second-approve their own expense'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_caller = v_expense.approved_by THEN
    RAISE EXCEPTION 'Second approval must come from a different approver'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT role INTO v_caller_role FROM public.profiles
   WHERE id = v_caller AND COALESCE(status, 'active') = 'active';
  IF v_caller_role IS NULL THEN
    RAISE EXCEPTION 'Caller is not an active user' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT eligible_roles INTO v_eligible_roles
    FROM public.approver_pools
   WHERE action_type='expense_payment' AND tier='second';
  IF NOT (v_eligible_roles ? v_caller_role) THEN
    RAISE EXCEPTION 'Your role (%) is not eligible as second approver for expenses', v_caller_role
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_current_hash := public.canonical_expense_payload_hash(p_expense_id);
  IF v_current_hash IS DISTINCT FROM v_expense.payload_hash_at_approval THEN
    UPDATE public.expenses SET
      status                   = 'pending', approved_by = NULL, approved_at = NULL,
      payload_hash_at_approval = NULL, co_approval_required = false
    WHERE id = p_expense_id;
    RAISE EXCEPTION 'Expense payload changed since first approval. Re-approval required.';
  END IF;

  UPDATE public.expenses SET
    second_approver_id       = v_caller, second_approved_at = now(),
    approved_by_secondary    = v_caller, approved_by_secondary_at = now(),
    status                   = 'approved'
  WHERE id = p_expense_id
  RETURNING * INTO v_expense;

  INSERT INTO public.transfer_audit (
    actor_id, actor_role, action, outcome, amount_ngn, reference, metadata
  ) VALUES (
    v_caller, v_caller_role, 'expense_second_approved', 'ok', v_expense.amount_ngn, p_expense_id::text,
    jsonb_build_object('expense_id', p_expense_id, 'idempotency_key', p_idempotency_key)
  );
  INSERT INTO public.audit_logs (action_type, description, performed_by, performed_by_name)
  VALUES (
    'expense_second_approved',
    format('Expense %s second-approved (₦%s)', p_expense_id,
           to_char(v_expense.amount_ngn, 'FM999,999,999,999')),
    v_caller,
    (SELECT full_name FROM public.profiles WHERE id = v_caller)
  );

  RETURN v_expense;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.confirm_second_expense_approval(uuid, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.confirm_second_expense_approval(uuid, text)
  TO authenticated, service_role;


-- ── reject_expense ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reject_expense(
  p_expense_id uuid,
  p_reason     text
)
RETURNS public.expenses
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expense     public.expenses;
  v_caller      uuid := auth.uid();
  v_caller_role text;
  v_pool_first  jsonb;
  v_pool_second jsonb;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) < 5 THEN
    RAISE EXCEPTION 'Rejection reason is required (min 5 chars)';
  END IF;

  SELECT * INTO v_expense FROM public.expenses
   WHERE id = p_expense_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Expense % not found', p_expense_id; END IF;

  IF v_expense.status NOT IN ('pending','pending_second_approval') THEN
    RAISE EXCEPTION 'Cannot reject expense in status %', v_expense.status;
  END IF;

  SELECT role INTO v_caller_role FROM public.profiles
   WHERE id = v_caller AND COALESCE(status, 'active') = 'active';
  IF v_caller_role IS NULL THEN
    RAISE EXCEPTION 'Caller is not an active user' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT eligible_roles INTO v_pool_first  FROM public.approver_pools
   WHERE action_type='expense_payment' AND tier='first';
  SELECT eligible_roles INTO v_pool_second FROM public.approver_pools
   WHERE action_type='expense_payment' AND tier='second';
  IF NOT (v_pool_first ? v_caller_role OR v_pool_second ? v_caller_role) THEN
    RAISE EXCEPTION 'Your role is not eligible to reject expenses'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.expenses SET
    status                   = 'rejected', rejection_reason = trim(p_reason),
    approved_by              = NULL, approved_at = NULL,
    second_approver_id       = NULL, second_approved_at = NULL,
    payload_hash_at_approval = NULL, co_approval_required = false
  WHERE id = p_expense_id
  RETURNING * INTO v_expense;

  INSERT INTO public.audit_logs (action_type, description, performed_by, performed_by_name)
  VALUES (
    'expense_rejected',
    format('Expense %s rejected: %s', p_expense_id, trim(p_reason)),
    v_caller,
    (SELECT full_name FROM public.profiles WHERE id = v_caller)
  );

  RETURN v_expense;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reject_expense(uuid, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.reject_expense(uuid, text)
  TO authenticated, service_role;


-- =============================================================================
-- Part 5 — Recreate set_transfer_limit without C5 (self-edit) and C6 (90-day)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.set_transfer_limit(
  p_id           uuid        DEFAULT NULL,
  p_role         text        DEFAULT NULL,
  p_user_id      uuid        DEFAULT NULL,
  p_single       numeric     DEFAULT NULL,
  p_daily        numeric     DEFAULT NULL,
  p_monthly      numeric     DEFAULT NULL,
  p_co_approval  numeric     DEFAULT NULL,
  p_batch        numeric     DEFAULT NULL,
  p_expires_at   timestamptz DEFAULT NULL,
  p_reason       text        DEFAULT NULL,
  p_ip_hash      text        DEFAULT NULL,
  p_user_agent   text        DEFAULT NULL
)
RETURNS public.transfer_limits
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller      uuid;
  v_caller_role text;
  v_old_row     public.transfer_limits;
  v_new_row     public.transfer_limits;
  v_kind        text;
  v_expires     timestamptz;
BEGIN
  -- ── Auth ──────────────────────────────────────────────────────────────────
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_caller_role := public.current_user_role();
  IF v_caller_role IS DISTINCT FROM 'super_admin' THEN
    RAISE EXCEPTION 'Only super_admin can manage transfer limits'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── Mutual exclusivity: exactly one of p_id, p_user_id, p_role ───────────
  IF p_id IS NULL AND p_user_id IS NULL AND p_role IS NULL THEN
    RAISE EXCEPTION 'Supply p_id (to update existing row), p_user_id (user override), or p_role (role default)';
  END IF;

  -- ── User-override path ────────────────────────────────────────────────────
  IF p_user_id IS NOT NULL THEN
    v_kind := 'user';

    -- Reason is mandatory for per-user overrides.
    IF p_reason IS NULL OR length(trim(p_reason)) < 5 THEN
      RAISE EXCEPTION 'A reason of at least 5 characters is required when setting a user-level override';
    END IF;

    -- Default expiry: 30 days.  No hard upper limit.
    v_expires := COALESCE(p_expires_at, now() + interval '30 days');

  -- ── Role-default path ─────────────────────────────────────────────────────
  ELSIF p_role IS NOT NULL THEN
    v_kind    := 'role';
    v_expires := NULL;  -- Role defaults never expire.

  -- ── p_id path (update by primary key) ────────────────────────────────────
  ELSE
    v_kind    := 'id';
    v_expires := p_expires_at;
  END IF;

  -- ── Capture old row for audit (if updating) ───────────────────────────────
  IF p_id IS NOT NULL THEN
    SELECT * INTO v_old_row FROM public.transfer_limits WHERE id = p_id;
  ELSIF p_user_id IS NOT NULL THEN
    SELECT * INTO v_old_row FROM public.transfer_limits WHERE user_id = p_user_id;
  ELSIF p_role IS NOT NULL THEN
    SELECT * INTO v_old_row FROM public.transfer_limits
     WHERE role = p_role AND user_id IS NULL;
  END IF;

  -- ── Upsert ────────────────────────────────────────────────────────────────
  BEGIN
    IF p_id IS NOT NULL THEN
      UPDATE public.transfer_limits SET
        single_txn_limit_ngn     = COALESCE(p_single,      single_txn_limit_ngn),
        daily_limit_ngn          = COALESCE(p_daily,       daily_limit_ngn),
        monthly_limit_ngn        = COALESCE(p_monthly,     monthly_limit_ngn),
        co_approval_threshold_ngn= COALESCE(p_co_approval, co_approval_threshold_ngn),
        single_batch_limit_ngn   = COALESCE(p_batch,       single_batch_limit_ngn),
        expires_at               = CASE WHEN v_kind = 'id' THEN v_expires
                                        ELSE expires_at END,
        granted_by               = v_caller,
        granted_reason           = COALESCE(p_reason, granted_reason),
        updated_at               = now()
      WHERE id = p_id
      RETURNING * INTO v_new_row;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'transfer_limits row % not found', p_id;
      END IF;

    ELSIF p_user_id IS NOT NULL THEN
      INSERT INTO public.transfer_limits (
        user_id, role,
        single_txn_limit_ngn, daily_limit_ngn, monthly_limit_ngn,
        co_approval_threshold_ngn, single_batch_limit_ngn,
        expires_at, granted_by, granted_reason,
        updated_at
      ) VALUES (
        p_user_id,
        (SELECT role FROM public.profiles WHERE id = p_user_id),
        p_single, p_daily, p_monthly, p_co_approval, p_batch,
        v_expires, v_caller, p_reason,
        now()
      )
      ON CONFLICT ON CONSTRAINT transfer_limits_user_uq DO UPDATE SET
        single_txn_limit_ngn      = COALESCE(EXCLUDED.single_txn_limit_ngn,      transfer_limits.single_txn_limit_ngn),
        daily_limit_ngn           = COALESCE(EXCLUDED.daily_limit_ngn,           transfer_limits.daily_limit_ngn),
        monthly_limit_ngn         = COALESCE(EXCLUDED.monthly_limit_ngn,         transfer_limits.monthly_limit_ngn),
        co_approval_threshold_ngn = COALESCE(EXCLUDED.co_approval_threshold_ngn, transfer_limits.co_approval_threshold_ngn),
        single_batch_limit_ngn    = COALESCE(EXCLUDED.single_batch_limit_ngn,    transfer_limits.single_batch_limit_ngn),
        expires_at                = EXCLUDED.expires_at,
        granted_by                = EXCLUDED.granted_by,
        granted_reason            = EXCLUDED.granted_reason,
        updated_at                = now()
      RETURNING * INTO v_new_row;

    ELSE
      INSERT INTO public.transfer_limits (
        role, user_id,
        single_txn_limit_ngn, daily_limit_ngn, monthly_limit_ngn,
        co_approval_threshold_ngn, single_batch_limit_ngn,
        expires_at, granted_by, granted_reason,
        updated_at
      ) VALUES (
        p_role, NULL,
        p_single, p_daily, p_monthly, p_co_approval, p_batch,
        NULL, v_caller, p_reason,
        now()
      )
      ON CONFLICT ON CONSTRAINT transfer_limits_role_default_uq DO UPDATE SET
        single_txn_limit_ngn      = COALESCE(EXCLUDED.single_txn_limit_ngn,      transfer_limits.single_txn_limit_ngn),
        daily_limit_ngn           = COALESCE(EXCLUDED.daily_limit_ngn,           transfer_limits.daily_limit_ngn),
        monthly_limit_ngn         = COALESCE(EXCLUDED.monthly_limit_ngn,         transfer_limits.monthly_limit_ngn),
        co_approval_threshold_ngn = COALESCE(EXCLUDED.co_approval_threshold_ngn, transfer_limits.co_approval_threshold_ngn),
        single_batch_limit_ngn    = COALESCE(EXCLUDED.single_batch_limit_ngn,    transfer_limits.single_batch_limit_ngn),
        granted_by                = EXCLUDED.granted_by,
        granted_reason            = EXCLUDED.granted_reason,
        updated_at                = now()
      RETURNING * INTO v_new_row;
    END IF;

  EXCEPTION
    WHEN check_violation THEN
      RAISE EXCEPTION 'Cap ordering violated: single_txn_limit_ngn must be <= daily_limit_ngn <= monthly_limit_ngn, and single_batch_limit_ngn must be <= monthly_limit_ngn. Check your values and try again.'
        USING ERRCODE = 'check_violation';
  END;

  -- ── Transfer audit row ────────────────────────────────────────────────────
  INSERT INTO public.transfer_audit (
    actor_id, actor_role, action, outcome, ip_hash, user_agent, metadata
  ) VALUES (
    v_caller, v_caller_role,
    'cap_changed', 'ok',
    p_ip_hash, p_user_agent,
    jsonb_build_object(
      'kind',       v_kind,
      'target_id',  COALESCE(p_id::text, p_user_id::text, p_role),
      'before',     CASE WHEN v_old_row IS NOT NULL THEN row_to_json(v_old_row)::jsonb ELSE NULL END,
      'after',      row_to_json(v_new_row)::jsonb
    )
  );

  -- ── Generic audit log ─────────────────────────────────────────────────────
  INSERT INTO public.audit_logs (
    action_type, description, performed_by, performed_by_name
  ) VALUES (
    'transfer_limit_changed',
    format('Transfer limit %s (%s=%s): single=%s daily=%s monthly=%s batch=%s expires=%s',
           CASE WHEN v_old_row IS NULL THEN 'created' ELSE 'updated' END,
           v_kind,
           COALESCE(p_id::text, p_user_id::text, p_role, '?'),
           COALESCE(p_single::text,      '(unchanged)'),
           COALESCE(p_daily::text,       '(unchanged)'),
           COALESCE(p_monthly::text,     '(unchanged)'),
           COALESCE(p_batch::text,       '(unchanged)'),
           COALESCE(v_expires::text,     'none')),
    v_caller,
    (SELECT full_name FROM public.profiles WHERE id = v_caller)
  );

  RETURN v_new_row;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_transfer_limit(
  uuid, text, uuid, numeric, numeric, numeric, numeric, numeric,
  timestamptz, text, text, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_transfer_limit(
  uuid, text, uuid, numeric, numeric, numeric, numeric, numeric,
  timestamptz, text, text, text
) TO authenticated, service_role;


-- =============================================================================
-- Part 6 — Recreate delete_transfer_limit without C5 (self-delete blocks)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.delete_transfer_limit(
  p_id         uuid,
  p_ip_hash    text DEFAULT NULL,
  p_user_agent text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller      uuid;
  v_caller_role text;
  v_row         public.transfer_limits;
BEGIN
  -- ── Auth ──────────────────────────────────────────────────────────────────
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_caller_role := public.current_user_role();
  IF v_caller_role IS DISTINCT FROM 'super_admin' THEN
    RAISE EXCEPTION 'Only super_admin can delete transfer limits'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── Fetch the row ─────────────────────────────────────────────────────────
  SELECT * INTO v_row FROM public.transfer_limits WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'transfer_limits row % not found', p_id;
  END IF;

  -- ── Delete ────────────────────────────────────────────────────────────────
  DELETE FROM public.transfer_limits WHERE id = p_id;

  -- ── Transfer audit ────────────────────────────────────────────────────────
  INSERT INTO public.transfer_audit (
    actor_id, actor_role, action, outcome, ip_hash, user_agent, metadata
  ) VALUES (
    v_caller, v_caller_role,
    'cap_deleted', 'ok',
    p_ip_hash, p_user_agent,
    jsonb_build_object(
      'deleted_id',   p_id,
      'was_user_id',  v_row.user_id,
      'was_role',     v_row.role,
      'before',       row_to_json(v_row)::jsonb
    )
  );

  -- ── Generic audit log ─────────────────────────────────────────────────────
  INSERT INTO public.audit_logs (
    action_type, description, performed_by, performed_by_name
  ) VALUES (
    'transfer_limit_deleted',
    format('Transfer limit deleted: id=%s (role=%s user_id=%s)',
           p_id, COALESCE(v_row.role,'—'), COALESCE(v_row.user_id::text,'—')),
    v_caller,
    (SELECT full_name FROM public.profiles WHERE id = v_caller)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.delete_transfer_limit(uuid, text, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.delete_transfer_limit(uuid, text, text)
  TO authenticated, service_role;

-- End of migration.
