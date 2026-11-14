-- time_submit_week() had no guard against an empty week: a user could click
-- "Submit week for approval" on a week with zero logged time and it would
-- silently insert/update a time_approvals row with total_hours = 0, show a
-- success toast, and sit in every approver's queue as a real submission.
-- Add a server-side check (the client already disables the button for a
-- zero-hour week, but this is the actual guarantee — the RPC must refuse
-- it regardless of what called it).
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

  IF v_total = 0 THEN
    RAISE EXCEPTION 'Cannot submit a week with no logged time';
  END IF;

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

NOTIFY pgrst, 'reload schema';
