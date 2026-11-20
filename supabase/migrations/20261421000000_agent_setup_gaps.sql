-- Ops Agent: SU01 "Setup gap". The agent can only tag, copy and escalate to the right people when the basics are filled in, so it checks them.
--
--   One low-priority Inbox item per person who has a gap that stops the Agent working for them:
--     * not in a team group (most rules apply to a group, so nothing is watched for them),
--     * no manager (nobody to copy or hand it to; leadership and placed staff do not need one),
--     * work days or hours that cannot be right (no working days, or the day ends before it starts).
--   Missing work hours are NOT a gap: the company default is used.
--   One system item when people have no Cliq ID saved (a Cliq connection is set up): tags then use the person's email instead.
--   Each item closes itself the minute the gap is filled. People with approved leave, field staff and the company NDI are not in the team.
--
-- Rollback: supabase/rollbacks/20261421_agent_setup_gaps_down.sql

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
      IF public.agent_raise_flag('SU01', 'system', NULL, 'person', r.person_id::text, '', 'low', 'Setup gap: ' || r.full_name,
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
      IF public.agent_raise_flag('SU01', 'system', NULL, 'system', 'cliq_ids', '', 'low', 'People without a Cliq ID',
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
REVOKE ALL ON FUNCTION public.agent_rule_su01(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agent_rule_su01(timestamptz) TO service_role;

INSERT INTO public.agent_rules (code, module_key, title, description, enabled, severity, params, status) VALUES
  ('SU01', NULL, 'Setup gap', 'A person with no team group, no manager or impossible work hours (the Agent cannot watch, copy or escalate for them), and one item when people have no Cliq ID saved. Closes itself when fixed.', true, 'low', '{}', 'ready')
ON CONFLICT (code) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description, severity = EXCLUDED.severity, status = 'ready';
