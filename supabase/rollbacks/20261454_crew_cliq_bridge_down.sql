-- Rolls back 20261454000000_crew_cliq_bridge.sql. Pending crew messages in the outbox are removed first.
DROP TRIGGER IF EXISTS crew_messages_to_cliq ON public.crew_messages;
DROP FUNCTION IF EXISTS public.crew_enqueue_cliq();
DELETE FROM public.agent_outbox WHERE kind = 'crew';
DO $$
DECLARE c record;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint WHERE conrelid = 'public.agent_outbox'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%kind%' LOOP
    EXECUTE format('ALTER TABLE public.agent_outbox DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;
ALTER TABLE public.agent_outbox ADD CONSTRAINT agent_outbox_kind_check CHECK (kind IN ('flag', 'summary', 'record', 'followup'));
DROP FUNCTION IF EXISTS public.crew_save_settings(boolean, uuid, uuid, text[]);
DROP TABLE IF EXISTS public.crew_settings;
