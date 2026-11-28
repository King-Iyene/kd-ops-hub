-- Rolls back 20261472000000_crew_app_writes.sql. Agents lose app.create / app.update / app.soft_delete. Changes already applied to KDOps data stay (they were
-- approved by the owner and are in audit_logs as crew_app_change); app.* proposals that are still waiting are withdrawn; the old ones stay as history.
DROP TRIGGER IF EXISTS crew_check_app_proposal ON public.crew_proposals;
UPDATE public.crew_proposals SET status = 'withdrawn', decided_at = now() WHERE action LIKE 'app.%' AND status = 'pending';

-- back to the crew_decide of 20261460 (no app.% branch)
CREATE OR REPLACE FUNCTION public.crew_decide(p_proposal uuid, p_decision text, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'nc_meta', 'pg_temp'
AS $function$
DECLARE r public.crew_proposals; v_res jsonb; v_status text; v_err text;
BEGIN
  IF NOT public.crew_is_owner() THEN RAISE EXCEPTION 'only the owner can decide proposals'; END IF;
  IF p_decision NOT IN ('approve', 'reject') THEN RAISE EXCEPTION 'decision must be approve or reject'; END IF;
  SELECT * INTO r FROM public.crew_proposals WHERE id = p_proposal FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'no such proposal'; END IF;
  IF r.status NOT IN ('pending') THEN RAISE EXCEPTION 'this proposal is already %', r.status; END IF;

  IF p_decision = 'reject' THEN
    UPDATE public.crew_proposals SET status = 'rejected', decided_by = auth.uid(), decided_at = now(), decision_note = p_note WHERE id = p_proposal;
    IF r.ledger_key IS NOT NULL THEN UPDATE public.crew_ledger SET state = 'rejected', updated_at = now() WHERE key = r.ledger_key; END IF;
    INSERT INTO public.crew_notes (agent_id, kind, body, source, evidence)
    VALUES (r.agent_id, 'lesson', 'The owner REJECTED: ' || r.summary || CASE WHEN coalesce(p_note, '') <> '' THEN ' Reason: ' || p_note ELSE ' (no reason given: ask before proposing it again)' END,
            'proposal_outcome', jsonb_build_object('proposal', r.id, 'action', r.action));
    RETURN jsonb_build_object('status', 'rejected');
  END IF;

  IF r.action LIKE 'record.%' OR r.action LIKE 'agent.%' THEN
    BEGIN
      IF r.action LIKE 'agent.%' THEN v_res := public.crew_execute_agent(p_proposal, auth.uid());
      ELSE v_res := public.crew_execute(p_proposal, auth.uid()); END IF;
      v_status := 'executed';
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
      v_status := 'failed';
      v_res := '{}'::jsonb;
    END;
    UPDATE public.crew_proposals SET status = v_status, decided_by = auth.uid(), decided_at = now(), decision_note = p_note,
           executed_at = CASE WHEN v_status = 'executed' THEN now() END, result = coalesce(v_res, '{}'::jsonb), error = v_err WHERE id = p_proposal;
    IF r.ledger_key IS NOT NULL THEN
      IF v_status = 'executed' THEN UPDATE public.crew_ledger SET state = 'recorded', updated_at = now() WHERE key = r.ledger_key;
      ELSE DELETE FROM public.crew_ledger WHERE key = r.ledger_key AND state = 'proposed'; END IF;
    END IF;
    IF v_status = 'failed' AND r.action LIKE 'record.%' THEN
      INSERT INTO public.crew_mistakes (agent_id, kind, note, proposal_id) VALUES (r.agent_id, 'failed_proposal', left('An approved proposal could not run: ' || r.summary || ' (' || coalesce(v_err, 'no reason given') || ')', 1000), r.id);
    END IF;
    RETURN jsonb_build_object('status', v_status, 'result', v_res, 'error', v_err);
  ELSIF r.action LIKE 'advice.%' THEN
    IF r.action = 'advice.knowledge' THEN
      INSERT INTO public.crew_knowledge (topic, body, updated_by_agent) VALUES (left(r.payload ->> 'topic', 120), left(r.payload ->> 'body', 20000), r.agent_id)
      ON CONFLICT (topic) DO UPDATE SET body = excluded.body, updated_by_agent = excluded.updated_by_agent, updated_at = now();
    END IF;
    UPDATE public.crew_proposals SET status = 'executed', decided_by = auth.uid(), decided_at = now(), executed_at = now(), decision_note = p_note WHERE id = p_proposal;
    RETURN jsonb_build_object('status', 'executed');
  ELSE
    UPDATE public.crew_proposals SET status = 'approved', decided_by = auth.uid(), decided_at = now(), decision_note = p_note WHERE id = p_proposal;
    RETURN jsonb_build_object('status', 'approved');
  END IF;
END $function$;

DROP FUNCTION IF EXISTS public.crew_app_preview(uuid);
DROP FUNCTION IF EXISTS public.crew_execute_app(uuid, uuid);
DROP FUNCTION IF EXISTS public.crew_app_schema(uuid, text);
DROP FUNCTION IF EXISTS public.crew_check_app_proposal();
DROP FUNCTION IF EXISTS public.crew_app_check_duplicate(text, jsonb, uuid);
DROP FUNCTION IF EXISTS public.crew_app_check_values(text, text, jsonb);
DROP FUNCTION IF EXISTS public.crew_app_live_sql(jsonb);
DROP TABLE IF EXISTS public.crew_app_write_sources;

-- the old action list; NOT VALID so the app.* proposals already in the history do not block it
ALTER TABLE public.crew_proposals DROP CONSTRAINT IF EXISTS crew_proposals_action_check;
ALTER TABLE public.crew_proposals ADD CONSTRAINT crew_proposals_action_check CHECK (action ~ '^(record\.(create|update|soft_delete)|draft\.(batch_payment|payroll_run|invoice|filing)|advice\.[a-z_]+|agent\.(retire|hire)|external\.(github|vercel|supabase|other)|drive\.(create|update|trash))$') NOT VALID;

UPDATE public.crew_agent_private SET allowed_actions = ARRAY(SELECT x FROM unnest(allowed_actions) x WHERE x NOT IN ('app.create', 'app.update', 'app.soft_delete')) WHERE allowed_actions && ARRAY['app.create', 'app.update', 'app.soft_delete'];
UPDATE public.crew_agent_private SET instructions = regexp_replace(instructions, E'\n\nCHANGING KDOPS DATA[^\n]*', '') WHERE instructions LIKE '%CHANGING KDOPS DATA%';
