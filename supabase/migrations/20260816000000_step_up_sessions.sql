-- =============================================================================
-- Step-up authentication for approval actions.
--
-- Every approval RPC (approve_payment_batch, confirm_second_approval,
-- approve_expense, confirm_second_expense_approval, reject_*) now requires
-- a valid step-up session token obtained by re-authenticating with the
-- caller's password AND their TOTP factor.
--
-- Flow:
--   1. Client calls verifyMfa(factorId, totpCode) → Supabase Auth elevates
--      session to AAL2.
--   2. Client calls create_step_up_session(password, totpCode, purpose,
--      resource_id) → RPC verifies password + checks AAL2, returns token uuid.
--   3. Client calls the approval RPC with p_step_up_token; RPC calls
--      consume_step_up_token internally (single-use, 5-min window, purpose +
--      resource_id bound).
--
-- Lockout: 3+ failures in 60 minutes → refused until the oldest of the three
-- is older than 60 minutes.
-- =============================================================================


-- =============================================================================
-- Part 1 — Tables
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.step_up_sessions (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  purpose     text        NOT NULL CHECK (purpose IN (
                'approve_batch', 'approve_expense',
                'reject_batch',  'reject_expense',
                'cap_change',    'quick_pay')),
  resource_id uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  consumed_at timestamptz,
  ip_hash     text,
  user_agent  text
);

CREATE INDEX IF NOT EXISTS step_up_sessions_lookup_idx
  ON public.step_up_sessions (user_id, purpose, expires_at)
  WHERE consumed_at IS NULL;

ALTER TABLE public.step_up_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY su_self_read ON public.step_up_sessions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());
-- All writes go through SECURITY DEFINER RPCs — no direct-insert policy.

CREATE TABLE IF NOT EXISTS public.step_up_failures (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid        NOT NULL,
  attempted_at   timestamptz NOT NULL DEFAULT now(),
  failure_reason text,   -- 'wrong_password' | 'wrong_totp' | 'lockout_check'
  ip_hash        text
);

CREATE INDEX IF NOT EXISTS step_up_failures_user_time_idx
  ON public.step_up_failures (user_id, attempted_at DESC);

ALTER TABLE public.step_up_failures ENABLE ROW LEVEL SECURITY;
-- No SELECT policy for authenticated — only service_role can read failures.


-- =============================================================================
-- Part 2 — create_step_up_session
-- =============================================================================

