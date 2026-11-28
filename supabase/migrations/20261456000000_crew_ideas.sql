-- Crew: the idea board, and a Head of People.
--
--   Agents see problems and chances in their own work (a job done by hand every day, a gap, friction). They file an IDEA for Engineering to build.
--   Before filing they look at the open ideas: a similar one is not duplicated, their support is added to it (so "Finance and NDI both need
--   this" becomes one idea with two departments behind it). Engineering triages: merges duplicates, ranks by support and impact, writes a short
--   spec and a rough estimate. The OWNER decides: approve, reject (with a reason the requesting agents learn from), mark building, mark shipped.
--   Nothing is built, and no GitHub, Vercel or Supabase change is made, without an approval in the queue. The owner can also add an idea himself,
--   which counts as approved.
--
-- Rollback: supabase/rollbacks/20261456_crew_ideas_down.sql

-- ── a Head of People (HR) joins the crew ────────────────────────────────────
DO $$
DECLARE c record;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint WHERE conrelid = 'public.crew_agents'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%ndi_head%' LOOP
    EXECUTE format('ALTER TABLE public.crew_agents DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;
ALTER TABLE public.crew_agents ADD CONSTRAINT crew_agents_role_check CHECK (role IN ('cfo', 'finance_head', 'accountant', 'treasury', 'payroll', 'revenue', 'fpa', 'ops_head', 'product_head', 'marketing_head', 'engineering_head', 'ndi_head', 'tasks_head', 'compliance_head', 'people_head'));

-- the Head of People may endorse proposals like the other heads (the function's role list is extended in place)
DO $$
DECLARE v_def text; v_new text;
BEGIN
  v_def := pg_get_functiondef('public.crew_endorse(uuid, uuid, text, text)'::regprocedure);
  v_new := replace(v_def, '''tasks_head'', ''compliance_head'') THEN RAISE EXCEPTION', '''tasks_head'', ''compliance_head'', ''people_head'') THEN RAISE EXCEPTION');
  IF v_new = v_def THEN RAISE EXCEPTION 'crew_endorse role list not found: cannot add people_head'; END IF;
  EXECUTE v_new;
END $$;

INSERT INTO public.crew_agents (slug, name, title, role, department, company, color)
VALUES ('people_head', 'Margaret Doyle', 'Head of People (HR)', 'people_head', 'People', 'All companies', '#e11d48')
ON CONFLICT (slug) DO NOTHING;
UPDATE public.crew_agents a SET reports_to = (SELECT id FROM public.crew_agents WHERE slug = 'cfo') WHERE a.slug = 'people_head' AND a.reports_to IS NULL;

INSERT INTO public.crew_agent_private (agent_id, persona, instructions, model, allowed_actions, allowed_read_bases, allowed_write_bases, max_pending, max_runs_per_day)
SELECT a.id,
  'Head of People. Fair, firm and practical: you look after the people so the company can rely on them, and you say so plainly when a person or a process is the problem.',
  (SELECT split_part(instructions, E'\nROLE:', 1) FROM public.crew_agent_private p JOIN public.crew_agents c ON c.id = p.agent_id WHERE c.slug = 'ops_head')
  || E'\nROLE: Head of People (HR). You own how people join, work, are rewarded, are looked after and leave: onboarding, leave, contracts and letters, policies, attendance, performance conversations, culture and the daily rhythm of the team (for example the morning huddle). You work with Operations (follow-through), Compliance and Tax (labour and pension rules), Payroll (pay) and the CFO. You never message an employee about pay, discipline or health yourself: you tell the CFO and the owner what you see, with the people involved and the evidence. When you see a repeated people job done by hand, file an idea for Engineering.',
  'claude-sonnet-5-5', ARRAY['advice.risk', 'advice.strategy', 'advice.knowledge'], '{}', '{}', 500, NULL
FROM public.crew_agents a WHERE a.slug = 'people_head'
ON CONFLICT (agent_id) DO NOTHING;

-- ── the idea board ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.crew_ideas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (char_length(title) BETWEEN 5 AND 160),
  problem text NOT NULL CHECK (char_length(problem) BETWEEN 10 AND 2000),
  proposal text NOT NULL DEFAULT '' CHECK (char_length(proposal) <= 2000),
  requested_by uuid REFERENCES public.crew_agents(id) ON DELETE SET NULL,   -- null = the owner
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  supporters jsonb NOT NULL DEFAULT '[]'::jsonb,      -- [{agent, department, note, at}]: everyone who needs it, the requester first
  departments text[] NOT NULL DEFAULT '{}',
  support_count integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'triaged', 'approved', 'building', 'shipped', 'rejected', 'merged')),
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  spec text NOT NULL DEFAULT '' CHECK (char_length(spec) <= 8000),
  estimate text NOT NULL DEFAULT '' CHECK (char_length(estimate) <= 300),
  merged_into uuid REFERENCES public.crew_ideas(id) ON DELETE SET NULL,
  owner_note text,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS crew_ideas_status_idx ON public.crew_ideas (status, support_count DESC, created_at DESC);

ALTER TABLE public.crew_ideas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS crew_ideas_owner ON public.crew_ideas;
CREATE POLICY crew_ideas_owner ON public.crew_ideas FOR SELECT TO authenticated USING (public.crew_is_owner());
REVOKE ALL ON public.crew_ideas FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.crew_ideas TO authenticated;
GRANT ALL ON public.crew_ideas TO service_role;

-- the words that carry the meaning of a sentence (4+ letters, no filler): used to spot an idea that already exists
CREATE OR REPLACE FUNCTION public.crew_words(p text)
RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
  SELECT coalesce(array_agg(DISTINCT w), '{}'::text[])
    FROM regexp_split_to_table(lower(coalesce(p, '')), '[^a-z0-9]+') AS w
   WHERE char_length(w) >= 4 AND w NOT IN ('that', 'this', 'with', 'from', 'have', 'will', 'they', 'when', 'than', 'then', 'your', 'also', 'into', 'each', 'every', 'should', 'could', 'would', 'need', 'needs', 'make', 'makes', 'done', 'does', 'over', 'such', 'more', 'most', 'some', 'what', 'which', 'there', 'their', 'them', 'were', 'been', 'being', 'about', 'after', 'before', 'because')
$$;

-- how alike two ideas are, 0 to 1 (shared meaningful words over all their meaningful words)
CREATE OR REPLACE FUNCTION public.crew_similarity(a text[], b text[])
RETURNS numeric LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
  SELECT CASE WHEN coalesce(cardinality(a), 0) = 0 OR coalesce(cardinality(b), 0) = 0 THEN 0
         ELSE (SELECT count(*) FROM unnest(a) x WHERE x = ANY (b))::numeric / (cardinality(a) + cardinality(b) - (SELECT count(*) FROM unnest(a) x WHERE x = ANY (b)))::numeric END
$$;

-- an agent files an idea; a similar open one gets its support instead of a duplicate
CREATE OR REPLACE FUNCTION public.crew_idea_submit(p_agent uuid, p_title text, p_problem text, p_proposal text DEFAULT '', p_evidence jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE a public.crew_agents; v_words text[]; r record; v_best uuid; v_sim numeric := 0; v_id uuid; v_n integer;
BEGIN
  SELECT * INTO a FROM public.crew_agents WHERE id = p_agent AND active;
  IF a.id IS NULL THEN RAISE EXCEPTION 'unknown or inactive agent'; END IF;
  SELECT count(*) INTO v_n FROM public.crew_ideas WHERE requested_by = p_agent AND created_at > now() - interval '1 day';
  IF v_n >= 5 THEN RAISE EXCEPTION 'you have filed 5 ideas today: support an existing one or wait until tomorrow'; END IF;
  v_words := public.crew_words(p_title || ' ' || p_title || ' ' || p_problem);
  -- alike when the whole texts share enough meaning, or when the TITLES do (a long problem text would otherwise hide a plainly identical request)
  FOR r IN SELECT id, greatest(public.crew_similarity(v_words, public.crew_words(title || ' ' || title || ' ' || problem)),
                               CASE WHEN public.crew_similarity(public.crew_words(p_title), public.crew_words(title)) >= 0.5 THEN public.crew_similarity(public.crew_words(p_title), public.crew_words(title)) ELSE 0 END) AS s
             FROM public.crew_ideas WHERE status IN ('open', 'triaged', 'approved', 'building') LOOP
    IF r.s > v_sim THEN v_sim := r.s; v_best := r.id; END IF;
  END LOOP;
  IF v_best IS NOT NULL AND v_sim >= 0.4 THEN
    RETURN public.crew_idea_support(p_agent, v_best, p_problem) || jsonb_build_object('created', false, 'similarity', round(v_sim, 2));
  END IF;
  INSERT INTO public.crew_ideas (title, problem, proposal, requested_by, evidence, supporters, departments)
  VALUES (p_title, p_problem, coalesce(p_proposal, ''), p_agent, coalesce(p_evidence, '{}'::jsonb),
          jsonb_build_array(jsonb_build_object('agent', p_agent, 'department', a.department, 'note', left(p_problem, 400), 'at', now())), ARRAY[a.department])
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('created', true, 'idea', v_id, 'support_count', 1);
END $$;

-- an agent adds its need to an existing idea (once per agent), with what it sees from its side
CREATE OR REPLACE FUNCTION public.crew_idea_support(p_agent uuid, p_idea uuid, p_note text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE a public.crew_agents; i public.crew_ideas;
BEGIN
  SELECT * INTO a FROM public.crew_agents WHERE id = p_agent AND active;
  IF a.id IS NULL THEN RAISE EXCEPTION 'unknown or inactive agent'; END IF;
  SELECT * INTO i FROM public.crew_ideas WHERE id = p_idea FOR UPDATE;
  IF NOT FOUND OR i.status IN ('rejected', 'merged', 'shipped') THEN RAISE EXCEPTION 'that idea is closed'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(i.supporters) s WHERE (s ->> 'agent')::uuid = p_agent) THEN
    RETURN jsonb_build_object('created', false, 'idea', p_idea, 'support_count', i.support_count, 'already', true);
  END IF;
  UPDATE public.crew_ideas SET
    supporters = supporters || jsonb_build_array(jsonb_build_object('agent', p_agent, 'department', a.department, 'note', left(coalesce(p_note, ''), 400), 'at', now())),
    departments = (SELECT array_agg(DISTINCT d) FROM unnest(departments || a.department) d),
    support_count = support_count + 1, updated_at = now()
   WHERE id = p_idea RETURNING * INTO i;
  RETURN jsonb_build_object('created', false, 'idea', p_idea, 'support_count', i.support_count, 'departments', to_jsonb(i.departments));
END $$;

CREATE OR REPLACE FUNCTION public.crew_idea_list(p_agent uuid, p_status text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.crew_agents WHERE id = p_agent AND active) THEN RAISE EXCEPTION 'unknown or inactive agent'; END IF;
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id', id, 'title', title, 'problem', left(problem, 400), 'proposal', left(proposal, 400), 'status', status, 'priority', priority,
      'support_count', support_count, 'departments', to_jsonb(departments), 'estimate', estimate, 'has_spec', spec <> '') ORDER BY support_count DESC, created_at DESC)
    FROM (SELECT * FROM public.crew_ideas WHERE (p_status IS NULL AND status IN ('open', 'triaged', 'approved', 'building')) OR status = p_status ORDER BY support_count DESC, created_at DESC LIMIT 60) q), '[]'::jsonb);
