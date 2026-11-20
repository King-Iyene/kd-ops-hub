-- Ops Agent: Admins can use the Agent again (Inbox, Chat, Summaries), as the original design intended. Super Admin keeps configuring.
--
--   * agent_can_access: Super Admin or Admin. agent_can_configure stays Super Admin only (Settings, Connections, rules, API keys, modules).
--   * agent_in_scope: for an Admin, only what the Agent covers (companies and modules switched on, and the Admin's own scope if one was set),
--     and never flags about themselves, about other Admins or Super Admins (hide_own_flags), or about leadership
--     (leadership_flags_super_admin_only). Both settings are on by default and a Super Admin can change them in Settings.
--   * agent_my_scope: tells the screens who may do what (configure is false for an Admin, so Settings is read only and Connections is hidden).
--   * "Setup gap" items (SU01) carry no module: a module the Agent does not list ('system') would hide them from every Admin.
--
-- Rollback: supabase/rollbacks/20261424_agent_admin_access_down.sql

CREATE OR REPLACE FUNCTION public.agent_can_access()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT coalesce(public.agent_role() IN ('super_admin', 'admin'), false)
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

  IF p_company IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.agent_company_scope WHERE company_id = p_company AND enabled) THEN RETURN false; END IF;
    IF v_scope.company_ids IS NOT NULL AND NOT (p_company = ANY (v_scope.company_ids)) THEN RETURN false; END IF;
  ELSIF v_scope.company_ids IS NOT NULL THEN
    RETURN false; -- a record with no company is only for Admins who see every company
  END IF;

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

CREATE OR REPLACE FUNCTION public.agent_rule_su01(p_now timestamptz DEFAULT now())
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  r record; v_reasons text[]; v_codes text[]; v_keep text[] := '{}'; v_created integer := 0; v_resolved integer := 0;
  v_cliq boolean; v_total integer; v_missing integer; v_names text; v_cliq_open boolean := false;
BEGIN
  FOR r IN
    SELECT t.person_id, t.full_name, t.group_name, t.working_days, t.work_start, t.work_end, public.agent_manager_of(t.person_id) AS mgr
      FROM public.agent_team_v t
  LOOP
    v_reasons := '{}'; v_codes := '{}';
    IF r.group_name IS NULL THEN
      v_reasons := v_reasons || 'they are not in a team group, so most rules do not look at them'::text; v_codes := v_codes || 'no_group'::text;
    END IF;
    IF coalesce(r.group_name, '') NOT IN ('leadership', 'placement') AND r.mgr IS NULL THEN
      v_reasons := v_reasons || 'no manager is set, so nobody can be copied or asked to follow up'::text; v_codes := v_codes || 'no_manager'::text;
    END IF;
    IF (r.working_days IS NOT NULL AND cardinality(r.working_days) = 0) OR (r.work_start IS NOT NULL AND r.work_end IS NOT NULL AND r.work_start >= r.work_end) THEN
      v_reasons := v_reasons || 'their work days or work hours cannot be right'::text; v_codes := v_codes || 'bad_hours'::text;
    END IF;

    IF cardinality(v_reasons) > 0 THEN
      IF public.agent_raise_flag('SU01', NULL, NULL, 'person', r.person_id::text, '', 'low', 'Setup gap: ' || r.full_name,
           format('%s is not fully set up: %s.', r.full_name, array_to_string(v_reasons, '; ')),
           jsonb_build_object('person_id', r.person_id, 'person_name', r.full_name, 'reasons', to_jsonb(v_codes)),
           'In Settings, People, set their group and manager and check their work days and hours.', p_now) THEN v_created := v_created + 1; END IF;
      v_keep := v_keep || r.person_id::text;
    END IF;
  END LOOP;

  WITH x AS (UPDATE public.agent_flags SET status = 'auto_resolved', updated_at = p_now
              WHERE rule_code = 'SU01' AND subject_type = 'person' AND status IN ('open', 'snoozed') AND NOT (subject_id = ANY (v_keep)) RETURNING id)
  INSERT INTO public.agent_flag_events (flag_id, kind, created_at) SELECT id, 'auto_resolved', p_now FROM x;
  GET DIAGNOSTICS v_resolved = ROW_COUNT;

  -- Cliq IDs: one item for everyone, only when Cliq tagging is in use.
  v_cliq := EXISTS (SELECT 1 FROM public.agent_connections c WHERE c.kind = 'cliq' AND coalesce(c.config ->> 'mention_people', 'true') <> 'false');
  IF v_cliq THEN
    SELECT count(*), count(*) FILTER (WHERE coalesce(nullif(btrim(i.cliq_user_id), ''), '') = '')
      INTO v_total, v_missing
      FROM public.agent_team_v t LEFT JOIN public.agent_identity_map i ON i.person_id = t.person_id;
    IF v_missing > 0 THEN
      SELECT string_agg(n, ', ' ORDER BY n) INTO v_names FROM (
        SELECT t.full_name AS n FROM public.agent_team_v t LEFT JOIN public.agent_identity_map i ON i.person_id = t.person_id
         WHERE coalesce(nullif(btrim(i.cliq_user_id), ''), '') = '' ORDER BY t.full_name LIMIT 8) q;
      IF public.agent_raise_flag('SU01', NULL, NULL, 'system', 'cliq_ids', '', 'low', 'People without a Cliq ID',
           format('%s of %s people have no Cliq ID saved, so a Cliq tag for them uses their email address instead%s.', v_missing, v_total,
                  CASE WHEN v_missing > 8 THEN ' (for example ' || v_names || ')' ELSE ' (' || v_names || ')' END),
           jsonb_build_object('missing', v_missing, 'team', v_total),
           'In Settings, People, add their Cliq user ID, so tags always reach the right person.', p_now) THEN v_created := v_created + 1; END IF;
      v_cliq_open := true;
    END IF;
  END IF;
  IF NOT v_cliq_open THEN
    WITH x AS (UPDATE public.agent_flags SET status = 'auto_resolved', updated_at = p_now
                WHERE rule_code = 'SU01' AND subject_type = 'system' AND subject_id = 'cliq_ids' AND status IN ('open', 'snoozed') RETURNING id)
    INSERT INTO public.agent_flag_events (flag_id, kind, created_at) SELECT id, 'auto_resolved', p_now FROM x;
  END IF;
  RETURN jsonb_build_object('created', v_created, 'resolved', v_resolved);
END $$;

UPDATE public.agent_flags SET module = NULL WHERE rule_code = 'SU01' AND module = 'system';
