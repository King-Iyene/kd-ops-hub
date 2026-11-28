-- Crew in Cliq, direct message to the owner: saving the destination, what it needs, what it resets, and that older calls still work.
-- Replay: with the Crew migrations (through 20261470) applied, run  psql -v ON_ERROR_STOP=1 < supabase/tests/crew_cliq_dm.sql   (everything is rolled back).
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
  v_owner uuid; v_api uuid := gen_random_uuid(); v_hook uuid := gen_random_uuid(); v_checks integer := 0;
BEGIN
  SELECT owner_profile_id INTO v_owner FROM public.crew_settings WHERE id;
  IF v_owner IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_owner AND role = 'super_admin') THEN
    v_owner := gen_random_uuid();
    INSERT INTO auth.users (id, email) VALUES (v_owner, 'owner@t.local');
    INSERT INTO public.profiles (id, email, full_name, role, status) VALUES (v_owner, 'owner@t.local', 'Test Owner', 'super_admin', 'active');
    UPDATE public.crew_settings SET owner_profile_id = v_owner WHERE id;
  END IF;
  INSERT INTO public.agent_connections (id, kind, name, config) VALUES
    (v_api, 'cliq', 'Test Zoho sign-in', '{"mode":"api","dc":"com","channel":"test"}'),
    (v_hook, 'cliq', 'Test webhook', '{"mode":"webhook"}');
  -- a clean starting point
  UPDATE public.crew_settings SET cliq_enabled = false, cliq_connection_id = NULL, cliq_commands_enabled = false, cliq_owner_id = NULL, cliq_cursor_ms = 0, cliq_dm = false,
         cliq_dm_chat_id = NULL, cliq_error = NULL, cliq_error_at = NULL WHERE id;

  -- the defaults and the remembered values are checked ------------------------------------------------------------------------------------------
  PERFORM pg_temp.t_eq('the destination is the channel by default', (SELECT cliq_dm FROM public.crew_settings WHERE id), false);
  PERFORM pg_temp.t_err($q$UPDATE public.crew_settings SET cliq_dm_chat_id = 'bad id!' WHERE id$q$, 'crew_settings_cliq_dm_chat_id_check');
  v_checks := v_checks + 2;

  PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  -- older calls (4 and 6 arguments) still work and keep the channel as the destination (the first one picks the connection, which restarts what was learned)
  PERFORM public.crew_save_settings(true, v_api, v_owner, ARRAY['alert']);
  EXECUTE 'RESET ROLE';
  UPDATE public.crew_settings SET cliq_dm_chat_id = 'CT_1234567890', cliq_error = 'x', cliq_error_at = now() WHERE id;
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM public.crew_save_settings(true, v_api, v_owner, ARRAY['alert'], false, NULL);
  PERFORM pg_temp.t_eq('old calls leave the channel', (SELECT cliq_dm FROM public.crew_settings WHERE id), false);
  PERFORM pg_temp.t_eq('and the remembered chat (nothing changed)', (SELECT cliq_dm_chat_id FROM public.crew_settings WHERE id), 'CT_1234567890');
  v_checks := v_checks + 2;

  -- a direct message needs to know who it is for, and the connection that signs in with Zoho
  PERFORM pg_temp.t_err(format('SELECT public.crew_save_settings(true, %L, %L, ARRAY[%L], NULL, NULL, true)', v_api, v_owner, 'alert'), 'needs to know who it is for');
  PERFORM pg_temp.t_err(format('SELECT public.crew_save_settings(true, %L, %L, ARRAY[%L], NULL, %L, true)', v_hook, v_owner, 'alert', '20012345678'), 'signs in with Zoho');
  PERFORM pg_temp.t_err(format('SELECT public.crew_save_settings(true, NULL, %L, ARRAY[%L], NULL, %L, true)', v_owner, 'alert', '20012345678'), 'choose the Cliq connection first');
  PERFORM pg_temp.t_err(format('SELECT public.crew_save_settings(true, %L, %L, ARRAY[%L], NULL, %L, true)', v_api, v_owner, 'alert', 'bad id!'), 'may only use letters');
  PERFORM pg_temp.t_eq('nothing was saved by the refusals', (SELECT cliq_dm FROM public.crew_settings WHERE id), false);
  v_checks := v_checks + 5;

  -- the owner chooses "me, as a direct message"
  PERFORM public.crew_save_settings(true, v_api, v_owner, ARRAY['alert'], NULL, '20012345678', true);
  PERFORM pg_temp.t_eq('direct message on', (SELECT cliq_dm FROM public.crew_settings WHERE id), true);
  PERFORM pg_temp.t_eq('to the typed account', (SELECT cliq_owner_id FROM public.crew_settings WHERE id), '20012345678');
  PERFORM pg_temp.t_eq('the chat and the old problem are forgotten', (SELECT cliq_dm_chat_id IS NULL AND cliq_error IS NULL AND cliq_error_at IS NULL FROM public.crew_settings WHERE id), true);
  PERFORM pg_temp.t_eq('and the read mark restarts', (SELECT cliq_cursor_ms FROM public.crew_settings WHERE id), 0::bigint);
  v_checks := v_checks + 4;

  -- commands work with a direct message, and saving something else keeps what was learned
  PERFORM public.crew_save_settings(true, v_api, v_owner, ARRAY['alert'], true, NULL, NULL);
  PERFORM pg_temp.t_eq('commands on with the direct message', (SELECT cliq_commands_enabled AND cliq_dm FROM public.crew_settings WHERE id), true);
  EXECUTE 'RESET ROLE';
  UPDATE public.crew_settings SET cliq_cursor_ms = 7000, cliq_dm_chat_id = 'CT_999', cliq_error = 'Zoho needs one more permission', cliq_error_at = now() WHERE id;
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM public.crew_save_settings(true, v_api, v_owner, ARRAY['alert', 'reminder']);
  PERFORM pg_temp.t_eq('saving the kinds alone keeps the mark', (SELECT cliq_cursor_ms FROM public.crew_settings WHERE id), 7000::bigint);
  PERFORM pg_temp.t_eq('the chat', (SELECT cliq_dm_chat_id FROM public.crew_settings WHERE id), 'CT_999');
  PERFORM pg_temp.t_eq('and the problem shown to the owner', (SELECT cliq_error FROM public.crew_settings WHERE id), 'Zoho needs one more permission');
  PERFORM pg_temp.t_eq('and the destination', (SELECT cliq_dm FROM public.crew_settings WHERE id), true);
  v_checks := v_checks + 5;

  -- another sign-in restarts everything learned; back to a channel too
  PERFORM public.crew_save_settings(true, v_api, v_owner, ARRAY['alert'], NULL, NULL, false);
  PERFORM pg_temp.t_eq('back to the channel', (SELECT cliq_dm FROM public.crew_settings WHERE id), false);
  PERFORM pg_temp.t_eq('the mark restarts', (SELECT cliq_cursor_ms FROM public.crew_settings WHERE id), 0::bigint);
  PERFORM pg_temp.t_eq('the chat is forgotten', (SELECT cliq_dm_chat_id IS NULL AND cliq_error IS NULL FROM public.crew_settings WHERE id), true);
  -- a channel may still use any Cliq connection (the webhook one too), exactly as before
  PERFORM public.crew_save_settings(true, v_hook, v_owner, ARRAY['alert']);
  PERFORM pg_temp.t_eq('the channel path is unchanged', (SELECT cliq_connection_id FROM public.crew_settings WHERE id), v_hook);
  -- with alerts off nothing about the direct message is demanded, and commands go off with the alerts
  PERFORM public.crew_save_settings(true, v_api, v_owner, ARRAY['alert'], NULL, NULL, true);
  PERFORM public.crew_save_settings(false, NULL, v_owner, ARRAY['alert']);
  PERFORM pg_temp.t_eq('commands are off with the alerts', (SELECT cliq_commands_enabled FROM public.crew_settings WHERE id), false);
  v_checks := v_checks + 6;

  EXECUTE 'RESET ROLE';
  -- only the owner can save
  PERFORM set_config('request.jwt.claim.sub', gen_random_uuid()::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM pg_temp.t_err(format('SELECT public.crew_save_settings(true, %L, NULL, ARRAY[%L], NULL, %L, true)', v_api, 'alert', '20012345678'), 'only the owner');
  EXECUTE 'RESET ROLE';
  v_checks := v_checks + 1;

  RAISE NOTICE 'crew_cliq_dm: all % checks passed', v_checks;
END $$;

ROLLBACK;
