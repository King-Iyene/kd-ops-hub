-- Task tables: "send new entries to another tool" (for example a new daily report goes to Zoho Cliq the moment it is submitted).
--
--   1. tm_table_connections   one row per rule: this table, that connection (made in Agent, Connections), the message, tagging.
--                             Super Admin only (the same people who can make connections).
--   2. agent_outbox           gets kind 'record' and a rule_id, so the sender that already delivers Agent messages delivers these too.
--   3. tm_record_to_outbox    AFTER INSERT on tm_table_records: queue the entry for every enabled rule on its table and wake the sender at
--                             once, so it goes out within seconds (the every-minute sender stays as the retry). An entry with no answers
--                             yet is not sent (a row added by hand and filled in afterwards is not announced half empty), a flood is braked
--                             (30 per rule per minute), and nothing here can ever stop an entry from being saved.
--   4. agent_dispatch_kick()  the "send now" nudge.
--
-- Rollback: supabase/rollbacks/20261416_tm_table_connections_down.sql

CREATE TABLE IF NOT EXISTS public.tm_table_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id uuid NOT NULL REFERENCES public.tm_tables(id) ON DELETE CASCADE,
  connection_id uuid NOT NULL REFERENCES public.agent_connections(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
  enabled boolean NOT NULL DEFAULT true,
  template text CHECK (template IS NULL OR length(template) <= 3000),
  channel text CHECK (channel IS NULL OR channel ~ '^[a-z0-9_]{1,50}$'),
  tag_person boolean NOT NULL DEFAULT true,
  cc_manager boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_sent_at timestamptz
);
CREATE INDEX IF NOT EXISTS tm_table_connections_table_idx ON public.tm_table_connections (table_id) WHERE enabled;

DROP TRIGGER IF EXISTS tm_table_connections_set_updated_at ON public.tm_table_connections;
CREATE TRIGGER tm_table_connections_set_updated_at BEFORE UPDATE ON public.tm_table_connections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.tm_table_connections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tm_table_connections FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tm_table_connections TO authenticated;
GRANT ALL ON public.tm_table_connections TO service_role;
DROP POLICY IF EXISTS tm_table_connections_all ON public.tm_table_connections;
CREATE POLICY tm_table_connections_all ON public.tm_table_connections FOR ALL TO authenticated
  USING (public.agent_can_configure()) WITH CHECK (public.agent_can_configure());

-- ── the outbox carries entries too ─────────────────────────────────────────
ALTER TABLE public.agent_outbox ADD COLUMN IF NOT EXISTS rule_id uuid REFERENCES public.tm_table_connections(id) ON DELETE CASCADE;

DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'public.agent_outbox'::regclass
       AND ((contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%kind%')
         OR (contype = 'u' AND pg_get_constraintdef(oid) ILIKE '%connection_id%kind%ref_id%'))
  LOOP
    EXECUTE format('ALTER TABLE public.agent_outbox DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;
ALTER TABLE public.agent_outbox ADD CONSTRAINT agent_outbox_kind_check CHECK (kind IN ('flag', 'summary', 'record'));
-- One message per connection per thing; two rules on the same connection may each send the same entry.
CREATE UNIQUE INDEX IF NOT EXISTS agent_outbox_once_idx
  ON public.agent_outbox (connection_id, kind, ref_id, coalesce(rule_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- ── wake the sender now ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.agent_dispatch_kick()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_url text; v_secret text;
BEGIN
  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'agent_dispatch_url';
  IF v_url IS NULL THEN
    SELECT regexp_replace(decrypted_secret, '/[^/]+/?$', '/agent-dispatch') INTO v_url FROM vault.decrypted_secrets WHERE name = 'batch_worker_url';
  END IF;
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'cron_shared_secret';
  IF v_url IS NULL OR v_secret IS NULL THEN RETURN; END IF;
  PERFORM net.http_post(url := v_url, headers := jsonb_build_object('Content-Type', 'application/json', 'X-Cron-Secret', v_secret), body := '{}'::jsonb);
EXCEPTION WHEN OTHERS THEN
  NULL;   -- the every-minute sender will pick it up
END $$;
REVOKE ALL ON FUNCTION public.agent_dispatch_kick() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agent_dispatch_kick() TO service_role;

-- ── queue a new entry ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tm_record_to_outbox()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE r record; v_queued integer := 0;
BEGIN
  IF NEW.data IS NULL OR NEW.data = '{}'::jsonb THEN RETURN NEW; END IF;
  FOR r IN SELECT id, connection_id FROM public.tm_table_connections WHERE table_id = NEW.table_id AND enabled LOOP
    IF (SELECT count(*) FROM public.agent_outbox WHERE rule_id = r.id AND created_at > now() - interval '1 minute') >= 30 THEN CONTINUE; END IF;
    INSERT INTO public.agent_outbox (connection_id, kind, ref_id, rule_id) VALUES (r.connection_id, 'record', NEW.id, r.id) ON CONFLICT DO NOTHING;
    v_queued := v_queued + 1;
  END LOOP;
  IF v_queued > 0 THEN PERFORM public.agent_dispatch_kick(); END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;   -- saving an entry always wins over announcing it
END $$;
REVOKE ALL ON FUNCTION public.tm_record_to_outbox() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS tm_table_records_to_outbox ON public.tm_table_records;
CREATE TRIGGER tm_table_records_to_outbox AFTER INSERT ON public.tm_table_records
  FOR EACH ROW EXECUTE FUNCTION public.tm_record_to_outbox();
