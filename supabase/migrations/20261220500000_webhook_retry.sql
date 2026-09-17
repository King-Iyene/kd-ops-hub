-- Webhook delivery retries with exponential backoff.
--
-- Before this, webhook-dispatcher counted a single failed HTTP call as a
-- real failure immediately (incrementing failure_count, auto-disabling
-- after 10). A receiver having one bad minute — a redeploy, a cold start,
-- a transient 502 — permanently counted against it exactly the same as a
-- genuinely dead endpoint. This adds real retry/backoff (see
-- supabase/functions/_shared/webhook-retry.ts for the schedule) so only a
-- delivery that fails every attempt counts as a real failure.

ALTER TABLE nc_meta.webhook_deliveries
  ADD COLUMN IF NOT EXISTS payload_json TEXT,
  ADD COLUMN IF NOT EXISTS attempt_number INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS given_up BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS parent_delivery_id UUID REFERENCES nc_meta.webhook_deliveries(id) ON DELETE SET NULL;

-- Only rows with a due, not-yet-superseded retry are ever queried by the
-- worker — a partial index keeps that scan cheap regardless of how many
-- historical (already-resolved) rows accumulate.
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_due_retry
  ON nc_meta.webhook_deliveries (next_retry_at)
  WHERE next_retry_at IS NOT NULL AND given_up = false;

-- Atomic claim for the retry worker. pg_cron fires every minute; if a tick
-- backs up (many due retries, each with a 10s HTTP timeout) it can still be
-- running when the next one starts. A plain "SELECT due rows, process them,
-- clear next_retry_at" would let two overlapping ticks both pick up the same
-- row and double-send it to the receiver. FOR UPDATE SKIP LOCKED is the
-- standard Postgres job-queue pattern for exactly this: two concurrent
-- callers get disjoint batches, never overlapping ones.
CREATE OR REPLACE FUNCTION nc_meta.claim_due_webhook_deliveries(p_limit INTEGER DEFAULT 50)
RETURNS SETOF nc_meta.webhook_deliveries
LANGUAGE sql
SECURITY DEFINER
SET search_path = nc_meta, pg_temp
AS $$
  UPDATE nc_meta.webhook_deliveries
  SET next_retry_at = NULL
  WHERE id IN (
    SELECT id FROM nc_meta.webhook_deliveries
    WHERE success = false AND given_up = false AND next_retry_at IS NOT NULL AND next_retry_at <= now()
    ORDER BY next_retry_at
    FOR UPDATE SKIP LOCKED
    LIMIT p_limit
  )
  RETURNING *;
$$;

COMMENT ON FUNCTION nc_meta.claim_due_webhook_deliveries IS
  'Atomically claims up to p_limit due webhook_deliveries rows (clearing '
  'next_retry_at so no other concurrent caller can claim the same rows) and '
  'returns them for webhook-retry-worker to process.';

-- Redefine trim_webhook_deliveries (from 20261220400000) now that a row can
-- be the live head of an in-progress retry chain: the original version
-- purged purely by recency, so a chatty webhook with >50 delivery rows could
-- have its still-pending retry silently deleted before it ever fired, with
-- no failure recorded and no further retry — a silent drop. Never purge a
-- row that still has a scheduled next_retry_at, regardless of the 50-cap.
CREATE OR REPLACE FUNCTION nc_meta.trim_webhook_deliveries()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM nc_meta.webhook_deliveries
  WHERE webhook_id = NEW.webhook_id
    AND next_retry_at IS NULL
    AND id NOT IN (
      SELECT id FROM nc_meta.webhook_deliveries
      WHERE webhook_id = NEW.webhook_id
      ORDER BY created_at DESC
      LIMIT 50
    );
  RETURN NEW;
END;
$$;

-- Enable extensions (no-op if already enabled by an earlier cron worker).
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Same Vault-backed tick pattern as tick_batch_worker() (see
-- 20260730000005_batch_worker_cron.sql) — reuses the SAME cron_shared_secret
-- Vault entry that worker already required you to set up, so the only new
-- setup needed here is registering this function's own URL:
--
--   select vault.create_secret(
--     'https://<project-ref>.supabase.co/functions/v1/webhook-retry-worker',
--     'webhook_retry_worker_url'
--   );
CREATE OR REPLACE FUNCTION public.tick_webhook_retry_worker()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_url    text;
  v_secret text;
BEGIN
  SELECT decrypted_secret INTO v_url    FROM vault.decrypted_secrets WHERE name = 'webhook_retry_worker_url';
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'cron_shared_secret';

  IF v_url IS NULL OR v_secret IS NULL THEN
    RAISE NOTICE 'tick_webhook_retry_worker: Vault secrets not configured yet — skipping';
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

COMMENT ON FUNCTION public.tick_webhook_retry_worker() IS
  'Invoked by pg_cron every minute. Calls webhook-retry-worker to resend any '
  'webhook_deliveries row whose next_retry_at is due.';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'webhook-retry-tick') THEN
    PERFORM cron.unschedule('webhook-retry-tick');
  END IF;
END;
$$;

SELECT cron.schedule(
  'webhook-retry-tick',
  '* * * * *',
  $$ SELECT public.tick_webhook_retry_worker(); $$
);
