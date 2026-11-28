-- Crew app-data access: allowed sources only, no bank details or account numbers, filters and limits, arbitrary relations refused, brief table list.
-- Run AFTER migration 20261457000000; ends with a deliberate exception starting TESTRESULT: and rolls back.

DO $t$
DECLARE o text := ''; r jsonb; cfo uuid; ctrl uuid; trs uuid; eng uuid; mkt uuid; ndi uuid; n int; k text; bad text := ''; tbl uuid; direct int;
BEGIN
  SELECT id INTO cfo FROM public.crew_agents WHERE slug='cfo'; SELECT id INTO ctrl FROM public.crew_agents WHERE slug='controller';
  SELECT id INTO trs FROM public.crew_agents WHERE slug='treasury'; SELECT id INTO eng FROM public.crew_agents WHERE slug='engineering_head';
  SELECT id INTO mkt FROM public.crew_agents WHERE slug='marketing_head'; SELECT id INTO ndi FROM public.crew_agents WHERE slug='ndi_head';
  o := 'cfo_sources='||jsonb_array_length(public.crew_list_sources(cfo))||' eng_sources='||jsonb_array_length(public.crew_list_sources(eng))||' mkt_sources='||jsonb_array_length(public.crew_list_sources(mkt))||'; ';
  -- expenses: all columns, no bank details in the answer
  r := public.crew_read_app(cfo,'expenses','[]'::jsonb,500);
  FOREACH k IN ARRAY ARRAY['account_number','bank_name','account_name','receipt_sha256','payload_hash_at_approval'] LOOP IF (r->'columns') ? k THEN bad := bad||k||','; END IF; END LOOP;
  SELECT count(*) INTO direct FROM public.expenses WHERE deleted_at IS NULL;
  o := o||'expenses_rows='||jsonb_array_length(r->'rows')||' direct_not_deleted='||least(direct,500)||' forbidden_columns_present=['||bad||']; ';
  -- a chosen subset of columns only
  r := public.crew_read_app(cfo,'expenses','[]'::jsonb,2,'date',true,ARRAY['id','amount_ngn','receipt_url']);
  o := o||'subset_keys='||(SELECT string_agg(key, ',' ORDER BY key) FROM jsonb_object_keys(coalesce(r->'rows'->0,'{}'::jsonb)) key)||'; ';
  -- payments: last 4 and a fingerprint, never the number
  bad := '';
  r := public.crew_read_app(trs,'payment_items','[]'::jsonb,5);
  FOREACH k IN ARRAY ARRAY['account_number','account_number_enc','paystack_raw','flutterwave_raw','paystack_recipient_code'] LOOP IF (r->'columns') ? k THEN bad := bad||k||','; END IF; END LOOP;
  o := o||'payment_items_rows='||jsonb_array_length(r->'rows')||' has_last4='||((r->'columns') ? 'account_last4')||' has_fingerprint='||((r->'columns') ? 'account_fingerprint')||' forbidden=['||bad||']; ';
  -- people: no pay, bank or ID
  bad := '';
  r := public.crew_read_app(cfo,'people','[]'::jsonb,5);
  FOREACH k IN ARRAY ARRAY['salary_ngn','bank_account_number','email','phone','nin','bvn_last4','date_of_birth'] LOOP IF (r->'columns') ? k THEN bad := bad||k||','; END IF; END LOOP;
  o := o||'people_rows='||jsonb_array_length(r->'rows')||' forbidden=['||bad||']; ';
  -- filters match a direct count
  r := public.crew_read_app(cfo,'fuel_requests','[{"field":"status","op":"eq","value":"payment_sent"}]'::jsonb,500);
  SELECT count(*) INTO direct FROM public.fuel_requests WHERE status='payment_sent' AND deleted_at IS NULL;
  o := o||'fuel_payment_sent='||jsonb_array_length(r->'rows')||' direct='||direct||'; ';
  r := public.crew_read_app(cfo,'fuel_requests','[{"field":"receipt_url","op":"is_null"},{"field":"payment_sent_at","op":"not_null"}]'::jsonb,500);
  o := o||'fuel_sent_no_receipt='||jsonb_array_length(r->'rows')||'; ';
  -- the walls
  BEGIN PERFORM public.crew_read_app(ctrl,'payment_items'); o := o||'FAIL controller read payments; '; EXCEPTION WHEN OTHERS THEN o := o||'ok controller cannot read payment_items; '; END;
  BEGIN PERFORM public.crew_read_app(eng,'expenses'); o := o||'FAIL engineering read expenses; '; EXCEPTION WHEN OTHERS THEN o := o||'ok engineering cannot read expenses; '; END;
  BEGIN PERFORM public.crew_read_app(mkt,'invoices'); o := o||'FAIL marketing read invoices; '; EXCEPTION WHEN OTHERS THEN o := o||'ok marketing cannot read invoices; '; END;
  BEGIN PERFORM public.crew_read_app(cfo,'expenses','[]'::jsonb,5,NULL,true,ARRAY['account_number']); o := o||'FAIL bank column selected; '; EXCEPTION WHEN OTHERS THEN o := o||'ok bank column refused; '; END;
  BEGIN PERFORM public.crew_read_app(cfo,'expenses','[{"field":"account_number","op":"eq","value":"1"}]'::jsonb); o := o||'FAIL bank column filtered; '; EXCEPTION WHEN OTHERS THEN o := o||'ok bank column filter refused; '; END;
  BEGIN PERFORM public.crew_read_app(cfo,'expenses','[{"field":"status","op":"drop table"}]'::jsonb); o := o||'FAIL bad op; '; EXCEPTION WHEN OTHERS THEN o := o||'ok bad op refused; '; END;
  BEGIN PERFORM public.crew_read_app(cfo,'pg_user'); o := o||'FAIL arbitrary relation; '; EXCEPTION WHEN OTHERS THEN o := o||'ok arbitrary relation refused; '; END;
  -- brief table list, one table in full
  r := public.crew_list_tables(ndi);
  o := o||'ndi_tables='||jsonb_array_length(r)||' brief_has_fields='||(r->0 ? 'fields')||' fields_count_present='||(r->0 ? 'fields_count')||'; ';
  tbl := (r->0->>'table_id')::uuid;
  r := public.crew_list_tables(ndi, NULL, tbl);
  o := o||'one_table_rows='||jsonb_array_length(r)||' has_fields='||(r->0 ? 'fields')||'; ';
  r := public.crew_list_tables(ndi, 'school');
  o := o||'search_school='||jsonb_array_length(r)||'; ';
  o := o||'instructions_have_tip='||(SELECT count(*) FROM public.crew_agent_private WHERE instructions LIKE '%READING DATA CHEAPLY%')||'; ';
  RAISE EXCEPTION 'TESTRESULT: %', o;
END $t$;
