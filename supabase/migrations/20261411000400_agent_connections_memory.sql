-- Ops Agent v4 (5 of 5): connections that send on their own, and memory the chat can propose.
--
--   1. agent_connections.kind: also discord, teams, gchat, telegram.
--   2. agent_outbox: what is waiting to be sent to which connection. A new Inbox item or a new automatic summary is queued for every
--      connection whose config.events asks for it (flag_high, flag_all, summary_day, summary_week, summary_month; optional
--      config.min_severity). The edge function agent-dispatch sends the queue; pg_cron wakes it every minute (only when something
--      waits). Items that already exist when a connection is added are never sent: only what happens after.
--   3. agent_memory: a detail line and the chat thread it came from; agent_memory_suggest(...) is how chat proposes a memory (it
--      never duplicates one that exists). The person says Yes (active) or No (rejected) from the chat or from Settings.
--
-- Rollback: supabase/rollbacks/20261411_agent_v4_down.sql

-- ── 1. more kinds of connection ────────────────────────────────────────────
ALTER TABLE public.agent_connections DROP CONSTRAINT IF EXISTS agent_connections_kind_check;
ALTER TABLE public.agent_connections ADD CONSTRAINT agent_connections_kind_check
  CHECK (kind IN ('cliq', 'slack', 'email', 'webhook', 'n8n', 'whatsapp', 'api', 'discord', 'teams', 'gchat', 'telegram'));

