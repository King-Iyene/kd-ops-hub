-- =============================================================================
-- Weekly timesheet approvals. Submitting locks nothing by itself; only an
-- APPROVED week sets locked_at, which a trigger on time_entries then enforces
-- against further inserts/updates/deletes for that employee/week — except
-- for an admin override, which is written to audit_logs via log_audit().
-- =============================================================================

CREATE TABLE public.time_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  week_start_date date NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'approved', 'rejected')),
  approver_id uuid REFERENCES public.profiles(id),
  comment text,
  submitted_at timestamptz,
  decided_at timestamptz,
  locked_at timestamptz,
  total_hours numeric(8,2) NOT NULL DEFAULT 0,
  billable_hours numeric(8,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, week_start_date)
);
CREATE INDEX time_approvals_employee_idx ON public.time_approvals(employee_id, week_start_date);

-- Submit a week: computes totals SERVER-SIDE from time_entries (never trust
-- a client-provided total — this is the exact lesson from the payment-batch
-- incident: an aggregate must be derived from the real rows, not carried).
CREATE OR REPLACE FUNCTION public.time_submit_week(p_week_start date)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_total numeric;
  v_billable numeric;
BEGIN
  SELECT COALESCE(SUM(duration_minutes), 0) / 60.0,
         COALESCE(SUM(duration_minutes) FILTER (WHERE is_billable), 0) / 60.0
  INTO v_total, v_billable
  FROM public.time_entries
  WHERE employee_id = auth.uid()
    AND start_time::date >= p_week_start AND start_time::date < p_week_start + 7
    AND end_time IS NOT NULL;

  INSERT INTO public.time_approvals (employee_id, week_start_date, status, submitted_at, total_hours, billable_hours)
  VALUES (auth.uid(), p_week_start, 'submitted', now(), v_total, v_billable)
  ON CONFLICT (employee_id, week_start_date) DO UPDATE SET
    status = 'submitted', submitted_at = now(), total_hours = v_total, billable_hours = v_billable,
    approver_id = NULL, comment = NULL, decided_at = NULL, locked_at = NULL
  WHERE public.time_approvals.status IN ('draft', 'rejected')
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'This week is already submitted or approved';
  END IF;

  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.time_submit_week(date) TO authenticated;

CREATE OR REPLACE FUNCTION public.time_decide_approval(p_approval_id uuid, p_decision text, p_comment text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_row public.time_approvals;
BEGIN
  IF p_decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Invalid decision %', p_decision;
  END IF;
  IF NOT public.time_has_capability('approve_timesheets') THEN
    RAISE EXCEPTION 'Not permitted to approve timesheets';
  END IF;

  SELECT * INTO v_row FROM public.time_approvals WHERE id = p_approval_id;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Approval % not found', p_approval_id;
  END IF;
  IF v_row.status <> 'submitted' THEN
    RAISE EXCEPTION 'Only a submitted week can be decided (current status: %)', v_row.status;
  END IF;

  UPDATE public.time_approvals
  SET status = p_decision, approver_id = auth.uid(), comment = p_comment, decided_at = now(),
      locked_at = CASE WHEN p_decision = 'approved' THEN now() ELSE NULL END
  WHERE id = p_approval_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.time_decide_approval(uuid, text, text) TO authenticated;

-- Admin-only override to reopen an approved/locked week. Logged to audit_logs.
CREATE OR REPLACE FUNCTION public.time_admin_unlock_week(p_approval_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_row public.time_approvals;
BEGIN
  IF public.current_user_role() NOT IN ('super_admin', 'admin') THEN
    RAISE EXCEPTION 'Only an admin can unlock an approved week';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 5 THEN
    RAISE EXCEPTION 'A reason of at least 5 characters is required to unlock a week';
  END IF;

  SELECT * INTO v_row FROM public.time_approvals WHERE id = p_approval_id;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Approval % not found', p_approval_id;
  END IF;

  UPDATE public.time_approvals SET status = 'draft', locked_at = NULL WHERE id = p_approval_id;

  PERFORM public.log_audit(
    'timetrack_week_unlocked',
    format('Admin unlocked week of %s for employee %s: %s', v_row.week_start_date, v_row.employee_id, p_reason),
    jsonb_build_object('approval_id', p_approval_id, 'employee_id', v_row.employee_id, 'week_start_date', v_row.week_start_date)
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.time_admin_unlock_week(uuid, text) TO authenticated;

-- Enforce the lock on time_entries writes.
CREATE OR REPLACE FUNCTION public.time_entries_check_lock()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_employee_id uuid;
  v_week_date date;
  v_locked boolean;
BEGIN
  v_employee_id := COALESCE(NEW.employee_id, OLD.employee_id);
  v_week_date := date_trunc('week', COALESCE(NEW.start_time, OLD.start_time))::date;

  SELECT (locked_at IS NOT NULL) INTO v_locked
  FROM public.time_approvals
  WHERE employee_id = v_employee_id AND week_start_date = v_week_date;

  IF v_locked AND public.current_user_role() NOT IN ('super_admin', 'admin') THEN
    RAISE EXCEPTION 'This week is approved and locked. Ask an admin to unlock it first.';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER time_entries_check_lock_trg
  BEFORE INSERT OR UPDATE OR DELETE ON public.time_entries
  FOR EACH ROW EXECUTE FUNCTION public.time_entries_check_lock();

ALTER TABLE public.time_approvals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "time_approvals_read" ON public.time_approvals
  FOR SELECT TO authenticated USING (
    employee_id = auth.uid() OR public.time_has_capability('approve_timesheets')
  );
CREATE POLICY "time_approvals_write_via_rpc_only" ON public.time_approvals
  FOR ALL TO authenticated USING (false) WITH CHECK (false);
