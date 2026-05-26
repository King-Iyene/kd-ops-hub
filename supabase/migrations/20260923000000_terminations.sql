-- =============================================================================
-- Structured employee offboarding / termination record.
--
-- Until now an employee was offboarded by a bare status flip to 'inactive' with
-- no exit record. This adds a terminations table capturing the type, reason,
-- notice/last-working-day, rehire eligibility, exit-interview notes and a final
-- settlement estimate, plus a completion RPC that records the exit and
-- deactivates the profile in one atomic, audited step.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.terminations (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id         uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  termination_type    text NOT NULL CHECK (termination_type IN
                        ('resignation', 'dismissal', 'redundancy', 'retirement', 'end_of_contract', 'other')),
  reason              text,
  notice_date         date,
  last_working_day    date,
  rehire_eligible     boolean NOT NULL DEFAULT true,
  exit_interview_notes text,
  final_settlement_ngn numeric,
  status              text NOT NULL DEFAULT 'initiated'
                        CHECK (status IN ('initiated', 'in_progress', 'completed', 'cancelled')),
  initiated_by        uuid REFERENCES public.profiles(id),
  completed_at        timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- At most one open offboarding per employee.
CREATE UNIQUE INDEX IF NOT EXISTS terminations_one_open
  ON public.terminations (employee_id)
  WHERE status IN ('initiated', 'in_progress');

ALTER TABLE public.terminations ENABLE ROW LEVEL SECURITY;

-- Read: HR/finance roles. Write: admins (the Employees screen is admin-only).
DROP POLICY IF EXISTS "terminations_select" ON public.terminations;
CREATE POLICY "terminations_select" ON public.terminations
  FOR SELECT TO authenticated
  USING (public.current_user_role() IN ('super_admin', 'admin', 'finance'));

DROP POLICY IF EXISTS "terminations_insert" ON public.terminations;
CREATE POLICY "terminations_insert" ON public.terminations
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role() IN ('super_admin', 'admin'));

DROP POLICY IF EXISTS "terminations_update" ON public.terminations;
CREATE POLICY "terminations_update" ON public.terminations
  FOR UPDATE TO authenticated
  USING (public.current_user_role() IN ('super_admin', 'admin'));

-- ── Completion RPC: record the exit + deactivate the profile atomically ──────
CREATE OR REPLACE FUNCTION public.complete_offboarding(p_termination_id uuid)
RETURNS public.terminations
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_term public.terminations;
  v_role text := public.current_user_role();
BEGIN
  IF v_role NOT IN ('super_admin', 'admin') THEN
    RAISE EXCEPTION 'Only super_admin/admin can complete offboarding' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_term FROM public.terminations WHERE id = p_termination_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Termination % not found', p_termination_id; END IF;
  IF v_term.status = 'completed' THEN
    RAISE EXCEPTION 'This offboarding is already complete' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  UPDATE public.terminations
     SET status = 'completed', completed_at = now(), updated_at = now()
   WHERE id = p_termination_id
  RETURNING * INTO v_term;

  -- Deactivate the employee. SECURITY DEFINER runs as the function owner, so the
  -- guard_profile_role_status trigger's "trusted context" bypass lets the status
  -- change through even though the caller is admin (not super_admin).
  UPDATE public.profiles SET status = 'inactive' WHERE id = v_term.employee_id;

  INSERT INTO public.audit_logs (action_type, description, performed_by, performed_by_name)
  VALUES (
    'employee_offboarded',
    format('Offboarding completed (%s) — employee deactivated', v_term.termination_type),
    auth.uid(),
    (SELECT full_name FROM public.profiles WHERE id = auth.uid())
  );

  RETURN v_term;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.complete_offboarding(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_offboarding(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
