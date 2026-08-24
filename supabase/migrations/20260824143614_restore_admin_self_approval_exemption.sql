-- Explicit product decision by the super_admin owner: admin/super_admin
-- should be able to self-approve payroll runs, payment batches, and
-- expenses. Restores the exemption removed in
-- close_payroll_self_approval_bypass / close_batch_and_expense_self_approval_bypass,
-- for admin/super_admin only — every other role is still blocked from
-- approving their own submission.

CREATE OR REPLACE FUNCTION public.approve_payroll_run(p_run_id uuid)
RETURNS public.payroll_runs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_run           public.payroll_runs;
  v_caller        uuid := auth.uid();
  v_caller_role   text;
  v_sched         public.pay_schedules%ROWTYPE;
  v_auto_disburse timestamptz;
BEGIN
  SELECT * INTO v_run FROM public.payroll_runs WHERE id = p_run_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payroll run % not found', p_run_id;
  END IF;

  SELECT role INTO v_caller_role FROM public.profiles
   WHERE id = v_caller AND COALESCE(status, 'active') = 'active';
  IF v_caller_role IS NULL THEN
    RAISE EXCEPTION 'Caller is not an active user' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_caller_role NOT IN ('super_admin', 'admin', 'finance') THEN
    RAISE EXCEPTION 'Your role is not permitted to approve payroll runs'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_run.created_by = v_caller AND v_caller_role NOT IN ('admin', 'super_admin') THEN
    RAISE EXCEPTION 'Self-approval is not allowed for your role — the person who drafted this run cannot approve it'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_run.scheduled_disburse_at IS NULL AND v_run.pay_date IS NOT NULL THEN
    v_sched.auto_disburse_hour_local := 8;
    v_sched.auto_schedule_disbursement := true;
    IF v_run.pay_schedule_id IS NOT NULL THEN
      SELECT * INTO v_sched FROM public.pay_schedules WHERE id = v_run.pay_schedule_id;
    END IF;

    IF COALESCE(v_sched.auto_schedule_disbursement, true) THEN
      v_auto_disburse := (v_run.pay_date::timestamp + make_interval(hours => COALESCE(v_sched.auto_disburse_hour_local, 8)))
                            AT TIME ZONE 'Africa/Lagos';
      IF v_auto_disburse > now() THEN
        v_run.scheduled_disburse_at := v_auto_disburse;
      END IF;
    END IF;
  END IF;

  UPDATE public.payroll_runs
     SET status = 'approved', approved_by = v_caller,
         scheduled_disburse_at = v_run.scheduled_disburse_at,
         updated_at = now()
   WHERE id = p_run_id
   RETURNING * INTO v_run;

  RETURN v_run;
END;
$function$;

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
$function$;
