-- upsert_payroll_draft() was created in 20261217200000_race_condition_fixes.sql
-- with no caller-role check and no REVOKE from PUBLIC — the exact vulnerability
-- class already found and fixed three times in
-- 20261123000001_lock_down_unrestricted_definer_functions.sql (that
-- migration's own comment: "Postgres grants EXECUTE to PUBLIC by default on
-- function creation... Supabase grants EXECUTE on every new public-schema
-- function directly to anon/authenticated/service_role via ALTER DEFAULT
-- PRIVILEGES at creation time — REVOKE ... FROM PUBLIC alone does NOT touch
-- those direct per-role grants"). upsert_payroll_draft is SECURITY DEFINER
-- (bypasses RLS on payroll_runs) and was missed by that hardening pass since
-- it was added later, in a migration scoped to an unrelated ON CONFLICT bug.
--
-- As shipped, any authenticated (and, per that same default-grant behavior,
-- possibly anon) caller could invoke this RPC directly via PostgREST and
-- write arbitrary payroll_runs totals (any period, any segment, any
-- total_burn_ngn/paye_ngn/etc.) for the whole tenant, completely bypassing
-- the app's own "who can draft payroll" UI gating.
--
-- Fix mirrors the pattern already used by approve_payroll_run()
-- (20261125000009_payroll_auto_schedule_disbursement_and_holidays.sql): an
-- explicit active-user + role check inside the function body, using the
-- same super_admin/admin/finance role set the rest of payroll already uses
-- (see canDisburse in Payroll.tsx, and approve_payroll_run's own check) —
-- plus the explicit REVOKE ... FROM PUBLIC, anon, authenticated + re-GRANT
-- to authenticated that the lockdown migration established as the required
-- pattern (a bare REVOKE FROM PUBLIC does not revoke the separate direct
-- grants Supabase makes to anon/authenticated at creation time).

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
  v_caller uuid := auth.uid();
  v_caller_role text;
BEGIN
  SELECT role INTO v_caller_role FROM public.profiles
   WHERE id = v_caller AND COALESCE(status, 'active') = 'active';
  IF v_caller_role IS NULL THEN
    RAISE EXCEPTION 'Caller is not an active user' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_caller_role NOT IN ('super_admin', 'admin', 'finance') THEN
    RAISE EXCEPTION 'Your role is not permitted to draft payroll runs'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

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

REVOKE ALL ON FUNCTION public.upsert_payroll_draft(
  text, uuid, numeric, numeric, numeric, numeric, numeric, numeric, numeric,
  numeric, uuid, jsonb, text, integer, jsonb, jsonb
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.upsert_payroll_draft(
  text, uuid, numeric, numeric, numeric, numeric, numeric, numeric, numeric,
  numeric, uuid, jsonb, text, integer, jsonb, jsonb
) TO authenticated;
