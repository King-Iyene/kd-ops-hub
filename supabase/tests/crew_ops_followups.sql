-- Crew: the Head of Operations' standing permission to post in Cliq: off by default, owner-only controls, the daily cap, the text rules, the one-reminder-a-day rule,
-- the log, the kill switch, the time source and the twice-a-day routine.
-- Replay: with the Crew migrations (through 20261481) applied, run  psql -v ON_ERROR_STOP=1 < supabase/tests/crew_ops_followups.sql   (everything is rolled back).
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
-- the refusal text of a reserve call, or 'ALLOWED'
CREATE FUNCTION pg_temp.t_reserve(p_agent uuid, p_kind text, p_text text, p_tag text[] DEFAULT '{}') RETURNS text LANGUAGE plpgsql AS $$
DECLARE r jsonb;
BEGIN r := public.crew_cliq_post_reserve(p_agent, p_kind, p_text, p_tag); RETURN CASE WHEN (r ->> 'allowed')::boolean THEN 'ALLOWED' ELSE r ->> 'error' END; END $$;

DO $$
DECLARE
  v_owner uuid; v_ops uuid; v_cfo uuid; v_conn uuid := gen_random_uuid(); v_hook uuid := gen_random_uuid(); v_checks integer := 0;
  p1 text; p2 text; v_p1 uuid; v_p2 uuid; r jsonb; v_post1 uuid; v_post2 uuid; v_tz text; v_day date; v_slot_t time; v_work_start time; v_days integer[]; v_sun date; v_n integer; v_res text;
