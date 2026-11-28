-- Rolls back 20261456000000_crew_ideas.sql. The idea board and its contents are deleted; the Head of People is removed.
DROP FUNCTION IF EXISTS public.crew_idea_owner_add(text, text, text);
DROP FUNCTION IF EXISTS public.crew_idea_decide(uuid, text, text);
DROP FUNCTION IF EXISTS public.crew_idea_triage(uuid, uuid, text, text, text, uuid);
DROP FUNCTION IF EXISTS public.crew_idea_list(uuid, text);
DROP FUNCTION IF EXISTS public.crew_idea_support(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.crew_idea_submit(uuid, text, text, text, jsonb);
DROP FUNCTION IF EXISTS public.crew_similarity(text[], text[]);
DROP FUNCTION IF EXISTS public.crew_words(text);
DROP TABLE IF EXISTS public.crew_ideas;
UPDATE public.crew_agent_private SET instructions = replace(instructions, E'\nIMPROVE THE COMPANY:', E'\nIMPROVE-THE-COMPANY-REMOVED:') WHERE instructions LIKE '%IMPROVE THE COMPANY%';
DELETE FROM public.crew_agents WHERE slug = 'people_head';
-- the role list goes back to what it was (the endorse function keeps the extra role name harmlessly)
ALTER TABLE public.crew_agents DROP CONSTRAINT IF EXISTS crew_agents_role_check;
ALTER TABLE public.crew_agents ADD CONSTRAINT crew_agents_role_check CHECK (role IN ('cfo', 'finance_head', 'accountant', 'treasury', 'payroll', 'revenue', 'fpa', 'ops_head', 'product_head', 'marketing_head', 'engineering_head', 'ndi_head', 'tasks_head', 'compliance_head'));