-- ── 3. memory ──────────────────────────────────────────────────────────────
ALTER TABLE public.agent_memory ADD COLUMN IF NOT EXISTS detail text;
ALTER TABLE public.agent_memory ADD COLUMN IF NOT EXISTS source_thread uuid REFERENCES public.agent_chat_threads(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS agent_memory_thread_idx ON public.agent_memory (source_thread) WHERE source_thread IS NOT NULL;

CREATE OR REPLACE FUNCTION public.agent_memory_suggest(
  p_type text, p_content text, p_detail text DEFAULT NULL, p_scope text DEFAULT 'global', p_scope_ref text DEFAULT NULL, p_thread uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_content text := btrim(regexp_replace(coalesce(p_content, ''), '\s+', ' ', 'g')); v_id uuid; v_dup uuid;
BEGIN
  IF NOT public.agent_can_configure() THEN RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501'; END IF;
  IF p_type NOT IN ('fact', 'correction', 'preference', 'exemption', 'rule') THEN p_type := 'fact'; END IF;
  IF p_scope NOT IN ('global', 'company', 'person', 'module') THEN p_scope := 'global'; END IF;
  IF length(v_content) < 5 THEN RETURN jsonb_build_object('ok', false, 'reason', 'too_short'); END IF;
  v_content := left(v_content, 500);
  SELECT id INTO v_dup FROM public.agent_memory WHERE status IN ('proposed', 'active') AND lower(btrim(content)) = lower(v_content) LIMIT 1;
  IF v_dup IS NOT NULL THEN RETURN jsonb_build_object('ok', true, 'duplicate', true, 'id', v_dup); END IF;
  -- a chat thread that is not the caller's is ignored
  IF p_thread IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.agent_chat_threads t WHERE t.id = p_thread AND t.user_id = auth.uid()) THEN p_thread := NULL; END IF;
  INSERT INTO public.agent_memory (type, content, detail, scope, scope_ref, source, status, proposed_by, source_thread)
  VALUES (p_type, v_content, left(nullif(btrim(coalesce(p_detail, '')), ''), 600), p_scope, left(nullif(btrim(coalesce(p_scope_ref, '')), ''), 120), 'chat', 'proposed', auth.uid(), p_thread)
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('ok', true, 'duplicate', false, 'id', v_id);
END $$;
REVOKE ALL ON FUNCTION public.agent_memory_suggest(text, text, text, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agent_memory_suggest(text, text, text, text, text, uuid) TO authenticated, service_role;

-- ── 2. the outbox ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.agent_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES public.agent_connections(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('flag', 'summary')),
  ref_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  attempts integer NOT NULL DEFAULT 0,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  UNIQUE (connection_id, kind, ref_id)
);
CREATE INDEX IF NOT EXISTS agent_outbox_pending_idx ON public.agent_outbox (created_at) WHERE status = 'pending';
ALTER TABLE public.agent_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.agent_outbox FROM anon, authenticated;
GRANT SELECT ON public.agent_outbox TO authenticated;
GRANT ALL ON public.agent_outbox TO service_role;
DROP POLICY IF EXISTS agent_outbox_select ON public.agent_outbox;
CREATE POLICY agent_outbox_select ON public.agent_outbox FOR SELECT TO authenticated USING (public.agent_can_configure());

CREATE OR REPLACE FUNCTION public.agent_sev_rank(p text)
RETURNS integer LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT CASE p WHEN 'critical' THEN 5 WHEN 'high' THEN 4 WHEN 'medium' THEN 3 WHEN 'low' THEN 2 WHEN 'info' THEN 1 ELSE 0 END
$$;

CREATE OR REPLACE FUNCTION public.agent_outbox_flag()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.item_type NOT IN ('flag', 'human_action') OR NEW.rule_code = 'TK14' THEN RETURN NEW; END IF;
  INSERT INTO public.agent_outbox (connection_id, kind, ref_id)
  SELECT c.id, 'flag', NEW.id FROM public.agent_connections c
   WHERE ((coalesce(c.config -> 'events', '[]'::jsonb) ? 'flag_all')
          OR (public.agent_sev_rank(NEW.severity) >= 4 AND coalesce(c.config -> 'events', '[]'::jsonb) ? 'flag_high'))
     AND public.agent_sev_rank(NEW.severity) >= public.agent_sev_rank(coalesce(nullif(c.config ->> 'min_severity', ''), 'info'))
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.agent_outbox_summary()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT NEW.auto OR NEW.period_kind NOT IN ('day', 'week', 'month') THEN RETURN NEW; END IF;
  INSERT INTO public.agent_outbox (connection_id, kind, ref_id)
  SELECT c.id, 'summary', NEW.id FROM public.agent_connections c
   WHERE coalesce(c.config -> 'events', '[]'::jsonb) ? ('summary_' || NEW.period_kind)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS agent_flags_outbox ON public.agent_flags;
CREATE TRIGGER agent_flags_outbox AFTER INSERT ON public.agent_flags FOR EACH ROW EXECUTE FUNCTION public.agent_outbox_flag();
DROP TRIGGER IF EXISTS agent_summaries_outbox ON public.agent_summaries;
CREATE TRIGGER agent_summaries_outbox AFTER INSERT ON public.agent_summaries FOR EACH ROW EXECUTE FUNCTION public.agent_outbox_summary();
REVOKE ALL ON FUNCTION public.agent_outbox_flag(), public.agent_outbox_summary(), public.agent_sev_rank(text) FROM PUBLIC, anon, authenticated;

-- ── wake the sender ────────────────────────────────────────────────────────
-- Uses the same Vault secrets the other scheduled functions use (the shared cron secret, and the address of the batch worker
-- with its function name swapped for agent-dispatch). Does nothing when there is nothing to send or the secrets are missing.
CREATE OR REPLACE FUNCTION public.agent_dispatch_tick()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_url text; v_secret text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.agent_outbox WHERE status = 'pending' AND attempts < 4) THEN RETURN; END IF;
  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'agent_dispatch_url';
  IF v_url IS NULL THEN
    SELECT regexp_replace(decrypted_secret, '/[^/]+/?$', '/agent-dispatch') INTO v_url FROM vault.decrypted_secrets WHERE name = 'batch_worker_url';
  END IF;
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'cron_shared_secret';
  IF v_url IS NULL OR v_secret IS NULL THEN
    RAISE NOTICE 'agent_dispatch_tick: Vault secrets not configured yet, skipping';
    RETURN;
  END IF;
  PERFORM net.http_post(url := v_url, headers := jsonb_build_object('Content-Type', 'application/json', 'X-Cron-Secret', v_secret), body := '{}'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.agent_dispatch_tick() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agent_dispatch_tick() TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('agent_dispatch') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'agent_dispatch');
    PERFORM cron.schedule('agent_dispatch', '* * * * *', 'SELECT public.agent_dispatch_tick()');
  ELSE
    RAISE NOTICE 'pg_cron is not installed here: agent_dispatch was not scheduled';
  END IF;
  IF to_regclass('public.cron_job_expectations') IS NOT NULL THEN
    INSERT INTO public.cron_job_expectations (job_name, description, max_gap_minutes)
    VALUES ('agent_dispatch', 'Ops Agent: sends queued messages to connections', 10)
    ON CONFLICT (job_name) DO UPDATE SET description = EXCLUDED.description, max_gap_minutes = EXCLUDED.max_gap_minutes;
  END IF;
END $$;
