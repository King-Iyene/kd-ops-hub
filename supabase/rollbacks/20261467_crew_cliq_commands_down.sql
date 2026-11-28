-- Rolls back 20261467000000_crew_cliq_commands.sql: Cliq commands stop, the new columns and functions go, and crew_save_settings is the four-argument one again.
-- Nothing a command already did is undone (a proposal approved from Cliq stays approved); the Cliq alerts of 20261454 keep working.
DO $$ BEGIN PERFORM cron.unschedule('crew_cliq'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

DROP FUNCTION IF EXISTS public.crew_cliq_tick();
DROP FUNCTION IF EXISTS public.crew_cliq_decide(text, text, text);
DROP FUNCTION IF EXISTS public.crew_cliq_say(text, text);
DROP FUNCTION IF EXISTS public.crew_cliq_unmark_notified(uuid[]);
DROP FUNCTION IF EXISTS public.crew_cliq_mark_notified(uuid[]);
DROP FUNCTION IF EXISTS public.crew_cliq_pending_list(integer);
DROP FUNCTION IF EXISTS public.crew_cliq_pending_to_notify(integer);
DROP FUNCTION IF EXISTS public.crew_cliq_pending_rows();
DROP FUNCTION IF EXISTS public.crew_cliq_owner();

DROP FUNCTION IF EXISTS public.crew_save_settings(boolean, uuid, uuid, text[], boolean, text);
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

ALTER TABLE public.crew_proposals DROP COLUMN IF EXISTS cliq_notified_at;
ALTER TABLE public.crew_settings DROP CONSTRAINT IF EXISTS crew_settings_cliq_owner_id_check;
ALTER TABLE public.crew_settings DROP COLUMN IF EXISTS cliq_cursor_ms, DROP COLUMN IF EXISTS cliq_owner_id, DROP COLUMN IF EXISTS cliq_commands_enabled;
