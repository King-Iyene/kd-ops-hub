-- Rollback for 20261424000000_agent_admin_access.sql: Super Admin only again (re-apply section 1 of 20261411000000_agent_v4_access_runner.sql).
CREATE OR REPLACE FUNCTION public.agent_can_access()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$ SELECT coalesce(public.agent_role() = 'super_admin', false) $$;
CREATE OR REPLACE FUNCTION public.agent_in_scope(p_company uuid, p_module text, p_person uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$ SELECT coalesce(public.agent_role() = 'super_admin', false) $$;
CREATE OR REPLACE FUNCTION public.agent_my_scope()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_role text := public.agent_role();
BEGIN
  IF v_role IS DISTINCT FROM 'super_admin' THEN RETURN jsonb_build_object('role', v_role, 'access', false); END IF;
  RETURN jsonb_build_object('role', v_role, 'access', true, 'configure', true, 'companies', NULL, 'modules', NULL);
END $$;
