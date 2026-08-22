-- =============================================================================
-- CRITICAL FIX: payroll disbursement is currently broken.
--
-- Payroll.tsx's doDisburse() inserts payment_batches directly from the
-- browser at status='processing'. The insert-gate trigger added later
-- (20260930000300_payment_batches_insert_gate.sql) only allows authenticated
-- clients to INSERT at status IN ('draft','pending_approval') or 'funded'
-- (QuickPay only) — 'processing' is rejected outright for authenticated
-- callers. Every other batch-creation path in the app (NewPaymentBatch.tsx)
-- correctly inserts at 'draft'/'pending_approval'; only the payroll path
-- was never updated. Confirmed live: payment_batches has zero rows with
-- payroll_run_id set despite an approved August 2026 run sitting unpaid.
--
-- Fix: move batch + batch_items creation into a SECURITY DEFINER RPC.
-- SECURITY DEFINER functions run as the function owner, not 'authenticated',
-- so the insert-gate trigger's exemption ("current_user <> 'authenticated'")
-- applies and the direct-to-'processing' insert succeeds — the same
-- mechanism approve_payment_batch/lock_payroll_run_for_disbursement already
-- rely on.
--
-- This RPC is also the foundation for scheduled disbursement (the actual
-- ask): a cron-invoked edge function calls the exact same RPC a human
-- clicking "Disburse Now" calls, so there is only ONE code path for
-- "turn an approved payroll run into a dispatchable batch" — no drift
-- between manual and scheduled behaviour.
-- =============================================================================

-- ── 1. Scheduling column ─────────────────────────────────────────────────────
ALTER TABLE public.payroll_runs
  ADD COLUMN IF NOT EXISTS scheduled_disburse_at timestamptz;

COMMENT ON COLUMN public.payroll_runs.scheduled_disburse_at IS
  'When set on an approved run, the payroll-scheduled-disburse cron fires '
  'disbursement automatically once this time has passed. NULL = manual only '
  '(the existing "Disburse Now" behaviour). Cleared automatically once the '
  'run leaves ''approved'' status (disbursed, or reset).';

CREATE INDEX IF NOT EXISTS payroll_runs_scheduled_disburse_idx
  ON public.payroll_runs (scheduled_disburse_at)
  WHERE scheduled_disburse_at IS NOT NULL AND status = 'approved';

-- ── 2. schedule_payroll_disbursement / cancel — thin, guarded setters ───────
-- Kept as RPCs (not a raw client UPDATE) so we can enforce "only while
-- approved" and "must be in the future" server-side, not just in the UI.
CREATE OR REPLACE FUNCTION public.schedule_payroll_disbursement(
  p_run_id uuid,
  p_at     timestamptz
)
RETURNS public.payroll_runs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run         public.payroll_runs;
  v_caller_role text;
BEGIN
  v_caller_role := public.current_user_role();
  IF v_caller_role IS NULL OR v_caller_role <> ALL (ARRAY['super_admin','admin','finance']) THEN
    RAISE EXCEPTION 'Not authorized to schedule payroll disbursement' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_at <= now() THEN
    RAISE EXCEPTION 'Scheduled disbursement time must be in the future' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT * INTO v_run FROM public.payroll_runs WHERE id = p_run_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payroll run % not found', p_run_id;
  END IF;
  IF v_run.status <> 'approved' THEN
    RAISE EXCEPTION 'Only approved runs can be scheduled (current status: %)', v_run.status
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  UPDATE public.payroll_runs
     SET scheduled_disburse_at = p_at, updated_at = now()
   WHERE id = p_run_id
   RETURNING * INTO v_run;

  RETURN v_run;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_scheduled_payroll_disbursement(p_run_id uuid)
RETURNS public.payroll_runs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run         public.payroll_runs;
  v_caller_role text;
BEGIN
  v_caller_role := public.current_user_role();
  IF v_caller_role IS NULL OR v_caller_role <> ALL (ARRAY['super_admin','admin','finance']) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Row-lock first: if the disbursement cron has already claimed this run
  -- (status flipped to 'processing' under FOR UPDATE elsewhere), this call
  -- blocks until that transaction commits, then the status check below
  -- correctly refuses the cancellation — no race where a cancel silently
  -- lands after disbursement has already started.
  SELECT * INTO v_run FROM public.payroll_runs WHERE id = p_run_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payroll run % not found', p_run_id;
  END IF;
  IF v_run.status <> 'approved' THEN
    RAISE EXCEPTION 'Cannot cancel — disbursement is already in progress (status: %)', v_run.status
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  UPDATE public.payroll_runs
     SET scheduled_disburse_at = NULL, updated_at = now()
   WHERE id = p_run_id
   RETURNING * INTO v_run;

  RETURN v_run;
END;
$$;

