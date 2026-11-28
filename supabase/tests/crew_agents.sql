-- =============================================================================
-- Crew (AI executives): permission walls, the approval queue, the executor, orders, the company brain, run budgets, who may prompt.
--
-- Run AFTER migration 20261453000000, against a database that has the KDS Finances base (income table) and the NDI base (the real one is fine):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=0 -f supabase/tests/crew_agents.sql
-- It ends with a deliberate exception whose message starts TESTRESULT: and lists every check; a fragment containing FAIL, or a message
-- starting TESTFAIL, is a real failure. Everything is rolled back by that exception. Uses a real super_admin profile id (edit the owner uuid below).
-- =============================================================================




-- ============ TEST (rolled back by the final exception) ============
DO $t$
DECLARE dep uuid; cfo uuid; ndi uuid; cto uuid; tbl uuid; pid uuid; pid2 uuid; res jsonb; o text := ''; owner uuid := 'cd87b258-3030-408f-b8f5-8057b3b6afd3'; rid uuid; n int; msg text; cnt int;
BEGIN
  SELECT id INTO cfo FROM public.crew_agents WHERE slug='finance_head';
  SELECT id INTO dep FROM public.crew_agents WHERE slug='cfo';
  SELECT id INTO ndi FROM public.crew_agents WHERE slug='ndi_head';
  SELECT id INTO cto FROM public.crew_agents WHERE slug='engineering_head';
  SELECT t.id INTO tbl FROM nc_meta.tables t WHERE t.base_id='b211448d-ab7d-4cc8-8bf6-68ff09d62b81' AND t.pg_table_name='income';
  -- 1 permission walls
  BEGIN PERFORM public.crew_propose(cto,'record.create',tbl,'x','', '{"values":{"Client":"X"}}'); o := o||'FAIL cto create;'; EXCEPTION WHEN OTHERS THEN o := o||'ok cto blocked;'; END;
  BEGIN PERFORM public.crew_propose(ndi,'record.create',tbl,'x','', '{"values":{"Client":"X"}}'); o := o||'FAIL ndi wrote KDS;'; EXCEPTION WHEN OTHERS THEN o := o||'ok ndi blocked from KDS: '||SQLERRM||';'; END;
  BEGIN PERFORM public.crew_propose(cfo,'record.create',tbl,'x','', '{"values":{"Month & type":"X"}}'); o := o||'FAIL formula written;'; EXCEPTION WHEN OTHERS THEN o := o||'ok formula blocked;'; END;
  BEGIN PERFORM public.crew_propose(cfo,'record.create',tbl,'x','', '{"values":{"Nope":"X"}}'); o := o||'FAIL unknown field;'; EXCEPTION WHEN OTHERS THEN o := o||'ok unknown field blocked;'; END;
  BEGIN PERFORM public.crew_propose(cfo,'external.github',NULL,'x','', '{}'); o := o||'FAIL cfo external;'; EXCEPTION WHEN OTHERS THEN o := o||'ok cfo external blocked;'; END;
  -- 2 propose, ledger duplicate
  pid := public.crew_propose(cfo,'record.create',tbl,'Test income row','because', '{"values":{"Client":"ZZ TEST","Total Income (USD)":123.45}}','{"email":"abc"}','low','d1','raenest:test:1');
  BEGIN PERFORM public.crew_propose(cfo,'record.create',tbl,'again','', '{"values":{"Client":"ZZ TEST"}}','{}','low','d2','raenest:test:1'); o := o||'FAIL ledger dup;'; EXCEPTION WHEN unique_violation THEN o := o||'ok ledger dup blocked;'; END;
  -- 3 non-owner cannot decide
  BEGIN PERFORM public.crew_decide(pid,'approve',null); o := o||'FAIL non-owner decided;'; EXCEPTION WHEN OTHERS THEN o := o||'ok non-owner blocked;'; END;
  -- 4 owner approves -> executed
  PERFORM set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', owner::text, true);
  res := public.crew_decide(pid,'approve','ok');
  o := o||'decide='||res::text||';';
  SELECT count(*) INTO n FROM nc_kds_finances_1789949757826.income WHERE client='ZZ TEST' AND total_income_usd=123.45;
  o := o||'rows_in_income='||n||';';
  SELECT state INTO msg FROM public.crew_ledger WHERE key='raenest:test:1'; o := o||'ledger='||msg||';';
  -- 5 update then soft delete
  rid := (res->'result'->>'record_id')::uuid;
  pid2 := public.crew_propose(cfo,'record.update',tbl,'fix amount','', jsonb_build_object('record_id',rid,'values','{"Total Income (USD)":200}'::jsonb));
  res := public.crew_decide(pid2,'approve',null); o := o||'update='||(res->>'status')||';';
  SELECT total_income_usd::text INTO msg FROM nc_kds_finances_1789949757826.income WHERE id=rid; o := o||'amount_now='||msg||';';
  pid2 := public.crew_propose(cfo,'record.soft_delete',tbl,'remove test','', jsonb_build_object('record_id',rid),'{}','low');
  SELECT risk INTO msg FROM public.crew_proposals WHERE id=pid2; o := o||'delete_risk='||msg||';';
  res := public.crew_decide(pid2,'approve',null); o := o||'delete='||(res->>'status')||';';
  SELECT count(*) INTO n FROM nc_meta.trash WHERE record_id=rid; o := o||'in_trash='||n||';';
  SELECT count(*) INTO n FROM nc_kds_finances_1789949757826.income WHERE id=rid; o := o||'still_in_income='||n||';';
  -- 6 reject creates a lesson and the key stays blocked
  pid2 := public.crew_propose(cfo,'record.create',tbl,'dubious','', '{"values":{"Client":"ZZ2"}}','{}','medium',null,'raenest:test:2');
  res := public.crew_decide(pid2,'reject','not income, it is my own transfer');
  SELECT count(*) INTO n FROM public.crew_notes WHERE agent_id=cfo AND body LIKE '%REJECTED%'; o := o||'lessons='||n||';';
  BEGIN PERFORM public.crew_propose(cfo,'record.create',tbl,'dubious again','', '{"values":{"Client":"ZZ2"}}','{}','medium',null,'raenest:test:2'); o := o||'FAIL rejected dup;'; EXCEPTION WHEN unique_violation THEN o := o||'ok rejected stays blocked;'; END;
  -- 7 CTO low-risk external is released by CFO endorsement; medium needs the owner
  pid2 := public.crew_propose(cto,'external.vercel',NULL,'Add env var X to preview','low risk', '{"steps":["add var"]}','{}','low');
  SELECT requires_approver INTO msg FROM public.crew_proposals WHERE id=pid2; o := o||'cto_low_requires='||msg||';';
  BEGIN PERFORM public.crew_endorse(cto,pid2,'support','self'); o := o||'FAIL self endorsed;'; EXCEPTION WHEN OTHERS THEN o := o||'ok no self endorse;'; END; BEGIN PERFORM public.crew_endorse((SELECT id FROM public.crew_agents WHERE slug='controller'),pid2,'support','x'); o := o||'FAIL staff endorsed;'; EXCEPTION WHEN OTHERS THEN o := o||'ok staff cannot endorse;'; END;
  msg := public.crew_endorse(cfo,pid2,'support','fine'); o := o||'fd_endorse_low='||msg||';'; msg := public.crew_endorse(dep,pid2,'support','fine'); o := o||'deputy_endorse_low='||msg||';';
  pid2 := public.crew_propose(cto,'external.supabase',NULL,'Apply migration to prod','needed', '{"sql":"x"}','{}','high');
  msg := public.crew_endorse(dep,pid2,'support','needed but owner decides'); o := o||'endorse_high='||msg||';';
  res := public.crew_decide(pid2,'approve',null); o := o||'ext_approve='||(res->>'status')||';';
  PERFORM public.crew_mark_done(pid2,'applied by owner'); o := o||'marked_done;';
  -- 8 orders: challenge, insist, veto
  PERFORM public.crew_give_order(cfo,'Record all Raenest credits as income');
  SELECT id INTO rid FROM public.crew_orders WHERE agent_id=cfo ORDER BY created_at DESC LIMIT 1;
  PERFORM public.crew_respond_order(cfo,rid,'challenge','Raenest credits include your own NGN funding, that is not income.');
  PERFORM public.crew_resolve_order(rid,'insist','do it anyway');
  BEGIN PERFORM public.crew_respond_order(cfo,rid,'challenge','still no'); o := o||'FAIL challenged after insist;'; EXCEPTION WHEN OTHERS THEN o := o||'ok no re-challenge after insist;'; END;
  PERFORM public.crew_give_order(cfo,'Pay all salaries now');
  SELECT id INTO rid FROM public.crew_orders WHERE agent_id=cfo AND text LIKE 'Pay all%' LIMIT 1;
  PERFORM public.crew_respond_order(cfo,rid,'challenge','Cash will go negative on the 3rd.');
  PERFORM public.crew_resolve_order(rid,'veto','ok then no');
  SELECT status INTO msg FROM public.crew_orders WHERE id=rid; o := o||'order='||msg||';';
  -- 9 reads
  res := public.crew_read_records(cfo,tbl,'[{"field":"Client","op":"eq","value":"Careershift"}]'::jsonb,3);
  o := o||'read_rows='||jsonb_array_length(res->'rows')||';';
  BEGIN PERFORM public.crew_read_records(cto,tbl); o := o||'FAIL cto read;'; EXCEPTION WHEN OTHERS THEN o := o||'ok cto cannot read;'; END;
  BEGIN PERFORM public.crew_read_records(cfo,tbl,'[{"field":"Client","op":"drop","value":"x"}]'::jsonb); o := o||'FAIL bad op;'; EXCEPTION WHEN OTHERS THEN o := o||'ok bad op;'; END;
  res := public.crew_list_tables(ndi); o := o||'ndi_tables='||jsonb_array_length(res)||';';
  res := public.crew_signals(cfo); o := o||'signals_keys='||(SELECT string_agg(k, ',') FROM jsonb_object_keys(res) k)||';';
  -- 10 reminders (hour gate may skip) + token
  o := o||'reminders_sent='||public.crew_due_reminders()||';';
  msg := public.crew_issue_token('engineering_head','test');
  o := o||'token_agent_ok='||(public.crew_agent_by_token(msg) = cto)||';';
  PERFORM public.crew_revoke_tokens('engineering_head'); o := o||'after_revoke_null='||(public.crew_agent_by_token(msg) IS NULL)||';';
  BEGIN PERFORM public.crew_propose((SELECT id FROM public.crew_agents WHERE slug='treasury'),'record.create',tbl,'x','', '{"values":{"Client":"X"}}'); o := o||'FAIL treasury wrote;'; EXCEPTION WHEN OTHERS THEN o := o||'ok treasury cannot write records;'; END;
  pid2 := public.crew_propose((SELECT id FROM public.crew_agents WHERE slug='treasury'),'draft.batch_payment',NULL,'Pay vendors Friday','cash ok','{"items":[]}','{}','medium');
  res := public.crew_decide(pid2,'approve',null); o := o||'draft_status='||(res->>'status')||';';
  PERFORM public.crew_report_done((SELECT id FROM public.crew_agents WHERE slug='treasury'),pid2,'{"done":true}'); o := o||'draft_reported;';
  o := o||'agents='||(SELECT count(*) FROM public.crew_agents)||',reports_to_cfo='||(SELECT count(*) FROM public.crew_agents WHERE reports_to=dep)||',reports_to_vp='||(SELECT count(*) FROM public.crew_agents WHERE reports_to=cfo)||';';
  res := public.crew_begin_run((SELECT id FROM public.crew_agents WHERE slug='ops_head'),'routine'); o := o||'run1='||(res->>'allowed')||',left='||coalesce(res->>'runs_left','none')||';';
  UPDATE public.crew_agent_private SET max_runs_per_day = 1 WHERE agent_id = (SELECT id FROM public.crew_agents WHERE slug='ops_head');
  PERFORM public.crew_log_run((SELECT id FROM public.crew_agents WHERE slug='ops_head'),'routine',true,'done');
  res := public.crew_begin_run((SELECT id FROM public.crew_agents WHERE slug='ops_head'),'routine'); o := o||'limited_run_blocked='||(NOT (res->>'allowed')::boolean)||';';
  UPDATE public.crew_agent_private SET max_runs_per_day = NULL WHERE agent_id = (SELECT id FROM public.crew_agents WHERE slug='ops_head');
  PERFORM public.crew_log_run((SELECT id FROM public.crew_agents WHERE slug='ops_head'),'routine',true,'done');
  res := public.crew_begin_run((SELECT id FROM public.crew_agents WHERE slug='ops_head'),'routine'); o := o||'unlimited_run_allowed='||(res->>'allowed')||';';
  pid2 := public.crew_propose(dep,'advice.knowledge',NULL,'Write down our offers','owner told me','{"topic":"offers","body":"We sell X and Y"}');
  BEGIN PERFORM public.crew_propose(dep,'advice.knowledge',NULL,'bad','', '{"topic":1}'); o := o||'FAIL bad knowledge;'; EXCEPTION WHEN OTHERS THEN o := o||'ok bad knowledge refused;'; END;
  res := public.crew_decide(pid2,'approve',null); o := o||'knowledge='||(public.crew_get_knowledge(dep,'offers')->>'body')||';';
  o := o||'topics='||jsonb_array_length(public.crew_get_knowledge(dep))||';';
  pid2 := public.crew_propose((SELECT id FROM public.crew_agents WHERE slug='compliance_head'),'draft.filing',NULL,'Draft the VAT return for November','due 21st','{"tax":"VAT"}','{}','medium');
  res := public.crew_decide(pid2,'approve',null); o := o||'filing_status='||(res->>'status')||';';
  BEGIN PERFORM public.crew_propose((SELECT id FROM public.crew_agents WHERE slug='compliance_head'),'record.create',tbl,'x','', '{"values":{"Client":"X"}}'); o := o||'FAIL compliance wrote;'; EXCEPTION WHEN OTHERS THEN o := o||'ok compliance cannot write records;'; END;
  o := o||'tasks_reports_to_ops='||(SELECT (reports_to = (SELECT id FROM public.crew_agents WHERE slug='ops_head')) FROM public.crew_agents WHERE slug='tasks_head')||';';
  o := o||'finance_head_reports_to_cfo='||(SELECT (reports_to = dep) FROM public.crew_agents WHERE slug='finance_head')||';';
  o := o||'jobs='||(SELECT count(*) FROM cron.job WHERE jobname='crew_reminders')||';';
  -- 11 who may prompt
  PERFORM public.crew_say(dep,'hello deputy'); o := o||'owner_say_ok;';
  SELECT id INTO rid FROM public.profiles WHERE role <> 'super_admin' LIMIT 1;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', rid, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', rid::text, true);
  BEGIN PERFORM public.crew_say(dep,'I am an employee'); o := o||'FAIL employee prompted;'; EXCEPTION WHEN OTHERS THEN o := o||'ok employee cannot prompt;'; END;
  BEGIN PERFORM public.crew_grant_prompt(rid,'x'); o := o||'FAIL employee granted self;'; EXCEPTION WHEN OTHERS THEN o := o||'ok employee cannot grant;'; END;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', owner::text, true);
  PERFORM public.crew_grant_prompt(rid,'trusted'); 
  PERFORM set_config('request.jwt.claims', json_build_object('sub', rid, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', rid::text, true);
  PERFORM public.crew_say(dep,'now allowed'); o := o||'granted_say_ok;';
  o := o||'inbox='||(SELECT count(*) FROM public.crew_inbox(dep))||';';
  RAISE EXCEPTION 'TESTRESULT: %', o;
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM LIKE 'TESTRESULT:%' THEN RAISE; END IF;
  RAISE EXCEPTION 'TESTFAIL after [%]: %', o, SQLERRM;
END $t$;
