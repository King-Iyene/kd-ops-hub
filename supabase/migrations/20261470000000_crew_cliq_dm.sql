-- Crew in Cliq: send the alerts, and take the approve / reject / reply commands, as a DIRECT MESSAGE to the owner instead of in a channel.
--   * crew_settings.cliq_dm: false (the channel, as before) or true (the owner's own Cliq). A direct message still goes out through one of the Ops Agent's
--     Cliq connections (it supplies the Zoho sign-in), which must be the one that signs in with Zoho (API mode). The person is the Cliq user id or email the
--     owner typed in 20261467 (cliq_owner_id), so a direct message needs it.
--   * crew_settings.cliq_dm_chat_id: the direct chat the commands are read from, remembered so Zoho's chat list is not asked every minute.
--   * crew_settings.cliq_error / cliq_error_at: the last problem sending or reading in Cliq, in plain words, for the settings card to show
--     (for example "Zoho needs one more permission for direct messages ...").
-- Nothing changes until the owner chooses it: the default stays the channel.
-- Rollback: supabase/rollbacks/20261470_crew_cliq_dm_down.sql

ALTER TABLE public.crew_settings
  ADD COLUMN IF NOT EXISTS cliq_dm boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cliq_dm_chat_id text,
  ADD COLUMN IF NOT EXISTS cliq_error text,
  ADD COLUMN IF NOT EXISTS cliq_error_at timestamptz;
ALTER TABLE public.crew_settings DROP CONSTRAINT IF EXISTS crew_settings_cliq_dm_chat_id_check;
ALTER TABLE public.crew_settings ADD CONSTRAINT crew_settings_cliq_dm_chat_id_check CHECK (cliq_dm_chat_id IS NULL OR cliq_dm_chat_id ~ '^[A-Za-z0-9_.:-]{1,120}$');

-- Saving: the same function as in 20261467 with one more optional answer (p_dm: null = leave as it is). Older calls (4 or 6 arguments) still work.
-- Changing the destination, the connection or whose account is obeyed restarts the "read up to here" mark and forgets the remembered chat and error.
DROP FUNCTION IF EXISTS public.crew_save_settings(boolean, uuid, uuid, text[], boolean, text);
CREATE OR REPLACE FUNCTION public.crew_save_settings(p_enabled boolean, p_connection uuid, p_profile uuid, p_kinds text[], p_commands boolean DEFAULT NULL, p_owner_id text DEFAULT NULL, p_dm boolean DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE s public.crew_settings; v_commands boolean; v_owner text; v_dm boolean; v_restart boolean;
BEGIN
  IF NOT public.crew_is_owner() THEN RAISE EXCEPTION 'only the owner can change Crew settings'; END IF;
  IF p_enabled AND p_connection IS NULL THEN RAISE EXCEPTION 'choose the Cliq connection first'; END IF;
  IF p_connection IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.agent_connections WHERE id = p_connection AND kind = 'cliq') THEN RAISE EXCEPTION 'that is not a Cliq connection'; END IF;
  IF p_kinds IS NULL OR cardinality(p_kinds) = 0 OR NOT (p_kinds <@ ARRAY['message', 'reply', 'report', 'alert', 'challenge', 'reminder', 'brief']) THEN RAISE EXCEPTION 'bad message kinds'; END IF;
  SELECT * INTO s FROM public.crew_settings WHERE id;
  -- left as it is, unless alerts are being switched off: commands use the alerts' destination, so they go off with them
  v_commands := coalesce(p_commands, s.cliq_commands_enabled AND p_enabled);
  v_owner := CASE WHEN p_owner_id IS NULL THEN s.cliq_owner_id ELSE nullif(btrim(p_owner_id), '') END;
  v_dm := coalesce(p_dm, s.cliq_dm);
  IF v_owner IS NOT NULL AND v_owner !~ '^[A-Za-z0-9._@+-]{2,120}$' THEN RAISE EXCEPTION 'the Cliq user id or email may only use letters, digits and . _ @ + - (2 to 120 characters)'; END IF;
  IF v_commands AND NOT p_enabled THEN RAISE EXCEPTION 'turn on Cliq alerts first: commands use the same destination'; END IF;
  IF v_commands AND v_owner IS NULL THEN RAISE EXCEPTION 'type your Cliq user id or email: only that account is obeyed'; END IF;
  IF v_dm AND p_enabled THEN
    IF v_owner IS NULL THEN RAISE EXCEPTION 'type your Cliq user id or email: a direct message needs to know who it is for'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.agent_connections WHERE id = p_connection AND kind = 'cliq' AND config ->> 'mode' = 'api') THEN
      RAISE EXCEPTION 'a direct message needs the Cliq connection that signs in with Zoho (API): pick another one';
    END IF;
  END IF;
  v_restart := (v_commands AND NOT s.cliq_commands_enabled) OR v_owner IS DISTINCT FROM s.cliq_owner_id OR p_connection IS DISTINCT FROM s.cliq_connection_id OR v_dm IS DISTINCT FROM s.cliq_dm;
  UPDATE public.crew_settings SET cliq_enabled = p_enabled, cliq_connection_id = p_connection, notify_profile_id = p_profile, notify_kinds = p_kinds,
         cliq_commands_enabled = v_commands, cliq_owner_id = v_owner, cliq_dm = v_dm,
         cliq_cursor_ms = CASE WHEN v_restart THEN 0 ELSE cliq_cursor_ms END,
         cliq_dm_chat_id = CASE WHEN v_restart THEN NULL ELSE cliq_dm_chat_id END,
         cliq_error = CASE WHEN v_restart THEN NULL ELSE cliq_error END, cliq_error_at = CASE WHEN v_restart THEN NULL ELSE cliq_error_at END,
         updated_at = now()
   WHERE id;
END $$;
REVOKE ALL ON FUNCTION public.crew_save_settings(boolean, uuid, uuid, text[], boolean, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crew_save_settings(boolean, uuid, uuid, text[], boolean, text, boolean) TO authenticated, service_role;
