-- ═══════════════════════════════════════════════════════════════════════════════
-- Maker-checker for payroll_runs and budgets
-- ─────────────────────────────────────────────────────────────────────────────
-- payment_batches already has this control, hardened after a documented
-- incident (20260924000000_restore_payment_authorization_controls.sql): a
-- SECURITY DEFINER RPC blocks self-approval for non-admin roles, and a
-- BEFORE UPDATE trigger locks direct client writes to the approval columns
-- so the check can't be bypassed with a raw .update() call.
--
-- payroll_runs and budgets never got the same treatment. Both currently
-- approve via a raw client-side
--   .update({ status: 'approved', approved_by: profile.id })
-- with zero DB-level resistance — a finance user can draft a payroll run
-- (or a budget) and approve their own submission with nothing to stop them.
-- That's the same class of gap payment_batches had before it was fixed.
--
-- This migration applies the identical, proven pattern to both tables,
-- scaled down to what they actually need (no approver pools / co-approval
-- thresholds — those are payment_batches-specific complexity payroll and
-- budgets don't have a documented need for yet):
--   • approve_payroll_run(p_run_id)
--   • approve_budget(p_budget_id)
-- Both: row-locked read, status precondition, active-user check, role
-- check, and self-approval blocked unless the caller is admin/super_admin
-- (matching the exact rule payment_batches uses).
--
-- The lock triggers are narrowly scoped: they only block (a) any direct
-- write to approved_by, and (b) any direct status transition INTO
-- 'approved'. Every other transition (draft ↔ pending_approval, budget
-- rejection, payroll approved → paid) is untouched — those aren't
-- authorization-sensitive and restricting them would just be friction.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── payroll_runs ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.approve_payroll_run(p_run_id uuid)
RETURNS public.payroll_runs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run         public.payroll_runs;
  v_caller      uuid := auth.uid();
  v_caller_role text;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_run FROM public.payroll_runs WHERE id = p_run_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payroll run % not found', p_run_id;
  END IF;

  IF v_run.status NOT IN ('draft', 'pending_approval') THEN
    RAISE EXCEPTION 'Payroll run is not awaiting approval (current status: %)', v_run.status
      USING ERRCODE = 'invalid_parameter_value';
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

  UPDATE public.payroll_runs
     SET status = 'approved', approved_by = v_caller, updated_at = now()
   WHERE id = p_run_id
   RETURNING * INTO v_run;

  RETURN v_run;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.approve_payroll_run(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.approve_payroll_run(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public._enforce_payroll_run_approval_state_writes()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- SECURITY DEFINER RPCs (and service_role) execute as a non-'authenticated'
  -- role, so their writes pass straight through; only direct client writes
  -- from the 'authenticated' role are checked.
  IF current_user <> 'authenticated' THEN
    RETURN NEW;
  END IF;

  IF NEW.approved_by IS DISTINCT FROM OLD.approved_by THEN
    RAISE EXCEPTION 'Direct writes to approved_by are not allowed. Use approve_payroll_run().'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status = 'approved' THEN
    RAISE EXCEPTION 'Use approve_payroll_run() to approve a run'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payroll_runs_approval_state_lock ON public.payroll_runs;
CREATE TRIGGER trg_payroll_runs_approval_state_lock
  BEFORE UPDATE ON public.payroll_runs
  FOR EACH ROW EXECUTE FUNCTION public._enforce_payroll_run_approval_state_writes();

-- ── budgets ──────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.approve_budget(p_budget_id uuid)
RETURNS public.budgets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_budget      public.budgets;
  v_caller      uuid := auth.uid();
  v_caller_role text;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_budget FROM public.budgets WHERE id = p_budget_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Budget % not found', p_budget_id;
  END IF;

  IF v_budget.status NOT IN ('draft', 'pending_approval') THEN
    RAISE EXCEPTION 'Budget is not awaiting approval (current status: %)', v_budget.status
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT role INTO v_caller_role FROM public.profiles
   WHERE id = v_caller AND COALESCE(status, 'active') = 'active';
  IF v_caller_role IS NULL THEN
    RAISE EXCEPTION 'Caller is not an active user' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_caller_role NOT IN ('super_admin', 'admin', 'finance') THEN
    RAISE EXCEPTION 'Your role is not permitted to approve budgets'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_budget.created_by = v_caller AND v_caller_role NOT IN ('admin', 'super_admin') THEN
    RAISE EXCEPTION 'Self-approval is not allowed for your role — the person who drafted this budget cannot approve it'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.budgets
     SET status = 'approved', approved_by = v_caller, updated_at = now()
   WHERE id = p_budget_id
   RETURNING * INTO v_budget;

  RETURN v_budget;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.approve_budget(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.approve_budget(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public._enforce_budget_approval_state_writes()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_user <> 'authenticated' THEN
    RETURN NEW;
  END IF;

  IF NEW.approved_by IS DISTINCT FROM OLD.approved_by THEN
    RAISE EXCEPTION 'Direct writes to approved_by are not allowed. Use approve_budget().'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status = 'approved' THEN
    RAISE EXCEPTION 'Use approve_budget() to approve a budget'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_budgets_approval_state_lock ON public.budgets;
CREATE TRIGGER trg_budgets_approval_state_lock
  BEFORE UPDATE ON public.budgets
  FOR EACH ROW EXECUTE FUNCTION public._enforce_budget_approval_state_writes();
