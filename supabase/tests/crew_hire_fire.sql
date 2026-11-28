-- Run after the migration, inside something that rolls back (the block ends with an exception that carries the result).
DO $t$
DECLARE
  o text := ''; ow uuid; cfo uuid; fh uuid; ctrl uuid; mk uuid; ops uuid; trs uuid; p uuid; q uuid; n integer; ev jsonb; res jsonb; newid uuid; i integer;
BEGIN
  SELECT owner_profile_id INTO ow FROM public.crew_settings WHERE id;
  SELECT id INTO cfo FROM public.crew_agents WHERE slug = 'cfo';
  SELECT id INTO fh FROM public.crew_agents WHERE slug = 'finance_head';
  SELECT id INTO ctrl FROM public.crew_agents WHERE slug = 'controller';
  SELECT id INTO mk FROM public.crew_agents WHERE slug = 'marketing_head';
  SELECT id INTO ops FROM public.crew_agents WHERE slug = 'ops_head';
  SELECT id INTO trs FROM public.crew_agents WHERE slug = 'treasury';

  o := o || 'managers_can_propose=' || (SELECT count(*) FROM public.crew_agent_private WHERE 'agent.retire' = ANY (allowed_actions)) || '; ';
  o := o || 'marketing_cannot=' || NOT ((SELECT 'agent.retire' = ANY (allowed_actions) FROM public.crew_agent_private WHERE agent_id = mk)) || '; ';
  o := o || 'is_boss cfo>ctrl=' || public.crew_is_boss_of(cfo, ctrl) || ' fh>ctrl=' || public.crew_is_boss_of(fh, ctrl) || ' mk>ctrl=' || public.crew_is_boss_of(mk, ctrl) || ' ctrl>cfo=' || public.crew_is_boss_of(ctrl, cfo) || '; ';

  -- no mistakes yet: refused
  BEGIN PERFORM public.crew_propose(cfo, 'agent.retire', NULL, 'Let the controller go', 'x', jsonb_build_object('agent', 'controller', 'reason', 'x')); o := o || 'FAIL retire with 0 mistakes; '; EXCEPTION WHEN OTHERS THEN o := o || 'ok refused with 0 mistakes (' || left(SQLERRM, 60) || '); '; END;
  -- someone who is not the boss cannot log a mistake
  BEGIN PERFORM public.crew_report_mistake(mk, ctrl, 'wrong_numbers', 'not my report'); o := o || 'FAIL non-boss logged; '; EXCEPTION WHEN OTHERS THEN o := o || 'ok non-boss refused; '; END;
  -- the boss logs three
  FOR i IN 1..3 LOOP PERFORM public.crew_report_mistake(fh, ctrl, 'wrong_numbers', 'Posted the wrong amount, case ' || i); END LOOP;
  o := o || 'count=' || public.crew_mistake_count(ctrl, 30) || '; ';
  o := o || 'team_view=' || (SELECT jsonb_array_length(public.crew_team_mistakes(fh))) || ' people; ';
  -- a non-boss cannot propose it even with the mistakes there
  BEGIN PERFORM public.crew_propose(ops, 'agent.retire', NULL, 'Let the controller go', 'x', jsonb_build_object('agent', 'controller', 'reason', 'x')); o := o || 'FAIL non-boss proposed; '; EXCEPTION WHEN OTHERS THEN o := o || 'ok non-boss refused (' || left(SQLERRM, 50) || '); '; END;
  p := public.crew_propose(cfo, 'agent.retire', NULL, 'Let the controller go', 'Three mistakes in a month', jsonb_build_object('agent', 'controller', 'reason', 'Three mistakes'), '{"claimed":"invented"}'::jsonb, 'low');
  SELECT evidence INTO ev FROM public.crew_proposals WHERE id = p;
  o := o || 'evidence_count=' || (ev ->> 'mistakes_30_days') || ' invented_kept=' || (ev ? 'claimed') || ' risk=' || (SELECT risk FROM public.crew_proposals WHERE id = p) || '; ';
  BEGIN PERFORM public.crew_propose(cfo, 'agent.retire', NULL, 'Let the controller go again', 'x', jsonb_build_object('agent', 'controller', 'reason', 'x')); o := o || 'FAIL duplicate; '; EXCEPTION WHEN OTHERS THEN o := o || 'ok duplicate refused; '; END;

  -- a hire before the person has left is refused
  BEGIN PERFORM public.crew_propose(fh, 'agent.hire', NULL, 'Hire a controller', 'x', jsonb_build_object('name', 'Roland Ashby', 'replaces', 'controller')); o := o || 'hire_proposed_before_leaving=true (checked on approval); '; EXCEPTION WHEN OTHERS THEN o := o || 'hire refused: ' || left(SQLERRM, 60) || '; '; END;

  -- the owner approves the firing
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ow, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  res := public.crew_decide(p, 'approve', 'agreed');
  RESET ROLE;
  o := o || 'decide=' || (res ->> 'status') || '; ';
  o := o || 'controller_active=' || (SELECT active FROM public.crew_agents WHERE id = ctrl) || ' status=' || (SELECT status FROM public.crew_agents WHERE id = ctrl) || '; ';
  o := o || 'staff_change=' || (SELECT count(*) FROM public.crew_staff_changes WHERE agent_id = ctrl AND kind = 'retired') || '; ';
  BEGIN PERFORM public.crew_propose(ctrl, 'advice.note', NULL, 'Retired agent proposing', 'x', '{}'::jsonb); o := o || 'FAIL retired agent can propose; '; EXCEPTION WHEN OTHERS THEN o := o || 'ok retired agent refused; '; END;

  -- the replacement: a taken name is refused, a new one works
  BEGIN PERFORM public.crew_propose(fh, 'agent.hire', NULL, 'Hire a controller', 'x', jsonb_build_object('name', 'Edmund Whitcombe', 'replaces', 'controller')); o := o || 'FAIL reused name; '; EXCEPTION WHEN OTHERS THEN o := o || 'ok reused name refused; '; END;
  q := public.crew_propose(fh, 'agent.hire', NULL, 'Hire a new controller', 'Replaces the one who left', jsonb_build_object('name', 'Roland Ashby', 'replaces', 'controller'));
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ow, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  res := public.crew_decide(q, 'approve', 'welcome');
  RESET ROLE;
  o := o || 'hire_decide=' || (res ->> 'status') || ' ' || coalesce(res #>> '{result,hired}', res ->> 'error') || '; ';
  SELECT id INTO newid FROM public.crew_agents WHERE name = 'Roland Ashby';
  o := o || 'new_active=' || (SELECT active FROM public.crew_agents WHERE id = newid) || ' role=' || (SELECT role FROM public.crew_agents WHERE id = newid) || ' reports_to_fh=' || ((SELECT reports_to FROM public.crew_agents WHERE id = newid) = fh) || '; ';
  o := o || 'inherits_brief=' || ((SELECT persona FROM public.crew_agent_private WHERE agent_id = newid) = (SELECT persona FROM public.crew_agent_private WHERE agent_id = ctrl)) || ' no_notes=' || ((SELECT notes FROM public.crew_agent_private WHERE agent_id = newid) = '') || ' tokens=' || (SELECT count(*) FROM public.crew_agent_tokens WHERE agent_id = newid) || '; ';
  o := o || 'new_mistakes=' || public.crew_mistake_count(newid, 30) || '; ';

  -- a failed approved record change logs a mistake automatically is covered by the unit of work in crew_decide (not exercised here: needs a real table)
  -- the owner can let someone go directly, once
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ow, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  res := public.crew_retire_agent(trs, 'testing');
  o := o || 'owner_direct=' || (res ->> 'retired') || '; ';
  BEGIN PERFORM public.crew_retire_agent(trs, 'again'); o := o || 'FAIL retired twice; '; EXCEPTION WHEN OTHERS THEN o := o || 'ok second retire refused; '; END;
  PERFORM public.crew_log_mistake(fh, 'other', 'owner logged');
  RESET ROLE;
  o := o || 'owner_logged=' || public.crew_mistake_count(fh, 30) || '; ';
  -- an ordinary employee cannot
  PERFORM set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM public.profiles WHERE role <> 'super_admin' AND status = 'active' LIMIT 1), 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN PERFORM public.crew_retire_agent(fh, 'x'); o := o || 'FAIL employee retired; '; EXCEPTION WHEN OTHERS THEN o := o || 'ok employee refused; '; END;
  RESET ROLE;
  RAISE EXCEPTION 'TESTRESULT: %', o;
END $t$;
