-- Idle time: the computer counts as idle after 7 minutes without a key or mouse movement (was 5).
-- Admins can still change both numbers any time in Time Tracking > Activity > Tracker settings; this only sets the starting point.
ALTER TABLE public.time_agent_policy ALTER COLUMN away_time_after_minutes SET DEFAULT 7;
ALTER TABLE public.time_agent_policy ALTER COLUMN stop_tracking_when_unused_minutes SET DEFAULT 7;
UPDATE public.time_agent_policy SET away_time_after_minutes = 7, stop_tracking_when_unused_minutes = 7;

-- The in-browser "Still working?" prompt uses its own number: keep it the same.
ALTER TABLE public.time_idle_settings ALTER COLUMN idle_threshold_minutes SET DEFAULT 7;
UPDATE public.time_idle_settings SET idle_threshold_minutes = 7;
