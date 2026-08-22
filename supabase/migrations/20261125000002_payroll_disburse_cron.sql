-- =============================================================================
-- Scheduled payroll disbursement: registers a pg_cron tick (every minute,
-- matching batch-worker-tick's cadence) that calls the payroll-disburse
-- edge function via its cron-secret path. The function itself finds every
-- approved run whose scheduled_disburse_at has passed and processes it
-- (see supabase/functions/payroll-disburse/index.ts for the full pipeline).
--
-- Setup required after this migration runs (one-time):
--   1. supabase functions deploy payroll-disburse --no-verify-jwt
--      (already deployed via MCP for this environment)
--   2. Vault secret 'payroll_disburse_url' — created by this migration.
--   3. Vault secret 'cron_shared_secret' — already exists (reused from
--      batch-worker / payroll-scheduler / fx-rate-sync).
--
-- Idempotent — safe under supabase db push.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Vault secret holding this project's payroll-disburse function URL.
-- vault.create_secret errors on a duplicate name, so check first.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'payroll_disburse_url') THEN
    PERFORM vault.create_secret(
      'https://mseeurrvdcfxdmvqjjki.supabase.co/functions/v1/payroll-disburse',
      'payroll_disburse_url'
    );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.tick_payroll_disburse()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_url    text;
  v_secret text;
BEGIN
  SELECT decrypted_secret INTO v_url    FROM vault.decrypted_secrets WHERE name = 'payroll_disburse_url';
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'cron_shared_secret';

  IF v_url IS NULL OR v_secret IS NULL THEN
    RAISE NOTICE 'tick_payroll_disburse: Vault secrets not configured yet — skipping';
    RETURN;
  END IF;

  -- Cheap short-circuit: skip the HTTP round-trip entirely on ticks where
  -- nothing is due (the overwhelming majority — payroll disbursement is
  -- scheduled rarely, unlike batch-worker which drains constantly).
  IF NOT EXISTS (
    SELECT 1 FROM public.payroll_runs
     WHERE status = 'approved'
       AND scheduled_disburse_at IS NOT NULL
       AND scheduled_disburse_at <= now()
  ) THEN
    RETURN;
  END IF;

  PERFORM net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'X-Cron-Secret', v_secret
               ),
    body    := '{}'::jsonb
  );
END;
$$;

COMMENT ON FUNCTION public.tick_payroll_disburse() IS
  'Invoked by pg_cron every minute. Skips the HTTP call entirely unless at '
  'least one approved payroll run has scheduled_disburse_at <= now(). Calls '
  'the payroll-disburse edge function, which claims and dispatches every '
  'due run.';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'payroll-disburse-tick') THEN
    PERFORM cron.unschedule('payroll-disburse-tick');
  END IF;
END;
$$;

SELECT cron.schedule(
  'payroll-disburse-tick',
  '* * * * *',
  $$ SELECT public.tick_payroll_disburse(); $$
);

INSERT INTO public.cron_job_expectations (job_name, description, max_gap_minutes)
VALUES ('payroll-disburse-tick', 'Scheduled payroll disbursement sweep (every minute)', 10)
ON CONFLICT (job_name) DO UPDATE
  SET description = EXCLUDED.description,
      max_gap_minutes = EXCLUDED.max_gap_minutes;
