-- Run AFTER the 20261472 migration, inside the same transaction (the DO block ends in RAISE EXCEPTION 'TESTRESULT: ...' so nothing is kept).
-- Every line of the result starts with PASS or FAIL.

CREATE FUNCTION pg_temp.c(p_name text, p_ok boolean) RETURNS text LANGUAGE sql AS $$ SELECT CASE WHEN coalesce(p_ok, false) THEN 'PASS ' ELSE 'FAIL ' END || p_name || E'\n' $$;

-- propose through the real crew_propose; returns 'ok:<id>' or 'ERR:<message>'
CREATE FUNCTION pg_temp.prop(p_agent uuid, p_action text, p_payload jsonb, p_ledger text DEFAULT NULL, p_risk text DEFAULT 'low') RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  RETURN 'ok:' || public.crew_propose(p_agent, p_action, NULL, 'test ' || p_action, 'because', p_payload, '{}'::jsonb, p_risk, NULL, p_ledger, NULL);
EXCEPTION WHEN OTHERS THEN RETURN 'ERR:' || SQLERRM;
END $$;

-- decide as a given person (the same way the Cliq bridge does it); returns the result or 'ERR:<message>'
CREATE FUNCTION pg_temp.dec(p_id uuid, p_who uuid, p_decision text DEFAULT 'approve') RETURNS text LANGUAGE plpgsql AS $$
DECLARE res jsonb;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', p_who::text, true);
  res := public.crew_decide(p_id, p_decision, NULL);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  RETURN res::text;
EXCEPTION WHEN OTHERS THEN PERFORM set_config('request.jwt.claim.sub', '', true); RETURN 'ERR:' || SQLERRM;
END $$;

