-- =============================================================================
-- Section 10 support schema: the native desktop agent (Electron, under
-- desktop-agent/ at the repo root — NOT part of the Vite web app) writes
-- here using the same Supabase Auth session as the web app (no second
-- login system). This migration only adds the backend; the agent and its
-- admin review UI are separate deliverables in the same push.
--
-- Also adds optional GPS-at-clock-in to time_attendance_entries, mirroring
-- the existing attendance_records geo/selfie pattern (20261002000700) —
-- this part needs no native agent at all, just the browser Geolocation API,
-- so field staff get location-stamped clock-in immediately.
-- =============================================================================

ALTER TABLE public.time_attendance_entries
  ADD COLUMN IF NOT EXISTS clock_in_lat  numeric,
  ADD COLUMN IF NOT EXISTS clock_in_lng  numeric,
  ADD COLUMN IF NOT EXISTS clock_out_lat numeric,
  ADD COLUMN IF NOT EXISTS clock_out_lng numeric;

-- ---------------------------------------------------------------------------
-- Per-employee agent configuration. Row-per-employee; absent = agent not
-- enabled for them (fail-closed — the agent checks this before it ever
-- captures anything).
-- ---------------------------------------------------------------------------
CREATE TABLE public.time_agent_settings (
  employee_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  is_enabled boolean NOT NULL DEFAULT false,
  capture_interval_minutes integer NOT NULL DEFAULT 10 CHECK (capture_interval_minutes >= 1),
  screenshots_enabled boolean NOT NULL DEFAULT false,
  blur_screenshots boolean NOT NULL DEFAULT true,
  retention_days integer NOT NULL DEFAULT 30 CHECK (retention_days >= 1),
  updated_by uuid REFERENCES public.profiles(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Productivity classification rules (admin-editable, no redeploy needed).
-- First matching rule by priority wins; app_name/title_contains are plain
-- case-insensitive substring matches — good enough for v1, no regex engine
-- needed client-side.
-- ---------------------------------------------------------------------------
CREATE TABLE public.time_productivity_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_name_contains text,
  title_contains text,
  category text NOT NULL CHECK (category IN ('productive', 'neutral', 'unproductive')),
  priority integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (app_name_contains IS NOT NULL OR title_contains IS NOT NULL)
);

-- ---------------------------------------------------------------------------
-- Activity log: one row per capture interval tick.
-- ---------------------------------------------------------------------------
CREATE TABLE public.time_activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  window_title text,
  app_name text,
  productivity_category text CHECK (productivity_category IN ('productive', 'neutral', 'unproductive', NULL)),
  captured_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX time_activity_logs_employee_idx ON public.time_activity_logs(employee_id, captured_at);

CREATE TABLE public.time_screenshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  activity_log_id uuid REFERENCES public.time_activity_logs(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX time_screenshots_employee_idx ON public.time_screenshots(employee_id, captured_at);

-- Storage bucket for screenshots — private; every read goes through a
-- signed URL generated server-side for an authorized viewer.
INSERT INTO storage.buckets (id, name, public)
VALUES ('timetrack-screenshots', 'timetrack-screenshots', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "timetrack_screenshots_own_insert" ON storage.objects;
CREATE POLICY "timetrack_screenshots_own_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'timetrack-screenshots' AND auth.uid()::text = split_part(name, '/', 1));

DROP POLICY IF EXISTS "timetrack_screenshots_read" ON storage.objects;
CREATE POLICY "timetrack_screenshots_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'timetrack-screenshots'
    AND (auth.uid()::text = split_part(name, '/', 1) OR public.time_has_capability('view_others_time'))
  );

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.time_agent_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_productivity_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_screenshots ENABLE ROW LEVEL SECURITY;

-- Grant the one new capability this section needs, to the seeded Admin role.
UPDATE public.time_roles
SET capabilities = capabilities || jsonb_build_object('manage_activity_tracking', true)
WHERE role_key = 'time_admin';

CREATE POLICY "time_agent_settings_read" ON public.time_agent_settings
  FOR SELECT TO authenticated USING (
    employee_id = auth.uid() OR public.time_has_capability('manage_activity_tracking')
  );
CREATE POLICY "time_agent_settings_write" ON public.time_agent_settings
  FOR ALL TO authenticated
  USING (public.time_has_capability('manage_activity_tracking'))
  WITH CHECK (public.time_has_capability('manage_activity_tracking'));

CREATE POLICY "time_productivity_rules_read" ON public.time_productivity_rules
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "time_productivity_rules_write" ON public.time_productivity_rules
  FOR ALL TO authenticated
  USING (public.time_has_capability('manage_activity_tracking'))
  WITH CHECK (public.time_has_capability('manage_activity_tracking'));

-- Activity logs/screenshots: an employee can only INSERT their own
-- (the agent authenticates as them), and only if the agent is actually
-- enabled for them server-side — fail-closed even if the agent binary
-- is somehow pointed at an employee it shouldn't be.
CREATE POLICY "time_activity_logs_read" ON public.time_activity_logs
  FOR SELECT TO authenticated USING (
    employee_id = auth.uid() OR public.time_has_capability('manage_activity_tracking')
  );
CREATE POLICY "time_activity_logs_insert" ON public.time_activity_logs
  FOR INSERT TO authenticated WITH CHECK (
    employee_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.time_agent_settings s WHERE s.employee_id = auth.uid() AND s.is_enabled)
  );

CREATE POLICY "time_screenshots_read" ON public.time_screenshots
  FOR SELECT TO authenticated USING (
    employee_id = auth.uid() OR public.time_has_capability('manage_activity_tracking')
  );
CREATE POLICY "time_screenshots_insert" ON public.time_screenshots
  FOR INSERT TO authenticated WITH CHECK (
    employee_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.time_agent_settings s WHERE s.employee_id = auth.uid() AND s.is_enabled AND s.screenshots_enabled)
  );

-- ---------------------------------------------------------------------------
-- Retention purge — same pattern as purge_old_batch_item_snapshots /
-- purge_archived_payment_batches. Per-employee retention_days from
-- time_agent_settings; falls back to 30 for an employee with no row
-- (shouldn't happen since logs require a settings row to insert at all).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.purge_old_activity_logs()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_deleted integer;
BEGIN
  WITH purged AS (
    DELETE FROM public.time_activity_logs l
    USING public.time_agent_settings s
    WHERE s.employee_id = l.employee_id
      AND l.captured_at < now() - make_interval(days => s.retention_days)
    RETURNING l.id
  )
  SELECT count(*) INTO v_deleted FROM purged;
  RETURN v_deleted;
END;
$$;
REVOKE ALL ON FUNCTION public.purge_old_activity_logs() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purge_old_activity_logs() TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-old-activity-logs-daily') THEN
      PERFORM cron.unschedule('purge-old-activity-logs-daily');
    END IF;
    PERFORM cron.schedule('purge-old-activity-logs-daily', '0 3 * * *',
      $cron$ SELECT public.purge_old_activity_logs(); $cron$);
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
