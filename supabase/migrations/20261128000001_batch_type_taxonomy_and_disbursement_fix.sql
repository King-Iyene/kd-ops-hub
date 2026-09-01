-- Extend batch_type taxonomy with 'employee_allowance' and 'employee_reimbursement'
-- so operators no longer pick 'employee_salary' for non-salary employee payments.
--
-- Also fixes create_payroll_disbursement_batch to set batch_type = 'employee_salary'
-- on the payment_batches row it creates — previously it defaulted to 'contractor',
-- which would have caused the payslip trigger to skip creating payslips for
-- payroll-run disbursements.

-- 1. Update column comment to reflect all valid types.
COMMENT ON COLUMN payment_batches.batch_type IS
  'contractor | employee_salary | employee_allowance | employee_reimbursement | advance | prize | mixed';

-- 2. Reclassify existing batches that are clearly not salary runs but were
--    tagged as employee_salary because no other employee type existed.
--    Heuristic: batch_type = 'employee_salary' AND payroll_run_id IS NULL
--    AND name contains 'Allowance' or 'Reimbursement' or 'Repair' keywords.
UPDATE public.payment_batches
   SET batch_type = 'employee_allowance'
 WHERE batch_type = 'employee_salary'
   AND payroll_run_id IS NULL
   AND (name ILIKE '%allowance%' OR name ILIKE '%stipend%');

UPDATE public.payment_batches
   SET batch_type = 'employee_reimbursement'
 WHERE batch_type = 'employee_salary'
   AND payroll_run_id IS NULL
   AND (name ILIKE '%reimbursement%' OR name ILIKE '%repair%' OR name ILIKE '%refund%');

-- 3. Delete payslips that were wrongly created from these reclassified batches.
--    The payslip trigger now correctly skips non-salary batches, but existing
--    wrong payslips need cleaning up.
DELETE FROM public.payslips p
USING public.batch_items bi, public.payment_batches pb
WHERE p.batch_item_id = bi.id
  AND bi.batch_id = pb.id
  AND pb.batch_type IN ('employee_allowance', 'employee_reimbursement');

-- 4. Fix create_payroll_disbursement_batch to set batch_type = 'employee_salary'.
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
