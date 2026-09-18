-- ═══════════════════════════════════════════════════════════════════════════════
-- Payroll run stage timestamps + status-change audit trail
-- ─────────────────────────────────────────────────────────────────────────────
-- Two related gaps, both found while building the run-detail status timeline.
--
-- 1. A payroll run records WHO approved it (payroll_runs.approved_by, written
--    only through approve_payroll_run() and protected by
--    trg_payroll_runs_approval_state_lock) but never WHEN. The only time
--    signal is updated_at, which every later write clobbers — scheduling a
--    disbursement, recording a disbursement error, settling deductions. So
--    after any of those, the approval time is simply gone.
--
--    That materially weakens the maker-checker control the approval RPC
--    exists to enforce: "this run was approved by someone other than its
--    drafter" is only half an answer if you cannot say when, or reconstruct
--    the order of events during a payroll dispute.
--
-- 2. No payroll_runs status change is written to audit_logs at all. Grepping
--    every migration and every logAudit() call site in src/ confirms it:
--    audit action types exist for payroll_run_recalled, payroll_run_deleted,
--    salary_disbursed and the two disbursement-scheduling actions, but the
--    three transitions that actually move money toward a person — submitted,
--    approved, paid — are recorded nowhere.
--
-- This migration fixes both, and deliberately fixes them at the DATABASE
-- layer rather than in the React client, because the client is not the only
-- writer: the payroll-scheduler, payroll-disburse and batch-worker edge
-- functions all move runs between statuses with service_role. Instrumenting
-- call sites one by one would leave exactly those paths — the automated ones
-- nobody watches — unrecorded.
--
-- ── What this migration does NOT do ──────────────────────────────────────────
-- It does not backfill historical runs. There is no trustworthy source to
-- backfill FROM (that is the whole point of gap 2), and inventing plausible
-- timestamps for runs that have already paid real salaries would be worse
-- than leaving them honestly blank — it would look like evidence. Existing
-- rows keep NULL stamps and the UI renders them as "not recorded", so a run
-- predating this migration is visibly distinguishable from one that was
-- properly tracked. Nothing about a paid run's money columns is touched.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. The columns ───────────────────────────────────────────────────────────
-- Nullable by design: a run that has not reached a stage has no timestamp for
-- it, and every historical run has none at all.

ALTER TABLE public.payroll_runs
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_at  timestamptz,
  ADD COLUMN IF NOT EXISTS paid_at      timestamptz;

COMMENT ON COLUMN public.payroll_runs.submitted_at IS
  'When the run was submitted for review (status -> pending_approval). NULL for runs that predate stage-timestamp tracking, or that were approved straight from draft.';
COMMENT ON COLUMN public.payroll_runs.approved_at IS
  'When the run was approved (status -> approved). Set by trigger, not by the client. NULL for runs that predate stage-timestamp tracking.';
COMMENT ON COLUMN public.payroll_runs.paid_at IS
  'When the run was marked paid (status -> paid). NULL for runs that predate stage-timestamp tracking.';

-- ── 2. Stamp the stages ──────────────────────────────────────────────────────
-- A BEFORE trigger, so this works for every writer: the React client, the
-- approve_payroll_run() RPC, and the edge functions running as service_role.
--
-- Recall-to-draft clears the downstream stamps on purpose. A recalled run is
-- genuinely back at the beginning, and leaving a stale "approved 3 days ago"
-- on a run now sitting in Draft would make the timeline lie. The full history
-- survives in audit_logs, which is append-only and hash-chained.

CREATE OR REPLACE FUNCTION public.trg_fn_stamp_payroll_run_stages()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'pending_approval' THEN
      NEW.submitted_at := now();

    ELSIF NEW.status = 'approved' THEN
      -- Only a genuine approval sets approved_at. payroll-disburse rolls a
      -- run back to 'approved' when a disbursement attempt fails
      -- (finalize_payroll_run_disbursement with p_new_status => 'approved'),
      -- and treating that as a fresh approval would overwrite the real
      -- approval time with the time of a failed payment retry — quietly
      -- destroying the very fact this migration exists to preserve.
      IF OLD.status IN ('draft', 'pending_approval') THEN
        NEW.approved_at := now();
      END IF;

    ELSIF NEW.status = 'paid' THEN
      NEW.paid_at := now();

    ELSIF NEW.status = 'draft' THEN
      NEW.submitted_at := NULL;
      NEW.approved_at  := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payroll_runs_stamp_stages ON public.payroll_runs;
