-- Rolls back 20261470000000_crew_cliq_dm.sql: direct messages go away and crew_save_settings is the six-argument one of 20261467 again.
-- Anything already sent to the owner stays sent. Sending then goes back to the channel (an owner who had chosen "me as a direct message" must pick a channel again).
DROP FUNCTION IF EXISTS public.crew_save_settings(boolean, uuid, uuid, text[], boolean, text, boolean);
CREATE OR REPLACE FUNCTION public.crew_save_settings(p_enabled boolean, p_connection uuid, p_profile uuid, p_kinds text[], p_commands boolean DEFAULT NULL, p_owner_id text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE s public.crew_settings; v_commands boolean; v_owner text; v_restart boolean;
BEGIN
  IF NOT public.crew_is_owner() THEN RAISE EXCEPTION 'only the owner can change Crew settings'; END IF;
  IF p_enabled AND p_connection IS NULL THEN RAISE EXCEPTION 'choose the Cliq connection first'; END IF;
  IF p_connection IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.agent_connections WHERE id = p_connection AND kind = 'cliq') THEN RAISE EXCEPTION 'that is not a Cliq connection'; END IF;
  IF p_kinds IS NULL OR cardinality(p_kinds) = 0 OR NOT (p_kinds <@ ARRAY['message', 'reply', 'report', 'alert', 'challenge', 'reminder', 'brief']) THEN RAISE EXCEPTION 'bad message kinds'; END IF;
  SELECT * INTO s FROM public.crew_settings WHERE id;
  v_commands := coalesce(p_commands, s.cliq_commands_enabled AND p_enabled);
  v_owner := CASE WHEN p_owner_id IS NULL THEN s.cliq_owner_id ELSE nullif(btrim(p_owner_id), '') END;
  IF v_owner IS NOT NULL AND v_owner !~ '^[A-Za-z0-9._@+-]{2,120}$' THEN RAISE EXCEPTION 'the Cliq user id or email may only use letters, digits and . _ @ + - (2 to 120 characters)'; END IF;
  IF v_commands AND NOT p_enabled THEN RAISE EXCEPTION 'turn on Cliq alerts first: commands use the same channel'; END IF;
  IF v_commands AND v_owner IS NULL THEN RAISE EXCEPTION 'type your Cliq user id or email: only that account is obeyed'; END IF;
  v_restart := (v_commands AND NOT s.cliq_commands_enabled) OR v_owner IS DISTINCT FROM s.cliq_owner_id OR p_connection IS DISTINCT FROM s.cliq_connection_id;
  UPDATE public.crew_settings SET cliq_enabled = p_enabled, cliq_connection_id = p_connection, notify_profile_id = p_profile, notify_kinds = p_kinds,
         cliq_commands_enabled = v_commands, cliq_owner_id = v_owner, cliq_cursor_ms = CASE WHEN v_restart THEN 0 ELSE cliq_cursor_ms END, updated_at = now()
   WHERE id;
END $$;
REVOKE ALL ON FUNCTION public.crew_save_settings(boolean, uuid, uuid, text[], boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crew_save_settings(boolean, uuid, uuid, text[], boolean, text) TO authenticated, service_role;

ALTER TABLE public.crew_settings DROP CONSTRAINT IF EXISTS crew_settings_cliq_dm_chat_id_check;
ALTER TABLE public.crew_settings DROP COLUMN IF EXISTS cliq_error_at, DROP COLUMN IF EXISTS cliq_error, DROP COLUMN IF EXISTS cliq_dm_chat_id, DROP COLUMN IF EXISTS cliq_dm;