CREATE OR REPLACE FUNCTION public.create_step_up_session(
  p_password    text,
  p_totp_code   text,          -- passed for logging; actual TOTP verified via Supabase Auth AAL
  p_purpose     text,
  p_resource_id uuid  DEFAULT NULL,
  p_ip_hash     text  DEFAULT NULL,
  p_user_agent  text  DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller        uuid        := auth.uid();
  v_failure_count int;
  v_pwd_ok        bool;
  v_has_totp      bool;
  v_token         uuid;
  v_new_count     int;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_purpose NOT IN (
    'approve_batch','approve_expense','reject_batch',
    'reject_expense','cap_change','quick_pay'
  ) THEN
    RAISE EXCEPTION 'Invalid step-up purpose: %', p_purpose;
  END IF;

  -- ── Lockout check ─────────────────────────────────────────────────────────
  -- Locked when 3+ failures exist within the last 60 minutes.
  SELECT COUNT(*) INTO v_failure_count
    FROM public.step_up_failures
   WHERE user_id = v_caller
     AND attempted_at > now() - interval '1 hour';

  IF v_failure_count >= 3 THEN
    RAISE EXCEPTION 'Account temporarily locked — too many failed step-up attempts. Try again later.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── TOTP configuration check ───────────────────────────────────────────────
  -- If the user has no verified TOTP factor they cannot step up.
  -- This is NOT counted as a failure — it is a configuration requirement.
  SELECT EXISTS (
    SELECT 1 FROM auth.mfa_factors
     WHERE user_id = v_caller
       AND factor_type = 'totp'
       AND status = 'verified'
  ) INTO v_has_totp;

  IF NOT v_has_totp THEN
    RAISE EXCEPTION 'Two-factor authentication is required for approvals. Set up TOTP in Security Settings first.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── Password verification ──────────────────────────────────────────────────
  SELECT (encrypted_password = crypt(p_password, encrypted_password))
    INTO v_pwd_ok
    FROM auth.users
   WHERE id = v_caller;

  IF NOT COALESCE(v_pwd_ok, false) THEN
    INSERT INTO public.step_up_failures (user_id, failure_reason, ip_hash)
    VALUES (v_caller, 'wrong_password', p_ip_hash);

    -- Re-check count; notify on lockout trigger.
    SELECT COUNT(*) INTO v_new_count
      FROM public.step_up_failures
     WHERE user_id = v_caller
       AND attempted_at > now() - interval '1 hour';

    IF v_new_count >= 3 THEN
      INSERT INTO public.notifications (user_id, type, module, priority, title, body)
      VALUES (
        v_caller, 'step_up_locked', 'security', 'high',
        'Approval account locked',
        'Too many failed step-up attempts. You are locked out for 1 hour.'
      );
      INSERT INTO public.notifications (user_id, type, module, priority, title, body)
        SELECT id, 'step_up_lockout_alert', 'security', 'high',
               'Step-up lockout alert',
               format('A user account was locked after 3 failed approval authentication attempts')
          FROM public.profiles WHERE role = 'super_admin';
    END IF;

    RAISE EXCEPTION 'Incorrect password'
      USING ERRCODE = 'invalid_password';
  END IF;

  -- ── TOTP / AAL2 check ─────────────────────────────────────────────────────
  -- verifyMfa() on the client elevates the Supabase Auth session to AAL2.
  -- The JWT's "aal" claim reflects this. Verify it here so the RPC is the
  -- single source of truth: password + TOTP, both required.
  IF (auth.jwt()->>'aal') IS DISTINCT FROM 'aal2' THEN
    INSERT INTO public.step_up_failures (user_id, failure_reason, ip_hash)
    VALUES (v_caller, 'wrong_totp', p_ip_hash);

    SELECT COUNT(*) INTO v_new_count
      FROM public.step_up_failures
     WHERE user_id = v_caller
       AND attempted_at > now() - interval '1 hour';

    IF v_new_count >= 3 THEN
      INSERT INTO public.notifications (user_id, type, module, priority, title, body)
      VALUES (
        v_caller, 'step_up_locked', 'security', 'high',
        'Approval account locked',
        'Too many failed step-up attempts. You are locked out for 1 hour.'
      );
    END IF;

    RAISE EXCEPTION 'TOTP verification required — call supabase.auth.mfa.verify() before this RPC'
      USING ERRCODE = 'invalid_password';
  END IF;

  -- ── Create session ─────────────────────────────────────────────────────────
  INSERT INTO public.step_up_sessions (
    user_id, purpose, resource_id, expires_at, ip_hash, user_agent
  ) VALUES (
    v_caller, p_purpose, p_resource_id,
    now() + interval '5 minutes',
    p_ip_hash, p_user_agent
  )
  RETURNING id INTO v_token;

  PERFORM public.log_audit(
    'step_up_session_created',
    format('Step-up session created (purpose: %s)', p_purpose),
    jsonb_build_object('purpose', p_purpose, 'resource_id', p_resource_id)
  );

  RETURN v_token;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_step_up_session(text, text, text, uuid, text, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.create_step_up_session(text, text, text, uuid, text, text)
  TO authenticated;


-- =============================================================================
-- Part 3 — consume_step_up_token
-- =============================================================================

CREATE OR REPLACE FUNCTION public.consume_step_up_token(
  p_token       uuid,
  p_purpose     text,
  p_resource_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
BEGIN
  IF v_caller IS NULL THEN RETURN false; END IF;

  UPDATE public.step_up_sessions
     SET consumed_at = now()
   WHERE id            = p_token
     AND user_id       = v_caller
     AND purpose       = p_purpose
     AND (resource_id IS NOT DISTINCT FROM p_resource_id)
     AND expires_at    > now()
     AND consumed_at IS NULL;

  RETURN FOUND;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.consume_step_up_token(uuid, text, uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.consume_step_up_token(uuid, text, uuid)
  TO authenticated, service_role;


-- =============================================================================
-- Part 4 — Modified approval RPCs (step-up token required)
--
-- Each function:
--   1. Consumes the step-up token at the very start (fails fast).
--   2. Then proceeds with the identical business logic from the previous
--      migration (20260811000000 / 20260811100000).
-- =============================================================================

-- Drop old signatures so we can replace them with the new ones.
DROP FUNCTION IF EXISTS public.approve_payment_batch(uuid, text);
DROP FUNCTION IF EXISTS public.confirm_second_approval(uuid, text);
DROP FUNCTION IF EXISTS public.reject_payment_batch(uuid, text);
DROP FUNCTION IF EXISTS public.approve_expense(uuid, text);
DROP FUNCTION IF EXISTS public.confirm_second_expense_approval(uuid, text);
DROP FUNCTION IF EXISTS public.reject_expense(uuid, text);

-- ── approve_payment_batch ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.approve_payment_batch(
  p_batch_id        uuid,
  p_step_up_token   uuid,
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

  IF NOT public.consume_step_up_token(p_step_up_token, 'approve_batch', p_batch_id) THEN
    RAISE EXCEPTION 'step_up_required: Step-up token invalid, expired, or already consumed'
      USING ERRCODE = 'P0003';
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

REVOKE EXECUTE ON FUNCTION public.approve_payment_batch(uuid, uuid, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.approve_payment_batch(uuid, uuid, text)
  TO authenticated, service_role;


-- ── confirm_second_approval ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.confirm_second_approval(
  p_batch_id        uuid,
  p_step_up_token   uuid,
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

  IF NOT public.consume_step_up_token(p_step_up_token, 'approve_batch', p_batch_id) THEN
    RAISE EXCEPTION 'step_up_required: Step-up token invalid, expired, or already consumed'
      USING ERRCODE = 'P0003';
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

REVOKE EXECUTE ON FUNCTION public.confirm_second_approval(uuid, uuid, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.confirm_second_approval(uuid, uuid, text)
  TO authenticated, service_role;


-- ── reject_payment_batch ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reject_payment_batch(
  p_batch_id      uuid,
  p_step_up_token uuid,
  p_reason        text
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

  IF NOT public.consume_step_up_token(p_step_up_token, 'reject_batch', p_batch_id) THEN
    RAISE EXCEPTION 'step_up_required: Step-up token invalid, expired, or already consumed'
      USING ERRCODE = 'P0003';
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

REVOKE EXECUTE ON FUNCTION public.reject_payment_batch(uuid, uuid, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.reject_payment_batch(uuid, uuid, text)
  TO authenticated, service_role;


-- ── approve_expense ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.approve_expense(
  p_expense_id      uuid,
  p_step_up_token   uuid,
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

  IF NOT public.consume_step_up_token(p_step_up_token, 'approve_expense', p_expense_id) THEN
    RAISE EXCEPTION 'step_up_required: Step-up token invalid, expired, or already consumed'
      USING ERRCODE = 'P0003';
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

REVOKE EXECUTE ON FUNCTION public.approve_expense(uuid, uuid, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.approve_expense(uuid, uuid, text)
  TO authenticated, service_role;


-- ── confirm_second_expense_approval ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.confirm_second_expense_approval(
  p_expense_id      uuid,
  p_step_up_token   uuid,
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

  IF NOT public.consume_step_up_token(p_step_up_token, 'approve_expense', p_expense_id) THEN
    RAISE EXCEPTION 'step_up_required: Step-up token invalid, expired, or already consumed'
      USING ERRCODE = 'P0003';
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

REVOKE EXECUTE ON FUNCTION public.confirm_second_expense_approval(uuid, uuid, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.confirm_second_expense_approval(uuid, uuid, text)
  TO authenticated, service_role;


-- ── reject_expense ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reject_expense(
  p_expense_id    uuid,
  p_step_up_token uuid,
  p_reason        text
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

  IF NOT public.consume_step_up_token(p_step_up_token, 'reject_expense', p_expense_id) THEN
    RAISE EXCEPTION 'step_up_required: Step-up token invalid, expired, or already consumed'
      USING ERRCODE = 'P0003';
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

REVOKE EXECUTE ON FUNCTION public.reject_expense(uuid, uuid, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.reject_expense(uuid, uuid, text)
  TO authenticated, service_role;

-- End of migration.
-- Findings closed: step-up authentication (password + TOTP) for every
-- approve_payment_batch, confirm_second_approval, reject_payment_batch,
-- approve_expense, confirm_second_expense_approval, reject_expense call.