END $$;

-- Engineering only: rank, spec, estimate, and merge duplicates into one
CREATE OR REPLACE FUNCTION public.crew_idea_triage(p_agent uuid, p_idea uuid, p_priority text DEFAULT NULL, p_spec text DEFAULT NULL, p_estimate text DEFAULT NULL, p_merge_into uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE a public.crew_agents; i public.crew_ideas; t public.crew_ideas;
BEGIN
  SELECT * INTO a FROM public.crew_agents WHERE id = p_agent AND active;
  IF a.id IS NULL OR a.role <> 'engineering_head' THEN RAISE EXCEPTION 'only the Head of Engineering triages ideas'; END IF;
  IF p_priority IS NOT NULL AND p_priority NOT IN ('low', 'medium', 'high') THEN RAISE EXCEPTION 'priority must be low, medium or high'; END IF;
  SELECT * INTO i FROM public.crew_ideas WHERE id = p_idea FOR UPDATE;
  IF NOT FOUND OR i.status IN ('rejected', 'merged', 'shipped') THEN RAISE EXCEPTION 'that idea is closed'; END IF;
  IF p_merge_into IS NOT NULL THEN
    IF p_merge_into = p_idea THEN RAISE EXCEPTION 'cannot merge an idea into itself'; END IF;
    SELECT * INTO t FROM public.crew_ideas WHERE id = p_merge_into FOR UPDATE;
    IF NOT FOUND OR t.status IN ('rejected', 'merged', 'shipped') THEN RAISE EXCEPTION 'the idea to merge into is closed'; END IF;
    UPDATE public.crew_ideas SET
      supporters = supporters || (SELECT coalesce(jsonb_agg(s), '[]'::jsonb) FROM jsonb_array_elements(i.supporters) s WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(t.supporters) x WHERE x ->> 'agent' = s ->> 'agent')),
      departments = (SELECT array_agg(DISTINCT d) FROM unnest(t.departments || i.departments) d), updated_at = now()
     WHERE id = p_merge_into;
    UPDATE public.crew_ideas SET support_count = jsonb_array_length(supporters) WHERE id = p_merge_into;
    UPDATE public.crew_ideas SET status = 'merged', merged_into = p_merge_into, updated_at = now() WHERE id = p_idea;
    RETURN jsonb_build_object('merged_into', p_merge_into);
  END IF;
  UPDATE public.crew_ideas SET priority = coalesce(p_priority, priority), spec = coalesce(left(p_spec, 8000), spec), estimate = coalesce(left(p_estimate, 300), estimate),
         status = CASE WHEN status = 'open' THEN 'triaged' ELSE status END, updated_at = now() WHERE id = p_idea;
  RETURN jsonb_build_object('idea', p_idea, 'status', (SELECT status FROM public.crew_ideas WHERE id = p_idea));
