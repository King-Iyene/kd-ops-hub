-- Crew: alerts from the AI executives reach the owner in Zoho Cliq, through the Ops Agent's existing, tested delivery (agent_outbox + agent-dispatch).
--
--   A message an agent writes to the owner (a challenge, an alert, a reminder ...) is put in the outbox when the owner has switched this on in
--   Crew > Team > Cliq alerts. agent-dispatch (every minute) posts it in the chosen Cliq channel and tags the owner. Nothing here lets an agent
--   post anywhere itself: it can only write a message to the owner, and a database trigger decides whether that becomes a Cliq message.
--   The time-tracker items for employees are NOT duplicated: the Ops Agent already posts them in the reporting channel and tags each manager.
--
-- Rollback: supabase/rollbacks/20261454_crew_cliq_bridge_down.sql

CREATE TABLE IF NOT EXISTS public.crew_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  cliq_enabled boolean NOT NULL DEFAULT false,
  cliq_connection_id uuid REFERENCES public.agent_connections(id) ON DELETE SET NULL,
  notify_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  notify_kinds text[] NOT NULL DEFAULT ARRAY['alert', 'challenge', 'reminder'],
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.crew_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.crew_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS crew_settings_owner ON public.crew_settings;
CREATE POLICY crew_settings_owner ON public.crew_settings FOR SELECT TO authenticated USING (public.crew_is_owner());
REVOKE ALL ON public.crew_settings FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.crew_settings TO authenticated;
GRANT ALL ON public.crew_settings TO service_role;

CREATE OR REPLACE FUNCTION public.crew_save_settings(p_enabled boolean, p_connection uuid, p_profile uuid, p_kinds text[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.crew_is_owner() THEN RAISE EXCEPTION 'only the owner can change Crew settings'; END IF;
  IF p_enabled AND p_connection IS NULL THEN RAISE EXCEPTION 'choose the Cliq connection first'; END IF;
  IF p_connection IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.agent_connections WHERE id = p_connection AND kind = 'cliq') THEN RAISE EXCEPTION 'that is not a Cliq connection'; END IF;
  IF p_kinds IS NULL OR cardinality(p_kinds) = 0 OR NOT (p_kinds <@ ARRAY['message', 'reply', 'report', 'alert', 'challenge', 'reminder', 'brief']) THEN RAISE EXCEPTION 'bad message kinds'; END IF;
  UPDATE public.crew_settings SET cliq_enabled = p_enabled, cliq_connection_id = p_connection, notify_profile_id = p_profile, notify_kinds = p_kinds, updated_at = now() WHERE id;
END $$;
REVOKE ALL ON FUNCTION public.crew_save_settings(boolean, uuid, uuid, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crew_save_settings(boolean, uuid, uuid, text[]) TO authenticated, service_role;

-- the outbox may now carry a crew message ("crew"): keep every kind it already had
DO $$
DECLARE c record;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint WHERE conrelid = 'public.agent_outbox'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%kind%' LOOP
    EXECUTE format('ALTER TABLE public.agent_outbox DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;
ALTER TABLE public.agent_outbox ADD CONSTRAINT agent_outbox_kind_check CHECK (kind IN ('flag', 'summary', 'record', 'followup', 'crew'));

-- A message to the owner becomes a Cliq message when the owner switched it on and the kind is one he wants there.
CREATE OR REPLACE FUNCTION public.crew_enqueue_cliq()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE s public.crew_settings;
BEGIN
  IF NOT NEW.to_owner OR NEW.from_agent IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO s FROM public.crew_settings WHERE id;
  IF s.cliq_enabled AND s.cliq_connection_id IS NOT NULL AND NEW.kind = ANY (s.notify_kinds) THEN
    INSERT INTO public.agent_outbox (connection_id, kind, ref_id) VALUES (s.cliq_connection_id, 'crew', NEW.id);
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.crew_enqueue_cliq() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS crew_messages_to_cliq ON public.crew_messages;
CREATE TRIGGER crew_messages_to_cliq AFTER INSERT ON public.crew_messages FOR EACH ROW EXECUTE FUNCTION public.crew_enqueue_cliq();

-- The Head of Operations does not post time-tracker items again: the Ops Agent already does, in the reporting channel with the manager tagged.
UPDATE public.crew_agent_private p
   SET instructions = regexp_replace(p.instructions, 'TRACKER WATCH:.*?INBOX DUTY:',
     'TRACKER WATCH: the Ops Agent already posts time-tracker items in the Cliq reporting channel and tags each manager, so you do NOT post them again. You review them: who keeps missing, whose manager does not act on it, which team is slipping, and you tell the CFO and the owner with names, counts and dates. INBOX DUTY:')
  FROM public.crew_agents a
 WHERE a.id = p.agent_id AND a.slug = 'ops_head' AND p.instructions LIKE '%TRACKER WATCH: during%';
