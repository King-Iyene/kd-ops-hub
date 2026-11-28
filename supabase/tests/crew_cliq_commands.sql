-- Crew in Cliq: approve, reject and reply from Cliq go through the real crew_decide / crew_say as the owner, with the extra rules (CONFIRM for
-- high-risk and team changes, no payments), one waiting proposal per code, a replay does nothing twice, and only the server can call any of it.
-- Replay: with the Crew migrations (through 20261467) applied, run  psql -v ON_ERROR_STOP=1 < supabase/tests/crew_cliq_commands.sql   (everything is rolled back).
-- It uses the owner named in crew_settings; if none is set, it makes a test owner.
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
  v_owner uuid; v_role text; v_conn uuid := gen_random_uuid(); v_checks integer := 0;
  a_one uuid := gen_random_uuid(); a_two uuid := gen_random_uuid(); a_solo uuid := gen_random_uuid(); a_gone uuid := gen_random_uuid();
  p_med uuid := gen_random_uuid(); p_high uuid := gen_random_uuid(); p_pay uuid := gen_random_uuid(); p_team uuid := gen_random_uuid(); p_rej uuid := gen_random_uuid();
  p_x1 uuid := 'abcdef01-0000-4000-8000-000000000001'; p_x2 uuid := 'abcdef02-0000-4000-8000-000000000002';
  v_res jsonb; v_ids uuid[]; v_n integer; v_row public.crew_proposals;