CREATE FUNCTION pg_temp.pid(p text) RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(substr(p, 4), '')::uuid $$;
CREATE FUNCTION pg_temp.sig(p_rel regclass) RETURNS text LANGUAGE plpgsql AS $$
DECLARE s text;
BEGIN EXECUTE format('SELECT coalesce(md5(string_agg(t::text, ''|'' ORDER BY t.id)), '''') FROM %s t', p_rel) INTO s; RETURN s; END $$;

DO $t$
DECLARE
  r text := ''; own uuid; cfo uuid; ops uuid; mkt uuid; fin uuid; ctl uuid; p text; pr uuid; d text; n1 integer; n2 integer; sig1 text; sig2 text;
  sub1 uuid; sub2 uuid; ven1 uuid; cli1 uuid; inv1 uuid; bud1 uuid; bi1 uuid; exp1 uuid; bat1 uuid; spy1 uuid; tsk1 uuid; lst uuid; other uuid;
  paid_inv uuid; locked_bud uuid; approved_exp uuid; processed_batch uuid; paid_run uuid; draft_run uuid; pending2 uuid; v jsonb; sch jsonb;
BEGIN
  SELECT id INTO own FROM public.profiles WHERE role = 'super_admin' AND deleted_at IS NULL LIMIT 1;
  SELECT id INTO other FROM public.profiles WHERE role <> 'super_admin' AND deleted_at IS NULL LIMIT 1;
  SELECT id INTO cfo FROM public.crew_agents WHERE slug = 'cfo';
  SELECT id INTO fin FROM public.crew_agents WHERE slug = 'finance_head';
  SELECT id INTO ctl FROM public.crew_agents WHERE slug = 'controller';
  SELECT id INTO ops FROM public.crew_agents WHERE slug = 'ops_head';
  SELECT id INTO mkt FROM public.crew_agents WHERE slug = 'marketing_head';
  SELECT id INTO lst FROM public.tm_lists LIMIT 1;
  r := r || pg_temp.c('have_owner_and_agents', own IS NOT NULL AND other IS NOT NULL AND cfo IS NOT NULL AND fin IS NOT NULL AND ctl IS NOT NULL AND ops IS NOT NULL AND lst IS NOT NULL);

  -- ===== schema and permissions =====
  sch := public.crew_app_schema(cfo, NULL);
  r := r || pg_temp.c('cfo_sees_10_sources', jsonb_array_length(sch -> 'sources') = 10);
  r := r || pg_temp.c('cfo_not_tasks', NOT (sch::text LIKE '%"tasks"%'));
  r := r || pg_temp.c('never_listed_payment_items_loans_schedules', NOT (sch::text ~ 'payment_items|loan_repayments|recurring_schedules|payment_anomalies|"people"'));
  r := r || pg_temp.c('ops_sees_only_tasks', (SELECT jsonb_agg(x ->> 'source') FROM jsonb_array_elements(public.crew_app_schema(ops, NULL) -> 'sources') x) = '["tasks"]'::jsonb);
  r := r || pg_temp.c('marketing_sees_nothing', jsonb_array_length(public.crew_app_schema(mkt, NULL) -> 'sources') = 0);
  sch := public.crew_app_schema(cfo, 'subscriptions');
  r := r || pg_temp.c('schema_has_columns', jsonb_array_length(sch -> 'sources' -> 0 -> 'columns') > 10 AND (sch::text LIKE '%billing_cycle%') AND NOT (sch::text LIKE '%created_by%') AND NOT (sch::text LIKE '%"column": "id"%'));
  r := r || pg_temp.c('actions_granted', (SELECT bool_and('app.create' = ANY (allowed_actions) AND 'app.soft_delete' = ANY (allowed_actions)) FROM public.crew_agent_private WHERE agent_id IN (cfo, fin, ctl, ops)));
  r := r || pg_temp.c('marketing_has_no_app_action', NOT ('app.create' = ANY (SELECT unnest(allowed_actions) FROM public.crew_agent_private WHERE agent_id = mkt)));
  p := pg_temp.prop(mkt, 'app.create', '{"source":"clients","values":{"name":"X"}}');
  r := r || pg_temp.c('marketing_cannot_propose', p LIKE 'ERR:%may not propose%');

  -- ===== subscriptions: create, update, soft delete =====
  SELECT id INTO sub2 FROM public.subscriptions ORDER BY id LIMIT 1;
  sig1 := pg_temp.sig('public.subscriptions');
  SELECT count(*) INTO n1 FROM public.subscriptions;
  p := pg_temp.prop(cfo, 'app.create', '{"source":"subscriptions","values":{"name":"ZZ Test Tool","vendor":"ZZ Vendor","amount_ngn":30000,"billing_cycle":"monthly","category":"software","notes":"hi"}}', 'sub:zz-test:monthly');
  r := r || pg_temp.c('sub_create_proposed', p LIKE 'ok:%');
  pr := pg_temp.pid(p);
  r := r || pg_temp.c('proposal_pending_owner_medium', (SELECT status = 'pending' AND requires_approver = 'owner' AND risk = 'medium' AND dedupe_key LIKE 'app:app.create:%' AND payload ->> 'source' = 'subscriptions' AND table_id IS NULL FROM public.crew_proposals WHERE id = pr));
  r := r || pg_temp.c('nothing_written_on_propose', (SELECT count(*) FROM public.subscriptions) = n1 AND pg_temp.sig('public.subscriptions') = sig1);
  p := pg_temp.prop(cfo, 'app.create', '{"source":"subscriptions","values":{"name":"ZZ Test Tool","vendor":"ZZ Vendor","amount_ngn":30000,"billing_cycle":"monthly"}}', 'sub:zz-test:monthly');
  r := r || pg_temp.c('same_ledger_key_refused', p LIKE 'ERR:duplicate%');
  p := pg_temp.prop(cfo, 'app.create', '{"source":"subscriptions","values":{"name":"zz test tool","vendor":"zz vendor","amount_ngn":99,"billing_cycle":"monthly"}}', 'sub:other-key');
  r := r || pg_temp.c('same_natural_key_pending_not_blocked_until_applied', p LIKE 'ok:%');
  pending2 := pg_temp.pid(p);
  d := pg_temp.dec(pr, other);
  r := r || pg_temp.c('non_owner_cannot_approve', d LIKE 'ERR:only the owner%');
  r := r || pg_temp.c('still_nothing_written', (SELECT count(*) FROM public.subscriptions) = n1);
  d := pg_temp.dec(pr, own);
  r := r || pg_temp.c('owner_approve_executes', d LIKE '%"status": "executed"%');
  SELECT id INTO sub1 FROM public.subscriptions WHERE name = 'ZZ Test Tool';
  r := r || pg_temp.c('sub_row_created_draft_state', (SELECT status = 'active' AND created_by = own AND amount_ngn = 30000 AND currency = 'NGN' AND notes LIKE 'hi [Crew agent %proposal %]' FROM public.subscriptions WHERE id = sub1));
  r := r || pg_temp.c('exactly_one_row_added', (SELECT count(*) FROM public.subscriptions) = n1 + 1);
  r := r || pg_temp.c('proposal_executed_with_result', (SELECT status = 'executed' AND result ->> 'record_id' = sub1::text AND decided_by = own FROM public.crew_proposals WHERE id = pr));
  r := r || pg_temp.c('ledger_recorded', (SELECT state = 'recorded' FROM public.crew_ledger WHERE key = 'sub:zz-test:monthly'));
  r := r || pg_temp.c('audit_logged', EXISTS (SELECT 1 FROM public.audit_logs WHERE action_type = 'crew_app_change' AND metadata ->> 'proposal' = pr::text));
  d := pg_temp.dec(pending2, own);
  r := r || pg_temp.c('second_same_key_fails_at_execute', d LIKE '%"failed"%' AND d LIKE '%duplicate%' AND (SELECT count(*) FROM public.subscriptions WHERE lower(name) = 'zz test tool') = 1);
  r := r || pg_temp.c('failed_logged_as_mistake', EXISTS (SELECT 1 FROM public.crew_mistakes WHERE proposal_id = pending2 AND kind = 'failed_proposal'));
  -- update: only the named row and columns change
  sig1 := (SELECT md5(string_agg(t::text, '|' ORDER BY t.id)) FROM public.subscriptions t WHERE id <> sub1);
  p := pg_temp.prop(cfo, 'app.update', jsonb_build_object('source', 'subscriptions', 'record_id', sub1, 'values', '{"amount_ngn":45000,"notes":null}'::jsonb));
  r := r || pg_temp.c('sub_update_proposed', p LIKE 'ok:%');
  pr := pg_temp.pid(p);
  PERFORM set_config('request.jwt.claim.sub', own::text, true);
  v := public.crew_app_preview(pr);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  r := r || pg_temp.c('preview_before_30000_after_45000', jsonb_array_length(v -> 'fields') = 2
    AND EXISTS (SELECT 1 FROM jsonb_array_elements(v -> 'fields') x WHERE x ->> 'column' = 'amount_ngn' AND (x -> 'before')::numeric = 30000 AND (x -> 'after')::numeric = 45000 AND x ->> 'changed' = 'true'));
  d := pg_temp.dec(pr, own);
  r := r || pg_temp.c('sub_updated', (SELECT amount_ngn = 45000 AND notes IS NULL AND name = 'ZZ Test Tool' AND vendor = 'ZZ Vendor' FROM public.subscriptions WHERE id = sub1));
  r := r || pg_temp.c('other_subscriptions_untouched', sig1 = (SELECT md5(string_agg(t::text, '|' ORDER BY t.id)) FROM public.subscriptions t WHERE id <> sub1));
  -- refusals on subscriptions
  p := pg_temp.prop(cfo, 'app.update', jsonb_build_object('source', 'subscriptions', 'record_id', sub1, 'values', '{"created_by":"00000000-0000-0000-0000-000000000000"}'::jsonb));
  r := r || pg_temp.c('refuse_created_by', p LIKE 'ERR:%cannot be written%');
  p := pg_temp.prop(cfo, 'app.update', jsonb_build_object('source', 'subscriptions', 'record_id', sub1, 'values', '{"status":"cancelled"}'::jsonb));
  r := r || pg_temp.c('refuse_status_cancelled_by_update', p LIKE 'ERR:%must be one of: active, paused%');
  p := pg_temp.prop(cfo, 'app.update', jsonb_build_object('source', 'subscriptions', 'record_id', sub1, 'values', '{"id":"00000000-0000-0000-0000-000000000000"}'::jsonb));
  r := r || pg_temp.c('refuse_id', p LIKE 'ERR:%cannot be written%');
  p := pg_temp.prop(cfo, 'app.update', jsonb_build_object('source', 'subscriptions', 'record_id', sub1, 'values', '{"amount_ngn":"45000"}'::jsonb));
  r := r || pg_temp.c('refuse_number_as_text', p LIKE 'ERR:%must be a number%');
  p := pg_temp.prop(cfo, 'app.update', jsonb_build_object('source', 'subscriptions', 'record_id', sub1, 'values', '{"amount_ngn":-5}'::jsonb));
  r := r || pg_temp.c('refuse_negative', p LIKE 'ERR:%must be between%');
  p := pg_temp.prop(cfo, 'app.update', jsonb_build_object('source', 'subscriptions', 'record_id', sub1, 'values', '{"next_renewal_date":"2026-02-31"}'::jsonb));
  r := r || pg_temp.c('refuse_fake_date', p LIKE 'ERR:%not a real date%');
  p := pg_temp.prop(cfo, 'app.update', jsonb_build_object('source', 'subscriptions', 'record_id', sub1, 'values', '{"next_renewal_date":"01/12/2026"}'::jsonb));
  r := r || pg_temp.c('refuse_non_iso_date', p LIKE 'ERR:%yyyy-mm-dd%');
  p := pg_temp.prop(cfo, 'app.update', jsonb_build_object('source', 'subscriptions', 'record_id', sub1, 'values', '{"billing_cycle":"weekly"}'::jsonb));
  r := r || pg_temp.c('refuse_bad_enum', p LIKE 'ERR:%must be one of%');
  p := pg_temp.prop(cfo, 'app.update', jsonb_build_object('source', 'subscriptions', 'record_id', sub1, 'values', jsonb_build_object('notes', repeat('x', 1001))));
  r := r || pg_temp.c('refuse_too_long', p LIKE 'ERR:%too long%');
  p := pg_temp.prop(cfo, 'app.update', jsonb_build_object('source', 'subscriptions', 'values', '{"amount_ngn":1}'::jsonb));
  r := r || pg_temp.c('refuse_missing_record_id', p LIKE 'ERR:%needs record_id%');
  p := pg_temp.prop(cfo, 'app.update', jsonb_build_object('source', 'subscriptions', 'record_id', gen_random_uuid(), 'values', '{"amount_ngn":1}'::jsonb));
  r := r || pg_temp.c('refuse_unknown_record', p LIKE 'ERR:no editable record%');
  p := pg_temp.prop(cfo, 'app.update', jsonb_build_object('source', 'subscriptions', 'record_id', sub1, 'values', '{"amount_ngn":1}'::jsonb, 'sql', 'drop table x'));
  r := r || pg_temp.c('refuse_extra_payload_key', p LIKE 'ERR:%unknown fields%');
  p := pg_temp.prop(cfo, 'app.create', '{"values":{"name":"x"}}');
  r := r || pg_temp.c('refuse_no_source', p LIKE 'ERR:%needs a source%');
  p := pg_temp.prop(cfo, 'app.create', '{"source":"profiles","values":{"name":"x"}}');
  r := r || pg_temp.c('refuse_unknown_source_profiles', p LIKE 'ERR:unknown source%');
  p := pg_temp.prop(cfo, 'app.create', '{"source":"payment_items","values":{"amount_ngn":5}}');
  r := r || pg_temp.c('refuse_payment_items', p LIKE 'ERR:unknown source%');
  p := pg_temp.prop(cfo, 'app.create', '{"source":"loan_repayments","values":{"amount_ngn":5}}');
  r := r || pg_temp.c('refuse_loan_repayments', p LIKE 'ERR:unknown source%');
  p := pg_temp.prop(cfo, 'app.create', '{"source":"recurring_schedules","values":{"frequency":"weekly"}}');
  r := r || pg_temp.c('refuse_recurring_schedules', p LIKE 'ERR:unknown source%');
  p := pg_temp.prop(cfo, 'app.create', '{"source":"subscriptions;drop table x","values":{"name":"x"}}');
  r := r || pg_temp.c('refuse_injection_in_source', p LIKE 'ERR:unknown source%');
  p := pg_temp.prop(cfo, 'app.create', '{"source":"subscriptions","values":{"name":"Z9","amount_ngn":1,"nope":1}}');
  r := r || pg_temp.c('refuse_unknown_column', p LIKE 'ERR:column "nope" cannot be written%');
  p := pg_temp.prop(cfo, 'app.create', '{"source":"subscriptions","values":{"vendor":"Z9"}}');
  r := r || pg_temp.c('refuse_missing_required', p LIKE 'ERR:missing required column%');
  p := pg_temp.prop(cfo, 'app.create', '{"source":"subscriptions","values":{"name":"Z9","amount_ngn":1,"status":"active"}}');
  r := r || pg_temp.c('refuse_status_on_create', p LIKE 'ERR:%set by the system%');
  p := pg_temp.prop(cfo, 'app.delete', '{"source":"subscriptions","record_id":"00000000-0000-0000-0000-000000000000"}');
  r := r || pg_temp.c('refuse_permanent_delete_action_not_allowed', p LIKE 'ERR:%may not propose%');
  BEGIN
    INSERT INTO public.crew_proposals (agent_id, action, summary, payload) VALUES (cfo, 'app.delete', 'x', '{}');
    r := r || 'FAIL app.delete_insert_accepted' || E'\n';
  EXCEPTION WHEN OTHERS THEN r := r || 'PASS app.delete_refused' || E'\n'; END;
  BEGIN
    INSERT INTO public.crew_proposals (agent_id, action, summary, payload) VALUES (cfo, 'app.hard_delete', 'x', '{}');
    r := r || 'FAIL app.hard_delete_insert_accepted' || E'\n';
  EXCEPTION WHEN OTHERS THEN r := r || 'PASS app.hard_delete_refused' || E'\n'; END;
  -- executing without being the owner is refused, even for a pending app proposal
  p := pg_temp.prop(cfo, 'app.update', jsonb_build_object('source', 'subscriptions', 'record_id', sub1, 'values', '{"priority":"low"}'::jsonb));
  pr := pg_temp.pid(p);
  BEGIN PERFORM public.crew_execute_app(pr, own); r := r || 'FAIL execute_app_without_owner_session' || E'\n';
  EXCEPTION WHEN OTHERS THEN r := r || pg_temp.c('execute_app_without_owner_session_refused', SQLERRM LIKE '%only the owner%'); END;
  -- the CFO's own endorsement can never approve an app proposal
  PERFORM public.crew_endorse(fin, pr, 'support', 'ok');
  r := r || pg_temp.c('endorse_does_not_approve', (SELECT status = 'pending' FROM public.crew_proposals WHERE id = pr));
  d := pg_temp.dec(pr, own, 'reject');
  r := r || pg_temp.c('reject_changes_nothing', (SELECT priority <> 'low' OR priority IS NULL FROM public.subscriptions WHERE id = sub1) AND (SELECT status = 'rejected' FROM public.crew_proposals WHERE id = pr));
  -- execution-time failure: the database constraint refuses (USD needs amount_usd) and nothing is kept
  p := pg_temp.prop(cfo, 'app.create', '{"source":"subscriptions","values":{"name":"ZZ Usd","amount_ngn":1,"currency":"USD"}}');
  pr := pg_temp.pid(p);
  d := pg_temp.dec(pr, own);
  r := r || pg_temp.c('constraint_failure_reported', d LIKE '%"status": "failed"%' AND (SELECT status = 'failed' AND error IS NOT NULL FROM public.crew_proposals WHERE id = pr) AND NOT EXISTS (SELECT 1 FROM public.subscriptions WHERE name = 'ZZ Usd'));
  -- permission removed after proposing blocks the execution
  p := pg_temp.prop(cfo, 'app.update', jsonb_build_object('source', 'subscriptions', 'record_id', sub1, 'values', '{"priority":"high"}'::jsonb));
  pr := pg_temp.pid(p);
  UPDATE public.crew_agent_private SET allowed_actions = array_remove(allowed_actions, 'app.update') WHERE agent_id = cfo;
  d := pg_temp.dec(pr, own);
  r := r || pg_temp.c('permission_removed_blocks_execution', d LIKE '%"failed"%' AND d LIKE '%may no longer propose%' AND (SELECT priority IS DISTINCT FROM 'high' FROM public.subscriptions WHERE id = sub1));
  UPDATE public.crew_agent_private SET allowed_actions = allowed_actions || ARRAY['app.update'] WHERE agent_id = cfo;
  -- soft delete = cancelled; high risk; the row stays
  sig1 := (SELECT md5(string_agg(t::text, '|' ORDER BY t.id)) FROM public.subscriptions t WHERE id <> sub1);
  p := pg_temp.prop(cfo, 'app.soft_delete', jsonb_build_object('source', 'subscriptions', 'record_id', sub1), NULL, 'low');
  pr := pg_temp.pid(p);
  r := r || pg_temp.c('soft_delete_is_high_risk', (SELECT risk = 'high' FROM public.crew_proposals WHERE id = pr));
  p := pg_temp.prop(cfo, 'app.soft_delete', jsonb_build_object('source', 'subscriptions', 'record_id', sub1, 'values', '{"name":"x"}'::jsonb));
  r := r || pg_temp.c('soft_delete_takes_no_values', p LIKE 'ERR:%takes only source and record_id%');
  d := pg_temp.dec(pr, own);
  r := r || pg_temp.c('subscription_cancelled_not_deleted', (SELECT status = 'cancelled' FROM public.subscriptions WHERE id = sub1) AND (SELECT count(*) FROM public.subscriptions) = n1 + 1);
  r := r || pg_temp.c('other_subs_untouched_after_delete', sig1 = (SELECT md5(string_agg(t::text, '|' ORDER BY t.id)) FROM public.subscriptions t WHERE id <> sub1));
  p := pg_temp.prop(cfo, 'app.update', jsonb_build_object('source', 'subscriptions', 'record_id', sub1, 'values', '{"priority":"high"}'::jsonb));
  r := r || pg_temp.c('cannot_edit_cancelled', p LIKE 'ERR:no editable record%');
  -- recreating a cancelled one is allowed (the live key is free again)
  p := pg_temp.prop(cfo, 'app.create', '{"source":"subscriptions","values":{"name":"ZZ Test Tool","vendor":"ZZ Vendor","amount_ngn":1000,"billing_cycle":"monthly"}}');
  r := r || pg_temp.c('recreate_after_cancel_allowed', p LIKE 'ok:%');

  -- ===== subscription_payments: never paid =====
  p := pg_temp.prop(cfo, 'app.create', jsonb_build_object('source', 'subscription_payments', 'values', jsonb_build_object('subscription_id', sub2, 'month', '2031-01-01', 'status', 'paid')));
  r := r || pg_temp.c('refuse_paid_status', p LIKE 'ERR:%must be one of: pending, skipped, overdue%');
  p := pg_temp.prop(cfo, 'app.create', jsonb_build_object('source', 'subscription_payments', 'values', jsonb_build_object('subscription_id', sub2, 'month', '2031-01-01', 'paid_at', '2031-01-02')));
  r := r || pg_temp.c('refuse_paid_at', p LIKE 'ERR:%cannot be written%');
  p := pg_temp.prop(cfo, 'app.create', jsonb_build_object('source', 'subscription_payments', 'values', jsonb_build_object('subscription_id', sub2, 'month', '2031-01-01', 'amount_ngn', 1200)));
  pr := pg_temp.pid(p);
  d := pg_temp.dec(pr, own);
  SELECT id INTO spy1 FROM public.subscription_payments WHERE subscription_id = sub2 AND month = '2031-01-01';
  r := r || pg_temp.c('sub_payment_created_pending', (SELECT status = 'pending' AND paid_at IS NULL AND amount_ngn = 1200 FROM public.subscription_payments WHERE id = spy1));
  p := pg_temp.prop(cfo, 'app.soft_delete', jsonb_build_object('source', 'subscription_payments', 'record_id', spy1));
  r := r || pg_temp.c('sub_payments_have_no_delete', p LIKE 'ERR:%does not support%');
  UPDATE public.subscription_payments SET status = 'paid', paid_at = now() WHERE id = spy1;
  p := pg_temp.prop(cfo, 'app.update', jsonb_build_object('source', 'subscription_payments', 'record_id', spy1, 'values', '{"amount_ngn":5}'::jsonb));
  r := r || pg_temp.c('paid_month_cannot_be_edited', p LIKE 'ERR:no editable record%');

  -- ===== vendors =====
  p := pg_temp.prop(fin, 'app.create', '{"source":"vendors","values":{"name":"ZZ Vendor Ltd","category":"software","contact_email":"a@zz.test"}}');
  pr := pg_temp.pid(p);
  d := pg_temp.dec(pr, own);
  SELECT id INTO ven1 FROM public.vendors WHERE name = 'ZZ Vendor Ltd';
  r := r || pg_temp.c('vendor_created', ven1 IS NOT NULL AND (SELECT created_by = own AND bank_account_number IS NULL AND deleted_at IS NULL FROM public.vendors WHERE id = ven1));
  p := pg_temp.prop(fin, 'app.update', jsonb_build_object('source', 'vendors', 'record_id', ven1, 'values', '{"bank_account_number":"0123456789"}'::jsonb));
  r := r || pg_temp.c('refuse_bank_account_number', p LIKE 'ERR:%cannot be written%');
  p := pg_temp.prop(fin, 'app.update', jsonb_build_object('source', 'vendors', 'record_id', ven1, 'values', '{"bank_name":"X","bank_account_name":"Y"}'::jsonb));
  r := r || pg_temp.c('refuse_bank_name', p LIKE 'ERR:%cannot be written%');
  p := pg_temp.prop(fin, 'app.update', jsonb_build_object('source', 'vendors', 'record_id', ven1, 'values', '{"status":"blacklisted"}'::jsonb));
  r := r || pg_temp.c('refuse_blacklist', p LIKE 'ERR:%must be one of%');
  p := pg_temp.prop(fin, 'app.update', jsonb_build_object('source', 'vendors', 'record_id', ven1, 'values', '{"payment_terms":"Net 45","contract_value_ngn":250000}'::jsonb));
  d := pg_temp.dec(pg_temp.pid(p), own);
  r := r || pg_temp.c('vendor_updated', (SELECT payment_terms = 'Net 45' AND contract_value_ngn = 250000 AND category = 'software' FROM public.vendors WHERE id = ven1));
  p := pg_temp.prop(fin, 'app.soft_delete', jsonb_build_object('source', 'vendors', 'record_id', ven1));
  d := pg_temp.dec(pg_temp.pid(p), own);
  r := r || pg_temp.c('vendor_soft_deleted_row_kept', (SELECT deleted_at IS NOT NULL FROM public.vendors WHERE id = ven1));

  -- ===== clients =====
  p := pg_temp.prop(ctl, 'app.create', '{"source":"clients","values":{"name":"ZZ Client","status":"prospect","contract_value_ngn":500000}}');
  d := pg_temp.dec(pg_temp.pid(p), own);
  SELECT id INTO cli1 FROM public.clients WHERE name = 'ZZ Client';
  r := r || pg_temp.c('client_created_by_controller', cli1 IS NOT NULL);
  p := pg_temp.prop(ctl, 'app.update', jsonb_build_object('source', 'clients', 'record_id', cli1, 'values', '{"status":"active"}'::jsonb));
  d := pg_temp.dec(pg_temp.pid(p), own);
  r := r || pg_temp.c('client_updated', (SELECT status = 'active' FROM public.clients WHERE id = cli1));
  p := pg_temp.prop(ctl, 'app.soft_delete', jsonb_build_object('source', 'clients', 'record_id', cli1));
  d := pg_temp.dec(pg_temp.pid(p), own);
  r := r || pg_temp.c('client_soft_deleted', (SELECT deleted_at IS NOT NULL FROM public.clients WHERE id = cli1));

  -- ===== invoices: draft only, never paid or sent =====
  SELECT id INTO cli1 FROM public.clients WHERE deleted_at IS NULL LIMIT 1;
  p := pg_temp.prop(cfo, 'app.create', jsonb_build_object('source', 'invoices', 'values', jsonb_build_object('invoice_number', 'ZZ-INV-1', 'client_id', cli1, 'client_name', 'ZZ Client', 'due_date', '2031-02-01',
        'line_items', '[{"description":"Work","qty":1,"unit_price":1000}]'::jsonb, 'subtotal_ngn', 1000, 'vat_amount_ngn', 75, 'total_ngn', 1075)));
  d := pg_temp.dec(pg_temp.pid(p), own);
  SELECT id INTO inv1 FROM public.invoices WHERE invoice_number = 'ZZ-INV-1';
  r := r || pg_temp.c('invoice_created_as_draft', (SELECT status = 'draft' AND paid_date IS NULL AND created_by = own FROM public.invoices WHERE id = inv1));
  p := pg_temp.prop(cfo, 'app.update', jsonb_build_object('source', 'invoices', 'record_id', inv1, 'values', '{"status":"paid"}'::jsonb));
  r := r || pg_temp.c('refuse_invoice_paid', p LIKE 'ERR:%must be one of: draft, cancelled%');
  p := pg_temp.prop(cfo, 'app.update', jsonb_build_object('source', 'invoices', 'record_id', inv1, 'values', '{"status":"sent"}'::jsonb));
  r := r || pg_temp.c('refuse_invoice_sent', p LIKE 'ERR:%must be one of: draft, cancelled%');
  p := pg_temp.prop(cfo, 'app.update', jsonb_build_object('source', 'invoices', 'record_id', inv1, 'values', '{"paid_date":"2031-02-02"}'::jsonb));
  r := r || pg_temp.c('refuse_paid_date', p LIKE 'ERR:%cannot be written%');
  p := pg_temp.prop(cfo, 'app.create', '{"source":"invoices","values":{"invoice_number":"ZZ-INV-2","client_name":"C","due_date":"2031-02-01","status":"paid"}}');
  r := r || pg_temp.c('refuse_create_paid_invoice', p LIKE 'ERR:%set by the system%');
  p := pg_temp.prop(cfo, 'app.create', jsonb_build_object('source', 'invoices', 'values', jsonb_build_object('invoice_number', 'zz-inv-1', 'client_name', 'C', 'due_date', '2031-02-01')));
  r := r || pg_temp.c('refuse_duplicate_invoice_number', p LIKE 'ERR:duplicate%');
  INSERT INTO public.invoices (invoice_number, client_name, due_date, status) VALUES ('ZZ-PAID', 'C', '2031-03-01', 'paid') RETURNING id INTO paid_inv;
  p := pg_temp.prop(cfo, 'app.update', jsonb_build_object('source', 'invoices', 'record_id', paid_inv, 'values', '{"notes":"x"}'::jsonb));
  r := r || pg_temp.c('paid_invoice_not_editable', p LIKE 'ERR:no editable record%');
  p := pg_temp.prop(cfo, 'app.soft_delete', jsonb_build_object('source', 'invoices', 'record_id', paid_inv));
  r := r || pg_temp.c('paid_invoice_not_deletable', p LIKE 'ERR:no editable record%');
  p := pg_temp.prop(cfo, 'app.soft_delete', jsonb_build_object('source', 'invoices', 'record_id', inv1));
  d := pg_temp.dec(pg_temp.pid(p), own);
  r := r || pg_temp.c('draft_invoice_soft_deleted', (SELECT deleted_at IS NOT NULL FROM public.invoices WHERE id = inv1));

  -- ===== budgets and lines =====
  p := pg_temp.prop(cfo, 'app.create', '{"source":"budgets","values":{"name":"ZZ Budget","period":"monthly","start_date":"2031-01-01","end_date":"2031-01-31","total_amount_ngn":1000000}}');
  d := pg_temp.dec(pg_temp.pid(p), own);
  SELECT id INTO bud1 FROM public.budgets WHERE name = 'ZZ Budget';
  r := r || pg_temp.c('budget_created_draft_unlocked', (SELECT status = 'draft' AND NOT locked AND approved_by IS NULL AND created_by = own FROM public.budgets WHERE id = bud1));
  p := pg_temp.prop(cfo, 'app.update', jsonb_build_object('source', 'budgets', 'record_id', bud1, 'values', '{"status":"approved"}'::jsonb));
  r := r || pg_temp.c('budget_update_not_supported_yet', p LIKE 'ERR:%does not support%');
  p := pg_temp.prop(cfo, 'app.soft_delete', jsonb_build_object('source', 'budgets', 'record_id', bud1));
  r := r || pg_temp.c('budget_soft_delete_not_supported_yet', p LIKE 'ERR:%does not support%');
  p := pg_temp.prop(cfo, 'app.create', jsonb_build_object('source', 'budget_items', 'values', jsonb_build_object('budget_id', bud1, 'category', 'Software', 'allocated_ngn', 300000)));
  d := pg_temp.dec(pg_temp.pid(p), own);
  SELECT id INTO bi1 FROM public.budget_items WHERE budget_id = bud1;
  r := r || pg_temp.c('budget_item_created', (SELECT allocated_ngn = 300000 AND spent_ngn = 0 FROM public.budget_items WHERE id = bi1));
  p := pg_temp.prop(cfo, 'app.update', jsonb_build_object('source', 'budget_items', 'record_id', bi1, 'values', '{"spent_ngn":5}'::jsonb));
  r := r || pg_temp.c('refuse_spent', p LIKE 'ERR:%cannot be written%');
  p := pg_temp.prop(cfo, 'app.update', jsonb_build_object('source', 'budget_items', 'record_id', bi1, 'values', '{"allocated_ngn":350000}'::jsonb));
  d := pg_temp.dec(pg_temp.pid(p), own);
  r := r || pg_temp.c('budget_item_updated', (SELECT allocated_ngn = 350000 FROM public.budget_items WHERE id = bi1));
  INSERT INTO public.budgets (name, period, start_date, end_date, status, locked) VALUES ('ZZ Locked', 'monthly', '2031-02-01', '2031-02-28', 'approved', true) RETURNING id INTO locked_bud;
  p := pg_temp.prop(cfo, 'app.create', jsonb_build_object('source', 'budget_items', 'values', jsonb_build_object('budget_id', locked_bud, 'category', 'X', 'allocated_ngn', 1)));
  r := r || pg_temp.c('refuse_line_on_locked_budget', p LIKE 'ERR:%no usable record%');
  p := pg_temp.prop(cfo, 'app.update', jsonb_build_object('source', 'budgets', 'record_id', locked_bud, 'values', '{"notes":"x"}'::jsonb));
  r := r || pg_temp.c('locked_budget_update_not_supported', p LIKE 'ERR:%does not support%');

  -- ===== expenses: pending claims only =====
  p := pg_temp.prop(cfo, 'app.create', jsonb_build_object('source', 'expenses', 'values', jsonb_build_object('submitted_by', own, 'category', 'software', 'date', '2031-01-05', 'amount_ngn', 15000, 'vendor_name', 'ZZ Vendor', 'description', 'Tool')));
  d := pg_temp.dec(pg_temp.pid(p), own);
  SELECT id INTO exp1 FROM public.expenses WHERE vendor_name = 'ZZ Vendor' AND date = '2031-01-05';
  r := r || pg_temp.c('expense_created_pending_unpaid', (SELECT status = 'pending' AND coalesce(payment_status, 'pending') = 'pending' AND approved_by IS NULL AND processed_at IS NULL AND description LIKE 'Tool [Crew agent%' FROM public.expenses WHERE id = exp1));
  p := pg_temp.prop(cfo, 'app.update', jsonb_build_object('source', 'expenses', 'record_id', exp1, 'values', '{"payment_status":"processed"}'::jsonb));
  r := r || pg_temp.c('refuse_payment_status_processed', p LIKE 'ERR:%cannot be written%');
  p := pg_temp.prop(cfo, 'app.update', jsonb_build_object('source', 'expenses', 'record_id', exp1, 'values', '{"status":"approved"}'::jsonb));
  r := r || pg_temp.c('refuse_expense_status', p LIKE 'ERR:%cannot be written%');
  p := pg_temp.prop(cfo, 'app.update', jsonb_build_object('source', 'expenses', 'record_id', exp1, 'values', '{"approved_by":"00000000-0000-0000-0000-000000000000"}'::jsonb));
  r := r || pg_temp.c('refuse_expense_approved_by', p LIKE 'ERR:%cannot be written%');
  p := pg_temp.prop(cfo, 'app.update', jsonb_build_object('source', 'expenses', 'record_id', exp1, 'values', '{"amount_ngn":16000}'::jsonb));
  d := pg_temp.dec(pg_temp.pid(p), own);
  r := r || pg_temp.c('expense_updated', (SELECT amount_ngn = 16000 FROM public.expenses WHERE id = exp1));
  INSERT INTO public.expenses (submitted_by, category, date, amount_ngn, status, payment_status) VALUES (own, 'other', '2031-01-06', 5, 'approved', 'pending') RETURNING id INTO approved_exp;
  p := pg_temp.prop(cfo, 'app.update', jsonb_build_object('source', 'expenses', 'record_id', approved_exp, 'values', '{"amount_ngn":6}'::jsonb));
  r := r || pg_temp.c('approved_expense_not_editable', p LIKE 'ERR:no editable record%');
  p := pg_temp.prop(cfo, 'app.soft_delete', jsonb_build_object('source', 'expenses', 'record_id', approved_exp));
  r := r || pg_temp.c('approved_expense_not_deletable', p LIKE 'ERR:no editable record%');
  p := pg_temp.prop(cfo, 'app.soft_delete', jsonb_build_object('source', 'expenses', 'record_id', exp1));
  d := pg_temp.dec(pg_temp.pid(p), own);
  r := r || pg_temp.c('pending_expense_soft_deleted', (SELECT deleted_at IS NOT NULL FROM public.expenses WHERE id = exp1));

  -- ===== payment batches: drafts only =====
  p := pg_temp.prop(cfo, 'app.create', '{"source":"payment_batches","values":{"name":"ZZ Batch","payment_date":"2031-01-25","period":"2031-01"}}');
  d := pg_temp.dec(pg_temp.pid(p), own);
  SELECT id INTO bat1 FROM public.payment_batches WHERE name = 'ZZ Batch';
  r := r || pg_temp.c('batch_created_draft_empty', (SELECT status = 'draft' AND total_amount = 0 AND beneficiary_count = 0 AND NOT is_quick_pay AND approved_by IS NULL AND funded_at IS NULL AND created_by = own FROM public.payment_batches WHERE id = bat1));
  FOREACH d IN ARRAY ARRAY['status', 'total_amount', 'approved_by', 'funded_at', 'beneficiary_count', 'is_quick_pay', 'provider', 'scheduled_date', 'processing_started_at', 'funding_evidence', 'batch_type'] LOOP
    p := pg_temp.prop(cfo, 'app.update', jsonb_build_object('source', 'payment_batches', 'record_id', bat1, 'values', jsonb_build_object(d, 'x')));
    r := r || pg_temp.c('refuse_batch_' || d, p LIKE 'ERR:%cannot be written%');
  END LOOP;
  p := pg_temp.prop(cfo, 'app.update', jsonb_build_object('source', 'payment_batches', 'record_id', bat1, 'values', '{"name":"ZZ Batch v2","notes":"edited"}'::jsonb));
  d := pg_temp.dec(pg_temp.pid(p), own);
  r := r || pg_temp.c('batch_updated', (SELECT name = 'ZZ Batch v2' AND status = 'draft' FROM public.payment_batches WHERE id = bat1));
  SELECT id INTO processed_batch FROM public.payment_batches WHERE status IN ('processed', 'funded', 'approved', 'processing') ORDER BY created_at DESC LIMIT 1;
  p := pg_temp.prop(cfo, 'app.update', jsonb_build_object('source', 'payment_batches', 'record_id', processed_batch, 'values', '{"name":"hacked"}'::jsonb));
  r := r || pg_temp.c('processed_batch_not_editable', processed_batch IS NOT NULL AND p LIKE 'ERR:no editable record%');
  p := pg_temp.prop(cfo, 'app.soft_delete', jsonb_build_object('source', 'payment_batches', 'record_id', processed_batch));
  r := r || pg_temp.c('processed_batch_not_deletable', p LIKE 'ERR:no editable record%');
  p := pg_temp.prop(cfo, 'app.soft_delete', jsonb_build_object('source', 'payment_batches', 'record_id', bat1));
  d := pg_temp.dec(pg_temp.pid(p), own);
  r := r || pg_temp.c('draft_batch_soft_deleted_stamped', (SELECT deleted_at IS NOT NULL AND deleted_by = own AND deletion_reason LIKE 'Crew agent%' AND status = 'draft' FROM public.payment_batches WHERE id = bat1));

  -- ===== payroll runs: note/name of a draft only =====
  SELECT id INTO paid_run FROM public.payroll_runs WHERE status = 'paid' LIMIT 1;
  INSERT INTO public.payroll_runs (period, company_id) SELECT '2031-01', company_id FROM public.payroll_runs LIMIT 1 RETURNING id INTO draft_run;
  p := pg_temp.prop(cfo, 'app.create', '{"source":"payroll_runs","values":{"notes":"x"}}');
  r := r || pg_temp.c('payroll_create_not_supported', p LIKE 'ERR:%does not support%');
  p := pg_temp.prop(cfo, 'app.soft_delete', jsonb_build_object('source', 'payroll_runs', 'record_id', draft_run));
  r := r || pg_temp.c('payroll_delete_not_supported', p LIKE 'ERR:%does not support%');
  FOREACH d IN ARRAY ARRAY['status', 'total_burn_ngn', 'approved_by', 'paid_at', 'pay_date', 'scheduled_disburse_at', 'total_employee_ngn'] LOOP
    p := pg_temp.prop(cfo, 'app.update', jsonb_build_object('source', 'payroll_runs', 'record_id', draft_run, 'values', jsonb_build_object(d, 'x')));
    r := r || pg_temp.c('refuse_payroll_' || d, p LIKE 'ERR:%cannot be written%');
  END LOOP;
  p := pg_temp.prop(cfo, 'app.update', jsonb_build_object('source', 'payroll_runs', 'record_id', paid_run, 'values', '{"notes":"x"}'::jsonb));
  r := r || pg_temp.c('paid_run_not_editable', paid_run IS NOT NULL AND p LIKE 'ERR:no editable record%');
  p := pg_temp.prop(cfo, 'app.update', jsonb_build_object('source', 'payroll_runs', 'record_id', draft_run, 'values', '{"notes":"check the overtime lines","custom_name":"Jan 2031 run"}'::jsonb));
  d := pg_temp.dec(pg_temp.pid(p), own);
  r := r || pg_temp.c('draft_run_note_updated_status_unchanged', (SELECT notes = 'check the overtime lines' AND status = 'draft' AND paid_at IS NULL FROM public.payroll_runs WHERE id = draft_run));

  -- ===== tasks (Head of Operations only) =====
  p := pg_temp.prop(ops, 'app.create', jsonb_build_object('source', 'tasks', 'values', jsonb_build_object('list_id', lst, 'title', 'ZZ follow up the vendor', 'priority', 'high')));
  d := pg_temp.dec(pg_temp.pid(p), own);
  SELECT id INTO tsk1 FROM public.tm_tasks WHERE title = 'ZZ follow up the vendor';
  r := r || pg_temp.c('task_created_by_ops', (SELECT status = 'to_do' AND created_by = own FROM public.tm_tasks WHERE id = tsk1));
  p := pg_temp.prop(ops, 'app.update', jsonb_build_object('source', 'tasks', 'record_id', tsk1, 'values', '{"status":"done"}'::jsonb));
  r := r || pg_temp.c('refuse_task_done', p LIKE 'ERR:%must be one of%');
  p := pg_temp.prop(ops, 'app.update', jsonb_build_object('source', 'tasks', 'record_id', tsk1, 'values', '{"status":"in_progress"}'::jsonb));
  d := pg_temp.dec(pg_temp.pid(p), own);
  r := r || pg_temp.c('task_updated', (SELECT status = 'in_progress' FROM public.tm_tasks WHERE id = tsk1));
  p := pg_temp.prop(ops, 'app.soft_delete', jsonb_build_object('source', 'tasks', 'record_id', tsk1));
  r := r || pg_temp.c('task_no_delete', p LIKE 'ERR:%does not support%');
  p := pg_temp.prop(ops, 'app.create', '{"source":"subscriptions","values":{"name":"x","amount_ngn":1}}');
  r := r || pg_temp.c('ops_cannot_write_subscriptions', p LIKE 'ERR:%may not write%' OR p LIKE 'ERR:%unknown source%');
  p := pg_temp.prop(cfo, 'app.create', jsonb_build_object('source', 'tasks', 'values', jsonb_build_object('list_id', lst, 'title', 'x')));
  r := r || pg_temp.c('cfo_cannot_write_tasks', p LIKE 'ERR:%may not write%' OR p LIKE 'ERR:%unknown source%');
  -- direct insert (as if the gateway were bypassed) is still checked by the trigger
  BEGIN
    INSERT INTO public.crew_proposals (agent_id, action, summary, payload) VALUES (mkt, 'app.create', 'x', '{"source":"clients","values":{"name":"Q"}}');
    r := r || 'FAIL direct_insert_by_marketing_accepted' || E'\n';
  EXCEPTION WHEN OTHERS THEN r := r || pg_temp.c('direct_insert_by_marketing_refused', SQLERRM LIKE '%may not write%'); END;
  BEGIN
    INSERT INTO public.crew_proposals (agent_id, action, summary, payload, risk, status, requires_approver) VALUES (cfo, 'app.create', 'x', '{"source":"clients","values":{"name":"Direct Insert Co"}}', 'low', 'approved', 'manager_or_owner');
    r := r || pg_temp.c('direct_insert_forced_pending_owner', (SELECT status = 'pending' AND requires_approver = 'owner' AND risk = 'medium' FROM public.crew_proposals WHERE summary = 'x' AND payload ->> 'source' = 'clients' ORDER BY created_at DESC LIMIT 1));
  END;
  r := r || pg_temp.c('no_client_written_without_approval', NOT EXISTS (SELECT 1 FROM public.clients WHERE name = 'Direct Insert Co'));

  -- ===== the grants =====
  r := r || pg_temp.c('execute_not_granted_to_public', NOT has_function_privilege('anon', 'public.crew_execute_app(uuid,uuid)', 'EXECUTE') AND NOT has_function_privilege('authenticated', 'public.crew_execute_app(uuid,uuid)', 'EXECUTE')
    AND NOT has_function_privilege('authenticated', 'public.crew_app_schema(uuid,text)', 'EXECUTE') AND NOT has_function_privilege('authenticated', 'public.crew_app_check_values(text,text,jsonb)', 'EXECUTE')
    AND has_function_privilege('service_role', 'public.crew_app_schema(uuid,text)', 'EXECUTE') AND has_function_privilege('authenticated', 'public.crew_app_preview(uuid)', 'EXECUTE') AND NOT has_function_privilege('anon', 'public.crew_app_preview(uuid)', 'EXECUTE'));
  BEGIN PERFORM public.crew_app_preview(pr); r := r || 'FAIL preview_open_to_non_owner' || E'\n';
  EXCEPTION WHEN OTHERS THEN r := r || pg_temp.c('preview_refuses_non_owner', SQLERRM LIKE '%only the owner%'); END;

  RAISE EXCEPTION 'TESTRESULT: %', E'\n' || r;
END $t$;
