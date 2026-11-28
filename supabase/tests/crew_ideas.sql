-- Crew idea board: similar ideas join, only Engineering triages, the owner approves/rejects (agents learn), the owner can add his own, a daily limit.
-- Run AFTER migration 20261456000000 on a database with the crew tables; it ends with a deliberate exception starting TESTRESULT: and rolls back. Edit the owner uuid.

DO $t$
DECLARE o text := ''; x text; r jsonb; ctrl uuid; ndi uuid; eng uuid; hr uuid; ops uuid; cfo uuid; i1 uuid; i2 uuid; seed uuid; pid uuid; n int; owner uuid := 'cd87b258-3030-408f-b8f5-8057b3b6afd3';
BEGIN
  SELECT id INTO ctrl FROM public.crew_agents WHERE slug='controller'; SELECT id INTO ndi FROM public.crew_agents WHERE slug='ndi_head';
  SELECT id INTO eng FROM public.crew_agents WHERE slug='engineering_head'; SELECT id INTO hr FROM public.crew_agents WHERE slug='people_head';
  SELECT id INTO ops FROM public.crew_agents WHERE slug='ops_head'; SELECT id INTO cfo FROM public.crew_agents WHERE slug='cfo';
  o := 'agents='||(SELECT count(*) FROM public.crew_agents)||' hr_reports_to_cfo='||(SELECT reports_to = cfo FROM public.crew_agents WHERE id=hr)||' hr_model='||(SELECT model FROM public.crew_agent_private WHERE agent_id=hr)||' improve_para_in_all='||(SELECT count(*) FROM public.crew_agent_private WHERE instructions LIKE '%IMPROVE THE COMPANY%')||' triage_para_eng='||(SELECT instructions LIKE '%IDEA TRIAGE%' FROM public.crew_agent_private WHERE agent_id=eng)||'; ';
  pid := public.crew_propose(ctrl,'advice.finance',NULL,'Check the rate','r','{}');
  x := public.crew_endorse(hr,pid,'support','agree'); o := o||'hr_endorse='||x||'; ';
  BEGIN PERFORM public.crew_endorse(ctrl,pid,'support','x'); o := o||'FAIL staff endorsed; '; EXCEPTION WHEN OTHERS THEN o := o||'ok staff cannot endorse; '; END;
  r := public.crew_idea_submit(ctrl,'Create a payment batch for all NDI leads at once','Each month we create the payment batch for every NDI lead by hand, one person at a time, which takes hours and invites mistakes.','Pick the leads, set the amount, create the batch as a draft.');
  i1 := (r->>'idea')::uuid; o := o||'first='||(r->>'created')||'; ';
  r := public.crew_idea_submit(ndi,'Bulk payment batch for the NDI leads','The NDI leads are paid by hand one at a time each month; a batch for all NDI leads at once would save hours and avoid mistakes.');
  o := o||'second_created='||(r->>'created')||' count='||(r->>'support_count')||' same_idea='||((r->>'idea')::uuid = i1)||' depts='||(r->'departments')::text||'; ';
  r := public.crew_idea_submit(ops,'Weekly vehicle service checklist photos','Drivers should upload photos of the service checklist every week so Operations can see which vehicles are overdue for maintenance.');
  i2 := (r->>'idea')::uuid; o := o||'unrelated_created='||(r->>'created')||'; ';
  SELECT id INTO seed FROM public.crew_ideas WHERE title LIKE 'Daily huddle reminder%';
  r := public.crew_idea_submit(ops,'Reminder for the morning huddle every day at 9 AM EST','Somebody in Operations has to remember to announce the huddle each morning; a reminder at 9:00 AM EST would stop it being forgotten.');
  o := o||'huddle_joined='||((r->>'idea')::uuid = seed)||' count='||(r->>'support_count')||'; ';
  r := public.crew_idea_support(ops, seed, 'again'); o := o||'support_twice_already='||coalesce(r->>'already','no')||'; ';
  BEGIN PERFORM public.crew_idea_triage(ctrl, i1, 'high'); o := o||'FAIL non-eng triaged; '; EXCEPTION WHEN OTHERS THEN o := o||'ok only engineering triages; '; END;
  r := public.crew_idea_triage(eng, i1, 'high', 'Spec: select leads, amount, create batch draft.', '2 days'); o := o||'triage_status='||(r->>'status')||'; ';
  r := public.crew_idea_triage(eng, i2, NULL, NULL, NULL, i1); o := o||'merged_into_i1='||((r->>'merged_into')::uuid = i1)||' count_after='||(SELECT support_count FROM public.crew_ideas WHERE id=i1)||'; ';
  r := public.crew_idea_list(ctrl); o := o||'list_len='||jsonb_array_length(r)||'; ';
  FOR n IN 1..7 LOOP
    BEGIN PERFORM public.crew_idea_submit(cfo,'x'||md5('t'||n)||' x'||md5('u'||n),'problem text with unique tokens x'||md5('p'||n)||' x'||md5('q'||n)||' x'||md5('r'||n)); EXCEPTION WHEN OTHERS THEN o := o||'limit_hit_at='||n||'; '; EXIT; END;
  END LOOP;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', owner::text, true);
  PERFORM public.crew_idea_decide(i1,'approve','Do it');
  o := o||'approved_status='||(SELECT status FROM public.crew_ideas WHERE id=i1)||' eng_msg='||(SELECT count(*) FROM public.crew_messages WHERE to_agent=eng AND body LIKE 'APPROVED idea%')||' ctrl_told='||(SELECT count(*) FROM public.crew_messages WHERE to_agent=ctrl AND body LIKE 'Idea "Create a payment batch%')||' ndi_told='||(SELECT count(*) FROM public.crew_messages WHERE to_agent=ndi AND body LIKE 'Idea "Create a payment batch%')||'; ';
  PERFORM public.crew_idea_decide(seed,'reject','We do the huddle on Cliq already');
  o := o||'lessons_for_hr_ops='||(SELECT count(*) FROM public.crew_notes WHERE body LIKE 'The owner REJECTED the idea "Daily huddle%' AND agent_id IN (hr, ops))||'; ';
  x := public.crew_idea_owner_add('Recipient book for payments','I want a saved list of recipients so I can pick them when I create a payment.')::text;
  o := o||'owner_added_status='||(SELECT status FROM public.crew_ideas WHERE id=x::uuid)||' eng_told='||(SELECT count(*) FROM public.crew_messages WHERE to_agent=eng AND body LIKE 'The owner wants this built%')||'; ';
  PERFORM public.crew_idea_decide(i1,'shipped','Live'); o := o||'shipped='||(SELECT status FROM public.crew_ideas WHERE id=i1)||'; ';
  SELECT id INTO owner FROM public.profiles WHERE role <> 'super_admin' LIMIT 1;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', owner::text, true);
  BEGIN PERFORM public.crew_idea_decide(i1,'reject','x'); o := o||'FAIL employee decided; '; EXCEPTION WHEN OTHERS THEN o := o||'ok employee cannot decide; '; END;
  BEGIN PERFORM public.crew_idea_owner_add('Sneaky idea title','Sneaky problem statement text'); o := o||'FAIL employee added; '; EXCEPTION WHEN OTHERS THEN o := o||'ok employee cannot add; '; END;
  RAISE EXCEPTION 'TESTRESULT: %', o;
END $t$;
