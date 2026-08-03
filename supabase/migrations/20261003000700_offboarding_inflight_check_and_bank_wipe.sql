-- =============================================================================
-- complete_offboarding() (the RPC the Offboarding tab actually calls — not
-- the separate soft_delete_employee "anonymise" button) did two things and
-- nothing else: flip terminations.status and profiles.status. It never
-- checked whether a payroll run currently in flight still references this
-- employee, and it never scrubbed bank_name / bank_account_number /
-- bank_account_name / paystack_recipient_code — an offboarded employee's
-- bank details stayed live on their profile indefinitely.
--
-- Two related dangers this closes:
--   1. Wiping bank details while a payroll run is actively disbursing
--      (status='processing') would break that specific transfer mid-flight.
--   2. Leaving bank details live forever after offboarding is itself the
--      exposure — an inactive account's bank details have no reason to
--      still be readable/updatable once nothing more will ever be paid to
--      it.
--
-- Long-term shape, not a one-off patch: instead of hard-blocking
-- completion when a run is in flight (which would leave HR stuck), we
-- complete the deactivation immediately but DEFER the bank-detail wipe
-- until the in-flight run clears, tracked via a new
-- terminations.bank_details_wiped column and swept automatically by a
-- daily cron job — so the wipe always eventually happens without anyone
-- needing to remember to come back and do it by hand.
-- =============================================================================

ALTER TABLE public.terminations
  ADD COLUMN IF NOT EXISTS bank_details_wiped boolean NOT NULL DEFAULT false;

-- Backfill: any termination already completed before this migration has no
-- in-flight run to worry about retroactively, but we don't know its true
-- history — leave existing completed rows as bank_details_wiped=false so
-- the sweep below picks them up once and wipes them going forward. This is
-- a one-time catch-up, not a re-triggerable loop (the sweep only acts on
-- rows still false).

CREATE OR REPLACE FUNCTION public.employee_has_inflight_payroll(p_employee_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.payslips ps
      JOIN public.payroll_runs pr ON pr.id = ps.payroll_run_id
     WHERE ps.employee_id = p_employee_id
       AND pr.status IN ('approved', 'processing')
  );
$$;

COMMENT ON FUNCTION public.employee_has_inflight_payroll(uuid) IS
  'True if this employee has a payslip on a payroll run that is approved '
  '(about to disburse) or processing (actively disbursing right now). Used '
  'to decide whether it is safe to wipe an offboarded employee''s bank '
  'details immediately, or defer until the run clears.';

CREATE OR REPLACE FUNCTION public.complete_offboarding(p_termination_id uuid)
RETURNS public.terminations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_term     public.terminations;
  v_role     text := public.current_user_role();
  v_inflight boolean;
