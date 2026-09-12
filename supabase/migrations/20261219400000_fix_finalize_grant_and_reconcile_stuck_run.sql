-- 2026-09-12 incident: a real, live scheduled payroll disbursement for the
-- September 2026 "Testing" pay-group run actually paid an employee
-- (Iyene Iyene, ₦1,500, Paystack transfer TRF_ylryioy856b11mbp, gateway
-- response "Successful", domain "live" — real money) but the run itself
-- silently stayed on "Approved" with zero visible indication anything had
-- happened. This is a silent SUCCESS-not-recorded, the mirror image of the
-- silent-failure bugs already fixed earlier today.
--
-- ROOT CAUSE: 20261124000000_critical_security_lockdown.sql revoked ALL
-- privileges on finalize_payroll_run_disbursement() and re-granted EXECUTE
-- to `authenticated` only — service_role was dropped from the grant list
-- and never restored (CREATE OR REPLACE FUNCTION in 20261125000007 kept
-- the same signature, so it inherited that same broken ACL rather than
-- resetting it). Every scheduled/cron disbursement calls this RPC through
-- the service-role client (a cron tick carries no user JWT, so
-- current_user is never 'authenticated'), so the very last step of the
-- pipeline — flipping the run to 'paid' and settling deductions — has
-- been silently failing with a permission error since Nov 24, for every
-- tenant, every time a scheduled disbursement actually dispatched a
-- transfer. The transfer itself goes through the same battle-tested
-- batch-worker path every other payment type uses and was unaffected —
-- only this one bookkeeping RPC call was broken, and (until the
-- accompanying edge-function fix) its failure was never even checked for,
-- let alone surfaced.

-- 1. Root-cause fix: restore the missing grant.
GRANT EXECUTE ON FUNCTION public.finalize_payroll_run_disbursement(uuid, text) TO service_role;

-- 2. Prevent a related failure mode: an employee whose net pay resolves to
--    ₦0 (e.g. a discretionary deduction fully capped against a small
--    salary) still got a batch_item inserted, which then sat at 'pending'
--    forever — there is nothing to transfer, so no provider call is ever
--    made for it, and batch-worker's orphan watchdog would keep retrying
--    it every tick, indefinitely, without ever reaching a terminal state.
--    Treat a ₦0 net payslip the same way a missing-bank-details employee
--    is already treated: skipped, not batched.
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
  v_run := public.lock_payroll_run_for_disbursement(p_run_id);

  SELECT COALESCE((raw->>'active_payment_provider'), 'paystack') INTO v_provider
  FROM (SELECT to_jsonb(cs) AS raw FROM public.company_settings cs
         WHERE cs.id = '00000000-0000-0000-0000-000000000001'::uuid) s;
  IF v_provider NOT IN ('paystack', 'flutterwave') THEN
    v_provider := 'paystack';
  END IF;

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

  SELECT COALESCE(SUM(p.net_ngn), 0), COUNT(*)
    INTO v_total, v_count
    FROM public.payslips p
    JOIN public.profiles pr ON pr.id = p.employee_id
   WHERE p.payroll_run_id = p_run_id
     AND NOT (p.employee_id = ANY(v_covered))
     AND p.net_ngn > 0
     AND COALESCE(pr.bank_name, '') <> ''
     AND COALESCE(pr.bank_account_number, '') <> '';

  IF v_batch_id IS NULL THEN
    INSERT INTO public.payment_batches (
      name, status, payment_date, total_amount, beneficiary_count,
      provider, payroll_run_id, batch_type
    ) VALUES (
      'Salary ' || to_char(to_date(v_run.period, 'YYYY-MM'), 'FMMonth YYYY'),
      'processing', CURRENT_DATE, v_total, v_count,
      v_provider, p_run_id, 'employee_salary'
    )
    RETURNING id INTO v_batch_id;
  END IF;

  FOR v_slip IN
    SELECT p.id, p.employee_id, p.employee_name, p.net_ngn
      FROM public.payslips p
     WHERE p.payroll_run_id = p_run_id
       AND NOT (p.employee_id = ANY(v_covered))
  LOOP
    IF COALESCE(v_slip.net_ngn, 0) <= 0 THEN
      v_skipped := v_skipped || jsonb_build_object(
        'employee_id', v_slip.employee_id,
        'employee_name', v_slip.employee_name,
        'reason', 'net pay is NGN 0 - nothing to disburse'
      );
      CONTINUE;
    END IF;

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

REVOKE EXECUTE ON FUNCTION public.create_payroll_disbursement_batch(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.create_payroll_disbursement_batch(uuid) TO authenticated, service_role;

-- 3. One-time reconciliation of the specific run caught mid-incident on
--    2026-09-12: real money already moved (Iyene Iyene was paid ₦1,500,
--    Paystack transfer TRF_ylryioy856b11mbp, succeeded); the second
--    employee's net pay was ₦0 (a deliberate capping test) so there was
--    never anything to send for them. Bring both the stuck batch_item and
--    the run's status in line with what actually happened, by driving
--    them through the same functions the automated path uses (so any
--    deduction/advance/loan settlement happens exactly as it would have)
--    rather than a bare status flip. No-op if this has already been
--    reconciled by hand.
DO $$
DECLARE
  v_run_id   uuid := '2e770f48-e890-4205-a559-e4a88fc2dca5';
  v_batch_id uuid := '54aa5cdb-aacd-4405-9c7b-e306afc82467';
  v_item_id  uuid := '4ecb93b1-2d08-4b19-a395-cbc29db83f14';
BEGIN
  UPDATE public.batch_items
     SET status = 'succeeded',
         completed_at = now(),
         narration = 'Net pay was NGN 0 after deduction capping - nothing to transfer.'
   WHERE id = v_item_id
     AND amount_ngn = 0
     AND status = 'pending';

  PERFORM public.finalize_batch(v_batch_id);

  UPDATE public.payroll_runs
     SET status = 'processing'
   WHERE id = v_run_id
     AND status = 'approved';

  IF EXISTS (SELECT 1 FROM public.payroll_runs WHERE id = v_run_id AND status = 'processing') THEN
    PERFORM public.finalize_payroll_run_disbursement(v_run_id, 'paid');
  END IF;
END $$;
