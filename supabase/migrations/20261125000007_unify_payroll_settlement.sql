-- Fix: employee_deductions.amount_deducted_to_date and
-- employee_advances.outstanding_ngn were ONLY ever settled by markPaid()
-- in Payroll.tsx — the "Record as Manually Paid" escape hatch. The real
-- disbursement path (doDisburse -> payroll-disburse edge function ->
-- finalize_payroll_run_disbursement) flips payroll_runs.status straight to
-- 'paid' with zero settlement logic. Confirmed live: 2 active
-- employee_advances (₦7,050 outstanding total) exist in production right
-- now that would silently never pay down if a run settles through the real
-- path instead of the manual one — a deduction cap could never trip, an
-- advance balance could never go down, even though the employee's payslip
-- already shows the amount taken out.
--
-- Fix: move settlement into one SECURITY DEFINER function,
-- settle_payroll_run_deductions(), called from BOTH paths so there is
-- exactly one implementation instead of two that can drift:
--   - finalize_payroll_run_disbursement() calls it when transitioning to
--     'paid' (the real disbursement path).
--   - Payroll.tsx's markPaid() now calls it via rpc() instead of
--     duplicating the logic client-side (see accompanying frontend change).
-- Idempotent via payroll_runs.deductions_settled_at — safe to call twice
-- for the same run (e.g. if markPaid() is ever hit for a run that somehow
-- already settled) without double-deducting.
--
-- Also settles staff_loans linked via employee_deductions.staff_loan_id
-- (added in 20261125000006) — a loan repaid through payroll now has its
-- outstanding_ngn reduced and a staff_loan_repayments audit row created
-- automatically, the same moment the deduction itself is settled.

ALTER TABLE public.payroll_runs
  ADD COLUMN IF NOT EXISTS deductions_settled_at timestamptz;

CREATE OR REPLACE FUNCTION public.settle_payroll_run_deductions(p_run_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run          public.payroll_runs;
  v_slip         RECORD;
  v_item         jsonb;
  v_ded_id       uuid;
  v_adv_id       uuid;
  v_amount       numeric;
  v_ded_totals   jsonb := '{}'::jsonb;
  v_adv_totals   jsonb := '{}'::jsonb;
  v_key          text;
  v_ded          RECORD;
  v_adv          RECORD;
  v_loan         RECORD;
  v_new_total    numeric;
  v_new_outstanding numeric;
BEGIN
  SELECT * INTO v_run FROM public.payroll_runs WHERE id = p_run_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payroll run % not found', p_run_id;
  END IF;

  -- Already settled (either path already ran for this run) — no-op.
  IF v_run.deductions_settled_at IS NOT NULL THEN
    RETURN;
  END IF;

  -- Aggregate deductions_json across every payslip for this run, splitting
  -- by whether each line item references a recurring deduction ('id') or
  -- an advance repayment ('advance_id') — mirrors the shape written by
  -- generatePayslips() in Payroll.tsx.
  FOR v_slip IN
    SELECT deductions_json FROM public.payslips
    WHERE payroll_run_id = p_run_id AND deductions_json IS NOT NULL
  LOOP
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_slip.deductions_json)
    LOOP
      v_amount := COALESCE((v_item->>'amount_ngn')::numeric, 0);
      IF v_item ? 'advance_id' THEN
        v_key := v_item->>'advance_id';
        v_adv_totals := jsonb_set(v_adv_totals, ARRAY[v_key], to_jsonb(COALESCE((v_adv_totals->>v_key)::numeric, 0) + v_amount));
      ELSIF v_item ? 'id' THEN
        v_key := v_item->>'id';
        v_ded_totals := jsonb_set(v_ded_totals, ARRAY[v_key], to_jsonb(COALESCE((v_ded_totals->>v_key)::numeric, 0) + v_amount));
      END IF;
    END LOOP;
  END LOOP;

  -- Settle recurring deductions (and any staff loan each one is linked to).
  FOR v_key, v_amount IN SELECT * FROM jsonb_each_text(v_ded_totals)
  LOOP
    v_ded_id := v_key::uuid;
    SELECT * INTO v_ded FROM public.employee_deductions WHERE id = v_ded_id FOR UPDATE;
    IF NOT FOUND THEN CONTINUE; END IF;

    v_new_total := COALESCE(v_ded.amount_deducted_to_date, 0) + v_amount::numeric;
    UPDATE public.employee_deductions
       SET amount_deducted_to_date = v_new_total,
           status = CASE WHEN v_ded.total_deductible_amount IS NOT NULL
                          AND v_new_total >= v_ded.total_deductible_amount
                         THEN 'completed' ELSE status END
     WHERE id = v_ded_id;

    IF v_ded.staff_loan_id IS NOT NULL THEN
      SELECT * INTO v_loan FROM public.staff_loans WHERE id = v_ded.staff_loan_id FOR UPDATE;
      IF FOUND THEN
        v_new_outstanding := GREATEST(0, COALESCE(v_loan.outstanding_ngn, 0) - v_amount::numeric);
        UPDATE public.staff_loans
           SET outstanding_ngn = v_new_outstanding,
               status = CASE WHEN v_new_outstanding = 0 THEN 'fully_paid'
                              WHEN status = 'approved' THEN 'active'
                              ELSE status END
         WHERE id = v_loan.id;

        INSERT INTO public.staff_loan_repayments (loan_id, amount_ngn, repayment_type, payroll_run_id, period, notes)
        VALUES (v_loan.id, v_amount::numeric, 'payroll_deduction', p_run_id, v_run.period, 'Auto-settled from payroll run');
      END IF;
    END IF;
  END LOOP;

  -- Settle salary advances.
  FOR v_key, v_amount IN SELECT * FROM jsonb_each_text(v_adv_totals)
  LOOP
    v_adv_id := v_key::uuid;
    SELECT * INTO v_adv FROM public.employee_advances WHERE id = v_adv_id FOR UPDATE;
    IF NOT FOUND THEN CONTINUE; END IF;

    v_new_outstanding := GREATEST(0, COALESCE(v_adv.outstanding_ngn, 0) - v_amount::numeric);
    UPDATE public.employee_advances
       SET outstanding_ngn = v_new_outstanding,
           status = CASE WHEN v_new_outstanding = 0 THEN 'settled' ELSE status END
     WHERE id = v_adv_id;
  END LOOP;

  UPDATE public.payroll_runs SET deductions_settled_at = now() WHERE id = p_run_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.settle_payroll_run_deductions(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.settle_payroll_run_deductions(uuid) TO authenticated, service_role;

-- Wire into the real disbursement path.
CREATE OR REPLACE FUNCTION public.finalize_payroll_run_disbursement(
  p_run_id uuid,
  p_new_status text
)
RETURNS public.payroll_runs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run public.payroll_runs;
BEGIN
  IF p_new_status NOT IN ('paid', 'approved') THEN
    RAISE EXCEPTION 'Invalid target status %', p_new_status USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT * INTO v_run FROM public.payroll_runs WHERE id = p_run_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payroll run % not found', p_run_id;
  END IF;

  IF v_run.status <> 'processing' THEN
    RAISE EXCEPTION 'Payroll run is not in processing state (current status: %)', v_run.status
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  UPDATE public.payroll_runs
     SET status = p_new_status, updated_at = now()
   WHERE id = p_run_id
   RETURNING * INTO v_run;

  IF p_new_status = 'paid' THEN
    PERFORM public.settle_payroll_run_deductions(p_run_id);
  END IF;

  RETURN v_run;
END;
$$;