CREATE TRIGGER trg_payroll_runs_stamp_stages
  BEFORE UPDATE ON public.payroll_runs
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_stamp_payroll_run_stages();

-- ── 3. Record every status change in the audit log ───────────────────────────
-- SECURITY DEFINER so the insert is not blocked by RLS on audit_logs for
-- whichever role performed the update. AFTER UPDATE so a transition that ends
-- up rejected by one of the other BEFORE triggers (the paid-run lock, the
-- approval-state lock) never leaves a log line claiming it happened.
--
-- auth.uid() is NULL when an edge function does this as service_role; that is
-- recorded faithfully as an automated action rather than being attributed to
-- a person who was not involved.

CREATE OR REPLACE FUNCTION public.trg_fn_audit_payroll_run_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_name   text;
  v_action text;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  -- Recall-to-draft is deliberately NOT logged here. The client already
  -- writes a 'payroll_run_recalled' row for it (src/pages/Payroll.tsx), and
  -- the React UI is the only writer that performs that transition — no edge
  -- function moves a run back to draft. Logging it here too would put two
  -- rows in the hash-chained audit log for one action, which is worse than
  -- the gap it would close.
  IF NEW.status = 'draft' THEN
    RETURN NEW;
  END IF;

  v_action := CASE
    WHEN NEW.status = 'pending_approval' THEN 'payroll_run_submitted'
    -- Distinguish a real approval from payroll-disburse rolling a failed
    -- disbursement back to 'approved'; recording the second as an approval
    -- would show an approver who never clicked anything.
    WHEN NEW.status = 'approved' AND OLD.status IN ('draft', 'pending_approval')
                                 THEN 'payroll_run_approved'
    WHEN NEW.status = 'approved' THEN 'payroll_run_disbursement_reverted'
    WHEN NEW.status = 'processing' THEN 'payroll_run_processing'
    WHEN NEW.status = 'paid'       THEN 'payroll_run_paid'
    ELSE 'payroll_run_status_changed'
  END;

  IF v_caller IS NOT NULL THEN
    SELECT full_name INTO v_name FROM public.profiles WHERE id = v_caller;
  END IF;

  INSERT INTO public.audit_logs (
    action_type, description, entity_type, entity_id,
    performed_by, performed_by_name, metadata
  ) VALUES (
    v_action,
    format(
      'Payroll run %s moved %s -> %s (%s employees, %s NGN)',
      NEW.period, OLD.status, NEW.status,
      COALESCE(NEW.employee_count, 0), COALESCE(NEW.total_burn_ngn, 0)
    ),
    'payroll_run',
    NEW.id,
    v_caller,
    COALESCE(v_name, CASE WHEN v_caller IS NULL THEN 'System (automated)' END),
    jsonb_build_object(
      'from_status',    OLD.status,
      'to_status',      NEW.status,
      'period',         NEW.period,
      'company_id',     NEW.company_id,
      'pay_group_id',   NEW.pay_group_id,
      'employee_count', NEW.employee_count,
      'total_burn_ngn', NEW.total_burn_ngn,
      'approved_by',    NEW.approved_by
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payroll_runs_audit_status ON public.payroll_runs;
CREATE TRIGGER trg_payroll_runs_audit_status
  AFTER UPDATE ON public.payroll_runs
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_audit_payroll_run_status();

-- ── 4. Index for the timeline query ──────────────────────────────────────────
-- The run-detail timeline reads this entity's history directly.

CREATE INDEX IF NOT EXISTS idx_audit_logs_entity
  ON public.audit_logs (entity_type, entity_id, created_at DESC)
  WHERE entity_type IS NOT NULL;
