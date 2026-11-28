-- Who can see the AI executives (in the Office, and their public card): by default only the owner, named by profile, not every super admin.
-- The owner can let named people see them too. The rule is in the database, not only on the page: anyone else's query for the agents returns nothing.

ALTER TABLE public.crew_settings ADD COLUMN IF NOT EXISTS owner_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.crew_settings ADD COLUMN IF NOT EXISTS office_viewers uuid[] NOT NULL DEFAULT '{}';

-- the owner of the company (King Iyene). Only set when nobody is named yet, so choosing another owner later is not undone by a re-run.
UPDATE public.crew_settings SET owner_profile_id = '3380f8c1-6a83-4ff1-a98f-6cd6a510598d'
WHERE owner_profile_id IS NULL AND EXISTS (SELECT 1 FROM public.profiles WHERE id = '3380f8c1-6a83-4ff1-a98f-6cd6a510598d');

CREATE OR REPLACE FUNCTION public.crew_is_company_owner() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT COALESCE(auth.uid() = (SELECT owner_profile_id FROM public.crew_settings WHERE id), false)
$$;

CREATE OR REPLACE FUNCTION public.crew_can_see_agents() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT public.crew_is_company_owner()
      OR COALESCE(auth.uid() = ANY (SELECT unnest(office_viewers) FROM public.crew_settings WHERE id), false)
$$;
REVOKE ALL ON FUNCTION public.crew_is_company_owner() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.crew_can_see_agents() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crew_is_company_owner() TO authenticated;
GRANT EXECUTE ON FUNCTION public.crew_can_see_agents() TO authenticated;

DROP POLICY IF EXISTS crew_agents_read ON public.crew_agents;
CREATE POLICY crew_agents_read ON public.crew_agents FOR SELECT TO authenticated USING (active AND public.crew_can_see_agents());

CREATE OR REPLACE FUNCTION public.crew_set_office_viewers(p_ids uuid[]) RETURNS uuid[]
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v uuid[];
BEGIN
  IF NOT public.crew_is_company_owner() THEN RAISE EXCEPTION 'only the owner can choose who sees the agents'; END IF;
  SELECT COALESCE(array_agg(DISTINCT p.id), '{}') INTO v FROM public.profiles p WHERE p.id = ANY (COALESCE(p_ids, '{}'));
  UPDATE public.crew_settings SET office_viewers = v WHERE id;
  RETURN v;
END $$;
REVOKE ALL ON FUNCTION public.crew_set_office_viewers(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crew_set_office_viewers(uuid[]) TO authenticated;
