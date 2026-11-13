-- =============================================================================
-- Daily attendance clock-in/out — distinct from project timers (time_entries).
-- One open attendance row (clock_out IS NULL) per employee at a time.
-- =============================================================================

CREATE TABLE public.time_attendance_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  clock_in timestamptz NOT NULL,
  clock_out timestamptz,
  source text NOT NULL DEFAULT 'web' CHECK (source IN ('web', 'kiosk')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (clock_out IS NULL OR clock_out >= clock_in)
);
CREATE INDEX time_attendance_entries_employee_idx ON public.time_attendance_entries(employee_id, clock_in);
CREATE UNIQUE INDEX time_attendance_one_open_idx
  ON public.time_attendance_entries(employee_id) WHERE clock_out IS NULL;

ALTER TABLE public.time_attendance_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "time_attendance_read" ON public.time_attendance_entries
  FOR SELECT TO authenticated USING (
    employee_id = auth.uid() OR public.time_has_capability('view_others_time')
  );
CREATE POLICY "time_attendance_write_own" ON public.time_attendance_entries
  FOR ALL TO authenticated
  USING (employee_id = auth.uid() OR public.current_user_role() IN ('super_admin', 'admin'))
  WITH CHECK (employee_id = auth.uid() OR public.current_user_role() IN ('super_admin', 'admin'));
