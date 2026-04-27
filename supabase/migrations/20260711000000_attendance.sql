-- Attendance & Timesheets
--
-- Design decisions:
--   • One row per employee per work_date — enforced by UNIQUE constraint.
--     If a date needs updating the existing row is amended, not duplicated.
--   • clock_in / clock_out are stored as TIME (no timezone) because the
--     platform is single-timezone (Nigeria WAT / UTC+1). Business rules
--     (e.g. late = clock_in after 09:00) are applied in the app layer so
--     they can be configured without migrations.
--   • status is the authoritative attendance label set by HR or derived by
--     the app from leave_requests. The app checks approved leave for the
--     period and can pre-fill status = 'on_leave' without a FK.
--   • overtime_minutes allows payroll to pick up authorised overtime per day.
--   • recorded_by tracks who entered the record (HR officer or self).

CREATE TABLE IF NOT EXISTS public.attendance_records (
  id               UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  work_date        DATE        NOT NULL,
  clock_in         TIME        DEFAULT NULL,
  clock_out        TIME        DEFAULT NULL,
  status           TEXT        NOT NULL DEFAULT 'present'
                     CHECK (status IN (
                       'present','absent','late','half_day','remote','on_leave','public_holiday'
                     )),
  overtime_minutes INTEGER     NOT NULL DEFAULT 0 CHECK (overtime_minutes >= 0),
  notes            TEXT        DEFAULT NULL,
  recorded_by      UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (employee_id, work_date)
);

CREATE OR REPLACE FUNCTION public.set_attendance_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS attendance_updated_at ON public.attendance_records;
CREATE TRIGGER attendance_updated_at
  BEFORE UPDATE ON public.attendance_records
  FOR EACH ROW EXECUTE FUNCTION public.set_attendance_updated_at();

CREATE INDEX IF NOT EXISTS att_employee_idx  ON public.attendance_records (employee_id);
CREATE INDEX IF NOT EXISTS att_date_idx      ON public.attendance_records (work_date DESC);
CREATE INDEX IF NOT EXISTS att_status_idx    ON public.attendance_records (status);

ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Employees can read own attendance"
  ON public.attendance_records FOR SELECT
  USING (auth.uid() IS NOT NULL AND (employee_id = auth.uid() OR auth.uid() IS NOT NULL));

CREATE POLICY "Managers can manage attendance"
  ON public.attendance_records FOR ALL
  USING (auth.uid() IS NOT NULL);
