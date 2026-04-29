-- Batch-worker watchdog — picks up orphaned batches if the operator closes
-- their tab mid-run. Schedules the batch-worker edge function once a minute
-- to scan for any batch in 'processing' state whose updated_at is stale.
--
-- Requires:
--   • pg_cron + pg_net extensions (Supabase: enable in Database -> Extensions)
--   • Vault secrets: app.batch_worker_url + app.cron_shared_secret
--   • Edge function `batch-worker` deployed
--
-- Setup:
--   1. supabase functions deploy batch-worker
--   2. supabase secrets set CRON_SHARED_SECRET=$(openssl rand -hex 32)
--   3. In SQL Editor, after the migration runs:
--
--        select vault.create_secret(
--          '<your-paste-of-CRON_SHARED_SECRET>',
--          'cron_shared_secret'
--        );
--        select vault.create_secret(
--          'https://<project-ref>.supabase.co/functions/v1/batch-worker',
--          'batch_worker_url'
--        );
--
--   4. Run: select cron.schedule('batch-worker-tick', '* * * * *', $$ … $$)
--      below — the migration registers it for you, but you can re-run if
--      you change the URL/secret.

-- Enable extensions (no-op if already enabled).
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Helper that pulls config from Vault and POSTs to the worker. Putting this
-- in a function keeps the cron line tiny and makes it easy to update the URL
-- without altering the schedule.
CREATE OR REPLACE FUNCTION public.tick_batch_worker()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_url    text;
  v_secret text;
BEGIN
  -- Read the URL + shared secret from Vault. If missing, no-op silently —
  -- prevents the cron from spamming errors when the operator hasn't
  -- finished setup yet.
  SELECT decrypted_secret INTO v_url    FROM vault.decrypted_secrets WHERE name = 'batch_worker_url';
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'cron_shared_secret';

  IF v_url IS NULL OR v_secret IS NULL THEN
    RAISE NOTICE 'tick_batch_worker: Vault secrets not configured yet — skipping';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
                 'Content-Type',   'application/json',
                 'X-Cron-Secret',  v_secret
               ),
    body    := '{}'::jsonb
  );
END;
$$;

COMMENT ON FUNCTION public.tick_batch_worker() IS
  'Invoked by pg_cron every minute. Calls the batch-worker edge function in '
  'cron mode (no batch_id) so it picks up any batch stuck in processing > 60s.';

-- Unschedule any prior version of this job so re-running the migration is safe.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'batch-worker-tick') THEN
    PERFORM cron.unschedule('batch-worker-tick');
  END IF;
END;
$$;

-- Schedule the watchdog every minute.
SELECT cron.schedule(
  'batch-worker-tick',
  '* * * * *',
  $$ SELECT public.tick_batch_worker(); $$
);
