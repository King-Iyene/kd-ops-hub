-- Run after the migration, in something that rolls back (the block ends with an exception that carries the result).
-- Checks: an owner message queues one wake and a second merges into it; a manager can wake a report and a report can wake the manager;
-- the 10-minute cooldown; the depth limit; unrelated people and self-wakes are refused; the "question" message kind exists.
DO $t$
DECLARE o text := ''; cfo uuid; fh uuid; mk uuid; ctrl uuid; w1 uuid; w2 uuid;
BEGIN
  SELECT id INTO cfo FROM public.crew_agents WHERE slug = 'cfo';
  SELECT id INTO fh FROM public.crew_agents WHERE slug = 'finance_head';
  SELECT id INTO mk FROM public.crew_agents WHERE slug = 'marketing_head';
  SELECT id INTO ctrl FROM public.crew_agents WHERE slug = 'controller';
  INSERT INTO public.crew_messages (from_agent, to_agent, to_owner, kind, body) VALUES (NULL, fh, false, 'message', 'Please review the March expenses');
  o := o || 'owner_msg_queued=' || (SELECT count(*) FROM public.crew_wake_queue WHERE agent_id = fh AND status = 'pending' AND source = 'owner') || '; ';
  INSERT INTO public.crew_messages (from_agent, to_agent, to_owner, kind, body) VALUES (NULL, fh, false, 'message', 'And the payroll');
  o := o || 'second_merged=' || (SELECT count(*) FROM public.crew_wake_queue WHERE agent_id = fh AND status = 'pending') || '; ';
  w1 := public.crew_wake(cfo, ctrl, 'Check the duplicate invoice', 0);
  UPDATE public.crew_wake_queue SET status = 'fired', fired_at = now() WHERE id = w1;
  BEGIN PERFORM public.crew_wake(fh, ctrl, 'again', 0); o := o || 'FAIL cooldown; '; EXCEPTION WHEN OTHERS THEN o := o || 'ok cooldown; '; END;
  w2 := public.crew_wake(fh, cfo, 'I need a decision', 1);
  o := o || 'depth_stored=' || (SELECT depth FROM public.crew_wake_queue WHERE id = w2) || '; ';
  BEGIN PERFORM public.crew_wake(mk, ctrl, 'x', 0); o := o || 'FAIL non-related woke; '; EXCEPTION WHEN OTHERS THEN o := o || 'ok non-related refused; '; END;
  BEGIN PERFORM public.crew_wake(fh, (SELECT id FROM public.crew_agents WHERE slug = 'treasury'), 'x', 2); o := o || 'FAIL depth; '; EXCEPTION WHEN OTHERS THEN o := o || 'ok depth refused; '; END;
  BEGIN PERFORM public.crew_wake(fh, fh, 'x', 0); o := o || 'FAIL self wake; '; EXCEPTION WHEN OTHERS THEN o := o || 'ok self refused; '; END;
  PERFORM public.crew_post_message(ctrl, NULL, 'Which table holds the live income?', 'question');
  o := o || 'question_kind=' || (SELECT count(*) FROM public.crew_messages WHERE kind = 'question' AND from_agent = ctrl) || '; ';
  RAISE EXCEPTION 'TESTRESULT: %', o;
END $t$;
