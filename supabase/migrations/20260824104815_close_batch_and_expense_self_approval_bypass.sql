-- Same self-approval bypass pattern as approve_payroll_run: admin/super_admin
-- were exempt from the self-approval block on payment batches and expenses —
-- real money-movement approvals, not just payroll. Below the co-approval
-- threshold, an admin/super_admin could single-handedly create AND approve
-- a batch or expense with zero second check. Removing only the role
-- carve-out; step-up, co-approval threshold, transfer caps, and audit
-- logging are all untouched.

CREATE OR REPLACE FUNCTION public.approve_payment_batch(
  p_batch_id        uuid,
  p_step_up_token   uuid DEFAULT NULL::uuid,
  p_idempotency_key text DEFAULT NULL::text
)
RETURNS public.payment_batches
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_batch          public.payment_batches;
  v_caller         uuid := auth.uid();
  v_caller_role    text;
  v_eligible_roles jsonb;
  v_threshold      numeric;
  v_co_required    boolean;
  v_hash           text;
  v_cap_check      record;
  v_step_up_on     boolean;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT approval_step_up_required INTO v_step_up_on
    FROM public.company_settings WHERE id = '00000000-0000-0000-0000-000000000001';
  IF COALESCE(v_step_up_on, false) THEN
    IF p_step_up_token IS NULL
       OR NOT public.consume_step_up_token(p_step_up_token, 'approve_batch', p_batch_id) THEN
      RAISE EXCEPTION 'step_up_required: Step-up token invalid, expired, or already consumed'
        USING ERRCODE = 'P0003';
    END IF;
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
    RAISE EXCEPTION 'Self-approval is not allowed — the person who created this batch cannot approve it, regardless of role'
      USING ERRCODE = 'insufficient_privilege';
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
      'idempotency_key', p_idempotency_key, 'step_up_used', COALESCE(v_step_up_on, false)
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
$function$;

CREATE OR REPLACE FUNCTION public.approve_expense(
  p_expense_id      uuid,
  p_step_up_token   uuid DEFAULT NULL::uuid,
  p_idempotency_key text DEFAULT NULL::text
)
RETURNS public.expenses
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
  v_step_up_on     boolean;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT approval_step_up_required INTO v_step_up_on
    FROM public.company_settings WHERE id = '00000000-0000-0000-0000-000000000001';
  IF COALESCE(v_step_up_on, false) THEN
    IF p_step_up_token IS NULL
       OR NOT public.consume_step_up_token(p_step_up_token, 'approve_expense', p_expense_id) THEN
      RAISE EXCEPTION 'step_up_required: Step-up token invalid, expired, or already consumed'
        USING ERRCODE = 'P0003';
    END IF;
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
    RAISE EXCEPTION 'Self-approval is not allowed — the person who submitted this expense cannot approve it, regardless of role'
      USING ERRCODE = 'insufficient_privilege';
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
$function$;