-- ── 3. create_payroll_disbursement_batch — the core fix ─────────────────────
CREATE OR REPLACE FUNCTION public.create_payroll_disbursement_batch(p_run_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run            public.payroll_runs;
  v_provider       text;
  v_batch_id       uuid;
  v_existing_batch record;
  v_slip           record;
  v_emp            record;
  v_total          numeric := 0;
  v_count          integer := 0;
  v_skipped        jsonb := '[]'::jsonb;
  v_covered        uuid[];
BEGIN
  -- Claims the run (approved -> processing) with the same row-lock/status
  -- guard the manual "Disburse Now" path already relies on. Raises if
  -- another caller (human or cron) already claimed it.
  v_run := public.lock_payroll_run_for_disbursement(p_run_id);

  SELECT COALESCE((raw->>'active_payment_provider'), 'paystack') INTO v_provider
  FROM (SELECT to_jsonb(cs) AS raw FROM public.company_settings cs
         WHERE cs.id = '00000000-0000-0000-0000-000000000001'::uuid) s;
  IF v_provider NOT IN ('paystack', 'flutterwave') THEN
    v_provider := 'paystack';
  END IF;

  -- Crash-recovery: reuse an existing in-flight batch for this run instead
  -- of creating a duplicate (mirrors doDisburse's prior client-side logic).
  SELECT * INTO v_existing_batch FROM public.payment_batches
   WHERE payroll_run_id = p_run_id AND status IN ('processing', 'partially_processed')
   ORDER BY created_at DESC LIMIT 1;

  IF FOUND THEN
    v_batch_id := v_existing_batch.id;
    SELECT array_agg(employee_id) INTO v_covered
      FROM public.batch_items WHERE batch_id = v_batch_id AND employee_id IS NOT NULL;
  ELSE
    v_covered := ARRAY[]::uuid[];
  END IF;

  -- Total/count are computed from payslips with usable bank details, so the
  -- batch header accurately reflects what will actually be dispatched —
  -- not the full roster including employees we're about to skip.
  SELECT COALESCE(SUM(p.net_ngn), 0), COUNT(*)
    INTO v_total, v_count
    FROM public.payslips p
    JOIN public.profiles pr ON pr.id = p.employee_id
   WHERE p.payroll_run_id = p_run_id
     AND NOT (p.employee_id = ANY(v_covered))
     AND COALESCE(pr.bank_name, '') <> ''
     AND COALESCE(pr.bank_account_number, '') <> '';

  IF v_batch_id IS NULL THEN
    INSERT INTO public.payment_batches (
      name, status, payment_date, total_amount, beneficiary_count, provider, payroll_run_id
    ) VALUES (
      'Salary ' || to_char(to_date(v_run.period, 'YYYY-MM'), 'FMMonth YYYY'),
      'processing', CURRENT_DATE, v_total, v_count, v_provider, p_run_id
    )
    RETURNING id INTO v_batch_id;
  END IF;

  FOR v_slip IN
    SELECT p.id, p.employee_id, p.employee_name, p.net_ngn
      FROM public.payslips p
     WHERE p.payroll_run_id = p_run_id
       AND NOT (p.employee_id = ANY(v_covered))
  LOOP
    SELECT id, bank_name, bank_account_number,
           COALESCE(NULLIF(TRIM(first_name || ' ' || last_name), ''), full_name, v_slip.employee_name) AS display_name
      INTO v_emp
      FROM public.profiles WHERE id = v_slip.employee_id;

    IF v_emp.id IS NULL OR COALESCE(v_emp.bank_name, '') = '' OR COALESCE(v_emp.bank_account_number, '') = '' THEN
      v_skipped := v_skipped || jsonb_build_object(
        'employee_id', v_slip.employee_id,
        'employee_name', v_slip.employee_name,
        'reason', CASE WHEN v_emp.id IS NULL THEN 'profile not found' ELSE 'missing bank details' END
      );
      CONTINUE;
    END IF;

    INSERT INTO public.batch_items (
      batch_id, employee_id, full_name, bank_name, account_number, amount_ngn, status, provider
    ) VALUES (
      v_batch_id, v_slip.employee_id, v_emp.display_name, v_emp.bank_name, v_emp.bank_account_number,
      COALESCE(v_slip.net_ngn, 0), 'pending', v_provider
    );
  END LOOP;

  RETURN jsonb_build_object(
    'batch_id', v_batch_id,
    'provider', v_provider,
    'item_count', v_count,
    'total_amount', v_total,
    'skipped', v_skipped
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.schedule_payroll_disbursement(uuid, timestamptz) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.schedule_payroll_disbursement(uuid, timestamptz) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.cancel_scheduled_payroll_disbursement(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.cancel_scheduled_payroll_disbursement(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.create_payroll_disbursement_batch(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.create_payroll_disbursement_batch(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.create_payroll_disbursement_batch IS
  'Claims the run, creates (or reuses, on crash-retry) a payment_batches row '
  'at status=processing plus one pending batch_item per employee with usable '
  'bank details. Employees missing bank details are skipped, not fatal to '
  'the rest of the run, and returned in the skipped[] array. Does NOT '
  'dispatch any transfers — the caller must invoke the batch-worker edge '
  'function with the returned batch_id, exactly as every other batch type '
  'already does.';
