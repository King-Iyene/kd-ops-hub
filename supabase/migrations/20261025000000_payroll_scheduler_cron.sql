-- =============================================================================
-- Fix: the payroll-scheduler edge function (auto-drafts payroll runs when a
-- pay schedule's processing window opens, via schedule_auto_draft()) was
-- built but never actually registered with pg_cron anywhere. Every other
-- background job in this project (batch-worker-tick, fx-rate-daily-sync,
-- heyreach-daily-sync, kdops_leave_accrual, etc.) has a `cron.schedule(...)`
-- call in a migration; this one only ever had a comment in the function file
-- showing the SQL an operator *could* run by hand. Nobody did, so payroll
-- auto-drafting has silently never run, and it wasn't even in
-- cron_job_expectations so the cron health monitor never flagged it missing.
--
-- Mirrors the exact batch-worker / fx-rate-sync pattern: a small SECURITY
-- DEFINER function reads the target URL + shared secret from Vault and POSTs
-- to the edge function, so no secret is embedded in this migration or in
-- cron.job's stored command text.
--
-- Setup required after this migration runs (one-time, same as batch-worker):
--   1. supabase functions deploy payroll-scheduler --no-verify-jwt
--   2. supabase secrets set CRON_SHARED_SECRET=... (already set — reused
--      from batch-worker/fx-rate-sync/heyreach-sync)
--   3. In SQL Editor:
--        select vault.create_secret(
--          'https://<project-ref>.supabase.co/functions/v1/payroll-scheduler',
--          'payroll_scheduler_url'
--        );
--      (vault secret 'cron_shared_secret' should already exist from the
--      batch-worker setup — reused here, not recreated.)
--
-- Idempotent — safe under supabase db push.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.tick_payroll_scheduler()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_url    text;
  v_secret text;
BEGIN
  SELECT decrypted_secret INTO v_url    FROM vault.decrypted_secrets WHERE name = 'payroll_scheduler_url';
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'cron_shared_secret';

  IF v_url IS NULL OR v_secret IS NULL THEN
    RAISE NOTICE 'tick_payroll_scheduler: Vault secrets not configured yet — skipping';
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

COMMENT ON FUNCTION public.tick_payroll_scheduler() IS
  'Invoked by pg_cron daily at 06:00 UTC. Calls the payroll-scheduler edge '
  'function, which runs schedule_auto_draft() to create draft payroll runs '
  'for any pay schedule whose processing window has opened, then sends '
  'Finance/Admin notifications for new drafts and upcoming cutoffs.';

-- Unschedule any prior version of this job so re-running the migration is safe.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'payroll-auto-draft') THEN
    PERFORM cron.unschedule('payroll-auto-draft');
  END IF;
END;
$$;

-- 06:00 UTC == 07:00 Africa/Lagos, matching the window the edge function's
-- own header comment always documented but nothing actually scheduled.
SELECT cron.schedule(
  'payroll-auto-draft',
  '0 6 * * *',
  $$ SELECT public.tick_payroll_scheduler(); $$
);

-- Bring it under the same cron-health monitoring every other scheduled job
-- gets (public.cron_job_expectations / check_cron_health(), added in
-- 20261003000500_cron_reliability_and_monitoring.sql) so a future silent
-- failure raises an alert instead of going unnoticed again.
INSERT INTO public.cron_job_expectations (job_name, description, max_gap_minutes)
VALUES ('payroll-auto-draft', 'Payroll schedule auto-draft (daily 06:00 UTC)', 25 * 60)
ON CONFLICT (job_name) DO UPDATE
  SET description = EXCLUDED.description,
      max_gap_minutes = EXCLUDED.max_gap_minutes;
