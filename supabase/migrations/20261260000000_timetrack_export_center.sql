-- =============================================================================
-- Export Center: choose data type, date range, format, and an optional
-- scheduled/recurring export. On-demand export is just a client-side CSV
-- download (reuses existing RLS, no new schema needed for that). This
-- migration adds the schema for the RECURRING half: schedules a cron tick
-- that invokes an edge function (timetrack-export-runner) to generate and
-- email a signed download link — same pg_cron + pg_net + Vault pattern as
-- the existing batch-worker / fx-rate-sync cron jobs in this repo.
-- =============================================================================

CREATE TABLE public.time_export_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  data_type text NOT NULL CHECK (data_type IN ('time_entries', 'activity', 'expenses')),
  format text NOT NULL DEFAULT 'csv' CHECK (format = 'csv'), -- only CSV supported today; kept as a column so xlsx/PDF can be added without a new table
  lookback_days integer NOT NULL DEFAULT 7 CHECK (lookback_days BETWEEN 1 AND 366),
  frequency text NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly')),
  day_of_week smallint CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Mon..6=Sun, used when frequency='weekly'
  day_of_month smallint CHECK (day_of_month BETWEEN 1 AND 28), -- capped at 28 so every month has that day
  recipient_email text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  last_run_at timestamptz,
  next_run_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (frequency <> 'weekly' OR day_of_week IS NOT NULL),
  CHECK (frequency <> 'monthly' OR day_of_month IS NOT NULL)
);

ALTER TABLE public.time_export_schedules ENABLE ROW LEVEL SECURITY;

-- Export Center is an admin-facing feature (it can reach everyone's time
-- entries/activity/expenses, not just the caller's own), same gate as the
-- Agent & policy / Remote work detection pages.
CREATE POLICY "time_export_schedules_all" ON public.time_export_schedules
  FOR ALL TO authenticated
  USING (public.current_user_role() IN ('super_admin', 'admin'))
  WITH CHECK (public.current_user_role() IN ('super_admin', 'admin'));

-- ---------------------------------------------------------------------------
-- Private storage bucket for generated export files. No client-facing read
-- policy: the edge function (service role) uploads and mints a short-lived
-- signed URL emailed to the recipient, same shape as every other
-- service-role-driven bucket in this repo.
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('timetrack-exports', 'timetrack-exports', false)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- pg_cron tick, mirroring tick_batch_worker() / fx rate sync's cron wiring.
-- Vault secrets reused: cron_shared_secret (already set for other jobs).
-- One new secret to add after deploy:
--   select vault.create_secret(
--     'https://<project-ref>.supabase.co/functions/v1/timetrack-export-runner',
--     'timetrack_export_runner_url'
--   );
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.tick_timetrack_export_runner()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_url    text;
  v_secret text;
BEGIN
  SELECT decrypted_secret INTO v_url    FROM vault.decrypted_secrets WHERE name = 'timetrack_export_runner_url';
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'cron_shared_secret';

  IF v_url IS NULL OR v_secret IS NULL THEN
    RAISE NOTICE 'tick_timetrack_export_runner: Vault secrets not configured yet — skipping';
    RETURN;
  END IF;

  -- Only ping the edge function when something is actually due, so this
  -- hourly tick doesn't cold-start the function 24x/day for nothing.
  IF NOT EXISTS (
    SELECT 1 FROM public.time_export_schedules
    WHERE is_active AND next_run_at <= now()
  ) THEN
    RETURN;
  END IF;

  PERFORM net.http_post(
    url     := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'X-Cron-Secret', v_secret),
    body    := '{}'::jsonb
  );
END;
$$;

COMMENT ON FUNCTION public.tick_timetrack_export_runner() IS
  'Invoked hourly by pg_cron. Pings the timetrack-export-runner edge function '
  'only when a time_export_schedules row is actually due.';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'timetrack-export-runner-tick') THEN
    PERFORM cron.unschedule('timetrack-export-runner-tick');
  END IF;
END;
$$;

SELECT cron.schedule(
  'timetrack-export-runner-tick',
  '0 * * * *',
  $$ SELECT public.tick_timetrack_export_runner(); $$
);

NOTIFY pgrst, 'reload schema';
