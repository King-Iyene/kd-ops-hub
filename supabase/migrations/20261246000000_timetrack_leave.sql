-- =============================================================================
-- Leave / time-off requests — a distinct flow from weekly timesheet
-- approval (spec add-on, confirmed in scope): vacation/sick/other requests,
-- each with its own approver decision.
-- =============================================================================

CREATE TABLE public.time_leave_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  requires_approval boolean NOT NULL DEFAULT true,
  is_paid boolean NOT NULL DEFAULT true,
  is_archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.time_leave_types (name, requires_approval, is_paid) VALUES
  ('Vacation', true, true), ('Sick', true, true), ('Other', true, false);

CREATE TABLE public.time_leave_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  leave_type_id uuid NOT NULL REFERENCES public.time_leave_types(id),
  start_date date NOT NULL,
  end_date date NOT NULL,
  hours_per_day numeric(4,2), -- NULL = full day
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  approver_id uuid REFERENCES public.profiles(id),
  comment text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  CHECK (end_date >= start_date)
);
CREATE INDEX time_leave_requests_employee_idx ON public.time_leave_requests(employee_id, start_date);

CREATE OR REPLACE FUNCTION public.time_decide_leave_request(p_request_id uuid, p_decision text, p_comment text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_row public.time_leave_requests;
BEGIN
  IF p_decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Invalid decision %', p_decision;
  END IF;
  IF NOT public.time_has_capability('approve_leave') THEN
    RAISE EXCEPTION 'Not permitted to approve leave requests';
  END IF;

  SELECT * INTO v_row FROM public.time_leave_requests WHERE id = p_request_id;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'Leave request % not found', p_request_id; END IF;
  IF v_row.status <> 'pending' THEN RAISE EXCEPTION 'Only a pending request can be decided'; END IF;

  UPDATE public.time_leave_requests
  SET status = p_decision, approver_id = auth.uid(), comment = p_comment, decided_at = now()
  WHERE id = p_request_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.time_decide_leave_request(uuid, text, text) TO authenticated;

ALTER TABLE public.time_leave_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_leave_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "time_leave_types_read" ON public.time_leave_types FOR SELECT TO authenticated USING (true);
CREATE POLICY "time_leave_types_write" ON public.time_leave_types
  FOR ALL TO authenticated
  USING (public.time_has_capability('manage_leave_types'))
  WITH CHECK (public.time_has_capability('manage_leave_types'));

CREATE POLICY "time_leave_requests_read" ON public.time_leave_requests
  FOR SELECT TO authenticated USING (
    employee_id = auth.uid() OR public.time_has_capability('approve_leave')
  );
CREATE POLICY "time_leave_requests_insert" ON public.time_leave_requests
  FOR INSERT TO authenticated WITH CHECK (employee_id = auth.uid());
CREATE POLICY "time_leave_requests_cancel_own" ON public.time_leave_requests
  FOR UPDATE TO authenticated
  USING (employee_id = auth.uid() AND status = 'pending')
  WITH CHECK (employee_id = auth.uid() AND status = 'cancelled');
