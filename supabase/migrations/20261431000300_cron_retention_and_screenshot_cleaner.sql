-- Two jobs that had nothing to run them:
--   * data-retention-runner (Settings -> Data Retention promises "scheduled runs", but only the admin's "Run now" ever
--     called the function), and
--   * timetrack-screenshot-cleaner (new, see 20261431000200_screenshot_storage_cleanup.sql).
--
-- Same shape as 20260730000005_batch_worker_cron.sql / 20261411000400 (agent_dispatch): a tick function reads the shared
-- secret and the function URL from Vault and POSTs with X-Cron-Secret. The URL comes from its own Vault secret if one
-- exists, otherwise it is derived from the already-configured `batch_worker_url`; if neither (or `cron_shared_secret`)
-- exists the tick does nothing and says so in a NOTICE, so this migration never errors and never calls anything half
-- configured.
--
-- Idempotent: functions are CREATE OR REPLACE, each job is unscheduled before it is scheduled.
-- Requires the edge functions to be deployed (deploy-edge-functions.yml does that on merge).

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.tick_data_retention_runner()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_url    text;
  v_secret text;
BEGIN
  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'data_retention_runner_url';
  IF v_url IS NULL THEN
    SELECT regexp_replace(decrypted_secret, '/[^/]+/?$', '/data-retention-runner') INTO v_url
      FROM vault.decrypted_secrets WHERE name = 'batch_worker_url';
  END IF;
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'cron_shared_secret';

  IF v_url IS NULL OR v_secret IS NULL THEN
    RAISE NOTICE 'tick_data_retention_runner: Vault secrets not configured yet — skipping';
    RETURN;
  END IF;

  -- Cheap short-circuit: nothing to ping unless an admin has switched a policy on.
  IF NOT EXISTS (SELECT 1 FROM public.retention_policies WHERE mode <> 'off' AND NOT all_paused) THEN
    RETURN;
  END IF;

  PERFORM net.http_post(
    url     := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'X-Cron-Secret', v_secret),
    body    := '{}'::jsonb
  );
END;
$$;

COMMENT ON FUNCTION public.tick_data_retention_runner() IS
  'Invoked daily by pg_cron. Calls the data-retention-runner edge function (all active, un-paused policies; the function '
  'itself enforces the 7-day first-run delay) only when at least one policy is switched on.';

CREATE OR REPLACE FUNCTION public.tick_timetrack_screenshot_cleaner()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_url    text;
  v_secret text;
BEGIN
  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'timetrack_screenshot_cleaner_url';
  IF v_url IS NULL THEN
    SELECT regexp_replace(decrypted_secret, '/[^/]+/?$', '/timetrack-screenshot-cleaner') INTO v_url
      FROM vault.decrypted_secrets WHERE name = 'batch_worker_url';
  END IF;
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'cron_shared_secret';

  IF v_url IS NULL OR v_secret IS NULL THEN
    RAISE NOTICE 'tick_timetrack_screenshot_cleaner: Vault secrets not configured yet — skipping';
    RETURN;
  END IF;

  -- Only ping the function when files are actually waiting.
  IF NOT EXISTS (SELECT 1 FROM public.storage_delete_queue WHERE bucket = 'timetrack-screenshots' AND attempts < 5) THEN
    RETURN;
  END IF;

  PERFORM net.http_post(
    url     := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'X-Cron-Secret', v_secret),
    body    := '{}'::jsonb
  );
END;
$$;

COMMENT ON FUNCTION public.tick_timetrack_screenshot_cleaner() IS
  'Invoked daily by pg_cron, after the 03:00 activity-log purge. Calls the timetrack-screenshot-cleaner edge function when '
  'screenshot files are queued for removal.';

REVOKE ALL ON FUNCTION public.tick_data_retention_runner() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tick_timetrack_screenshot_cleaner() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'data-retention-runner-daily') THEN
    PERFORM cron.unschedule('data-retention-runner-daily');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'timetrack-screenshot-cleaner-daily') THEN
    PERFORM cron.unschedule('timetrack-screenshot-cleaner-daily');
  END IF;
END;
$$;

-- 03:30 UTC: after purge-old-activity-logs-daily (03:00), so the day's purged rows are queued by then.
SELECT cron.schedule('timetrack-screenshot-cleaner-daily', '30 3 * * *', $$ SELECT public.tick_timetrack_screenshot_cleaner(); $$);
-- 04:20 UTC
SELECT cron.schedule('data-retention-runner-daily', '20 4 * * *', $$ SELECT public.tick_data_retention_runner(); $$);
