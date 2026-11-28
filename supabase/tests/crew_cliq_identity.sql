-- Crew in Cliq: the owner's Cliq account comes from the Ops Agent's identity map (his profile), with the typed id as an override.
-- Replay: with the Crew migrations (through 20261473) applied, run  psql -v ON_ERROR_STOP=1 < supabase/tests/crew_cliq_identity.sql   (everything is rolled back).
BEGIN;

CREATE FUNCTION pg_temp.t_err(p_sql text, p_needle text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    IF position(p_needle IN SQLERRM) = 0 THEN RAISE EXCEPTION 'FAIL: wanted an error containing "%" but got "%" for: %', p_needle, SQLERRM, p_sql; END IF;
    RETURN;
  END;
  RAISE EXCEPTION 'FAIL: no error (wanted "%") for: %', p_needle, p_sql;
END $$;
CREATE FUNCTION pg_temp.t_eq(p_label text, p_got anyelement, p_want anyelement) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF p_got IS DISTINCT FROM p_want THEN RAISE EXCEPTION 'FAIL: % (got %, want %)', p_label, p_got, p_want; END IF; END $$;

DO $$
DECLARE
  v_owner uuid; v_api uuid := gen_random_uuid(); v_checks integer := 0;
BEGIN
  SELECT owner_profile_id INTO v_owner FROM public.crew_settings WHERE id;
  IF v_owner IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_owner AND role = 'super_admin') THEN
    v_owner := gen_random_uuid();
    INSERT INTO auth.users (id, email) VALUES (v_owner, 'owner@t.local');
    INSERT INTO public.profiles (id, email, full_name, role, status) VALUES (v_owner, 'owner@t.local', 'Test Owner', 'super_admin', 'active');
    UPDATE public.crew_settings SET owner_profile_id = v_owner WHERE id;
  END IF;
  INSERT INTO public.agent_connections (id, kind, name, config) VALUES (v_api, 'cliq', 'Test Zoho sign-in', '{"mode":"api","dc":"com","channel":"test"}');
  UPDATE public.crew_settings SET cliq_enabled = false, cliq_connection_id = NULL, cliq_commands_enabled = false, cliq_owner_id = NULL, cliq_cursor_ms = 0, cliq_dm = false WHERE id;

  -- not linked, nothing typed: nobody is known, and the tick does nothing
  DELETE FROM public.agent_identity_map WHERE person_id = v_owner;
  PERFORM pg_temp.t_eq('nobody is known', public.crew_cliq_effective_owner(), NULL::text);
  PERFORM public.crew_cliq_tick();
  v_checks := v_checks + 1;

  -- linked in the Ops Agent (Agent > Settings > Team): that id is the owner
  INSERT INTO public.agent_identity_map (person_id, cliq_user_id, matched_by) VALUES (v_owner, '20012345678', 'manual');
  PERFORM pg_temp.t_eq('the linked id counts', public.crew_cliq_effective_owner(), '20012345678');
  -- a typed id overrides it
  UPDATE public.crew_settings SET cliq_owner_id = '30099887766' WHERE id;
  PERFORM pg_temp.t_eq('the typed id overrides', public.crew_cliq_effective_owner(), '30099887766');
  UPDATE public.crew_settings SET cliq_owner_id = NULL WHERE id;
  -- an id that is not a plain id (a paste mistake) is never used
  UPDATE public.agent_identity_map SET cliq_user_id = 'bad id!' WHERE person_id = v_owner;
  PERFORM pg_temp.t_eq('a bad linked id is ignored', public.crew_cliq_effective_owner(), NULL::text);
  UPDATE public.agent_identity_map SET cliq_user_id = '  20012345678  ' WHERE person_id = v_owner;
  PERFORM pg_temp.t_eq('spaces around the linked id are trimmed', public.crew_cliq_effective_owner(), '20012345678');
  v_checks := v_checks + 4;

  -- only the server can ask for the id; a signed-in user cannot
  PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM pg_temp.t_err('SELECT public.crew_cliq_effective_owner()', 'permission denied');
  -- the settings card learns only yes or no, and only the owner may ask
  PERFORM pg_temp.t_eq('card: linked, no override', public.crew_cliq_owner_link(), '{"linked": true, "override": false}'::jsonb);
  EXECUTE 'RESET ROLE';
  UPDATE public.crew_settings SET cliq_owner_id = 'someone@example.com' WHERE id;
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM pg_temp.t_eq('card: override typed', public.crew_cliq_owner_link(), '{"linked": true, "override": true}'::jsonb);
  EXECUTE 'RESET ROLE';
  UPDATE public.crew_settings SET cliq_owner_id = NULL WHERE id;
  DELETE FROM public.agent_identity_map WHERE person_id = v_owner;
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM pg_temp.t_eq('card: not linked', public.crew_cliq_owner_link(), '{"linked": false, "override": false}'::jsonb);
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claim.sub', gen_random_uuid()::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM pg_temp.t_err('SELECT public.crew_cliq_owner_link()', 'only the owner');
  EXECUTE 'RESET ROLE';
  v_checks := v_checks + 5;

  -- saving: commands and a direct message need his account to be known, typed or linked
  PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM pg_temp.t_err(format('SELECT public.crew_save_settings(true, %L, %L, ARRAY[%L], true, NULL, NULL)', v_api, v_owner, 'alert'), 'link your profile in Agent > Settings > Team');
  PERFORM pg_temp.t_err(format('SELECT public.crew_save_settings(true, %L, %L, ARRAY[%L], NULL, NULL, true)', v_api, v_owner, 'alert'), 'link your profile in Agent > Settings > Team');
  PERFORM pg_temp.t_eq('nothing was saved', (SELECT cliq_commands_enabled OR cliq_dm FROM public.crew_settings WHERE id), false);
  EXECUTE 'RESET ROLE';
  INSERT INTO public.agent_identity_map (person_id, cliq_user_id, matched_by) VALUES (v_owner, '20012345678', 'manual');
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM public.crew_save_settings(true, v_api, v_owner, ARRAY['alert'], true, NULL, true);
  PERFORM pg_temp.t_eq('commands on with the linked profile and no typed id', (SELECT cliq_commands_enabled AND cliq_dm AND cliq_owner_id IS NULL FROM public.crew_settings WHERE id), true);
  EXECUTE 'RESET ROLE';
  PERFORM pg_temp.t_eq('and the owner is the linked id', public.crew_cliq_effective_owner(), '20012345678');
  v_checks := v_checks + 5;

  -- the clock now calls out for a linked owner (no Vault secrets in a test database: it must skip quietly, not fail)
  PERFORM public.crew_cliq_tick();
  v_checks := v_checks + 1;

  RAISE NOTICE 'crew_cliq_identity: all % checks passed', v_checks;
END $$;

ROLLBACK;
