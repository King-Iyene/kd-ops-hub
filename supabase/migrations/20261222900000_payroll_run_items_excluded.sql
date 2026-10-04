-- Add "excluded" flag to payslips and payroll_run_items so individual
-- employees can be paused/skipped on an approved run without deleting
-- the whole run.  The flag lives on payslips (the disbursement RPC's
-- source of truth) and is synced to payroll_run_items via trigger.

-- 1. payslips — the authoritative column the RPC reads from.
ALTER TABLE public.payslips
  ADD COLUMN IF NOT EXISTS excluded boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.payslips.excluded IS
  'When true the employee is skipped during disbursement. '
  'Their payslip stays for audit but they will not receive payment.';

-- 2. payroll_run_items — downstream mirror for reporting / UI.
ALTER TABLE public.payroll_run_items
  ADD COLUMN IF NOT EXISTS excluded boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.payroll_run_items.excluded IS
  'Synced from payslips.excluded — when true, excluded from disbursement totals.';

-- 3. Update the sync trigger to propagate the excluded flag.
CREATE OR REPLACE FUNCTION public.sync_payroll_run_item_from_payslip()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.payroll_run_items (
    payroll_run_id,
    employee_id,
    employee_name,
    gross_ngn,
    paye_ngn,
    pension_ngn,
    nhf_ngn,
    nhis_ngn,
    avc_ngn,
    net_ngn,
    excluded
  ) VALUES (
    NEW.payroll_run_id,
    NEW.employee_id,
    NEW.employee_name,
    COALESCE(NEW.gross_ngn, 0),
    COALESCE(NEW.paye_ngn, 0),
    COALESCE(NEW.pension_ngn, 0),
    COALESCE(NEW.nhf_ngn, 0),
    COALESCE(NEW.nhis_ngn, 0),
    COALESCE(NEW.avc_ngn, 0),
    COALESCE(NEW.net_ngn, 0),
    COALESCE(NEW.excluded, false)
  )
  ON CONFLICT (payroll_run_id, employee_id)
  DO UPDATE SET
    employee_name = EXCLUDED.employee_name,
    gross_ngn     = EXCLUDED.gross_ngn,
    paye_ngn      = EXCLUDED.paye_ngn,
    pension_ngn   = EXCLUDED.pension_ngn,
    nhf_ngn       = EXCLUDED.nhf_ngn,
    nhis_ngn      = EXCLUDED.nhis_ngn,
    avc_ngn       = EXCLUDED.avc_ngn,
    net_ngn       = EXCLUDED.net_ngn,
    excluded      = EXCLUDED.excluded;

  RETURN NEW;
END;
$$;

-- 4. Update the disbursement RPC to skip excluded payslips.
--    Re-creates the function with an AND NOT p.excluded filter on both
--    the total/count query and the batch-items loop.
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
  v_excluded_count integer := 0;
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

  -- Count excluded employees for the response payload.
  SELECT COUNT(*) INTO v_excluded_count
    FROM public.payslips
   WHERE payroll_run_id = p_run_id
     AND excluded = true;

  -- Total/count are computed from NON-EXCLUDED payslips with usable bank
  -- details, so the batch header accurately reflects what will be dispatched.
  SELECT COALESCE(SUM(p.net_ngn), 0), COUNT(*)
    INTO v_total, v_count
    FROM public.payslips p
    JOIN public.profiles pr ON pr.id = p.employee_id
   WHERE p.payroll_run_id = p_run_id
     AND p.excluded = false
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
       AND p.excluded = false
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
    'skipped', v_skipped,
    'excluded_count', v_excluded_count
  );
END;
$$;
