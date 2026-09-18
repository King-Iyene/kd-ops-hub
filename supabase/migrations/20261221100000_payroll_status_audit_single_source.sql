-- ═══════════════════════════════════════════════════════════════════════════════
-- Payroll status audit: one row per transition, written in one place
-- ─────────────────────────────────────────────────────────────────────────────
-- Follow-up to 20261221000000, which added an AFTER UPDATE trigger writing an
-- audit_logs row for every payroll_runs status change.
--
-- That migration missed something: the React client ALREADY logged three of
-- those transitions itself —
--     logAudit('payroll_submitted', ...)   on submit
--     logAudit('payroll_approved',  ...)   on approve
--     logAudit('payroll_paid',      ...)   on mark-as-paid
-- so from the moment the trigger shipped, each of those actions wrote TWO
-- rows into a hash-chained audit log: one from the client, one from the
-- trigger. Duplicate entries in the one table whose job is to be the
-- authoritative record of who did what is worse than the gap it replaced —
-- it makes a payroll dispute harder to read, not easier.
--
-- Resolution: the DATABASE is the single source of truth, and the redundant
-- client calls are removed in the same change (src/pages/Payroll.tsx).
-- The trigger wins on every axis that matters here:
--
--   * Coverage. The client is one of four writers. payroll-scheduler,
--     payroll-disburse and batch-worker all move runs between statuses as
--     service_role and logged nothing at all.
--   * Linkage. log_audit() takes only (action_type, description, metadata)
--     — it cannot set entity_type/entity_id, so a client-written row is not
--     attached to the run it describes and can only be found by reading its
--     prose. The trigger sets entity_type='payroll_run' and entity_id, which
--     is what makes "show me this run's history" a real query.
--   * Detail. from_status/to_status, company, pay group, headcount and total
--     are recorded as structured metadata rather than baked into a sentence.
--
-- This migration therefore also starts logging recall-to-draft, which
-- 20261221000000 deliberately skipped only because the client was covering
-- it. That client call is removed too, so there is still exactly one row.
--
-- Net effect: exactly one audit row per payroll status transition, for every
-- writer, linked to its run. No historical rows are touched — runs audited
-- under the old action names keep them, and the audit log UI continues to
-- categorise both old and new names under "Payroll".
-- ═══════════════════════════════════════════════════════════════════════════════

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

  v_action := CASE
    WHEN NEW.status = 'pending_approval' THEN 'payroll_run_submitted'
    -- Distinguish a real approval from payroll-disburse rolling a failed
    -- disbursement back to 'approved'; recording the second as an approval
    -- would show an approver who never clicked anything.
    WHEN NEW.status = 'approved' AND OLD.status IN ('draft', 'pending_approval')
                                 THEN 'payroll_run_approved'
    WHEN NEW.status = 'approved'   THEN 'payroll_run_disbursement_reverted'
    WHEN NEW.status = 'processing' THEN 'payroll_run_processing'
    WHEN NEW.status = 'paid'       THEN 'payroll_run_paid'
    -- Now logged here rather than by the client, so a recall performed by
    -- anything other than the React UI is recorded too.
    WHEN NEW.status = 'draft'      THEN 'payroll_run_recalled'
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
