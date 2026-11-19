-- Ops Agent, Phase 1 (2 of 6): who may use the agent and what they may see.
--
-- All three checks read the role from the database (profiles, status active),
-- never from the client, and ignore the "View As" simulator.
--
--   agent_can_access()     Super Admin or Admin
--   agent_can_configure()  Super Admin only
--   agent_in_scope(company, module, person)
--       Super Admin: always.
--       Admin: only inside their agent_admin_scope (NULL = all), only companies
--       and modules that are switched on, and never
--         - flags about themselves        (settings.hide_own_flags)
--         - flags about any Admin or Super Admin (same setting: only Super Admins see those)
--         - flags about leadership        (settings.leadership_flags_super_admin_only)
--
-- Rollback: supabase/rollbacks/20261408_agent_down.sql

CREATE OR REPLACE FUNCTION public.agent_role()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT p.role FROM public.profiles p WHERE p.id = auth.uid() AND p.status = 'active' LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.agent_can_access()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT coalesce(public.agent_role() IN ('super_admin', 'admin'), false)
$$;

CREATE OR REPLACE FUNCTION public.agent_can_configure()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT coalesce(public.agent_role() = 'super_admin', false)
$$;

-- A person's company comes from their pay group (there is no company column on a profile).
CREATE OR REPLACE FUNCTION public.agent_company_of(p_person uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT pg.company_id
    FROM public.profiles p
    JOIN public.pay_groups pg ON pg.id = p.pay_group_id
   WHERE p.id = p_person
     AND (auth.uid() IS NULL OR public.agent_can_access())  -- signed-in users without agent access learn nothing
$$;

CREATE OR REPLACE FUNCTION public.agent_in_scope(p_company uuid, p_module text, p_person uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_role text := public.agent_role();
  v_scope public.agent_admin_scope%ROWTYPE;
  v_settings public.agent_settings%ROWTYPE;
  v_subject_role text;
BEGIN
  IF v_role = 'super_admin' THEN RETURN true; END IF;
  IF v_role IS DISTINCT FROM 'admin' THEN RETURN false; END IF;

  SELECT * INTO v_scope FROM public.agent_admin_scope WHERE admin_id = auth.uid();
  SELECT * INTO v_settings FROM public.agent_settings WHERE id;

  -- Company: must be one the agent covers and, if this Admin is limited, one they were given.
  IF p_company IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.agent_company_scope WHERE company_id = p_company AND enabled) THEN RETURN false; END IF;
    IF v_scope.company_ids IS NOT NULL AND NOT (p_company = ANY (v_scope.company_ids)) THEN RETURN false; END IF;
  ELSIF v_scope.company_ids IS NOT NULL THEN
    RETURN false; -- a record with no company is only for Admins who see every company
  END IF;

  -- Module: must be switched on and, if this Admin is limited, one they were given.
  IF p_module IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.agent_module_access WHERE module_key = p_module AND enabled) THEN RETURN false; END IF;
    IF v_scope.module_keys IS NOT NULL AND NOT (p_module = ANY (v_scope.module_keys)) THEN RETURN false; END IF;
  END IF;

  IF p_person IS NOT NULL THEN
    IF coalesce(v_settings.hide_own_flags, true) THEN
      IF p_person = auth.uid() THEN RETURN false; END IF;
      SELECT role INTO v_subject_role FROM public.profiles WHERE id = p_person;
      IF v_subject_role IN ('admin', 'super_admin') THEN RETURN false; END IF;
    END IF;
    IF coalesce(v_settings.leadership_flags_super_admin_only, true)
       AND EXISTS (SELECT 1 FROM public.agent_person_profile WHERE person_id = p_person AND group_name = 'leadership') THEN
      RETURN false;
    END IF;
  END IF;

  RETURN true;
END $$;

-- Which companies / modules the current user may see, for the screens' pickers.
CREATE OR REPLACE FUNCTION public.agent_my_scope()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_role text := public.agent_role();
  v_scope public.agent_admin_scope%ROWTYPE;
BEGIN
  IF v_role IS NULL OR v_role NOT IN ('super_admin', 'admin') THEN
    RETURN jsonb_build_object('role', v_role, 'access', false);
  END IF;
  SELECT * INTO v_scope FROM public.agent_admin_scope WHERE admin_id = auth.uid();
  RETURN jsonb_build_object(
    'role', v_role,
    'access', true,
    'configure', v_role = 'super_admin',
    'companies', CASE WHEN v_role = 'super_admin' THEN NULL ELSE v_scope.company_ids END,
    'modules', CASE WHEN v_role = 'super_admin' THEN NULL ELSE v_scope.module_keys END
  );
END $$;

REVOKE ALL ON FUNCTION public.agent_role(), public.agent_can_access(), public.agent_can_configure(),
  public.agent_company_of(uuid), public.agent_in_scope(uuid, text, uuid), public.agent_my_scope() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agent_role(), public.agent_can_access(), public.agent_can_configure(),
  public.agent_company_of(uuid), public.agent_in_scope(uuid, text, uuid), public.agent_my_scope() TO authenticated, service_role;
