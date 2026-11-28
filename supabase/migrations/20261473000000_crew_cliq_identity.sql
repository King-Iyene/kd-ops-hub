-- Crew in Cliq: the owner's Cliq account comes from the SAME place the Ops Agent already uses to tag people (agent_identity_map.cliq_user_id,
-- filled in Agent > Settings > Team, "People"), so he does not have to type it again. What he types in Crew > Team > Cliq alerts is only an override.
--   * crew_cliq_effective_owner(): the Cliq id that counts as the owner: the one typed in Crew settings if any, else the one saved for his profile in
--     the identity map. Server-side only. It is the id a channel tag, a direct message and the "only the owner is obeyed" check all use.
--   * crew_cliq_owner_link(): owner-only, for the settings card: is a Cliq id saved for his profile, and is an override typed. It never returns the id.
--   * crew_save_settings: commands and direct messages no longer demand a typed id when his profile is already linked (same signature as 20261470).
--   * crew_cliq_tick(): runs when there is an effective id, typed or linked.
-- Rollback: supabase/rollbacks/20261473_crew_cliq_identity_down.sql

CREATE OR REPLACE FUNCTION public.crew_cliq_effective_owner() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT coalesce(
           CASE WHEN s.cliq_owner_id ~ '^[A-Za-z0-9._@+-]{2,120}$' THEN s.cliq_owner_id END,
           CASE WHEN btrim(i.cliq_user_id) ~ '^[A-Za-z0-9._@+-]{2,120}$' THEN btrim(i.cliq_user_id) END)
    FROM public.crew_settings s LEFT JOIN public.agent_identity_map i ON i.person_id = s.owner_profile_id
   WHERE s.id
$$;

CREATE OR REPLACE FUNCTION public.crew_cliq_owner_link() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE s public.crew_settings; v_linked boolean;
BEGIN
  IF NOT public.crew_is_owner() THEN RAISE EXCEPTION 'only the owner can see this'; END IF;
  SELECT * INTO s FROM public.crew_settings WHERE id;
  SELECT EXISTS (SELECT 1 FROM public.agent_identity_map i WHERE i.person_id = s.owner_profile_id AND btrim(i.cliq_user_id) ~ '^[A-Za-z0-9._@+-]{2,120}$') INTO v_linked;
  RETURN jsonb_build_object('linked', v_linked, 'override', s.cliq_owner_id IS NOT NULL);
END $$;

-- Saving: as in 20261470, except that a linked profile counts as "his Cliq id is known" (a typed id is then optional).
CREATE OR REPLACE FUNCTION public.crew_save_settings(p_enabled boolean, p_connection uuid, p_profile uuid, p_kinds text[], p_commands boolean DEFAULT NULL, p_owner_id text DEFAULT NULL, p_dm boolean DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE s public.crew_settings; v_commands boolean; v_owner text; v_dm boolean; v_restart boolean; v_known boolean;
BEGIN
  IF NOT public.crew_is_owner() THEN RAISE EXCEPTION 'only the owner can change Crew settings'; END IF;
  IF p_enabled AND p_connection IS NULL THEN RAISE EXCEPTION 'choose the Cliq connection first'; END IF;
  IF p_connection IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.agent_connections WHERE id = p_connection AND kind = 'cliq') THEN RAISE EXCEPTION 'that is not a Cliq connection'; END IF;
  IF p_kinds IS NULL OR cardinality(p_kinds) = 0 OR NOT (p_kinds <@ ARRAY['message', 'reply', 'report', 'alert', 'challenge', 'reminder', 'brief']) THEN RAISE EXCEPTION 'bad message kinds'; END IF;
  SELECT * INTO s FROM public.crew_settings WHERE id;
  v_commands := coalesce(p_commands, s.cliq_commands_enabled AND p_enabled);
  v_owner := CASE WHEN p_owner_id IS NULL THEN s.cliq_owner_id ELSE nullif(btrim(p_owner_id), '') END;
  v_dm := coalesce(p_dm, s.cliq_dm);
  IF v_owner IS NOT NULL AND v_owner !~ '^[A-Za-z0-9._@+-]{2,120}$' THEN RAISE EXCEPTION 'the Cliq user id or email may only use letters, digits and . _ @ + - (2 to 120 characters)'; END IF;
  -- his Cliq account is known when he typed one, or his profile is linked in Agent > Settings > Team
  v_known := v_owner IS NOT NULL OR EXISTS (SELECT 1 FROM public.agent_identity_map i WHERE i.person_id = s.owner_profile_id AND btrim(i.cliq_user_id) ~ '^[A-Za-z0-9._@+-]{2,120}$');
  IF v_commands AND NOT p_enabled THEN RAISE EXCEPTION 'turn on Cliq alerts first: commands use the same destination'; END IF;
  IF v_commands AND NOT v_known THEN RAISE EXCEPTION 'type your Cliq user id or email (or link your profile in Agent > Settings > Team): only that account is obeyed'; END IF;
  IF v_dm AND p_enabled THEN
    IF NOT v_known THEN RAISE EXCEPTION 'type your Cliq user id or email (or link your profile in Agent > Settings > Team): a direct message needs to know who it is for'; END IF;
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

-- The clock calls out when an id is known, typed or linked.
CREATE OR REPLACE FUNCTION public.crew_cliq_tick() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_url text; v_secret text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.crew_settings WHERE id AND cliq_enabled AND cliq_commands_enabled AND cliq_connection_id IS NOT NULL) OR public.crew_cliq_effective_owner() IS NULL THEN RETURN; END IF;
  SELECT regexp_replace(decrypted_secret, '/[^/]+/?$', '/crew-cliq') INTO v_url FROM vault.decrypted_secrets WHERE name = 'agent_dispatch_url';
  IF v_url IS NULL THEN
    SELECT regexp_replace(decrypted_secret, '/[^/]+/?$', '/crew-cliq') INTO v_url FROM vault.decrypted_secrets WHERE name = 'batch_worker_url';
  END IF;
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'cron_shared_secret';
  IF v_url IS NULL OR v_secret IS NULL THEN RAISE NOTICE 'crew_cliq_tick: Vault secrets not configured yet, skipping'; RETURN; END IF;
  PERFORM net.http_post(url := v_url, headers := jsonb_build_object('Content-Type', 'application/json', 'X-Cron-Secret', v_secret), body := '{}'::jsonb);
END $$;

REVOKE ALL ON FUNCTION public.crew_cliq_effective_owner() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crew_cliq_effective_owner() TO service_role;
REVOKE ALL ON FUNCTION public.crew_cliq_owner_link() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crew_cliq_owner_link() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.crew_cliq_tick() FROM PUBLIC, anon, authenticated;
