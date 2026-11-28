-- Hiring and firing the AI executives, always with the owner's approval.
--
--   * A MISTAKES LOG: a manager (or the owner) records a mistake against someone below them; a proposal that was approved and then failed
--     records one automatically. Counted over the last 30 days.
--   * A manager can PROPOSE letting a direct or indirect report go (agent.retire), but only with 3 or more logged mistakes in 30 days, and can
--     propose a replacement (agent.hire). Both wait in the owner's approval queue like any other proposal, with the mistakes attached as evidence
--     that the database writes itself (the agent cannot make it up).
--   * On approval the database carries it out: a retired executive is switched off, its keys revoked, its waiting proposals withdrawn, its own
--     reports moved to its manager. A hired executive inherits the job (brief, rules, permissions) of the one it replaces, under a new name, with
--     no history and no key until the owner issues one.
--   * The owner can also retire someone directly and log a mistake himself. Nobody is ever deleted: they are switched off and logged.

-- 1. what a proposal may be -------------------------------------------------------------------------------------------------------------
ALTER TABLE public.crew_proposals DROP CONSTRAINT IF EXISTS crew_proposals_action_check;
ALTER TABLE public.crew_proposals ADD CONSTRAINT crew_proposals_action_check
  CHECK (action ~ '^(record\.(create|update|soft_delete)|draft\.(batch_payment|payroll_run|invoice|filing)|advice\.[a-z_]+|agent\.(retire|hire)|external\.(github|vercel|supabase|other))$');

-- 2. the log of changes, and the mistakes -------------------------------------------------------------------------------------------------
ALTER TABLE public.crew_agents ADD COLUMN IF NOT EXISTS retired_at timestamptz;
ALTER TABLE public.crew_agents ADD COLUMN IF NOT EXISTS retired_reason text;

CREATE TABLE IF NOT EXISTS public.crew_mistakes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES public.crew_agents(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('wrong_proposal', 'duplicate', 'wrong_numbers', 'missed_deadline', 'ignored_order', 'failed_proposal', 'other')),
  note text NOT NULL CHECK (char_length(note) BETWEEN 3 AND 1000),
  reported_by_agent uuid REFERENCES public.crew_agents(id) ON DELETE SET NULL,
  reported_by_profile uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  proposal_id uuid REFERENCES public.crew_proposals(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS crew_mistakes_agent_idx ON public.crew_mistakes (agent_id, created_at DESC);
ALTER TABLE public.crew_mistakes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS crew_mistakes_owner ON public.crew_mistakes;
CREATE POLICY crew_mistakes_owner ON public.crew_mistakes FOR SELECT TO authenticated USING (public.crew_is_owner());
GRANT SELECT ON public.crew_mistakes TO authenticated;
GRANT ALL ON public.crew_mistakes TO service_role;

CREATE TABLE IF NOT EXISTS public.crew_staff_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('hired', 'retired')),
  agent_id uuid NOT NULL REFERENCES public.crew_agents(id) ON DELETE CASCADE,
  by_profile uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  proposal_id uuid REFERENCES public.crew_proposals(id) ON DELETE SET NULL,
  reason text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.crew_staff_changes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS crew_staff_changes_owner ON public.crew_staff_changes;
CREATE POLICY crew_staff_changes_owner ON public.crew_staff_changes FOR SELECT TO authenticated USING (public.crew_is_owner());
GRANT SELECT ON public.crew_staff_changes TO authenticated;
GRANT ALL ON public.crew_staff_changes TO service_role;

