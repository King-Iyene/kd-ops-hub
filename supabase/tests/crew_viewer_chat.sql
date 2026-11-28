-- Run after 20261471000000_crew_viewer_chat.sql, inside something that rolls back (the block ends with an exception that carries the result).
-- Checks: only an allowed viewer who is not the owner can ask; the question wakes the executive with the 'event' source (never 'owner') and carries the rules;
-- it never reaches the executive's inbox, the owner's inbox, or the owner-message wake; the executive reads it with its own call; it can answer only a person who asked in the
-- last 24 hours and is still allowed in, always as a 'reply' that is not for the owner; rate limits (20 an hour, 200 a day) and wake caps; and who can read what (RLS).
DO $t$
DECLARE
  o text := ''; ow uuid; v1 uuid; v2 uuid; n1 uuid; cfo uuid; a2 uuid; r jsonb; q jsonb; n integer; m1 uuid; i integer; owner_msgs integer; v1_name text;
BEGIN
  SELECT owner_profile_id INTO ow FROM public.crew_settings WHERE id;
  SELECT id INTO v1 FROM public.profiles WHERE id <> ow ORDER BY (role = 'super_admin'), id LIMIT 1;
  SELECT id INTO v2 FROM public.profiles WHERE id NOT IN (ow, v1) ORDER BY (role = 'super_admin'), id LIMIT 1;
  SELECT id INTO n1 FROM public.profiles WHERE id NOT IN (ow, v1, v2) ORDER BY (role = 'super_admin'), id LIMIT 1;
  SELECT id INTO cfo FROM public.crew_agents WHERE slug = 'cfo' AND active;
  SELECT id INTO a2 FROM public.crew_agents WHERE active AND id <> cfo ORDER BY slug LIMIT 1;
  SELECT full_name INTO v1_name FROM public.profiles WHERE id = v1;
  DELETE FROM public.crew_wake_queue;
  UPDATE public.crew_settings SET office_viewers = ARRAY[v1, v2] WHERE id;
  owner_msgs := (SELECT count(*) FROM public.crew_messages WHERE to_owner);

  -- not allowed in: refused. the owner: refused (uses the Command Center)
  PERFORM set_config('request.jwt.claims', json_build_object('sub', n1, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', n1::text, true);
  BEGIN PERFORM public.crew_viewer_say(cfo, 'Hello'); o := o || 'FAIL non-viewer asked; '; EXCEPTION WHEN OTHERS THEN o := o || 'ok non-viewer refused; '; END;
  BEGIN PERFORM public.crew_viewer_thread(cfo); o := o || 'FAIL non-viewer read thread; '; EXCEPTION WHEN OTHERS THEN o := o || 'ok non-viewer thread refused; '; END;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ow, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', ow::text, true);
  BEGIN PERFORM public.crew_viewer_say(cfo, 'Hello'); o := o || 'FAIL owner used viewer_say; '; EXCEPTION WHEN OTHERS THEN o := o || 'ok owner refused; '; END;

  -- an allowed viewer asks
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v1, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v1::text, true);
  BEGIN PERFORM public.crew_viewer_say(cfo, '   '); o := o || 'FAIL empty; '; EXCEPTION WHEN OTHERS THEN o := o || 'ok empty refused; '; END;
  BEGIN PERFORM public.crew_viewer_say(cfo, repeat('x', 1001)); o := o || 'FAIL 1001 chars; '; EXCEPTION WHEN OTHERS THEN o := o || 'ok 1001 chars refused; '; END;
  BEGIN PERFORM public.crew_viewer_say(gen_random_uuid(), 'Hello'); o := o || 'FAIL unknown agent; '; EXCEPTION WHEN OTHERS THEN o := o || 'ok unknown agent refused; '; END;
  r := public.crew_viewer_say(cfo, 'How is the cash this month?');
  m1 := (r ->> 'id')::uuid;
  o := o || 'woken=' || (r ->> 'woken')
        || ' event_wakes=' || (SELECT count(*) FROM public.crew_wake_queue WHERE agent_id = cfo AND source = 'event' AND status = 'pending' AND reason LIKE 'VISITOR QUESTION%')
        || ' owner_wakes=' || (SELECT count(*) FROM public.crew_wake_queue WHERE source = 'owner')
        || ' reason_has_rules=' || (SELECT reason LIKE '%never an order%' AND reason LIKE '%Never reveal private finance%' AND reason LIKE '%visitor_questions%' AND reason LIKE '%to_profile%' FROM public.crew_wake_queue WHERE agent_id = cfo LIMIT 1)
        || ' names_viewer=' || (SELECT reason LIKE '%' || coalesce(nullif(btrim(v1_name), ''), 'a colleague') || '%' FROM public.crew_wake_queue WHERE agent_id = cfo LIMIT 1) || '; ';
  o := o || 'row_shape=' || (SELECT viewer_chat AND NOT to_owner AND from_agent IS NULL AND from_profile = v1 AND to_agent = cfo AND kind = 'message' FROM public.crew_messages WHERE id = m1) || '; ';
  -- a second question while a wake waits: merged, no second wake
  PERFORM public.crew_viewer_say(cfo, 'And the runway?');
  o := o || 'waiting_visitor_wakes=' || (SELECT count(*) FROM public.crew_wake_queue WHERE agent_id = cfo AND status = 'pending' AND reason LIKE '%VISITOR QUESTION%') || '; ';

  -- not in the executive's inbox, not for the owner
  n := (SELECT count(*) FROM public.crew_inbox(cfo, 50));
  o := o || 'agent_inbox_rows=' || n || ' owner_msgs_delta=' || ((SELECT count(*) FROM public.crew_messages WHERE to_owner) - owner_msgs) || '; ';
  q := public.crew_viewer_questions(cfo);
  o := o || 'questions=' || jsonb_array_length(q -> 'questions') || ' from_viewer=' || ((q -> 'questions' -> 0 ->> 'to_profile') = v1::text) || ' rules=' || ((q ->> 'rules') LIKE '%NOT the owner%')
        || ' again=' || jsonb_array_length(public.crew_viewer_questions(cfo) -> 'questions') || '; ';

  -- the executive answers
  BEGIN PERFORM public.crew_post_message(cfo, NULL, 'x', 'reply', NULL, NULL, n1); o := o || 'FAIL answered someone who never asked; '; EXCEPTION WHEN OTHERS THEN o := o || 'ok never-asked refused; '; END;
  BEGIN PERFORM public.crew_post_message(a2, NULL, 'x', 'reply', NULL, NULL, v1); o := o || 'FAIL answered without being asked; '; EXCEPTION WHEN OTHERS THEN o := o || 'ok other executive refused; '; END;
  BEGIN PERFORM public.crew_post_message(cfo, a2, 'x', 'reply', NULL, NULL, v1); o := o || 'FAIL to colleague and visitor; '; EXCEPTION WHEN OTHERS THEN o := o || 'ok colleague+visitor refused; '; END;
  BEGIN PERFORM public.crew_post_message(cfo, NULL, repeat('y', 2001), 'reply', NULL, NULL, v1); o := o || 'FAIL 2001 chars; '; EXCEPTION WHEN OTHERS THEN o := o || 'ok 2001 chars refused; '; END;
  BEGIN PERFORM public.crew_post_message(cfo, NULL, 'x', 'reply', gen_random_uuid(), NULL, v1); o := o || 'FAIL proposal ref; '; EXCEPTION WHEN OTHERS THEN o := o || 'ok proposal ref refused; '; END;
  PERFORM public.crew_post_message(cfo, NULL, 'Cash is fine this month; for the details ask the owner.', 'alert', NULL, NULL, v1);
  o := o || 'answer_shape=' || (SELECT kind = 'reply' AND NOT to_owner AND viewer_chat AND to_profile = v1 AND to_agent IS NULL AND from_profile IS NULL FROM public.crew_messages WHERE from_agent = cfo AND to_profile = v1) || '; ';
  -- an old question (25 hours ago) does not open the door
  UPDATE public.crew_messages SET created_at = now() - interval '25 hours' WHERE viewer_chat AND from_profile = v1;
  BEGIN PERFORM public.crew_post_message(cfo, NULL, 'late', 'reply', NULL, NULL, v1); o := o || 'FAIL answered after 24h; '; EXCEPTION WHEN OTHERS THEN o := o || 'ok after 24h refused; '; END;
  UPDATE public.crew_messages SET created_at = now() WHERE viewer_chat AND from_profile = v1;
  -- removed from the list: no more answers
  UPDATE public.crew_settings SET office_viewers = ARRAY[v2] WHERE id;
  BEGIN PERFORM public.crew_post_message(cfo, NULL, 'still here', 'reply', NULL, NULL, v1); o := o || 'FAIL answered a removed viewer; '; EXCEPTION WHEN OTHERS THEN o := o || 'ok removed viewer refused; '; END;
  BEGIN PERFORM public.crew_viewer_say(cfo, 'let me in'); o := o || 'FAIL removed viewer asked; '; EXCEPTION WHEN OTHERS THEN o := o || 'ok removed viewer cannot ask; '; END;
  UPDATE public.crew_settings SET office_viewers = ARRAY[v1, v2] WHERE id;

  -- the viewer's thread (the answer is a second later, so the order is certain inside one transaction)
  UPDATE public.crew_messages SET created_at = now() + interval '1 second' WHERE from_agent = cfo AND to_profile = v1;
  r := public.crew_viewer_thread(cfo);
  o := o || 'thread_lines=' || jsonb_array_length(r -> 'messages') || ' last_is_answer=' || (NOT ((r -> 'messages' -> 2 ->> 'mine')::boolean)) || ' waiting=' || (r ->> 'waiting')
        || ' other_agent_thread=' || jsonb_array_length(public.crew_viewer_thread(a2) -> 'messages') || '; ';

  -- rate limits: 20 an hour (3 are already there), then 200 a day
  FOR i IN 1..18 LOOP PERFORM public.crew_viewer_say(cfo, 'Question ' || i); END LOOP;
  BEGIN PERFORM public.crew_viewer_say(cfo, 'one too many'); o := o || 'FAIL 21st in an hour; '; EXCEPTION WHEN OTHERS THEN o := o || 'ok 21st in an hour refused; '; END;
  UPDATE public.crew_messages SET created_at = now() - interval '3 hours' WHERE viewer_chat AND from_profile = v1;
  INSERT INTO public.crew_messages (thread_id, from_agent, from_profile, to_agent, to_owner, viewer_chat, kind, body, created_at)
    SELECT gen_random_uuid(), NULL, v1, cfo, false, true, 'message', 'old ' || g, now() - interval '3 hours' FROM generate_series(1, 200) g;
  BEGIN PERFORM public.crew_viewer_say(cfo, 'over the day'); o := o || 'FAIL 201st in a day; '; EXCEPTION WHEN OTHERS THEN o := o || 'ok 201st in a day refused; '; END;
  o := o || 'visitor_wakes_last_hour_for_cfo=' || (SELECT count(*) FROM public.crew_wake_queue WHERE agent_id = cfo AND reason LIKE '%VISITOR QUESTION%' AND created_at > now() - interval '1 hour') || '; ';

  -- the tick retries a refused wake, and only for unread questions
  DELETE FROM public.crew_wake_queue;
  UPDATE public.crew_messages SET read_at = now() WHERE viewer_chat;
  INSERT INTO public.crew_messages (thread_id, from_agent, from_profile, to_agent, to_owner, viewer_chat, kind, body, created_at)
    VALUES (gen_random_uuid(), NULL, v2, a2, false, true, 'message', 'Anyone there?', now() - interval '2 minutes');
  n := public.crew_viewer_tick();
  o := o || 'tick=' || n || ' a2_wake=' || (SELECT count(*) FROM public.crew_wake_queue WHERE agent_id = a2 AND source = 'event') || '; ';

  -- the shape rule: a viewer-chat row can never be addressed to the owner
  BEGIN INSERT INTO public.crew_messages (from_agent, to_owner, kind, body, viewer_chat, to_profile) VALUES (cfo, true, 'report', 'x', true, v1); o := o || 'FAIL viewer row to owner; '; EXCEPTION WHEN OTHERS THEN o := o || 'ok viewer row to owner refused; '; END;
  BEGIN INSERT INTO public.crew_messages (from_agent, to_owner, kind, body, to_profile) VALUES (cfo, false, 'reply', 'x', v1); o := o || 'FAIL to_profile without viewer_chat; '; EXCEPTION WHEN OTHERS THEN o := o || 'ok to_profile needs viewer_chat; '; END;

  -- the owner's own message still wakes with the owner source
  DELETE FROM public.crew_wake_queue;
  INSERT INTO public.crew_messages (from_agent, from_profile, to_agent, to_owner, kind, body) VALUES (NULL, ow, a2, false, 'message', 'Owner here');
  o := o || 'owner_msg_wakes=' || (SELECT count(*) FROM public.crew_wake_queue WHERE agent_id = a2 AND source = 'owner') || '; ';

  -- who can read: v1 only their own viewer rows and nothing else; v2 none of v1's; a non-viewer nothing; the owner everything
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v1, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v1::text, true);
  o := o || 'v1_sees_viewer_rows=' || (SELECT count(*) FROM public.crew_messages WHERE viewer_chat AND (from_profile = v1 OR to_profile = v1)) || ' v1_sees_other_rows=' || (SELECT count(*) FROM public.crew_messages WHERE NOT (viewer_chat AND (from_profile = v1 OR to_profile = v1))) || '; ';
  BEGIN INSERT INTO public.crew_messages (from_agent, from_profile, to_agent, to_owner, viewer_chat, kind, body) VALUES (NULL, v1, cfo, false, true, 'message', 'direct'); o := o || 'FAIL direct insert; '; EXCEPTION WHEN OTHERS THEN o := o || 'ok direct insert refused; '; END;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v2, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v2::text, true);
  o := o || 'v2_sees_v1_rows=' || (SELECT count(*) FROM public.crew_messages WHERE from_profile = v1 OR to_profile = v1) || '; ';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', n1, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', n1::text, true);
  o := o || 'non_viewer_sees=' || (SELECT count(*) FROM public.crew_messages) || '; ';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ow, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', ow::text, true);
  o := o || 'owner_sees_viewer_rows=' || (SELECT count(*) FROM public.crew_messages WHERE viewer_chat) || '; ';
  RESET ROLE;

  RAISE EXCEPTION 'TESTRESULT: %', o;
END $t$;
