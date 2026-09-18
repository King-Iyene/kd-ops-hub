-- ═══════════════════════════════════════════════════════════════════════════════
-- upsert_payroll_draft() must not overwrite a run that is no longer a draft
-- ─────────────────────────────────────────────────────────────────────────────
-- The function is find-or-create on (company_id, period, payroll_segment_id).
-- When it finds an existing row it UPDATEs every money column and forces
-- status back to 'draft' — with no check on what that row's status actually
-- was.
--
-- So starting a "new payroll run" for a company + period + pay group that
-- already has a run silently rewrites that run. Reproduced against
-- PostgreSQL 16 with the real triggers in place, drafting N99 over an
-- existing N4,477,000 run:
--
--   pending_approval -> status reset to draft, figures overwritten
--   approved         -> status reset to draft, figures overwritten,
--                       approved_by LEFT SET
--   processing       -> status reset to draft, figures overwritten,
--                       while a disbursement is in flight
--   paid             -> correctly refused by trg_fn_lock_paid_payroll_run
--
-- No error, no warning, no confirmation in any of the first three cases.
--
-- Two things make this worse than a lost edit. First, it destroys an
-- approval: the maker-checker control in approve_payroll_run() is
-- meaningless if any subsequent draft silently un-approves the run and
-- rewrites the numbers. Second, approved_by is not cleared, so the row is
-- left naming an approver who never approved the figures it now holds.
--
-- The approval-state lock (20261002002300) does not catch this, by design:
-- it exempts anything that is not the 'authenticated' role so that
-- SECURITY DEFINER RPCs can do their job, and this is one of those RPCs.
-- The paid-run lock catches only the 'paid' case. Nothing covered the three
-- states in between.
--
-- Fix: refuse. An existing run that has moved past draft is only editable
-- through the explicit path the UI already has — recall it to draft first,
-- which is a deliberate action that gets audited — so the guard costs
-- nothing legitimate and closes the silent-overwrite hole.
--
-- The error is written to be read by a person, because it surfaces directly
-- in a toast: it names the period and what state the existing run is in.
--
-- Everything else about the function is unchanged from
-- 20261220800000_upsert_payroll_draft_company_scoped.sql.
-- ═══════════════════════════════════════════════════════════════════════════════

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
  p_company_id uuid,
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
  v_status text;
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
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'A company must be selected before drafting payroll'
      USING ERRCODE = '23502';
  END IF;

  -- Serialize: lock the matching row if it exists. Scoped by company_id so
  -- KD Squares and NDI drafting the same period+segment shape never collide.
  IF p_segment_id IS NULL THEN
    SELECT id, status INTO v_id, v_status FROM payroll_runs
      WHERE company_id = p_company_id AND period = p_period AND payroll_segment_id IS NULL
      FOR UPDATE;
  ELSE
    SELECT id, status INTO v_id, v_status FROM payroll_runs
      WHERE company_id = p_company_id AND period = p_period AND payroll_segment_id = p_segment_id
      FOR UPDATE;
  END IF;

  IF v_id IS NOT NULL THEN
    -- Only an actual draft may be rewritten in place. Anything further along
    -- has to be recalled deliberately first; see the header for what silently
    -- overwriting these used to do.
    IF v_status IS DISTINCT FROM 'draft' THEN
      RAISE EXCEPTION
        'A payroll run for % already exists for this pay group and is % — open it instead, or recall it to draft first if you need to change the figures.',
        p_period,
        CASE v_status
          WHEN 'pending_approval' THEN 'awaiting approval'
          WHEN 'approved'         THEN 'already approved'
          WHEN 'processing'       THEN 'being disbursed right now'
          WHEN 'paid'             THEN 'already paid'
          ELSE v_status
        END
        USING ERRCODE = 'invalid_parameter_value';
    END IF;

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
      period, payroll_segment_id, company_id,
      total_contractor_ngn, total_employee_ngn, total_expenses_ngn,
      paye_ngn, pension_ngn, nhf_ngn, employer_pension_ngn,
      total_burn_ngn, status, created_by, run_options,
      period_type, employee_count, bonuses_json, allowances_json
    ) VALUES (
      p_period, p_segment_id, p_company_id,
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
