-- =============================================================================
-- HeyReach status sync — Phase 1 (read-only).
--
-- Adds the columns + audit log that let the `heyreach-sync` edge function
-- record each contractor's HeyReach sender-account health, and schedules a
-- daily 06:00 (Africa/Lagos) sync via pg_cron.
--
-- DESIGN NOTES
--   • Fully additive. No existing column, constraint, or row is modified.
--   • The manual lifecycle column `contractors.status` ('active'|'inactive')
--     is NEVER touched by the sync — it stays the team's source of truth.
--     The synced fields below are a SEPARATE, read-only signal.
--   • Display status is derived in the app from (status + heyreach_status):
--       manual 'inactive'        -> ⏸️ Inactive   (always wins)
--       no heyreach_email match  -> 🆕 Pending
--       heyreach_status='active' -> ✅ Active      (authIsValid = true)
--       heyreach_status='disconnected' -> ⚠️ Disconnected (authIsValid = false)
--
-- OPERATOR SETUP (run once, after deploy — see heyreach-sync function header):
--   supabase functions deploy heyreach-sync --no-verify-jwt
--   supabase secrets set HEYREACH_API_KEY=...        (from HeyReach Settings → API)
--   -- CRON_SHARED_SECRET already exists from batch-worker; reused here.
--   In SQL Editor:
--     select vault.create_secret(
--       'https://<project-ref>.supabase.co/functions/v1/heyreach-sync',
--       'heyreach_sync_url'
--     );
-- =============================================================================

-- ── 1. Synced fields on contractors (all nullable, additive) ─────────────────
ALTER TABLE public.contractors
  ADD COLUMN IF NOT EXISTS heyreach_account_id      bigint,
  ADD COLUMN IF NOT EXISTS heyreach_status          text,
  ADD COLUMN IF NOT EXISTS heyreach_auth_valid      boolean,
  ADD COLUMN IF NOT EXISTS heyreach_active_campaigns integer,
  ADD COLUMN IF NOT EXISTS heyreach_synced_at       timestamptz;

-- Guard the synced status to the known set. 'unmatched' = has a LinkedIn Email
-- on file but no corresponding HeyReach sender account was found.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'contractors_heyreach_status_check'
  ) THEN
    ALTER TABLE public.contractors
      ADD CONSTRAINT contractors_heyreach_status_check
      CHECK (heyreach_status IS NULL
             OR heyreach_status IN ('active', 'disconnected', 'unmatched'));
  END IF;
END;
$$;

COMMENT ON COLUMN public.contractors.heyreach_status IS
  'Read-only HeyReach signal set by the heyreach-sync function: active | disconnected | unmatched. '
  'Never the manual lifecycle status (see contractors.status).';

-- ── 2. Sync audit log ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.heyreach_sync_log (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at         timestamptz NOT NULL DEFAULT now(),
  finished_at        timestamptz,
  ok                 boolean NOT NULL DEFAULT false,
  triggered_by       text    NOT NULL DEFAULT 'cron',  -- 'cron' | 'manual' | 'pre_batch'
  accounts_fetched   integer NOT NULL DEFAULT 0,
  contractors_checked integer NOT NULL DEFAULT 0,
  matched            integer NOT NULL DEFAULT 0,
  unmatched          integer NOT NULL DEFAULT 0,
  updated            integer NOT NULL DEFAULT 0,
  changes            jsonb   NOT NULL DEFAULT '[]'::jsonb,  -- [{contractor_id,name,from,to}]
  error              text
);

CREATE INDEX IF NOT EXISTS idx_heyreach_sync_log_started_at
  ON public.heyreach_sync_log (started_at DESC);

-- RLS: authenticated staff may READ the log (to show "last synced"). Writes are
-- only ever performed by the edge function using the service-role key, which
-- bypasses RLS — so no INSERT/UPDATE policy is granted to anyone else.
ALTER TABLE public.heyreach_sync_log ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'heyreach_sync_log'
      AND policyname = 'heyreach_sync_log_select_authenticated'
  ) THEN
    CREATE POLICY heyreach_sync_log_select_authenticated
      ON public.heyreach_sync_log
      FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END;
$$;

-- ── 3. Daily 06:00 Africa/Lagos cron (mirrors batch-worker-cron) ─────────────
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Pulls the function URL + shared secret from Vault and POSTs to the sync
-- function. No-ops quietly if the operator hasn't configured the URL yet, so
-- the cron never spams errors before setup is complete.
CREATE OR REPLACE FUNCTION public.tick_heyreach_sync()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_url    text;
  v_secret text;
BEGIN
  SELECT decrypted_secret INTO v_url    FROM vault.decrypted_secrets WHERE name = 'heyreach_sync_url';
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'cron_shared_secret';

  IF v_url IS NULL OR v_secret IS NULL THEN
    RAISE NOTICE 'tick_heyreach_sync: Vault secrets not configured yet — skipping';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'X-Cron-Secret', v_secret
               ),
    body    := jsonb_build_object('triggered_by', 'cron')
  );
END;
$$;

COMMENT ON FUNCTION public.tick_heyreach_sync() IS
  'Invoked by pg_cron daily at 05:00 UTC (06:00 Africa/Lagos). Calls the '
  'heyreach-sync edge function to refresh contractor HeyReach status.';

-- Unschedule any prior version so re-running the migration is safe.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'heyreach-daily-sync') THEN
    PERFORM cron.unschedule('heyreach-daily-sync');
  END IF;
END;
$$;

-- 05:00 UTC == 06:00 Africa/Lagos (WAT, UTC+1, no DST) — "before work starts".
SELECT cron.schedule(
  'heyreach-daily-sync',
  '0 5 * * *',
  $$ SELECT public.tick_heyreach_sync(); $$
);
