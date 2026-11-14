-- TimeCamp parity: Reports > Computer Activities > Productivity & Coaching > Goals.
-- Per-employee productivity targets (e.g. "6 productive hours/day" or
-- "70% efficiency/week"), checked against time_activity_logs at read time —
-- no new capture needed, this is config read against data that already exists.

CREATE TABLE public.time_activity_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  metric text NOT NULL CHECK (metric IN ('productive_hours', 'efficiency_pct')),
  period text NOT NULL CHECK (period IN ('daily', 'weekly')),
  target_value numeric NOT NULL CHECK (target_value >= 0),
  updated_by uuid REFERENCES public.profiles(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, metric, period)
);

ALTER TABLE public.time_activity_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "time_activity_goals_read" ON public.time_activity_goals
  FOR SELECT TO authenticated USING (
    employee_id = auth.uid() OR public.time_has_capability('manage_activity_tracking')
  );
CREATE POLICY "time_activity_goals_write" ON public.time_activity_goals
  FOR ALL TO authenticated
  USING (public.time_has_capability('manage_activity_tracking'))
  WITH CHECK (public.time_has_capability('manage_activity_tracking'));
