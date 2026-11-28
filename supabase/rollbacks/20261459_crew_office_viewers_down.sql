DROP FUNCTION IF EXISTS public.crew_set_office_viewers(uuid[]);
DROP POLICY IF EXISTS crew_agents_read ON public.crew_agents;
CREATE POLICY crew_agents_read ON public.crew_agents FOR SELECT TO authenticated USING (active);
DROP FUNCTION IF EXISTS public.crew_can_see_agents();
DROP FUNCTION IF EXISTS public.crew_is_company_owner();
ALTER TABLE public.crew_settings DROP COLUMN IF EXISTS office_viewers;
ALTER TABLE public.crew_settings DROP COLUMN IF EXISTS owner_profile_id;
