-- 1) Finance consolidation (owner's request):
--      Head of Finance <- Compliance & Tax (the paused Compliance head's access and duties)
--      Controller      <- FP&A / Revenue analyst  (one Finance Operations & Analysis role)
-- 2) Google Drive writes for the executives, ALWAYS through the owner's approval queue:
--      actions drive.create / drive.update / drive.trash (trash = recoverable, never a permanent delete; there is no share action)
--      a proposal for one can only be created in the 'pending' state with the owner as the approver; only the owner's approval makes it
--      'approved'; only then does the daemon run an executor session that is handed exactly that payload.

DO $$
DECLARE
  v_owner uuid := (SELECT owner_profile_id FROM public.crew_settings LIMIT 1);
  g record; s uuid; m uuid;
BEGIN
  FOR g IN SELECT * FROM (VALUES
    ('finance_head', ARRAY['compliance_head'],
       'Head of Finance, Tax & Compliance',
       'Head of Finance, Tax and Compliance. You run the finance team and the books, and you also own tax and compliance: you watch deadlines and filings, prepare tax filings as DRAFTS only, and say plainly when the company is exposed.',
       'Merged by the owner: tax and compliance now sit with the Head of Finance'),
    ('controller', ARRAY['fpa'],
       'Finance Operations & Analysis',
       'Finance operations and analysis. You keep the books and check every entry, match invoices to payments and payroll, prepare payroll runs and batch payments as DRAFTS only, track income and client invoices (invoices as drafts), and forecast and budget from the real numbers. You never pay anyone.',
       'Merged by the owner: duties now held by Finance Operations & Analysis')
  ) AS t(survivor, gone, title, persona, reason) LOOP
    SELECT id INTO s FROM public.crew_agents WHERE slug = g.survivor AND active;
    CONTINUE WHEN s IS NULL;
    UPDATE public.crew_agents SET title = g.title, updated_at = now() WHERE id = s;
    UPDATE public.crew_agent_private p SET
      persona = g.persona,
      allowed_actions = ARRAY(SELECT DISTINCT unnest(p.allowed_actions || COALESCE((SELECT array_agg(x) FROM (SELECT unnest(q.allowed_actions) x FROM public.crew_agent_private q JOIN public.crew_agents a ON a.id = q.agent_id WHERE a.slug = ANY (g.gone)) z), '{}'))),
      allowed_read_bases = ARRAY(SELECT DISTINCT unnest(p.allowed_read_bases || COALESCE((SELECT array_agg(x) FROM (SELECT unnest(q.allowed_read_bases) x FROM public.crew_agent_private q JOIN public.crew_agents a ON a.id = q.agent_id WHERE a.slug = ANY (g.gone)) z), '{}'))),
      allowed_write_bases = ARRAY(SELECT DISTINCT unnest(p.allowed_write_bases || COALESCE((SELECT array_agg(x) FROM (SELECT unnest(q.allowed_write_bases) x FROM public.crew_agent_private q JOIN public.crew_agents a ON a.id = q.agent_id WHERE a.slug = ANY (g.gone)) z), '{}'))),
      allowed_sources = ARRAY(SELECT DISTINCT unnest(p.allowed_sources || COALESCE((SELECT array_agg(x) FROM (SELECT unnest(q.allowed_sources) x FROM public.crew_agent_private q JOIN public.crew_agents a ON a.id = q.agent_id WHERE a.slug = ANY (g.gone)) z), '{}'))),
      updated_at = now()
    WHERE p.agent_id = s;
    FOR m IN SELECT id FROM public.crew_agents WHERE slug = ANY (g.gone) AND active LOOP
      PERFORM public.crew_retire_now(m, g.reason, v_owner, NULL);
    END LOOP;
  END LOOP;
END $$;

-- Finance gets to see all of the finance-related data in KDOps: the finance bases (KDS Finances, KD Baggs Ltd Finances, NDI), CRM, KDS Base, and every
-- app source the CFO sees (subscriptions, invoices, payroll, vendors...). Writing and deleting stay proposals the owner approves.
UPDATE public.crew_agent_private p SET
  allowed_read_bases = ARRAY(SELECT DISTINCT unnest(p.allowed_read_bases || (SELECT allowed_read_bases FROM public.crew_agent_private c JOIN public.crew_agents a ON a.id = c.agent_id WHERE a.slug = 'cfo'))),
  allowed_sources = ARRAY(SELECT DISTINCT unnest(p.allowed_sources || (SELECT allowed_sources FROM public.crew_agent_private c JOIN public.crew_agents a ON a.id = c.agent_id WHERE a.slug = 'cfo'))),
  allowed_write_bases = ARRAY(SELECT DISTINCT unnest(p.allowed_write_bases || ARRAY['b211448d-ab7d-4cc8-8bf6-68ff09d62b81'::uuid, 'bc07ec46-6c26-46b0-906d-cac7f829b373'::uuid])),
  updated_at = now()
WHERE p.agent_id IN (SELECT id FROM public.crew_agents WHERE slug IN ('finance_head', 'controller') AND active);

-- The table only accepts known actions: add the three Drive ones (and nothing that shares or permanently deletes).
ALTER TABLE public.crew_proposals DROP CONSTRAINT IF EXISTS crew_proposals_action_check;
ALTER TABLE public.crew_proposals ADD CONSTRAINT crew_proposals_action_check CHECK (action ~ '^(record\.(create|update|soft_delete)|draft\.(batch_payment|payroll_run|invoice|filing)|advice\.[a-z_]+|agent\.(retire|hire)|external\.(github|vercel|supabase|other)|drive\.(create|update|trash))$');

-- Drive actions: every active executive may PROPOSE them (the owner decides).
UPDATE public.crew_agent_private p
   SET allowed_actions = ARRAY(SELECT DISTINCT unnest(p.allowed_actions || ARRAY['drive.create', 'drive.update', 'drive.trash'])), updated_at = now()
 WHERE p.agent_id IN (SELECT id FROM public.crew_agents WHERE active);

-- What an agent may collect to carry out: approved drafts and approved Drive actions (nothing else).
CREATE OR REPLACE FUNCTION public.crew_my_approved(p_agent uuid)
RETURNS SETOF public.crew_proposals LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $f$
  SELECT * FROM public.crew_proposals WHERE agent_id = p_agent AND status = 'approved' AND (action LIKE 'draft.%' OR action LIKE 'drive.%') ORDER BY decided_at
$f$;

CREATE OR REPLACE FUNCTION public.crew_report_done(p_agent uuid, p_proposal uuid, p_result jsonb DEFAULT '{}'::jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $f$
BEGIN
  UPDATE public.crew_proposals SET status = 'executed', executed_at = now(), result = coalesce(p_result, '{}'::jsonb)
   WHERE id = p_proposal AND agent_id = p_agent AND status = 'approved' AND (action LIKE 'draft.%' OR action LIKE 'drive.%');
  IF NOT FOUND THEN RAISE EXCEPTION 'that is not an approved draft or Drive action of yours'; END IF;
END $f$;

-- A Drive proposal must say exactly what it will do, only on Google Drive, and is never lower than medium risk (trash is always high).
CREATE OR REPLACE FUNCTION public.crew_check_drive_proposal() RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp' AS $f$
BEGIN
  IF NEW.payload ->> 'provider' IS NULL OR NEW.payload ->> 'provider' NOT IN ('google_drive', 'zoho_workdrive') THEN RAISE EXCEPTION 'a Drive action needs payload.provider = "google_drive" or "zoho_workdrive"'; END IF;
  -- Zoho WorkDrive: text files only, created in a named folder or a new version of a named file; there is no trash or delete there
  IF NEW.payload ->> 'provider' = 'zoho_workdrive' THEN
    IF NEW.action = 'drive.trash' THEN RAISE EXCEPTION 'Zoho WorkDrive files cannot be deleted by agents'; END IF;
    IF NEW.action = 'drive.create' AND coalesce(btrim(NEW.payload ->> 'folder_id'), '') = '' THEN RAISE EXCEPTION 'a Zoho WorkDrive create needs payload.folder_id'; END IF;
  END IF;
  IF NEW.action = 'drive.create' AND (coalesce(btrim(NEW.payload ->> 'title'), '') = '' OR jsonb_typeof(NEW.payload -> 'content') IS DISTINCT FROM 'string') THEN
    RAISE EXCEPTION 'drive.create needs payload {provider, title, content, folder_id?}';
  END IF;
  IF NEW.action IN ('drive.update', 'drive.trash') AND coalesce(btrim(NEW.payload ->> 'file_id'), '') = '' THEN
    RAISE EXCEPTION '% needs payload.file_id', NEW.action;
  END IF;
  IF NEW.action = 'drive.update' AND NEW.payload ->> 'title' IS NULL AND NEW.payload ->> 'content' IS NULL THEN
    RAISE EXCEPTION 'drive.update needs a new title or new content';
  END IF;
  IF length(NEW.payload::text) > 200000 THEN RAISE EXCEPTION 'that Drive file is too large for one proposal'; END IF;
  NEW.requires_approver := 'owner';
  NEW.status := 'pending';
  IF NEW.action = 'drive.trash' THEN NEW.risk := 'high'; ELSIF NEW.risk = 'low' THEN NEW.risk := 'medium'; END IF;
  RETURN NEW;
END $f$;

DROP TRIGGER IF EXISTS crew_check_drive_proposal ON public.crew_proposals;
CREATE TRIGGER crew_check_drive_proposal BEFORE INSERT ON public.crew_proposals
  FOR EACH ROW WHEN (NEW.action LIKE 'drive.%') EXECUTE FUNCTION public.crew_check_drive_proposal();