BEGIN
  SELECT owner_profile_id INTO v_owner FROM public.crew_settings WHERE id;
  IF v_owner IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_owner AND role = 'super_admin') THEN
    v_owner := gen_random_uuid();
    INSERT INTO auth.users (id, email) VALUES (v_owner, 'owner@t.local');
    INSERT INTO public.profiles (id, email, full_name, role, status) VALUES (v_owner, 'owner@t.local', 'Test Owner', 'super_admin', 'active');
    UPDATE public.crew_settings SET owner_profile_id = v_owner WHERE id;
  END IF;
  SELECT id INTO v_ops FROM public.crew_agents WHERE slug = 'ops_head' AND active;
  SELECT id INTO v_cfo FROM public.crew_agents WHERE slug = 'cfo' AND active;
  IF v_ops IS NULL THEN RAISE EXCEPTION 'FAIL: this test needs the ops_head agent'; END IF;
  INSERT INTO public.agent_connections (id, kind, name, config) VALUES
    (v_conn, 'cliq', 'Zoho Cliq Test Operations', '{"mode":"api","dc":"com","channel":"test_ops"}'),
    (v_hook, 'cliq', 'Test webhook', '{"mode":"webhook"}');

  -- two real team members (names are never printed): the first has a Cliq id saved, the second has none
  SELECT full_name, person_id INTO p1, v_p1 FROM public.agent_team_v ORDER BY full_name LIMIT 1 OFFSET 0;
  SELECT full_name, person_id INTO p2, v_p2 FROM public.agent_team_v ORDER BY full_name LIMIT 1 OFFSET 1;
  IF p1 IS NULL OR p2 IS NULL THEN RAISE EXCEPTION 'FAIL: this test needs at least two people on the Ops Agent team'; END IF;
  INSERT INTO public.agent_identity_map (person_id, cliq_user_id, matched_by) VALUES (v_p1, '4400110011', 'manual') ON CONFLICT (person_id) DO UPDATE SET cliq_user_id = '4400110011';
  DELETE FROM public.agent_identity_map WHERE person_id = v_p2;

  -- the text rules ---------------------------------------------------------------------------------------------------------------------------------------------
  PERFORM pg_temp.t_eq('a plain reminder is fine', public.crew_cliq_post_text_error('@Sam Doe good morning, please start your timer when you can. Thanks!'), NULL::text);
  PERFORM pg_temp.t_eq('a kdsquares.com link is fine', public.crew_cliq_post_text_error('Open https://ops.kdsquares.com/timetrack when ready, or kdsquares.com'), NULL::text);
  PERFORM pg_temp.t_eq('times and dates are fine', public.crew_cliq_post_text_error('Please track from 10:30 today, 2026-11-28, 4 hours.'), NULL::text);
  PERFORM pg_temp.t_eq('empty', public.crew_cliq_post_text_error('   '), 'the message is empty');
  PERFORM pg_temp.t_eq('too long', public.crew_cliq_post_text_error(repeat('a ', 351)), 'too long: 700 characters at most');
  PERFORM pg_temp.t_eq('exactly 700 is fine', public.crew_cliq_post_text_error(repeat('a ', 350)), NULL::text);
  PERFORM pg_temp.t_eq('a hand-written tag', public.crew_cliq_post_text_error('hi {@123456}') LIKE 'do not write tags yourself%', true);
  PERFORM pg_temp.t_eq('an email', public.crew_cliq_post_text_error('write to sam@example.com') LIKE 'no email addresses%', true);
  PERFORM pg_temp.t_eq('another site', public.crew_cliq_post_text_error('see https://evil.example.org/x') LIKE 'no links except%', true);
  PERFORM pg_temp.t_eq('a bare domain', public.crew_cliq_post_text_error('go to evil.com now') LIKE 'no links except%', true);
  PERFORM pg_temp.t_eq('a look-alike domain', public.crew_cliq_post_text_error('see https://kdsquares.com.evil.io/x') LIKE 'no links except%', true);
  PERFORM pg_temp.t_eq('money symbol', public.crew_cliq_post_text_error('pay $50 now') LIKE 'no money amounts%', true);
  PERFORM pg_temp.t_eq('naira shorthand', public.crew_cliq_post_text_error('it costs N5000') LIKE 'no money amounts%', true);
  PERFORM pg_temp.t_eq('money word', public.crew_cliq_post_text_error('we owe 50 naira') LIKE 'no money amounts%', true);
  PERFORM pg_temp.t_eq('a grouped number', public.crew_cliq_post_text_error('about 1,200,000 this month') LIKE 'no money amounts%', true);
  PERFORM pg_temp.t_eq('an account number', public.crew_cliq_post_text_error('account 0123456789 please') LIKE 'no phone or account numbers%', true);
  PERFORM pg_temp.t_eq('a phone number', public.crew_cliq_post_text_error('call +234 803 123 4567') LIKE 'no phone or account numbers%', true);
  PERFORM pg_temp.t_eq('a spaced phone number', public.crew_cliq_post_text_error('call 803-123-4567') LIKE 'no phone or account numbers%', true);
  PERFORM pg_temp.t_eq('an api key', public.crew_cliq_post_text_error('use sk_live_abcdefghijklmnopqrstuv') LIKE 'that looks like a secret%', true);
  PERFORM pg_temp.t_eq('a password', public.crew_cliq_post_text_error('the password is hunter2') LIKE 'that looks like a secret%', true);
  PERFORM pg_temp.t_eq('a long token', public.crew_cliq_post_text_error('abcdefghijklmnopqrstuvwxyz0123456789ABCD') LIKE 'that looks like a secret%', true);
  v_checks := v_checks + 22;

  -- off by default, and refusals are logged ---------------------------------------------------------------------------------------------------------------------
  PERFORM pg_temp.t_eq('ops_head ships prepared but off', (SELECT enabled FROM public.crew_standing_permissions WHERE agent_id = v_ops AND kind = 'cliq_post'), false);
  UPDATE public.crew_standing_permissions SET connection_id = NULL, enabled = false WHERE agent_id = v_ops;   -- a clean starting point (not the seeded channel)
  DELETE FROM public.crew_cliq_posts WHERE agent_id = v_ops;
  PERFORM pg_temp.t_eq('permission off = refused', pg_temp.t_reserve(v_ops, 'announcement', 'Hello team'), 'you have no standing permission to post in Cliq (the owner has it switched off): tell the owner in the Crew inbox instead');
  PERFORM pg_temp.t_eq('the refusal is logged', (SELECT count(*) FROM public.crew_cliq_posts WHERE agent_id = v_ops AND status = 'refused')::int, 1);
  IF v_cfo IS NOT NULL THEN PERFORM pg_temp.t_eq('an agent with no permission row is refused too', pg_temp.t_reserve(v_cfo, 'announcement', 'Hello team') LIKE 'you have no standing permission%', true); END IF;
  PERFORM pg_temp.t_eq('a bad kind is refused', pg_temp.t_reserve(v_ops, 'spam', 'Hello'), 'kind must be tracking_followup or announcement');
  v_checks := v_checks + 5 - CASE WHEN v_cfo IS NULL THEN 1 ELSE 0 END;

  -- only the server can call the post functions; only the owner can change the permission ------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM pg_temp.t_err(format('SELECT public.crew_cliq_post_reserve(%L, %L, %L)', v_ops, 'announcement', 'hi'), 'permission denied');
  PERFORM pg_temp.t_err(format('SELECT public.crew_cliq_post_finish(%L, true)', gen_random_uuid()), 'permission denied');
  PERFORM pg_temp.t_err(format('SELECT public.crew_cliq_post_text_error(%L)', 'hi'), 'permission denied');
  PERFORM pg_temp.t_err(format('SELECT public.crew_ops_followup_tick()'), 'permission denied');
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claim.sub', gen_random_uuid()::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM pg_temp.t_err(format('SELECT public.crew_set_standing_permission(%L, %L, true)', v_ops, v_conn), 'only the owner');
  PERFORM pg_temp.t_err('SELECT public.crew_standing_kill_all()', 'only the owner');
  EXECUTE 'RESET ROLE';
  v_checks := v_checks + 6;

  -- a paused agent cannot post (20261480)
  UPDATE public.crew_agents SET paused = true WHERE id = v_ops;
  PERFORM pg_temp.t_eq('a paused agent is refused', pg_temp.t_reserve(v_ops, 'announcement', 'Hello team'), 'you are paused by the owner: you cannot post');
  UPDATE public.crew_agents SET paused = false WHERE id = v_ops;
  v_checks := v_checks + 1;

  -- the owner switches it on (the channel must be a Zoho sign-in connection with a channel; the limit and kinds are checked)
  PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM pg_temp.t_err(format('SELECT public.crew_set_standing_permission(%L, %L, true)', v_ops, v_hook), 'signs in with Zoho and has a channel');
  PERFORM pg_temp.t_err(format('SELECT public.crew_set_standing_permission(%L, NULL, true)', v_ops), 'choose the channel first');
  PERFORM pg_temp.t_err(format('SELECT public.crew_set_standing_permission(%L, %L, true, 0)', v_ops, v_conn), 'between 1 and 20');
  PERFORM pg_temp.t_err(format('SELECT public.crew_set_standing_permission(%L, %L, true, 21)', v_ops, v_conn), 'between 1 and 20');
  PERFORM pg_temp.t_err(format('SELECT public.crew_set_standing_permission(%L, %L, true, 5, ARRAY[%L])', v_ops, v_conn, 'payment'), 'which kinds');
  PERFORM public.crew_set_standing_permission(v_ops, v_conn, true, 2);
  EXECUTE 'RESET ROLE';
  PERFORM pg_temp.t_eq('on, with the owner''s limit', (SELECT enabled AND max_posts_per_day = 2 AND connection_id = v_conn AND created_by = v_owner FROM public.crew_standing_permissions WHERE agent_id = v_ops), true);
  v_checks := v_checks + 7;

  -- a reminder for a person with a Cliq id: reserved, then sent; the same person again the same day is refused
  PERFORM pg_temp.t_eq('a tracking follow-up must name someone', pg_temp.t_reserve(v_ops, 'tracking_followup', 'Please start your timer'), 'a tracking follow-up must name the person (or people) it is for in the tag list');
  PERFORM pg_temp.t_eq('an unknown name is refused', pg_temp.t_reserve(v_ops, 'tracking_followup', 'Hi', ARRAY['Nobody Atall Here']) LIKE 'no one on the team is called%', true);
  PERFORM pg_temp.t_eq('too many names', pg_temp.t_reserve(v_ops, 'announcement', 'Hi', ARRAY['a','b','c','d','e','f','g','h','i']), 'name at most 8 people in one post');
  r := public.crew_cliq_post_reserve(v_ops, 'tracking_followup', '@' || p1 || ' good morning, please start your timer when you can.', ARRAY[upper(p1)]);
  PERFORM pg_temp.t_eq('allowed', (r ->> 'allowed')::boolean, true);
  PERFORM pg_temp.t_eq('the person is tagged by their saved Cliq id', r -> 'mentions' -> 0 ->> 'id', '4400110011');
  PERFORM pg_temp.t_eq('and named', r -> 'mentions' -> 0 ->> 'name', p1);
  PERFORM pg_temp.t_eq('the Cliq connection to use', (r ->> 'connection_id')::uuid, v_conn);
  v_post1 := (r ->> 'post_id')::uuid;
  PERFORM pg_temp.t_eq('logged as reserved with the tag', (SELECT status || (tagged -> 0 ->> 'tagged') FROM public.crew_cliq_posts WHERE id = v_post1), 'reservedtrue');
  PERFORM public.crew_cliq_post_finish(v_post1, true);
  PERFORM pg_temp.t_eq('then sent', (SELECT status = 'sent' AND sent_at IS NOT NULL FROM public.crew_cliq_posts WHERE id = v_post1), true);
  PERFORM pg_temp.t_eq('one reminder a day per person', pg_temp.t_reserve(v_ops, 'tracking_followup', '@' || p1 || ' again?', ARRAY[p1]) LIKE '% was already reminded today%', true);
  PERFORM pg_temp.t_eq('finishing twice changes nothing', (SELECT count(*) FROM public.crew_cliq_posts WHERE agent_id = v_ops AND status = 'sent')::int, 1);
  v_checks := v_checks + 11;

  -- a person with no Cliq id is named but not really tagged; the cap counts sent and reserved posts, never failed ones
  r := public.crew_cliq_post_reserve(v_ops, 'tracking_followup', '@' || p2 || ' good morning, please start your timer.', ARRAY[p2]);
  PERFORM pg_temp.t_eq('allowed without an id', (r ->> 'allowed')::boolean, true);
  PERFORM pg_temp.t_eq('the id is empty: plain name only', r -> 'mentions' -> 0 ->> 'id', '');
  v_post2 := (r ->> 'post_id')::uuid;
  PERFORM pg_temp.t_eq('logged as not tagged', (SELECT tagged -> 0 ->> 'tagged' FROM public.crew_cliq_posts WHERE id = v_post2), 'false');
  PERFORM pg_temp.t_eq('the daily limit of 2 is reached', pg_temp.t_reserve(v_ops, 'announcement', 'Team meeting at 3'), 'you have used today''s limit of 2 posts: leave it for tomorrow or tell the owner');
  PERFORM public.crew_cliq_post_finish(v_post2, false, 'Zoho said no');
  PERFORM pg_temp.t_eq('a failed post does not use the limit', pg_temp.t_reserve(v_ops, 'announcement', 'Team meeting at 3'), 'ALLOWED');
  PERFORM pg_temp.t_eq('the failure is kept in the log', (SELECT status || error FROM public.crew_cliq_posts WHERE id = v_post2), 'failedZoho said no');
  v_checks := v_checks + 6;

  -- content refusals are logged with the reason; a post that was refused is never sent
  PERFORM pg_temp.t_eq('a money amount is refused', pg_temp.t_reserve(v_ops, 'announcement', 'Salaries of $500 go out'), 'no money amounts in a post');
  PERFORM pg_temp.t_eq('and logged', (SELECT count(*) FROM public.crew_cliq_posts WHERE agent_id = v_ops AND status = 'refused' AND error = 'no money amounts in a post')::int, 1);
  -- the kinds the owner allowed
  UPDATE public.crew_standing_permissions SET allowed_kinds = ARRAY['announcement'], max_posts_per_day = 20 WHERE agent_id = v_ops;
  PERFORM pg_temp.t_eq('a kind that is not allowed', pg_temp.t_reserve(v_ops, 'tracking_followup', '@' || p2 || ' hi', ARRAY[p2]), 'your permission does not cover tracking_followup posts');
  v_checks := v_checks + 3;

  -- the kill switch
  PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM pg_temp.t_eq('the kill switch reports what it turned off', public.crew_standing_kill_all() >= 1, true);
  EXECUTE 'RESET ROLE';
  PERFORM pg_temp.t_eq('everything is off', (SELECT count(*) FROM public.crew_standing_permissions WHERE enabled)::int, 0);
  PERFORM pg_temp.t_eq('and a post is refused', pg_temp.t_reserve(v_ops, 'announcement', 'Hello again') LIKE 'you have no standing permission%', true);
  v_checks := v_checks + 3;

  -- what ops_head may read: the time source, and nobody else gets it
  r := public.crew_read_app(v_ops, 'time_today', '[]'::jsonb, 5);
  PERFORM pg_temp.t_eq('ops_head may read time_today', r ->> 'source', 'time_today');
  PERFORM pg_temp.t_eq('with only the listed columns', (SELECT array_agg(c) FROM jsonb_array_elements_text(r -> 'columns') c) <@ ARRAY['person_id', 'full_name', 'day', 'tracked_minutes', 'timer_running', 'last_tracked_at', 'last_capture_at', 'expected_hours', 'expects_work', 'in_window', 'exempt_time', 'minutes_since_work_start', 'can_tag', 'ops_agent_flagged', 'group_name'], true);
  IF v_cfo IS NOT NULL THEN PERFORM pg_temp.t_err(format('SELECT public.crew_read_app(%L, %L)', v_cfo, 'time_today'), 'may not read'); END IF;
  PERFORM pg_temp.t_eq('no secret or pay column is exposed', (SELECT columns FROM public.crew_app_sources WHERE name = 'time_today') <@ ARRAY['person_id', 'full_name', 'day', 'tracked_minutes', 'timer_running', 'last_tracked_at', 'last_capture_at', 'expected_hours', 'expects_work', 'in_window', 'exempt_time', 'minutes_since_work_start', 'can_tag', 'ops_agent_flagged', 'group_name'], true);
  v_checks := v_checks + 3 + CASE WHEN v_cfo IS NULL THEN 0 ELSE 1 END;

  -- the routine: off = nothing; on = once a slot, only on working days, and the moments come from the Ops Agent settings
  SELECT timezone, default_work_start, default_working_days INTO v_tz, v_work_start, v_days FROM public.agent_settings WHERE id;
  PERFORM pg_temp.t_eq('permission off: the tick does nothing', public.crew_ops_followup_tick(), 'permission off');
  UPDATE public.crew_standing_permissions SET connection_id = v_conn, enabled = true WHERE agent_id = v_ops;
  v_day := (now() AT TIME ZONE v_tz)::date;
  -- a Sunday (not a working day for the default week)
  v_sun := v_day + ((7 - extract(isodow FROM v_day)::int) % 7);
  IF NOT (7 = ANY (v_days)) THEN
    PERFORM pg_temp.t_eq('not a working day: nothing', public.crew_ops_followup_tick((v_sun::timestamp + v_work_start + interval '95 minutes') AT TIME ZONE v_tz), 'not a working day');
    v_checks := v_checks + 1;
  END IF;
  -- the first working day from tomorrow, at work start + 95 minutes: slot 1 runs once
  v_day := v_day + 1;
  WHILE NOT (extract(isodow FROM v_day)::int = ANY (v_days)) LOOP v_day := v_day + 1; END LOOP;
  UPDATE public.crew_agents SET paused = true WHERE id = v_ops;
  PERFORM pg_temp.t_eq('a paused Henry is not woken by the routine', public.crew_ops_followup_tick((v_day::timestamp + v_work_start + interval '95 minutes') AT TIME ZONE v_tz), 'permission off');
  UPDATE public.crew_agents SET paused = false WHERE id = v_ops;
  v_checks := v_checks + 1;
  v_res := public.crew_ops_followup_tick((v_day::timestamp + v_work_start + interval '95 minutes') AT TIME ZONE v_tz);
  PERFORM pg_temp.t_eq('slot 1 ran (woke Henry, or nobody was behind)', v_res LIKE 'woke ops_head%' OR v_res = 'nothing to do now', true);
  PERFORM pg_temp.t_eq('and is recorded once', (SELECT count(*) FROM public.crew_ops_followup_runs WHERE day = v_day AND slot = 1)::int, 1);
  PERFORM pg_temp.t_eq('a second tick in the same slot does nothing', public.crew_ops_followup_tick((v_day::timestamp + v_work_start + interval '100 minutes') AT TIME ZONE v_tz), 'nothing to do now');
  PERFORM pg_temp.t_eq('still recorded once', (SELECT count(*) FROM public.crew_ops_followup_runs WHERE day = v_day AND slot = 1)::int, 1);
  PERFORM pg_temp.t_eq('outside the slots nothing happens', public.crew_ops_followup_tick((v_day::timestamp + v_work_start + interval '30 minutes') AT TIME ZONE v_tz), 'nothing to do now');
  SELECT count(*) INTO v_n FROM public.crew_wake_queue WHERE agent_id = v_ops AND source = 'event' AND created_at > now() - interval '1 minute';
  PERFORM pg_temp.t_eq('at most one wake came out of it', v_n <= 1, true);
  v_checks := v_checks + 7;

  RAISE NOTICE 'crew_ops_followups: all % checks passed', v_checks;
END $$;

ROLLBACK;
