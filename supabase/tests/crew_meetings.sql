-- Run after 20261469000000_crew_meetings.sql, inside something that rolls back (the block ends with an exception that carries the result).
-- Checks: only the company owner can call / speak / end; 2 to 8 people and the chair joins; every member is woken; threads are for members only; one contribution per round;
-- the owner's line is in the thread and wakes nobody; the tick opens round two when everybody spoke (or after 10 minutes), then asks the chair for the minutes;
-- only the chair, only then, can write the minutes, and they close the meeting, report to the owner and hand out the action items; a chair who never answers is closed
-- after 15 minutes; ending early asks the chair once; three open meetings at most; and the rows cannot be read by anyone but the company owner.
DO $t$
DECLARE
  o text := ''; ow uuid; other uuid; cfo uuid; a2 uuid; a3 uuid; a4 uuid; m1 uuid; m2 uuid; m3 uuid; m4 uuid; m5 uuid; res jsonb; n integer; ids uuid[]; w integer;
BEGIN
  SELECT owner_profile_id INTO ow FROM public.crew_settings WHERE id;
  SELECT id INTO other FROM public.profiles WHERE id <> ow ORDER BY (role = 'super_admin') DESC LIMIT 1;
  SELECT id INTO cfo FROM public.crew_agents WHERE slug = 'cfo' AND active;
  SELECT id INTO a2 FROM public.crew_agents WHERE active AND id <> cfo ORDER BY slug LIMIT 1;
  SELECT id INTO a3 FROM public.crew_agents WHERE active AND id NOT IN (cfo, a2) ORDER BY slug LIMIT 1;
  SELECT id INTO a4 FROM public.crew_agents WHERE active AND id NOT IN (cfo, a2, a3) ORDER BY slug LIMIT 1;
  DELETE FROM public.crew_wake_queue;   -- a clean queue to count in (rolled back with everything else)

  -- not the owner: refused
  PERFORM set_config('request.jwt.claims', json_build_object('sub', other, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', other::text, true);
  BEGIN PERFORM public.crew_meeting_call('Cash runway', 'x', ARRAY[a2, a3]); o := o || 'FAIL non-owner called; '; EXCEPTION WHEN OTHERS THEN o := o || 'ok non-owner refused; '; END;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', ow, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', ow::text, true);
  BEGIN PERFORM public.crew_meeting_call('Cash runway', 'x', ARRAY[cfo]); o := o || 'FAIL one person; '; EXCEPTION WHEN OTHERS THEN o := o || 'ok one person refused; '; END;
  BEGIN PERFORM public.crew_meeting_call('Hi', 'x', ARRAY[a2, a3]); o := o || 'FAIL short topic; '; EXCEPTION WHEN OTHERS THEN o := o || 'ok short topic refused; '; END;
  SELECT array_agg(id) INTO ids FROM (SELECT id FROM public.crew_agents WHERE active LIMIT 9) s;
  IF cardinality(ids) = 9 THEN
    BEGIN PERFORM public.crew_meeting_call('Too many', 'x', ids); o := o || 'FAIL nine people; '; EXCEPTION WHEN OTHERS THEN o := o || 'ok nine refused; '; END;
  END IF;

  -- a meeting: the chair (the CFO by default) joins even when not ticked
  m1 := public.crew_meeting_call('  Cash runway for the next quarter  ', 'Salaries are due on the 28th', ARRAY[a2, a3]);
  o := o || 'members=' || (SELECT count(*) FROM public.crew_meeting_members WHERE meeting_id = m1) || ' chair_is_cfo=' || (SELECT chair_agent = cfo FROM public.crew_meetings WHERE id = m1)
        || ' topic_trimmed=' || (SELECT topic FROM public.crew_meetings WHERE id = m1) || ' max_rounds=' || (SELECT max_rounds FROM public.crew_meetings WHERE id = m1) || '; ';
  o := o || 'woken=' || (SELECT count(*) FROM public.crew_wake_queue WHERE status = 'pending' AND source = 'owner' AND reason LIKE 'MEETING, round 1 of 2%' || m1 || '%') || '; ';

  -- the thread: members only
  res := public.crew_meeting_thread(a2, m1);
  o := o || 'thread_members=' || jsonb_array_length(res -> 'members') || ' your_turn=' || (res -> 'you' ->> 'your_turn') || ' brief=' || (res -> 'meeting' ->> 'context_from_owner') || '; ';
  IF a4 IS NOT NULL THEN
    BEGIN PERFORM public.crew_meeting_thread(a4, m1); o := o || 'FAIL outsider read; '; EXCEPTION WHEN OTHERS THEN o := o || 'ok outsider refused; '; END;
    BEGIN PERFORM public.crew_meeting_post(a4, m1, 'let me in'); o := o || 'FAIL outsider posted; '; EXCEPTION WHEN OTHERS THEN o := o || 'ok outsider post refused; '; END;
  END IF;

  -- contributions: one per round, bounded, no minutes from a non-chair or while open
  PERFORM public.crew_meeting_post(a2, m1, 'We have two months of salaries in the bank.');
  BEGIN PERFORM public.crew_meeting_post(a2, m1, 'and another thing'); o := o || 'FAIL twice in a round; '; EXCEPTION WHEN OTHERS THEN o := o || 'ok second post refused; '; END;
  BEGIN PERFORM public.crew_meeting_post(a3, m1, '   '); o := o || 'FAIL empty; '; EXCEPTION WHEN OTHERS THEN o := o || 'ok empty refused; '; END;
  BEGIN PERFORM public.crew_meeting_post(a3, m1, repeat('x', 1201)); o := o || 'FAIL too long; '; EXCEPTION WHEN OTHERS THEN o := o || 'ok 1201 chars refused; '; END;
  BEGIN PERFORM public.crew_meeting_post(a3, m1, 'x', '{"summary":"s"}'::jsonb); o := o || 'FAIL non-chair minutes; '; EXCEPTION WHEN OTHERS THEN o := o || 'ok non-chair minutes refused; '; END;
  BEGIN PERFORM public.crew_meeting_post(cfo, m1, 'x', '{"summary":"s"}'::jsonb); o := o || 'FAIL minutes while open; '; EXCEPTION WHEN OTHERS THEN o := o || 'ok minutes while open refused; '; END;

  -- the owner speaks: in the thread as "owner", and it wakes nobody
  w := (SELECT count(*) FROM public.crew_wake_queue);
  PERFORM public.crew_meeting_say(m1, 'Please be blunt about the tax bill too.');
  o := o || 'owner_line=' || (SELECT count(*) FROM public.crew_messages WHERE meeting_id = m1 AND from_agent IS NULL AND from_profile = ow AND NOT to_owner AND to_agent IS NULL)
        || ' wakes_from_owner_line=' || ((SELECT count(*) FROM public.crew_wake_queue) - w) || '; ';
  BEGIN PERFORM public.crew_meeting_say(m1, '   '); o := o || 'FAIL empty owner line; '; EXCEPTION WHEN OTHERS THEN o := o || 'ok empty owner line refused; '; END;
  res := public.crew_meeting_thread(a3, m1);
  o := o || 'thread_lines=' || jsonb_array_length(res -> 'messages') || ' owner_in_thread=' || ((res -> 'messages' -> 1 ->> 'from') = 'owner' OR (res -> 'messages' -> 0 ->> 'from') = 'owner') || ' waiting=' || (res -> 'waiting_for')::text || '; ';

  -- tick with someone still to speak: stays in round 1
  PERFORM public.crew_meeting_tick();
  o := o || 'round_after_tick_incomplete=' || (SELECT round FROM public.crew_meetings WHERE id = m1) || '; ';
  PERFORM public.crew_meeting_post(a3, m1, 'Receivables are 30 days late.');
  PERFORM public.crew_meeting_post(cfo, m1, 'I disagree with the first estimate: the tax bill is due too.');
  UPDATE public.crew_wake_queue SET status = 'fired';
  PERFORM public.crew_meeting_tick();
  o := o || 'round_after_all_spoke=' || (SELECT round FROM public.crew_meetings WHERE id = m1) || ' round2_wakes=' || (SELECT count(*) FROM public.crew_wake_queue WHERE status = 'pending' AND reason LIKE 'MEETING, round 2 of 2%') || '; ';

  -- round two, then the minutes are asked of the chair
  PERFORM public.crew_meeting_post(a2, m1, 'Round two: agreed on the tax point.');
  PERFORM public.crew_meeting_post(a3, m1, 'Round two: I will chase the receivables.');
  PERFORM public.crew_meeting_post(cfo, m1, 'Round two: summary coming.');
  UPDATE public.crew_wake_queue SET status = 'fired';
  PERFORM public.crew_meeting_tick();
  o := o || 'status_after_round2=' || (SELECT status FROM public.crew_meetings WHERE id = m1) || ' chair_wake=' || (SELECT count(*) FROM public.crew_wake_queue WHERE status = 'pending' AND agent_id = cfo AND reason LIKE 'MEETING MINUTES%') || '; ';
  res := public.crew_meeting_thread(cfo, m1);
  o := o || 'minutes_needed=' || (res -> 'you' ->> 'minutes_needed') || ' your_turn=' || (res -> 'you' ->> 'your_turn') || '; ';
  BEGIN PERFORM public.crew_meeting_post(a2, m1, 'one more word'); o := o || 'FAIL post after discussion; '; EXCEPTION WHEN OTHERS THEN o := o || 'ok post after discussion refused; '; END;
  BEGIN PERFORM public.crew_meeting_post(a2, m1, '', '{"summary":"s"}'::jsonb); o := o || 'FAIL non-chair minutes in summarising; '; EXCEPTION WHEN OTHERS THEN o := o || 'ok non-chair minutes refused; '; END;
  BEGIN PERFORM public.crew_meeting_post(cfo, m1, '', '{"summary":"s","action_items":[{"agent":"nobody_here","task":"x"}]}'::jsonb); o := o || 'FAIL unknown action agent; '; EXCEPTION WHEN OTHERS THEN o := o || 'ok unknown action agent refused; '; END;
  BEGIN PERFORM public.crew_meeting_post(cfo, m1, '', '{"decisions":["x"]}'::jsonb); o := o || 'FAIL no summary; '; EXCEPTION WHEN OTHERS THEN o := o || 'ok no summary refused; '; END;
  BEGIN PERFORM public.crew_meeting_post(cfo, m1, '', jsonb_build_object('summary', 's', 'decisions', (SELECT jsonb_agg('d' || i) FROM generate_series(1, 11) i))); o := o || 'FAIL 11 decisions; '; EXCEPTION WHEN OTHERS THEN o := o || 'ok 11 decisions refused; '; END;

  res := public.crew_meeting_post(cfo, m1, 'Thanks all.', jsonb_build_object(
    'summary', 'The runway is two months; tax and late receivables are the risks.',
    'decisions', jsonb_build_array('Chase receivables this week'),
    'needs_owner', jsonb_build_array('Approve a short bridge loan? I recommend yes.'),
    'action_items', jsonb_build_array(jsonb_build_object('agent', (SELECT slug FROM public.crew_agents WHERE id = a3), 'task', 'Chase the late receivables'), jsonb_build_object('agent', 'cfo', 'task', 'Draft the bridge loan note'))));
  o := o || 'closed=' || (SELECT status FROM public.crew_meetings WHERE id = m1) || ' items_sent=' || (res ->> 'action_items_sent')
        || ' summary_saved=' || ((SELECT minutes ->> 'summary' FROM public.crew_meetings WHERE id = m1) LIKE 'The runway%')
        || ' report_to_owner=' || (SELECT count(*) FROM public.crew_messages WHERE thread_id = m1 AND to_owner AND kind = 'report' AND from_agent = cfo AND meeting_id IS NULL AND body LIKE '%Needs your decision:%' AND body LIKE '%Action items:%')
        || ' action_msg_to_a3=' || (SELECT count(*) FROM public.crew_messages WHERE thread_id = m1 AND to_agent = a3 AND body LIKE 'ACTION ITEM%')
        || ' action_msg_to_chair_self=' || (SELECT count(*) FROM public.crew_messages WHERE thread_id = m1 AND to_agent = cfo) || '; ';
  BEGIN PERFORM public.crew_meeting_post(a2, m1, 'after close'); o := o || 'FAIL post after close; '; EXCEPTION WHEN OTHERS THEN o := o || 'ok post after close refused; '; END;
  BEGIN PERFORM public.crew_meeting_say(m1, 'after close'); o := o || 'FAIL owner after close; '; EXCEPTION WHEN OTHERS THEN o := o || 'ok owner line after close refused; '; END;
  BEGIN PERFORM public.crew_meeting_end(m1); o := o || 'FAIL end a closed meeting; '; EXCEPTION WHEN OTHERS THEN o := o || 'ok end of closed refused; '; END;

  -- nobody answers: ten minutes move a round on, and a chair who never writes the minutes is closed after fifteen
  m2 := public.crew_meeting_call('Nobody answers', '', ARRAY[a2, a3]);
  UPDATE public.crew_meetings SET round_started_at = now() - interval '11 minutes' WHERE id = m2;
  PERFORM public.crew_meeting_tick();
  o := o || 'timeout_round=' || (SELECT round FROM public.crew_meetings WHERE id = m2) || '; ';
  UPDATE public.crew_meetings SET round_started_at = now() - interval '11 minutes' WHERE id = m2;
  PERFORM public.crew_meeting_tick();
  o := o || 'timeout_status=' || (SELECT status FROM public.crew_meetings WHERE id = m2) || '; ';
  UPDATE public.crew_meetings SET summarising_at = now() - interval '16 minutes' WHERE id = m2;
  PERFORM public.crew_meeting_tick();
  o := o || 'stuck_closed=' || (SELECT status FROM public.crew_meetings WHERE id = m2) || ' note=' || ((SELECT minutes ->> 'summary' FROM public.crew_meetings WHERE id = m2) LIKE '%without minutes%')
        || ' alert=' || (SELECT count(*) FROM public.crew_messages WHERE thread_id = m2 AND to_owner AND kind = 'alert') || '; ';

  -- the owner ends one early: the chair is asked once
  m3 := public.crew_meeting_call('End me early', '', ARRAY[a2, a3]);
  UPDATE public.crew_wake_queue SET status = 'fired';
  PERFORM public.crew_meeting_end(m3);
  PERFORM public.crew_meeting_end(m3);
  o := o || 'ended_status=' || (SELECT status FROM public.crew_meetings WHERE id = m3) || ' chair_asked=' || (SELECT count(*) FROM public.crew_wake_queue WHERE status = 'pending' AND agent_id = cfo AND reason LIKE 'MEETING MINUTES%') || '; ';

  -- three open at once at most (m3 is still waiting for minutes)
  m4 := public.crew_meeting_call('Second open', '', ARRAY[a2, a3]);
  m5 := public.crew_meeting_call('Third open', '', ARRAY[a2, a3]);
  BEGIN PERFORM public.crew_meeting_call('Fourth open', '', ARRAY[a2, a3]); o := o || 'FAIL fourth open; '; EXCEPTION WHEN OTHERS THEN o := o || 'ok fourth open refused; '; END;

  -- who can read: the company owner only (and meeting lines never show in the normal inbox filter)
  PERFORM set_config('request.jwt.claims', json_build_object('sub', other, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', other::text, true);
  SET LOCAL ROLE authenticated;
  o := o || 'other_sees_meetings=' || (SELECT count(*) FROM public.crew_meetings) || ' members=' || (SELECT count(*) FROM public.crew_meeting_members) || ' lines=' || (SELECT count(*) FROM public.crew_messages WHERE meeting_id IS NOT NULL) || '; ';
  BEGIN INSERT INTO public.crew_meetings (topic, chair_agent) VALUES ('sneaky', cfo); o := o || 'FAIL direct insert; '; EXCEPTION WHEN OTHERS THEN o := o || 'ok direct insert refused; '; END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ow, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', ow::text, true);
  SET LOCAL ROLE authenticated;
  n := (SELECT count(*) FROM public.crew_meetings);
  o := o || 'owner_sees_meetings=' || n || ' lines=' || (SELECT count(*) FROM public.crew_messages WHERE meeting_id = m1) || '; ';
  RESET ROLE;

  RAISE EXCEPTION 'TESTRESULT: %', o;
END $t$;