END $$;

-- the owner's controls
CREATE OR REPLACE FUNCTION public.crew_idea_decide(p_idea uuid, p_decision text, p_note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE i public.crew_ideas; v_eng uuid; s jsonb; v_status text;
BEGIN
  IF NOT public.crew_is_owner() THEN RAISE EXCEPTION 'only the owner decides on ideas'; END IF;
  IF p_decision NOT IN ('approve', 'reject', 'building', 'shipped') THEN RAISE EXCEPTION 'decision must be approve, reject, building or shipped'; END IF;
  SELECT * INTO i FROM public.crew_ideas WHERE id = p_idea FOR UPDATE;
  IF NOT FOUND OR i.status IN ('merged') THEN RAISE EXCEPTION 'no such open idea'; END IF;
  v_status := CASE p_decision WHEN 'approve' THEN 'approved' WHEN 'reject' THEN 'rejected' ELSE p_decision END;
  UPDATE public.crew_ideas SET status = v_status, owner_note = p_note, decided_at = now(), updated_at = now() WHERE id = p_idea;
  SELECT id INTO v_eng FROM public.crew_agents WHERE slug = 'engineering_head' AND active;
  IF p_decision = 'approve' AND v_eng IS NOT NULL THEN
    INSERT INTO public.crew_messages (from_agent, from_profile, to_agent, to_owner, kind, body)
    VALUES (NULL, auth.uid(), v_eng, false, 'message', 'APPROVED idea: ' || i.title || '. Write the spec and a plan, then propose the build in the approval queue. ' || coalesce(p_note, ''));
  END IF;
  -- everyone who asked hears the outcome; a rejection becomes a lesson for them (what the owner does not want, and why)
  FOR s IN SELECT * FROM jsonb_array_elements(i.supporters) LOOP
    INSERT INTO public.crew_messages (from_agent, from_profile, to_agent, to_owner, kind, body)
    VALUES (NULL, auth.uid(), (s ->> 'agent')::uuid, false, 'reply', 'Idea "' || i.title || '": ' || v_status || '. ' || coalesce(p_note, ''));
    IF p_decision = 'reject' THEN
      INSERT INTO public.crew_notes (agent_id, kind, body, source, evidence)
      VALUES ((s ->> 'agent')::uuid, 'lesson', 'The owner REJECTED the idea "' || i.title || '"' || CASE WHEN coalesce(p_note, '') <> '' THEN ': ' || p_note ELSE ' (no reason given: ask before proposing something like it again)' END, 'owner_feedback', jsonb_build_object('idea', i.id));
    END IF;
  END LOOP;
END $$;

-- the owner adds an idea himself: it counts as approved, and Engineering is told to spec it
CREATE OR REPLACE FUNCTION public.crew_idea_owner_add(p_title text, p_problem text, p_proposal text DEFAULT '')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_id uuid; v_eng uuid;
BEGIN
  IF NOT public.crew_is_owner() THEN RAISE EXCEPTION 'only the owner can add an idea this way'; END IF;
  INSERT INTO public.crew_ideas (title, problem, proposal, requested_by, status, support_count, decided_at, owner_note)
  VALUES (p_title, p_problem, coalesce(p_proposal, ''), NULL, 'approved', 1, now(), 'Added by the owner') RETURNING id INTO v_id;
  SELECT id INTO v_eng FROM public.crew_agents WHERE slug = 'engineering_head' AND active;
  IF v_eng IS NOT NULL THEN
    INSERT INTO public.crew_messages (from_agent, from_profile, to_agent, to_owner, kind, body)
    VALUES (NULL, auth.uid(), v_eng, false, 'message', 'The owner wants this built: ' || p_title || '. ' || p_problem || ' Write the spec and a plan, then propose the build in the approval queue.');
  END IF;
  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION public.crew_words(text), public.crew_similarity(text[], text[]), public.crew_idea_submit(uuid, text, text, text, jsonb), public.crew_idea_support(uuid, uuid, text),
  public.crew_idea_list(uuid, text), public.crew_idea_triage(uuid, uuid, text, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crew_words(text), public.crew_similarity(text[], text[]), public.crew_idea_submit(uuid, text, text, text, jsonb), public.crew_idea_support(uuid, uuid, text),
  public.crew_idea_list(uuid, text), public.crew_idea_triage(uuid, uuid, text, text, text, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.crew_idea_decide(uuid, text, text), public.crew_idea_owner_add(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crew_idea_decide(uuid, text, text), public.crew_idea_owner_add(text, text, text) TO authenticated, service_role;

-- every agent is told to improve the company, and Engineering how to triage
UPDATE public.crew_agent_private SET instructions = instructions || E'\nIMPROVE THE COMPANY: when you notice a job done by hand again and again, a gap, a slow step or a mistake that keeps coming back, do not just live with it: file an idea for Engineering (ideas first to see what is already there: if a similar one exists, support it with what you see from your side instead of filing another). Say the problem, who it hurts, the evidence, and what you would build. Several departments needing the same thing is the strongest signal. Nothing is built without the owner''s approval; learn from what he approves and rejects.'
 WHERE instructions NOT LIKE '%IMPROVE THE COMPANY%';
UPDATE public.crew_agent_private p SET instructions = instructions || E'\nIDEA TRIAGE (Engineering): each run, list the ideas. Merge duplicates into one (triage with merge_into), rank by how many departments need it and how much time or money it saves, write a short spec and a rough estimate for the top ones, and say what you would NOT build and why. When the owner approves one, propose the build as an external.github proposal with the plan, the files, the check that proves it works and the rollback. Never start building before the approval.'
  FROM public.crew_agents a WHERE a.id = p.agent_id AND a.slug = 'engineering_head' AND p.instructions NOT LIKE '%IDEA TRIAGE%';

-- the first idea on the board: from the owner's own words about the daily huddle
INSERT INTO public.crew_ideas (title, problem, proposal, requested_by, departments, supporters, status)
SELECT 'Daily huddle reminder at 9:00 AM EST',
       'The morning huddle depends on someone remembering to announce it. A person in Operations should get (and post) a reminder every working day at 9:00 AM EST that it is time for the huddle.',
       'A scheduled reminder every working day at 9:00 AM EST to the Operations person, who announces the huddle to the team (in the office and in the Cliq channel).',
       a.id, ARRAY['People'], jsonb_build_array(jsonb_build_object('agent', a.id, 'department', 'People', 'note', 'Raised from the owner''s own words: a reminder system so the Operations person announces the huddle every morning.', 'at', now())), 'open'
  FROM public.crew_agents a WHERE a.slug = 'people_head'
  AND NOT EXISTS (SELECT 1 FROM public.crew_ideas WHERE title = 'Daily huddle reminder at 9:00 AM EST');