BEGIN
  IF v_role NOT IN ('super_admin', 'admin') THEN
    RAISE EXCEPTION 'Only super_admin/admin can complete offboarding' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_term FROM public.terminations WHERE id = p_termination_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Termination % not found', p_termination_id; END IF;
  IF v_term.status = 'completed' THEN
    RAISE EXCEPTION 'This offboarding is already complete' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  v_inflight := public.employee_has_inflight_payroll(v_term.employee_id);

  UPDATE public.terminations
     SET status = 'completed', completed_at = now(), updated_at = now()
   WHERE id = p_termination_id
  RETURNING * INTO v_term;

  -- Deactivate the employee. SECURITY DEFINER runs as the function owner, so the
  -- guard_profile_role_status trigger's "trusted context" bypass lets the status
  -- change through even though the caller is admin (not super_admin).
  UPDATE public.profiles SET status = 'inactive' WHERE id = v_term.employee_id;

  IF v_inflight THEN
    -- Defer the wipe — a payroll run still needs these bank details to pay
    -- this employee. The daily sweep below picks it up once that run
    -- clears. Notify admins so this isn't a silent gap.
    INSERT INTO public.audit_logs (action_type, description, performed_by, performed_by_name)
    VALUES (
      'employee_offboarded',
      'Offboarding completed — employee deactivated. Bank-detail wipe DEFERRED: an in-flight payroll run still references this employee.',
      auth.uid(),
      (SELECT full_name FROM public.profiles WHERE id = auth.uid())
    );

    INSERT INTO public.notifications (user_id, type, module, priority, title, body)
    SELECT id, 'offboarding_wipe_deferred', 'people', 'medium',
           'Bank-detail wipe deferred for offboarded employee',
           'An offboarded employee still has an in-flight payroll run — their bank details will be scrubbed automatically once it clears.'
      FROM public.profiles
     WHERE role IN ('super_admin', 'admin', 'finance') AND COALESCE(status, 'active') = 'active';
  ELSE
    UPDATE public.profiles
       SET bank_name                     = NULL,
           bank_account_number           = NULL,
           bank_account_name             = NULL,
           paystack_recipient_code       = NULL,
           paystack_recipient_verified_at = NULL
     WHERE id = v_term.employee_id;

    UPDATE public.terminations SET bank_details_wiped = true WHERE id = p_termination_id;

    INSERT INTO public.audit_logs (action_type, description, performed_by, performed_by_name)
    VALUES (
      'employee_offboarded',
      format('Offboarding completed (%s) — employee deactivated, bank details wiped', v_term.termination_type),
      auth.uid(),
      (SELECT full_name FROM public.profiles WHERE id = auth.uid())
    );
  END IF;

  SELECT * INTO v_term FROM public.terminations WHERE id = p_termination_id;
  RETURN v_term;
END;
$$;

COMMENT ON FUNCTION public.complete_offboarding(uuid) IS
  'Deactivates the employee and wipes their bank details (bank_name, '
  'bank_account_number, bank_account_name, paystack_recipient_code). If a '
  'payroll run is still approved/processing for this employee, the wipe is '
  'deferred (terminations.bank_details_wiped stays false) and '
  'sweep_deferred_offboarding_wipes() picks it up once that run clears.';

-- ── Daily sweep: finish any wipe that was deferred at completion time ───────
CREATE OR REPLACE FUNCTION public.sweep_deferred_offboarding_wipes()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t RECORD;
  v_count integer := 0;
BEGIN
  FOR t IN
    SELECT * FROM public.terminations
     WHERE status = 'completed' AND bank_details_wiped = false
  LOOP
    CONTINUE WHEN public.employee_has_inflight_payroll(t.employee_id);

    UPDATE public.profiles
       SET bank_name                     = NULL,
           bank_account_number           = NULL,
           bank_account_name             = NULL,
           paystack_recipient_code       = NULL,
           paystack_recipient_verified_at = NULL
     WHERE id = t.employee_id;

    UPDATE public.terminations SET bank_details_wiped = true WHERE id = t.id;

    INSERT INTO public.audit_logs (action_type, description, performed_by_name)
    VALUES (
      'employee_offboarded',
      'Deferred bank-detail wipe completed by daily sweep (in-flight payroll run has cleared)',
      'pg_cron Scheduler'
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.sweep_deferred_offboarding_wipes() IS
  'Runs daily. Finishes any bank-detail wipe that complete_offboarding() '
  'deferred because a payroll run was still in flight for that employee.';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'kdops_offboarding_wipe_sweep') THEN
    PERFORM cron.unschedule('kdops_offboarding_wipe_sweep');
  END IF;
END;
$$;

SELECT cron.schedule(
  'kdops_offboarding_wipe_sweep',
  '0 4 * * *',
  $$ SELECT public.sweep_deferred_offboarding_wipes(); $$
);

INSERT INTO public.cron_job_expectations (job_name, description, max_gap_minutes) VALUES
  ('kdops_offboarding_wipe_sweep', 'Deferred offboarding bank-detail wipe sweep (04:00 UTC)', 25 * 60)
ON CONFLICT (job_name) DO UPDATE
  SET description = EXCLUDED.description,
      max_gap_minutes = EXCLUDED.max_gap_minutes;
