-- ==========================================================================
-- Fix four race conditions identified in payroll/leave/advance audit
-- ==========================================================================

-- 1. ATOMIC LEAVE BALANCE DEDUCTION
-- Replaces the client-side read-increment-upsert pattern (TOCTOU race)
-- with a single atomic SQL operation using advisory locks.

CREATE OR REPLACE FUNCTION public.deduct_leave_balance(
  p_employee_id uuid,
  p_year integer,
  p_leave_type text,
  p_days numeric,
  p_accrued_cap numeric DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_col text;
  v_used numeric;
BEGIN
  v_col := p_leave_type || '_used';
  IF v_col NOT IN ('annual_used','sick_used','unpaid_used','maternity_used','paternity_used','compassionate_used','study_used') THEN
    RAISE EXCEPTION 'Invalid leave type: %', p_leave_type;
  END IF;

  -- Ensure balance row exists
  INSERT INTO leave_balances (employee_id, year)
  VALUES (p_employee_id, p_year)
  ON CONFLICT (employee_id, year) DO NOTHING;

  -- Serialize per employee+year
  PERFORM pg_advisory_xact_lock(
    hashtext('leave_bal_' || p_employee_id::text || '_' || p_year::text)
  );

  -- Overdraft guard for annual leave
  IF p_accrued_cap IS NOT NULL THEN
    EXECUTE format('SELECT COALESCE(%I, 0) FROM leave_balances WHERE employee_id = $1 AND year = $2', v_col)
      INTO v_used USING p_employee_id, p_year;
    IF v_used + p_days > p_accrued_cap THEN
      RETURN false;
    END IF;
  END IF;

  -- Atomic increment
  EXECUTE format(
    'UPDATE leave_balances SET %I = COALESCE(%I, 0) + $1 WHERE employee_id = $2 AND year = $3',
    v_col, v_col
  ) USING p_days, p_employee_id, p_year;

  RETURN true;
END;
$$;

-- Restore (for cancellation / revert)
CREATE OR REPLACE FUNCTION public.restore_leave_balance(
  p_employee_id uuid,
  p_year integer,
  p_leave_type text,
  p_days numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_col text;
BEGIN
  v_col := p_leave_type || '_used';
  IF v_col NOT IN ('annual_used','sick_used','unpaid_used','maternity_used','paternity_used','compassionate_used','study_used') THEN
    RAISE EXCEPTION 'Invalid leave type: %', p_leave_type;
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtext('leave_bal_' || p_employee_id::text || '_' || p_year::text)
  );

  EXECUTE format(
    'UPDATE leave_balances SET %I = GREATEST(0, COALESCE(%I, 0) - $1) WHERE employee_id = $2 AND year = $3',
    v_col, v_col
  ) USING p_days, p_employee_id, p_year;
END;
$$;


-- 2. ATOMIC PAYROLL DRAFT UPSERT
-- Replaces the client-side find-or-create pattern (TOCTOU race)
-- with a single server-side operation using SELECT ... FOR UPDATE.

CREATE OR REPLACE FUNCTION public.upsert_payroll_draft(
  p_period text,
  p_segment_id uuid,
  p_total_contractor_ngn numeric,
  p_total_employee_ngn numeric,
  p_total_expenses_ngn numeric,
  p_paye_ngn numeric,
  p_pension_ngn numeric,
  p_nhf_ngn numeric,
  p_employer_pension_ngn numeric,
  p_total_burn_ngn numeric,
  p_created_by uuid,
  p_run_options jsonb DEFAULT NULL,
  p_period_type text DEFAULT 'monthly',
  p_employee_count integer DEFAULT 0,
  p_bonuses_json jsonb DEFAULT NULL,
  p_allowances_json jsonb DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id uuid;
BEGIN
  -- Serialize: lock the matching row if it exists
  IF p_segment_id IS NULL THEN
    SELECT id INTO v_id FROM payroll_runs
      WHERE period = p_period AND payroll_segment_id IS NULL
      FOR UPDATE;
  ELSE
    SELECT id INTO v_id FROM payroll_runs
      WHERE period = p_period AND payroll_segment_id = p_segment_id
      FOR UPDATE;
  END IF;

  IF v_id IS NOT NULL THEN
    UPDATE payroll_runs SET
      total_contractor_ngn = p_total_contractor_ngn,
      total_employee_ngn   = p_total_employee_ngn,
      total_expenses_ngn   = p_total_expenses_ngn,
      paye_ngn             = p_paye_ngn,
      pension_ngn          = p_pension_ngn,
      nhf_ngn              = p_nhf_ngn,
      employer_pension_ngn = p_employer_pension_ngn,
      total_burn_ngn       = p_total_burn_ngn,
      run_options          = p_run_options,
      period_type          = p_period_type,
      employee_count       = p_employee_count,
      bonuses_json         = p_bonuses_json,
      allowances_json      = p_allowances_json,
      status               = 'draft'
    WHERE id = v_id;
  ELSE
    INSERT INTO payroll_runs (
      period, payroll_segment_id,
      total_contractor_ngn, total_employee_ngn, total_expenses_ngn,
      paye_ngn, pension_ngn, nhf_ngn, employer_pension_ngn,
      total_burn_ngn, status, created_by, run_options,
      period_type, employee_count, bonuses_json, allowances_json
    ) VALUES (
      p_period, p_segment_id,
      p_total_contractor_ngn, p_total_employee_ngn, p_total_expenses_ngn,
      p_paye_ngn, p_pension_ngn, p_nhf_ngn, p_employer_pension_ngn,
      p_total_burn_ngn, 'draft', p_created_by, p_run_options,
      p_period_type, p_employee_count, p_bonuses_json, p_allowances_json
    )
    RETURNING id INTO v_id;
  END IF;

  RETURN v_id;
END;
$$;


-- 3. ATOMIC STAFF LOAN REPAYMENT
-- Replaces client-side read-then-write in StaffLoans.tsx

CREATE OR REPLACE FUNCTION public.record_loan_repayment(
  p_loan_id uuid,
  p_amount numeric
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_new_outstanding numeric;
BEGIN
  UPDATE staff_loans
  SET outstanding_ngn = GREATEST(0, outstanding_ngn - p_amount),
      status = CASE
        WHEN GREATEST(0, outstanding_ngn - p_amount) = 0 THEN 'fully_paid'
        WHEN status = 'approved' THEN 'active'
        ELSE status
      END
  WHERE id = p_loan_id
  RETURNING outstanding_ngn INTO v_new_outstanding;

  RETURN v_new_outstanding;
END;
$$;