-- 3. who is whose boss ----------------------------------------------------------------------------------------------------------------------
-- true when p_boss is somewhere above p_target in the chain of reports_to (a boss of a boss counts)
CREATE OR REPLACE FUNCTION public.crew_is_boss_of(p_boss uuid, p_target uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH RECURSIVE up AS (
    SELECT reports_to AS id, 1 AS depth FROM public.crew_agents WHERE id = p_target
    UNION ALL
    SELECT a.reports_to, up.depth + 1 FROM public.crew_agents a JOIN up ON a.id = up.id WHERE up.id IS NOT NULL AND up.depth < 8
  )
  SELECT EXISTS (SELECT 1 FROM up WHERE id = p_boss)
$$;

CREATE OR REPLACE FUNCTION public.crew_mistake_count(p_target uuid, p_days integer DEFAULT 30) RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT count(*)::integer FROM public.crew_mistakes WHERE agent_id = p_target AND created_at > now() - make_interval(days => p_days)
$$;

-- 4. logging mistakes -------------------------------------------------------------------------------------------------------------------------
-- by a manager (through the gateway): only against someone below them, at most 20 a day each
CREATE OR REPLACE FUNCTION public.crew_report_mistake(p_agent uuid, p_target uuid, p_kind text, p_note text, p_proposal uuid DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_id uuid; v_today integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.crew_agents WHERE id = p_agent AND active) THEN RAISE EXCEPTION 'unknown or inactive agent'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.crew_agents WHERE id = p_target AND active) THEN RAISE EXCEPTION 'that person is not on the team'; END IF;
  IF NOT public.crew_is_boss_of(p_agent, p_target) THEN RAISE EXCEPTION 'you can only log mistakes for people who report to you (directly or through someone you manage)'; END IF;
  SELECT count(*) INTO v_today FROM public.crew_mistakes WHERE reported_by_agent = p_agent AND created_at > now() - interval '1 day';
  IF v_today >= 20 THEN RAISE EXCEPTION 'you have logged 20 mistakes today; that is enough for one day'; END IF;
  INSERT INTO public.crew_mistakes (agent_id, kind, note, reported_by_agent, proposal_id) VALUES (p_target, p_kind, p_note, p_agent, p_proposal) RETURNING id INTO v_id;
  INSERT INTO public.crew_notes (agent_id, kind, body, source, evidence)
  VALUES (p_target, 'mistake', 'Your manager logged a mistake against you (' || p_kind || '): ' || p_note, 'owner_feedback', jsonb_build_object('mistake', v_id));
  RETURN v_id;
END $$;

-- by the owner, from the profile in the Office
CREATE OR REPLACE FUNCTION public.crew_log_mistake(p_target uuid, p_kind text, p_note text, p_proposal uuid DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT public.crew_is_owner() THEN RAISE EXCEPTION 'only the owner can log a mistake from here'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.crew_agents WHERE id = p_target AND active) THEN RAISE EXCEPTION 'that person is not on the team'; END IF;
  INSERT INTO public.crew_mistakes (agent_id, kind, note, reported_by_profile, proposal_id) VALUES (p_target, p_kind, p_note, auth.uid(), p_proposal) RETURNING id INTO v_id;
  INSERT INTO public.crew_notes (agent_id, kind, body, source, evidence)
  VALUES (p_target, 'mistake', 'The owner logged a mistake against you (' || p_kind || '): ' || p_note, 'owner_feedback', jsonb_build_object('mistake', v_id));
  RETURN v_id;
END $$;

-- what a manager sees of the people below them: who has how many mistakes in the last 30 days, and the latest few
CREATE OR REPLACE FUNCTION public.crew_team_mistakes(p_agent uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.mistakes_30_days DESC, x.name), '[]'::jsonb) FROM (
    SELECT a.slug, a.name, a.title, public.crew_mistake_count(a.id, 30) AS mistakes_30_days,
           (SELECT COALESCE(jsonb_agg(jsonb_build_object('kind', m.kind, 'note', m.note, 'at', m.created_at) ORDER BY m.created_at DESC), '[]'::jsonb)
              FROM (SELECT * FROM public.crew_mistakes WHERE agent_id = a.id ORDER BY created_at DESC LIMIT 3) m) AS latest
      FROM public.crew_agents a WHERE a.active AND a.id <> p_agent AND public.crew_is_boss_of(p_agent, a.id)
  ) x
$$;

-- an approved proposal that then failed to run is a mistake of whoever made it (the executor below records it)

