-- Run after the 20261466 migration inside one transaction; it ends in RAISE EXCEPTION 'TESTRESULT: ...' so nothing is kept.
DO $t$
DECLARE a uuid; r text := ''; ok boolean; id1 uuid; st text; rk text; ap text;
BEGIN
  SELECT id INTO a FROM public.crew_agents WHERE slug = 'cfo';
  -- allowed action present
  r := r || 'cfo_may_propose_drive=' || (SELECT 'drive.create' = ANY (allowed_actions) FROM public.crew_agent_private WHERE agent_id = a) || E'\n';
  -- a valid create goes in pending, medium, owner
  INSERT INTO public.crew_proposals (agent_id, action, summary, payload, risk, status, requires_approver)
    VALUES (a, 'drive.create', 't', '{"provider":"google_drive","title":"x","content":"y"}', 'low', 'approved', 'manager_or_owner') RETURNING id, status, risk, requires_approver INTO id1, st, rk, ap;
  r := r || 'create=' || st || '/' || rk || '/' || ap || E'\n';
  -- trash is always high
  INSERT INTO public.crew_proposals (agent_id, action, summary, payload, risk) VALUES (a, 'drive.trash', 't', '{"provider":"google_drive","file_id":"abc"}', 'low') RETURNING risk INTO rk;
  r := r || 'trash_risk=' || rk || E'\n';
  -- bad ones are refused
  BEGIN INSERT INTO public.crew_proposals (agent_id, action, summary, payload) VALUES (a, 'drive.create', 't', '{"provider":"zoho","title":"x","content":"y"}'); r := r || 'wrong_provider=ACCEPTED' || E'\n';
  EXCEPTION WHEN OTHERS THEN r := r || 'wrong_provider=refused' || E'\n'; END;
  BEGIN INSERT INTO public.crew_proposals (agent_id, action, summary, payload) VALUES (a, 'drive.trash', 't', '{"provider":"google_drive"}'); r := r || 'no_file=ACCEPTED' || E'\n';
  EXCEPTION WHEN OTHERS THEN r := r || 'no_file=refused' || E'\n'; END;
  -- an approved Drive action is collectable only once approved
  r := r || 'collectable_before=' || (SELECT count(*) FROM public.crew_my_approved(a) WHERE action LIKE 'drive.%') || E'\n';
  UPDATE public.crew_proposals SET status = 'approved' WHERE id = id1;
  r := r || 'collectable_after=' || (SELECT count(*) FROM public.crew_my_approved(a) WHERE action LIKE 'drive.%') || E'\n';
  PERFORM public.crew_report_done(a, id1, '{"ok":true}');
  r := r || 'after_done=' || (SELECT status FROM public.crew_proposals WHERE id = id1) || E'\n';
  -- team after the merge
  r := r || (SELECT string_agg(slug || ':' || title, '; ' ORDER BY slug) FROM public.crew_agents WHERE active);
  RAISE EXCEPTION 'TESTRESULT: %', r;
END $t$;
