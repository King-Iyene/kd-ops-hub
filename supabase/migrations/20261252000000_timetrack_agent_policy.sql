-- =============================================================================
-- Closes the remaining TimeCamp-parity gap on the native agent: the
-- company-wide "Desktop application settings" policy page (every control
-- TimeCamp exposes at Settings > Modules > Desktop application, audited
-- directly from a live TimeCamp account). The per-employee enable/interval/
-- screenshot/retention settings already exist in time_agent_settings
-- (20261250000000) — this migration adds the COMPANY-WIDE behavior policy
-- that sits alongside it, plus the weekly tracking-hours schedule.
--
-- Singleton-row pattern, same as time_rounding_settings / time_idle_settings.
-- =============================================================================

CREATE TABLE public.time_agent_policy (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),

  track_window_titles boolean NOT NULL DEFAULT true,
  track_only_when_timer_running boolean NOT NULL DEFAULT false,
  dismiss_overlapping_activities boolean NOT NULL DEFAULT true,
  keep_tracking_last_task boolean NOT NULL DEFAULT true,
  allow_closing_agent boolean NOT NULL DEFAULT true,

  -- "Keep all computer usage tracking information entirely private and not
  -- shared with anyone besides the user that tracked that time" — when true,
  -- time_agent_settings_read / time_activity_logs_read / time_screenshots_read
  -- policies are NOT changed by this table (RLS can't branch on a sibling
  -- table's value at the policy-definition level); instead the admin UI
  -- reads this flag and hides the "view others' activity" controls when set,
  -- and time_has_capability('manage_activity_tracking') is revoked from all
  -- non-owner roles via the application layer when this is enabled.
  private_tracking_only boolean NOT NULL DEFAULT false,

  private_time_minutes_per_day integer NOT NULL DEFAULT 0 CHECK (private_time_minutes_per_day >= 0),

  away_time_after_minutes integer NOT NULL DEFAULT 5 CHECK (away_time_after_minutes >= 1),
  away_time_labels text NOT NULL DEFAULT '',
  block_away_time_outside_first_last boolean NOT NULL DEFAULT false,

  choose_task_when_unmatched boolean NOT NULL DEFAULT false,
  no_task_timeout_minutes integer NOT NULL DEFAULT 0 CHECK (no_task_timeout_minutes >= 0), -- 0 = immediately
  allow_logging_overtime boolean NOT NULL DEFAULT true,

  stop_tracking_when_unused_minutes integer NOT NULL DEFAULT 5 CHECK (stop_tracking_when_unused_minutes >= 1),
  stop_at_daily_limit_weekdays smallint[] NOT NULL DEFAULT '{}', -- 0=Mon..6=Sun

  disable_split_away_time boolean NOT NULL DEFAULT false,
  use_different_settings_for_notebooks boolean NOT NULL DEFAULT false,

  updated_by uuid REFERENCES public.profiles(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.time_agent_policy (id) VALUES (true);

ALTER TABLE public.time_agent_policy ENABLE ROW LEVEL SECURITY;
CREATE POLICY "time_agent_policy_read" ON public.time_agent_policy FOR SELECT TO authenticated USING (true);
CREATE POLICY "time_agent_policy_write" ON public.time_agent_policy
  FOR UPDATE TO authenticated
  USING (public.current_user_role() IN ('super_admin', 'admin'))
  WITH CHECK (public.current_user_role() IN ('super_admin', 'admin'));

-- ---------------------------------------------------------------------------
-- "Track time in specific hours" — one row per weekday, from/to. Defaults to
-- the full day open (00:00–23:59:59) for every day, matching TimeCamp's
-- own unrestricted default.
-- ---------------------------------------------------------------------------
CREATE TABLE public.time_agent_tracking_hours (
  weekday smallint PRIMARY KEY CHECK (weekday BETWEEN 0 AND 6), -- 0=Mon..6=Sun
  from_time time NOT NULL DEFAULT '00:00:00',
  to_time time NOT NULL DEFAULT '23:59:59',
  updated_by uuid REFERENCES public.profiles(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.time_agent_tracking_hours (weekday)
VALUES (0), (1), (2), (3), (4), (5), (6);

ALTER TABLE public.time_agent_tracking_hours ENABLE ROW LEVEL SECURITY;
CREATE POLICY "time_agent_tracking_hours_read" ON public.time_agent_tracking_hours FOR SELECT TO authenticated USING (true);
CREATE POLICY "time_agent_tracking_hours_write" ON public.time_agent_tracking_hours
  FOR UPDATE TO authenticated
  USING (public.current_user_role() IN ('super_admin', 'admin'))
  WITH CHECK (public.current_user_role() IN ('super_admin', 'admin'));

NOTIFY pgrst, 'reload schema';