-- 5. carrying it out --------------------------------------------------------------------------------------------------------------------------
-- switch someone off. Internal: called only after approval (or by the owner).
CREATE OR REPLACE FUNCTION public.crew_retire_now(p_target uuid, p_reason text, p_by uuid, p_proposal uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE a public.crew_agents; v_moved integer; v_withdrawn integer;
BEGIN
  SELECT * INTO a FROM public.crew_agents WHERE id = p_target FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'no such person'; END IF;
  IF NOT a.active THEN RAISE EXCEPTION '% has already left', a.name; END IF;
  UPDATE public.crew_agents SET active = false, status = 'offline', activity = '', retired_at = now(), retired_reason = left(coalesce(p_reason, ''), 1000), updated_at = now() WHERE id = p_target;
  UPDATE public.crew_agent_tokens SET revoked_at = now() WHERE agent_id = p_target AND revoked_at IS NULL;
  UPDATE public.crew_proposals SET status = 'withdrawn' WHERE agent_id = p_target AND status = 'pending' AND id IS DISTINCT FROM p_proposal;
  GET DIAGNOSTICS v_withdrawn = ROW_COUNT;
  UPDATE public.crew_agents SET reports_to = a.reports_to WHERE reports_to = p_target AND active;
  GET DIAGNOSTICS v_moved = ROW_COUNT;
  INSERT INTO public.crew_staff_changes (kind, agent_id, by_profile, proposal_id, reason) VALUES ('retired', p_target, p_by, p_proposal, left(coalesce(p_reason, ''), 1000));
  RETURN jsonb_build_object('retired', a.slug, 'reports_moved', v_moved, 'proposals_withdrawn', v_withdrawn);
END $$;

-- take on a new person. They inherit the job of the one they replace (or of a current holder of the same role): the brief, rules, permissions and
-- reading rights, under a new name, with no history, no scorecard and no key (the owner issues one).
CREATE OR REPLACE FUNCTION public.crew_hire_now(p_payload jsonb, p_by uuid, p_proposal uuid DEFAULT NULL, p_proposer uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_name text := btrim(coalesce(p_payload ->> 'name', '')); v_old public.crew_agents; v_tpl public.crew_agents; v_priv public.crew_agent_private;
  v_boss uuid; v_slug text; v_n integer := 1; v_id uuid; v_title text; v_role text := p_payload ->> 'role';
BEGIN
  IF char_length(v_name) < 2 OR char_length(v_name) > 60 OR v_name !~ '^[A-Za-z][A-Za-z .''-]+$' THEN RAISE EXCEPTION 'give the new person a proper English name (letters only)'; END IF;
  IF EXISTS (SELECT 1 FROM public.crew_agents WHERE lower(name) = lower(v_name)) THEN RAISE EXCEPTION 'someone is already called %', v_name; END IF;
  IF p_payload ? 'replaces' THEN
    SELECT * INTO v_old FROM public.crew_agents WHERE slug = p_payload ->> 'replaces';
    IF NOT FOUND THEN RAISE EXCEPTION 'nobody called % to replace', p_payload ->> 'replaces'; END IF;
    IF v_old.active THEN RAISE EXCEPTION '% is still on the team: let them go first', v_old.name; END IF;
    v_tpl := v_old;
  ELSE
    IF v_role IS NULL THEN RAISE EXCEPTION 'say which person this hire replaces, or which role it is'; END IF;
    SELECT * INTO v_tpl FROM public.crew_agents WHERE role = v_role AND active ORDER BY created_at DESC LIMIT 1;
    IF NOT FOUND THEN RAISE EXCEPTION 'there is no brief on file for the role "%": name the person this hire replaces instead', v_role; END IF;
  END IF;
  SELECT * INTO v_priv FROM public.crew_agent_private WHERE agent_id = v_tpl.id;
  IF v_priv.agent_id IS NULL THEN RAISE EXCEPTION 'there is no brief to copy for that job'; END IF;
  -- the boss: the one named, else the replaced person's manager if still here, else whoever asked
  IF p_payload ? 'reports_to' THEN SELECT id INTO v_boss FROM public.crew_agents WHERE slug = p_payload ->> 'reports_to' AND active; END IF;
  IF v_boss IS NULL THEN SELECT id INTO v_boss FROM public.crew_agents WHERE id = v_tpl.reports_to AND active; END IF;
  IF v_boss IS NULL THEN v_boss := p_proposer; END IF;
  v_title := coalesce(nullif(btrim(p_payload ->> 'title'), ''), v_tpl.title);
  v_slug := left(regexp_replace(v_tpl.slug, '_[0-9]+$', ''), 26);
  WHILE EXISTS (SELECT 1 FROM public.crew_agents WHERE slug = v_slug || '_' || (v_n + 1)) LOOP v_n := v_n + 1; END LOOP;
  v_slug := v_slug || '_' || (v_n + 1);
  INSERT INTO public.crew_agents (slug, name, title, role, department, company, reports_to, status, avatar, color, active)
  VALUES (v_slug, v_name, left(v_title, 120), v_tpl.role, v_tpl.department, v_tpl.company, v_boss, 'offline', '{}'::jsonb, v_tpl.color, true) RETURNING id INTO v_id;
  INSERT INTO public.crew_agent_private (agent_id, persona, instructions, notes, scorecard, model, advisor_model, allowed_actions, allowed_read_bases, allowed_write_bases, max_pending, max_runs_per_day, allowed_sources)
  VALUES (v_id, v_priv.persona, v_priv.instructions, '', '{}'::jsonb, v_priv.model, v_priv.advisor_model, v_priv.allowed_actions, v_priv.allowed_read_bases, v_priv.allowed_write_bases, v_priv.max_pending, v_priv.max_runs_per_day, v_priv.allowed_sources);
  INSERT INTO public.crew_staff_changes (kind, agent_id, by_profile, proposal_id, reason) VALUES ('hired', v_id, p_by, p_proposal, 'Takes over from ' || coalesce(v_tpl.name, 'the same role'));
  RETURN jsonb_build_object('hired', v_slug, 'agent_id', v_id, 'name', v_name, 'note', 'No key yet: issue one in Crew > Team before they can run.');
END $$;

-- the executor for the agent.* actions
CREATE OR REPLACE FUNCTION public.crew_execute_agent(p_proposal uuid, p_by uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE r public.crew_proposals; v_target uuid;
BEGIN
  SELECT * INTO r FROM public.crew_proposals WHERE id = p_proposal;
  IF r.action = 'agent.retire' THEN
    SELECT id INTO v_target FROM public.crew_agents WHERE slug = r.payload ->> 'agent';
    IF v_target IS NULL THEN RAISE EXCEPTION 'nobody called %', r.payload ->> 'agent'; END IF;
    RETURN public.crew_retire_now(v_target, coalesce(r.payload ->> 'reason', r.summary), p_by, p_proposal);
  ELSIF r.action = 'agent.hire' THEN
    RETURN public.crew_hire_now(r.payload, p_by, p_proposal, r.agent_id);
  END IF;
  RAISE EXCEPTION 'not an agent action';
END $$;

-- the owner lets someone go directly (no proposal needed: it is his call)
CREATE OR REPLACE FUNCTION public.crew_retire_agent(p_agent uuid, p_reason text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.crew_is_owner() THEN RAISE EXCEPTION 'only the owner can let an executive go'; END IF;
  RETURN public.crew_retire_now(p_agent, coalesce(nullif(btrim(p_reason), ''), 'Let go by the owner'), auth.uid(), NULL);
END $$;

-- 6. proposing and deciding ------------------------------------------------------------------------------------------------------------------
-- crew_propose: the same as before, plus the checks for agent.retire and agent.hire (marked "NEW")
CREATE OR REPLACE FUNCTION public.crew_propose(p_agent uuid, p_action text, p_table uuid, p_summary text, p_rationale text, p_payload jsonb, p_evidence jsonb DEFAULT '{}'::jsonb, p_risk text DEFAULT 'medium'::text, p_dedupe text DEFAULT NULL::text, p_ledger_key text DEFAULT NULL::text, p_order uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'nc_meta', 'pg_temp'
AS $function$
DECLARE perm public.crew_agent_private; v_base uuid; v_id uuid; v_pending integer; v_agent public.crew_agents; v_req text := 'owner'; v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_tgt public.crew_agents; v_cnt integer; v_boss public.crew_agents; v_old public.crew_agents;
BEGIN
  SELECT * INTO perm FROM public.crew_agent_perms(p_agent);
  IF perm.agent_id IS NULL THEN RAISE EXCEPTION 'unknown or inactive agent'; END IF;
  SELECT * INTO v_agent FROM public.crew_agents WHERE id = p_agent;
  IF NOT (p_action = ANY (perm.allowed_actions)) THEN RAISE EXCEPTION 'this agent may not propose "%"', p_action; END IF;
  IF p_risk NOT IN ('low', 'medium', 'high') THEN RAISE EXCEPTION 'risk must be low, medium or high'; END IF;
  SELECT count(*) INTO v_pending FROM public.crew_proposals WHERE agent_id = p_agent AND status = 'pending';
  IF v_pending >= perm.max_pending THEN RAISE EXCEPTION 'too many proposals are waiting for approval (%): wait for the owner to decide', v_pending; END IF;

  IF p_action LIKE 'record.%' THEN
    IF p_table IS NULL THEN RAISE EXCEPTION 'a record action needs a table'; END IF;
    v_base := public.crew_check_table_access(perm, p_table, true);
    IF p_action = 'record.create' THEN PERFORM public.crew_row_from_values(p_table, v_payload -> 'values');
    ELSIF p_action = 'record.update' THEN
      IF NOT (v_payload ? 'record_id') THEN RAISE EXCEPTION 'record.update needs record_id'; END IF;
      PERFORM public.crew_row_from_values(p_table, v_payload -> 'values');
    ELSIF NOT (v_payload ? 'record_id') THEN RAISE EXCEPTION 'record.soft_delete needs record_id'; END IF;
    IF p_action = 'record.soft_delete' AND p_risk = 'low' THEN p_risk := 'medium'; END IF;   -- deleting is never "low"
  ELSIF p_table IS NOT NULL THEN
    v_base := public.crew_check_table_access(perm, p_table, false);
  END IF;

  -- the company brain only takes a topic and a body
  IF p_action = 'advice.knowledge' AND (jsonb_typeof(v_payload -> 'topic') IS DISTINCT FROM 'string' OR jsonb_typeof(v_payload -> 'body') IS DISTINCT FROM 'string') THEN
    RAISE EXCEPTION 'advice.knowledge needs payload {topic, body}';
  END IF;

  -- NEW: letting someone go. Only their boss, only for someone still here, and only with 3 logged mistakes in 30 days. The evidence is written by the
  -- database from the mistakes log, so it cannot be invented. Always high risk, always the owner.
  IF p_action = 'agent.retire' THEN
    IF jsonb_typeof(v_payload -> 'agent') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'agent.retire needs payload {agent: <slug>, reason}'; END IF;
    SELECT * INTO v_tgt FROM public.crew_agents WHERE slug = v_payload ->> 'agent' AND active;
    IF NOT FOUND THEN RAISE EXCEPTION 'nobody on the team is called %', v_payload ->> 'agent'; END IF;
    IF NOT public.crew_is_boss_of(p_agent, v_tgt.id) THEN RAISE EXCEPTION 'you can only propose letting go someone who reports to you (directly or through someone you manage)'; END IF;
    v_cnt := public.crew_mistake_count(v_tgt.id, 30);
    IF v_cnt < 3 THEN RAISE EXCEPTION '% has % logged mistake(s) in the last 30 days: it takes at least 3 to propose letting someone go. Log each mistake as it happens.', v_tgt.name, v_cnt; END IF;
    IF EXISTS (SELECT 1 FROM public.crew_proposals WHERE action = 'agent.retire' AND status = 'pending' AND payload ->> 'agent' = v_payload ->> 'agent') THEN RAISE EXCEPTION 'that is already waiting for the owner'; END IF;
    p_risk := 'high';
    p_evidence := jsonb_build_object('person', v_tgt.name, 'title', v_tgt.title, 'mistakes_30_days', v_cnt,
      'mistakes', (SELECT coalesce(jsonb_agg(jsonb_build_object('kind', m.kind, 'note', m.note, 'at', m.created_at) ORDER BY m.created_at DESC), '[]'::jsonb)
                     FROM (SELECT * FROM public.crew_mistakes WHERE agent_id = v_tgt.id AND created_at > now() - interval '30 days' ORDER BY created_at DESC LIMIT 10) m));
  END IF;
  -- NEW: taking someone on. They must replace a person who has already left (and who reported to the proposer or below), or fill a role under the proposer.
  IF p_action = 'agent.hire' THEN
    IF jsonb_typeof(v_payload -> 'name') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'agent.hire needs payload {name, replaces: <slug of the person who left>} (or {name, role, reports_to})'; END IF;
    IF v_payload ? 'replaces' THEN
      SELECT * INTO v_old FROM public.crew_agents WHERE slug = v_payload ->> 'replaces';
      IF NOT FOUND THEN RAISE EXCEPTION 'nobody called % to replace', v_payload ->> 'replaces'; END IF;
      IF NOT public.crew_is_boss_of(p_agent, v_old.id) THEN RAISE EXCEPTION 'you can only replace someone who reported to you (directly or through someone you manage)'; END IF;
    ELSE
      IF jsonb_typeof(v_payload -> 'role') IS DISTINCT FROM 'string' OR jsonb_typeof(v_payload -> 'reports_to') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'a new role needs payload {name, role, reports_to}'; END IF;
      SELECT * INTO v_boss FROM public.crew_agents WHERE slug = v_payload ->> 'reports_to' AND active;
      IF NOT FOUND THEN RAISE EXCEPTION 'nobody on the team is called %', v_payload ->> 'reports_to'; END IF;
      IF v_boss.id <> p_agent AND NOT public.crew_is_boss_of(p_agent, v_boss.id) THEN RAISE EXCEPTION 'the new person must report to you or to someone who reports to you'; END IF;
    END IF;
    IF EXISTS (SELECT 1 FROM public.crew_agents WHERE lower(name) = lower(btrim(v_payload ->> 'name'))) THEN RAISE EXCEPTION 'someone is already called %', v_payload ->> 'name'; END IF;
    p_risk := 'medium';
  END IF;

  -- A technical agent's low-risk external change may be released by the CFO's go-ahead; everything else needs the owner.
  IF p_action LIKE 'external.%' AND p_risk = 'low' AND v_agent.role = 'engineering_head' THEN v_req := 'manager_or_owner'; END IF;

  IF p_ledger_key IS NOT NULL THEN
    INSERT INTO public.crew_ledger (key, agent_id) VALUES (p_ledger_key, p_agent) ON CONFLICT (key) DO NOTHING;
    IF NOT FOUND THEN RAISE EXCEPTION 'duplicate: "%" was already handled (see the ledger)', p_ledger_key USING ERRCODE = '23505'; END IF;
  END IF;

  INSERT INTO public.crew_proposals (agent_id, action, base_id, table_id, summary, rationale, evidence, payload, risk, requires_approver, dedupe_key, ledger_key, order_id)
  VALUES (p_agent, p_action, v_base, p_table, p_summary, coalesce(p_rationale, ''), coalesce(p_evidence, '{}'::jsonb), v_payload, p_risk, v_req, p_dedupe, p_ledger_key, p_order)
  RETURNING id INTO v_id;
  IF p_ledger_key IS NOT NULL THEN UPDATE public.crew_ledger SET proposal_id = v_id, updated_at = now() WHERE key = p_ledger_key; END IF;
  RETURN v_id;
END $function$;

-- crew_decide: the same as before, plus the agent.* actions are carried out on approval (marked "NEW"), and an approved record change that fails to run is logged as a mistake
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

  IF r.action LIKE 'record.%' OR r.action LIKE 'agent.%' THEN   -- NEW: agent.% too
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
      ELSE DELETE FROM public.crew_ledger WHERE key = r.ledger_key AND state = 'proposed'; END IF;   -- failed: free the key so it can be proposed again
    END IF;
    -- NEW: an approved record change that could not run is logged against whoever made it
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
  ELSE   -- external.* and draft.*: approved means "go ahead"; the owner (or Claude on his say-so) carries it out and marks it done
    UPDATE public.crew_proposals SET status = 'approved', decided_by = auth.uid(), decided_at = now(), decision_note = p_note WHERE id = p_proposal;
    RETURN jsonb_build_object('status', 'approved');
  END IF;
END $function$;

-- 7. who may call what -----------------------------------------------------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.crew_is_boss_of(uuid, uuid), public.crew_mistake_count(uuid, integer), public.crew_report_mistake(uuid, uuid, text, text, uuid),
  public.crew_team_mistakes(uuid), public.crew_retire_now(uuid, text, uuid, uuid), public.crew_hire_now(jsonb, uuid, uuid, uuid), public.crew_execute_agent(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crew_is_boss_of(uuid, uuid), public.crew_mistake_count(uuid, integer), public.crew_report_mistake(uuid, uuid, text, text, uuid), public.crew_team_mistakes(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.crew_log_mistake(uuid, text, text, uuid), public.crew_retire_agent(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crew_log_mistake(uuid, text, text, uuid), public.crew_retire_agent(uuid, text) TO authenticated;

-- 8. who may propose it, and what everybody is told ------------------------------------------------------------------------------------------------
-- the people who have people reporting to them (the CFO, the Head of Finance and the Head of Operations today) may propose letting a report go and a replacement
UPDATE public.crew_agent_private p SET allowed_actions = (SELECT array_agg(DISTINCT x) FROM unnest(p.allowed_actions || ARRAY['agent.retire', 'agent.hire']) x)
WHERE p.agent_id IN (SELECT DISTINCT reports_to FROM public.crew_agents WHERE reports_to IS NOT NULL AND active);

UPDATE public.crew_agent_private p SET instructions = p.instructions || E'\n\nACCOUNTABILITY (everyone): there is no room for mistakes here. Check your numbers and your evidence before you propose anything. A wrong, duplicate or late piece of work is logged against you by your manager. Three logged mistakes in 30 days and your manager may propose letting you go and bringing in someone else; the owner decides. Own your errors the moment you see them: tell your manager and note the lesson.'
WHERE p.instructions NOT LIKE '%ACCOUNTABILITY (everyone)%';

UPDATE public.crew_agent_private p SET instructions = p.instructions || E'\n\nYOUR PEOPLE (managers): you are responsible for the quality of everyone who reports to you, directly or through someone you manage. {"op":"team"} shows them with their slugs. When one makes a mistake, log it at once: {"op":"mistake","agent":"<slug>","kind":"wrong_proposal|duplicate|wrong_numbers|missed_deadline|ignored_order|other","note":"what was wrong, with the evidence","proposal_id":"<optional>"}. At the start of each weekly review, {"op":"mistakes"} shows the count for each person over 30 days. Be fair and exact: only log what you can show. If someone has 3 or more mistakes in 30 days, propose letting them go AND a replacement in the same run: {"op":"propose","action":"agent.retire","summary":"...","rationale":"...","payload":{"agent":"<slug>","reason":"..."}}, then (the person must have left first, so the replacement waits for the owner to approve the first) message the owner that you will propose a replacement with a good English name as soon as it is approved: {"op":"propose","action":"agent.hire","summary":"...","payload":{"name":"<First Last>","replaces":"<slug of the person who left>"}}. The database refuses a proposal with fewer than 3 logged mistakes. A replacement takes over the same job and rules, with no history. Never threaten anyone in a message; keep it factual.'
WHERE p.agent_id IN (SELECT DISTINCT reports_to FROM public.crew_agents WHERE reports_to IS NOT NULL AND active) AND p.instructions NOT LIKE '%YOUR PEOPLE (managers)%';