BEGIN
  -- the owner ---------------------------------------------------------------------------------------------------------------------------------
  SELECT owner_profile_id INTO v_owner FROM public.crew_settings WHERE id;
  IF v_owner IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_owner AND role = 'super_admin') THEN
    v_owner := gen_random_uuid();
    INSERT INTO auth.users (id, email) VALUES (v_owner, 'owner@t.local');
    INSERT INTO public.profiles (id, email, full_name, role, status) VALUES (v_owner, 'owner@t.local', 'Test Owner', 'super_admin', 'active');
    UPDATE public.crew_settings SET owner_profile_id = v_owner WHERE id;
  END IF;
  SELECT role INTO v_role FROM public.crew_agents LIMIT 1;
  v_role := coalesce(v_role, 'cfo');

  INSERT INTO public.crew_agents (id, slug, name, title, role) VALUES
    (a_one, 'zz_a', 'Zzhale One', 'Test One', v_role), (a_two, 'zz_b', 'Zzhale Two', 'Test Two', v_role),
    (a_solo, 'zz_c', 'Zzsolo Three', 'Test Three', v_role);
  INSERT INTO public.crew_agents (id, slug, name, title, role, active) VALUES (a_gone, 'zz_d', 'Zzgone Four', 'Test Four', v_role, false);
  INSERT INTO public.crew_proposals (id, agent_id, action, summary, risk) VALUES
    (p_med, a_solo, 'advice.finance', 'Medium advice', 'medium'),
    (p_high, a_solo, 'advice.finance', 'High-risk advice', 'high'),
    (p_pay, a_solo, 'draft.batch_payment', 'Pay the vendor', 'high'),
    (p_team, a_solo, 'agent.hire', 'Hire someone', 'low'),
    (p_rej, a_solo, 'advice.finance', 'To be rejected', 'medium'),
    (p_x1, a_solo, 'advice.finance', 'Twin one', 'low'),
    (p_x2, a_solo, 'advice.finance', 'Twin two', 'low');
  INSERT INTO public.agent_connections (id, kind, name, config) VALUES (v_conn, 'cliq', 'Test Cliq', '{"mode":"api","dc":"com","channel":"test"}');

  -- only the server can call these: a signed-in user cannot act as the owner through them ---------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM pg_temp.t_err(format('SELECT public.crew_cliq_decide(%L, %L, NULL)', left(p_med::text, 6), 'approve'), 'permission denied');
  PERFORM pg_temp.t_err(format('SELECT public.crew_cliq_say(%L, %L)', 'zz_c', 'hi'), 'permission denied');
  PERFORM pg_temp.t_err('SELECT * FROM public.crew_cliq_pending_to_notify(5)', 'permission denied');
  PERFORM pg_temp.t_err('SELECT public.crew_cliq_mark_notified(ARRAY[gen_random_uuid()])', 'permission denied');
  EXECUTE 'RESET ROLE';
  EXECUTE 'SET LOCAL ROLE anon';
  PERFORM pg_temp.t_err(format('SELECT public.crew_cliq_decide(%L, %L, NULL)', left(p_med::text, 6), 'approve'), 'permission denied');
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claim.sub', '', true);
  v_checks := v_checks + 6;

  -- settings: the new columns are off by default, and the saved id is checked ------------------------------------------------------------------
  PERFORM pg_temp.t_eq('commands are off by default', (SELECT cliq_commands_enabled FROM public.crew_settings WHERE id), false);
  PERFORM pg_temp.t_err($q$UPDATE public.crew_settings SET cliq_owner_id = 'bad id!' WHERE id$q$, 'crew_settings_cliq_owner_id_check');
  PERFORM pg_temp.t_err($q$UPDATE public.crew_settings SET cliq_owner_id = 'x' WHERE id$q$, 'crew_settings_cliq_owner_id_check');
  v_checks := v_checks + 3;

  -- approve and reject ------------------------------------------------------------------------------------------------------------------------
  PERFORM pg_temp.t_err($q$SELECT public.crew_cliq_decide('abc', 'approve', NULL)$q$, '6 to 8 letters');
  PERFORM pg_temp.t_err($q$SELECT public.crew_cliq_decide('abcdef012', 'approve', NULL)$q$, '6 to 8 letters');
  PERFORM pg_temp.t_err($q$SELECT public.crew_cliq_decide('zzzzzz', 'approve', NULL)$q$, '6 to 8 letters');
  PERFORM pg_temp.t_err($q$SELECT public.crew_cliq_decide('abcdef', 'maybe', NULL)$q$, 'say approve or reject');
  PERFORM pg_temp.t_err($q$SELECT public.crew_cliq_decide('0badc0de', 'approve', NULL)$q$, 'no proposal starts with');
  v_checks := v_checks + 5;

  -- a medium proposal is approved by a 6-character prefix, as the owner, by the real crew_decide
  v_res := public.crew_cliq_decide(upper(left(p_med::text, 6)), 'approve', NULL);
  PERFORM pg_temp.t_eq('approve returns the real status', v_res ->> 'status', 'executed');
  PERFORM pg_temp.t_eq('and the proposal', v_res ->> 'summary', 'Medium advice');
  SELECT * INTO v_row FROM public.crew_proposals WHERE id = p_med;
  PERFORM pg_temp.t_eq('status executed', v_row.status, 'executed');
  PERFORM pg_temp.t_eq('decided by the owner', v_row.decided_by, v_owner);
  PERFORM pg_temp.t_eq('note says Cliq', v_row.decision_note, 'Approved from Cliq');
  -- a message replayed after the decision does nothing twice
  PERFORM pg_temp.t_err(format('SELECT public.crew_cliq_decide(%L, %L, NULL)', left(p_med::text, 6), 'approve'), 'already executed');
  PERFORM pg_temp.t_err(format('SELECT public.crew_cliq_decide(%L, %L, NULL)', left(p_med::text, 6), 'reject'), 'already executed');
  v_checks := v_checks + 7;

  -- high risk needs the literal word CONFIRM; rejecting never does
  PERFORM pg_temp.t_err(format('SELECT public.crew_cliq_decide(%L, %L, NULL)', left(p_high::text, 6), 'approve'), 'approve ' || left(p_high::text, 6) || ' confirm');
  PERFORM pg_temp.t_err(format('SELECT public.crew_cliq_decide(%L, %L, %L)', left(p_high::text, 6), 'approve', 'yes please'), 'high-risk');
  PERFORM pg_temp.t_err(format('SELECT public.crew_cliq_decide(%L, %L, %L)', left(p_high::text, 6), 'approve', 'confirm'), 'high-risk');
  PERFORM pg_temp.t_eq('still waiting after the refusals', (SELECT status FROM public.crew_proposals WHERE id = p_high), 'pending');
  v_res := public.crew_cliq_decide(left(p_high::text, 6), 'approve', 'CONFIRM');
  PERFORM pg_temp.t_eq('high-risk approved with CONFIRM', v_res ->> 'status', 'executed');
  v_checks := v_checks + 5;

  -- hiring or letting someone go needs it too, even at low risk (and nothing is executed without it)
  PERFORM pg_temp.t_err(format('SELECT public.crew_cliq_decide(%L, %L, NULL)', left(p_team::text, 6), 'approve'), 'about the team');
  PERFORM pg_temp.t_eq('team proposal untouched', (SELECT status FROM public.crew_proposals WHERE id = p_team), 'pending');
  v_checks := v_checks + 2;

  -- a payment or a payroll run can never be approved from Cliq, with or without CONFIRM; it can be rejected
  PERFORM pg_temp.t_err(format('SELECT public.crew_cliq_decide(%L, %L, NULL)', left(p_pay::text, 6), 'approve'), 'approved in the app');
  PERFORM pg_temp.t_err(format('SELECT public.crew_cliq_decide(%L, %L, %L)', left(p_pay::text, 6), 'approve', 'CONFIRM'), 'approved in the app');
  PERFORM pg_temp.t_eq('payment untouched', (SELECT status FROM public.crew_proposals WHERE id = p_pay), 'pending');
  v_res := public.crew_cliq_decide(left(p_pay::text, 6), 'reject', 'we pay in the app');
  PERFORM pg_temp.t_eq('payment can be rejected', v_res ->> 'status', 'rejected');
  PERFORM pg_temp.t_eq('reason reaches the executive', (SELECT count(*) FROM public.crew_notes WHERE agent_id = a_solo AND body LIKE '%we pay in the app%')::int, 1);
  -- a reject with no reason stays empty, so the executive knows to ask before proposing it again
  v_res := public.crew_cliq_decide(left(p_rej::text, 6), 'reject', '   ');
  PERFORM pg_temp.t_eq('rejected', v_res ->> 'status', 'rejected');
  PERFORM pg_temp.t_eq('no reason kept empty', (SELECT decision_note FROM public.crew_proposals WHERE id = p_rej), NULL::text);
  PERFORM pg_temp.t_eq('lesson says no reason given', (SELECT count(*) FROM public.crew_notes WHERE agent_id = a_solo AND body LIKE '%To be rejected%no reason given%')::int, 1);
  v_checks := v_checks + 8;

  -- two waiting proposals share the same first six characters: the short code is refused, the long one works
  PERFORM pg_temp.t_err($q$SELECT public.crew_cliq_decide('abcdef', 'approve', NULL)$q$, '2 waiting proposals');
  SELECT count(*) INTO v_n FROM public.crew_cliq_pending_rows() WHERE id IN (p_x1, p_x2);
  PERFORM pg_temp.t_eq('both are listed', v_n, 2);
  PERFORM pg_temp.t_eq('with eight-character codes', (SELECT array_agg(code ORDER BY code) FROM public.crew_cliq_pending_rows() WHERE id IN (p_x1, p_x2)), ARRAY['abcdef01', 'abcdef02']);
  v_res := public.crew_cliq_decide('abcdef01', 'approve', NULL);
  PERFORM pg_temp.t_eq('the right one was approved', (SELECT status FROM public.crew_proposals WHERE id = p_x1), 'executed');
  PERFORM pg_temp.t_eq('the other still waits', (SELECT status FROM public.crew_proposals WHERE id = p_x2), 'pending');
  v_checks := v_checks + 5;

  -- the list of new proposals to post: once each, claimed, and given back when a post fails ---------------------------------------------------
  SELECT array_agg(id) INTO v_ids FROM public.crew_cliq_pending_to_notify(20) WHERE id IN (p_high, p_pay, p_team, p_x2);
  PERFORM pg_temp.t_eq('only the waiting ones are listed (team, twin two)', (SELECT array_agg(id ORDER BY id) FROM public.crew_cliq_pending_to_notify(20) WHERE id IN (p_med, p_high, p_pay, p_team, p_rej, p_x1, p_x2)), (SELECT array_agg(i ORDER BY i) FROM unnest(ARRAY[p_team, p_x2]) i));
  v_ids := public.crew_cliq_mark_notified(ARRAY[p_team, p_x2, p_med]);
  PERFORM pg_temp.t_eq('only waiting proposals are taken', (SELECT array_agg(i ORDER BY i) FROM unnest(v_ids) i), (SELECT array_agg(i ORDER BY i) FROM unnest(ARRAY[p_team, p_x2]) i));
  PERFORM pg_temp.t_eq('a second run takes nothing', cardinality(public.crew_cliq_mark_notified(ARRAY[p_team, p_x2])), 0);
  PERFORM pg_temp.t_eq('and finds nothing new', (SELECT count(*) FROM public.crew_cliq_pending_to_notify(20) WHERE id IN (p_team, p_x2))::int, 0);
  PERFORM pg_temp.t_eq('status still lists them', (SELECT count(*) FROM public.crew_cliq_pending_list(30) WHERE id IN (p_team, p_x2))::int, 2);
  PERFORM public.crew_cliq_unmark_notified(ARRAY[p_x2]);
  PERFORM pg_temp.t_eq('given back after a failed post', (SELECT array_agg(id) FROM public.crew_cliq_pending_to_notify(20) WHERE id IN (p_team, p_x2)), ARRAY[p_x2]);
  PERFORM pg_temp.t_eq('the list carries what Cliq shows', (SELECT agent_name || '|' || risk FROM public.crew_cliq_pending_to_notify(20) WHERE id = p_x2), 'Zzsolo Three|low');
  v_checks := v_checks + 7;

  -- write to an executive ---------------------------------------------------------------------------------------------------------------------
  v_res := public.crew_cliq_say('ZZ_C', 'please check the tax deadline');
  PERFORM pg_temp.t_eq('by slug', v_res ->> 'slug', 'zz_c');
  PERFORM pg_temp.t_eq('the message is the owner''s own', (SELECT count(*) FROM public.crew_messages WHERE to_agent = a_solo AND from_agent IS NULL AND from_profile = v_owner AND kind = 'message' AND body = 'please check the tax deadline')::int, 1);
  v_res := public.crew_cliq_say(' zzsolo ', 'and the filing date');
  PERFORM pg_temp.t_eq('by first name', v_res ->> 'agent', 'Zzsolo Three');
  PERFORM pg_temp.t_err($q$SELECT public.crew_cliq_say('zzhale', 'hello')$q$, 'more than one person is called');
  v_res := public.crew_cliq_say('zz_a', 'an exact slug always works');
  PERFORM pg_temp.t_eq('exact slug wins', v_res ->> 'slug', 'zz_a');
  PERFORM pg_temp.t_err($q$SELECT public.crew_cliq_say('zzgone', 'hello')$q$, 'no one on the team is called');
  PERFORM pg_temp.t_err($q$SELECT public.crew_cliq_say('zz_d', 'hello')$q$, 'no one on the team is called');
  PERFORM pg_temp.t_err($q$SELECT public.crew_cliq_say('nobody', 'hello')$q$, 'no one on the team is called');
  PERFORM pg_temp.t_err($q$SELECT public.crew_cliq_say('zz_c', '   ')$q$, 'the message is empty');
  PERFORM pg_temp.t_err($q$SELECT public.crew_cliq_say('', 'hello')$q$, 'say who it is for');
  PERFORM pg_temp.t_err(format('SELECT public.crew_cliq_say(%L, %L)', 'zz_c', repeat('x', 4001)), 'too long');
  v_checks := v_checks + 11;

  -- without a proper owner nothing is done -----------------------------------------------------------------------------------------------------
  UPDATE public.crew_settings SET owner_profile_id = NULL WHERE id;
  PERFORM pg_temp.t_err(format('SELECT public.crew_cliq_decide(%L, %L, NULL)', left(p_x2::text, 8), 'approve'), 'owner is not set up');
  PERFORM pg_temp.t_err($q$SELECT public.crew_cliq_say('zz_c', 'hello')$q$, 'owner is not set up');
  UPDATE public.crew_settings SET owner_profile_id = v_owner WHERE id;
  UPDATE public.profiles SET role = 'admin' WHERE id = v_owner;
  PERFORM pg_temp.t_err(format('SELECT public.crew_cliq_decide(%L, %L, NULL)', left(p_x2::text, 8), 'approve'), 'owner is not set up');
  UPDATE public.profiles SET role = 'super_admin' WHERE id = v_owner;
  v_checks := v_checks + 3;

  -- saving the settings: the old four-argument call still works, the new answers are checked, commands go off with the alerts -------------------
  PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM public.crew_save_settings(true, v_conn, v_owner, ARRAY['alert']);
  PERFORM pg_temp.t_eq('old call leaves commands off', (SELECT cliq_commands_enabled FROM public.crew_settings WHERE id), false);
  PERFORM pg_temp.t_err(format('SELECT public.crew_save_settings(true, %L, %L, ARRAY[%L], true, NULL)', v_conn, v_owner, 'alert'), 'type your Cliq user id or email');
  PERFORM pg_temp.t_err(format('SELECT public.crew_save_settings(true, %L, %L, ARRAY[%L], true, %L)', v_conn, v_owner, 'alert', 'bad id!'), 'may only use letters');
  PERFORM pg_temp.t_err(format('SELECT public.crew_save_settings(false, NULL, %L, ARRAY[%L], true, %L)', v_owner, 'alert', 'king@example.com'), 'turn on Cliq alerts first');
  PERFORM public.crew_save_settings(true, v_conn, v_owner, ARRAY['alert'], true, '  king@example.com ');
  PERFORM pg_temp.t_eq('commands on', (SELECT cliq_commands_enabled FROM public.crew_settings WHERE id), true);
  PERFORM pg_temp.t_eq('id saved trimmed', (SELECT cliq_owner_id FROM public.crew_settings WHERE id), 'king@example.com');
  PERFORM pg_temp.t_eq('mark restarted', (SELECT cliq_cursor_ms FROM public.crew_settings WHERE id), 0::bigint);
  EXECUTE 'RESET ROLE';
  UPDATE public.crew_settings SET cliq_cursor_ms = 5000 WHERE id;
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM public.crew_save_settings(true, v_conn, v_owner, ARRAY['alert', 'reminder']);
  PERFORM pg_temp.t_eq('saving alerts alone keeps the mark', (SELECT cliq_cursor_ms FROM public.crew_settings WHERE id), 5000::bigint);
  PERFORM pg_temp.t_eq('and commands stay on', (SELECT cliq_commands_enabled FROM public.crew_settings WHERE id), true);
  PERFORM public.crew_save_settings(true, v_conn, v_owner, ARRAY['alert'], true, 'someone.else@example.com');
  PERFORM pg_temp.t_eq('a new account restarts the mark', (SELECT cliq_cursor_ms FROM public.crew_settings WHERE id), 0::bigint);
  PERFORM public.crew_save_settings(false, NULL, v_owner, ARRAY['alert']);
  PERFORM pg_temp.t_eq('commands go off with the alerts', (SELECT cliq_commands_enabled FROM public.crew_settings WHERE id), false);
  PERFORM pg_temp.t_eq('the account stays typed', (SELECT cliq_owner_id FROM public.crew_settings WHERE id), 'someone.else@example.com');
  PERFORM public.crew_save_settings(false, NULL, v_owner, ARRAY['alert'], false, '');
  PERFORM pg_temp.t_eq('and can be cleared', (SELECT cliq_owner_id FROM public.crew_settings WHERE id), NULL::text);
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claim.sub', '', true);
  -- someone who is not the owner cannot save
  PERFORM set_config('request.jwt.claim.sub', gen_random_uuid()::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM pg_temp.t_err(format('SELECT public.crew_save_settings(true, %L, NULL, ARRAY[%L], true, %L)', v_conn, 'alert', 'x.y@z.com'), 'only the owner');
  EXECUTE 'RESET ROLE';
  v_checks := v_checks + 15;

  -- the clock function does nothing while switched off (and never errors without the Vault secrets)
  PERFORM public.crew_cliq_tick();
  v_checks := v_checks + 1;

  RAISE NOTICE 'crew_cliq_commands: all % checks passed', v_checks;
END $$;

ROLLBACK;
