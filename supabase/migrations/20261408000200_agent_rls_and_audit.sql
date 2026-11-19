-- Ops Agent, Phase 1 (3 of 6): row level security, grants, and the audit trail.
--
-- Rules of the road
--   * Every agent_ table has RLS on.
--   * Clients (the authenticated role) only get the grants below. Anything the
--     agent itself writes (flags, usage, rule runs, summaries, chat replies,
--     text checks, snapshots) is written by the service role or by SECURITY
--     DEFINER functions, never by a browser.
--   * Super Admin configures; Admin works inside their scope (agent_in_scope).
--   * Every change to a configuration table is written to agent_audit_log by a trigger.
--
-- Rollback: supabase/rollbacks/20261408_agent_down.sql

-- ── Audit helpers ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.agent_shorten_val(v jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN jsonb_typeof(v) = 'string' AND length(v #>> '{}') > 300
              THEN to_jsonb(left(v #>> '{}', 300) || '…') ELSE v END
$$;

CREATE OR REPLACE FUNCTION public.agent_shorten_json(j jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(jsonb_object_agg(k, public.agent_shorten_val(v)), '{}'::jsonb)
    FROM jsonb_each(coalesce(j, '{}'::jsonb)) AS t(k, v)
$$;

CREATE OR REPLACE FUNCTION public.agent_audit_trg()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_old jsonb;
  v_new jsonb;
  v_drop text[] := CASE WHEN TG_NARGS > 1 THEN string_to_array(TG_ARGV[1], ',') ELSE '{}' END;
  v_detail jsonb;
  v_col text;
BEGIN
  v_old := CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END;
  v_new := CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) END;
  FOREACH v_col IN ARRAY v_drop LOOP
    v_old := v_old - v_col;
    v_new := v_new - v_col;
  END LOOP;

  IF TG_OP = 'UPDATE' THEN
    SELECT coalesce(jsonb_object_agg(k, jsonb_build_object('from', public.agent_shorten_val(v_old -> k), 'to', public.agent_shorten_val(v_new -> k))), '{}'::jsonb)
      INTO v_detail
      FROM jsonb_object_keys(v_new) AS k
     WHERE k NOT IN ('updated_at', 'updated_by') AND (v_old -> k) IS DISTINCT FROM (v_new -> k);
    IF v_detail = '{}'::jsonb THEN RETURN NEW; END IF; -- nothing meaningful changed
  ELSE
    v_detail := jsonb_build_object('row', public.agent_shorten_json(coalesce(v_new, v_old)));
  END IF;

  INSERT INTO public.agent_audit_log (actor_id, action, entity_type, entity_id, detail)
  VALUES (auth.uid(), lower(TG_OP) || ':' || TG_TABLE_NAME, TG_TABLE_NAME,
          coalesce(v_new, v_old) ->> TG_ARGV[0], v_detail);
  RETURN coalesce(NEW, OLD);
END $$;

-- Written by the app and by edge functions for things that are not table changes
-- (a message sent, a chat tool call, a rule run).
CREATE OR REPLACE FUNCTION public.agent_audit(p_action text, p_entity_type text DEFAULT NULL, p_entity_id text DEFAULT NULL, p_detail jsonb DEFAULT '{}')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.agent_can_access() THEN
    RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.agent_audit_log (actor_id, action, entity_type, entity_id, detail)
  VALUES (auth.uid(), left(p_action, 120), p_entity_type, p_entity_id, public.agent_shorten_json(p_detail));
END $$;
REVOKE ALL ON FUNCTION public.agent_audit(text, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agent_audit(text, text, text, jsonb) TO authenticated, service_role;

CREATE TRIGGER agent_settings_audit AFTER INSERT OR UPDATE OR DELETE ON public.agent_settings
  FOR EACH ROW EXECUTE FUNCTION public.agent_audit_trg('id');
CREATE TRIGGER agent_company_scope_audit AFTER INSERT OR UPDATE OR DELETE ON public.agent_company_scope
  FOR EACH ROW EXECUTE FUNCTION public.agent_audit_trg('company_id');
CREATE TRIGGER agent_module_access_audit AFTER INSERT OR UPDATE OR DELETE ON public.agent_module_access
  FOR EACH ROW EXECUTE FUNCTION public.agent_audit_trg('module_key');
CREATE TRIGGER agent_admin_scope_audit AFTER INSERT OR UPDATE OR DELETE ON public.agent_admin_scope
  FOR EACH ROW EXECUTE FUNCTION public.agent_audit_trg('admin_id');
CREATE TRIGGER agent_person_profile_audit AFTER INSERT OR UPDATE OR DELETE ON public.agent_person_profile
  FOR EACH ROW EXECUTE FUNCTION public.agent_audit_trg('person_id');
CREATE TRIGGER agent_rules_audit AFTER INSERT OR UPDATE OR DELETE ON public.agent_rules
  FOR EACH ROW EXECUTE FUNCTION public.agent_audit_trg('code');
CREATE TRIGGER agent_memory_audit AFTER INSERT OR UPDATE OR DELETE ON public.agent_memory
  FOR EACH ROW EXECUTE FUNCTION public.agent_audit_trg('id');
CREATE TRIGGER agent_connections_audit AFTER INSERT OR UPDATE OR DELETE ON public.agent_connections
  FOR EACH ROW EXECUTE FUNCTION public.agent_audit_trg('id');
CREATE TRIGGER agent_identity_map_audit AFTER INSERT OR UPDATE OR DELETE ON public.agent_identity_map
  FOR EACH ROW EXECUTE FUNCTION public.agent_audit_trg('person_id');
CREATE TRIGGER agent_domain_list_audit AFTER INSERT OR UPDATE OR DELETE ON public.agent_domain_list
  FOR EACH ROW EXECUTE FUNCTION public.agent_audit_trg('id');
CREATE TRIGGER agent_api_keys_audit AFTER INSERT OR UPDATE OR DELETE ON public.agent_api_keys
  FOR EACH ROW EXECUTE FUNCTION public.agent_audit_trg('id', 'key_hash');

-- A sensitive module can never be switched on.
CREATE OR REPLACE FUNCTION public.agent_module_access_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.enabled AND EXISTS (SELECT 1 FROM public.agent_module_catalog c WHERE c.key = NEW.module_key AND c.sensitive) THEN
    RAISE EXCEPTION 'module_locked' USING HINT = 'This module holds sensitive data and cannot be switched on for the agent.';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER agent_module_access_guard BEFORE INSERT OR UPDATE ON public.agent_module_access
  FOR EACH ROW EXECUTE FUNCTION public.agent_module_access_guard();

-- ── RLS on ──────────────────────────────────────────────────────────────────
ALTER TABLE public.agent_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_company_scope ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_module_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_module_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_admin_scope ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_person_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_rule_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_flag_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_chat_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_text_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_domain_list ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_identity_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_schema_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_feature_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_ai_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_audit_log ENABLE ROW LEVEL SECURITY;

-- ── Settings and scope: everyone with access reads, Super Admin writes ──────
GRANT SELECT, UPDATE ON public.agent_settings TO authenticated;
CREATE POLICY agent_settings_select ON public.agent_settings FOR SELECT TO authenticated USING (public.agent_can_access());
CREATE POLICY agent_settings_update ON public.agent_settings FOR UPDATE TO authenticated
  USING (public.agent_can_configure()) WITH CHECK (public.agent_can_configure());

GRANT SELECT, INSERT, UPDATE ON public.agent_company_scope TO authenticated;
CREATE POLICY agent_company_scope_select ON public.agent_company_scope FOR SELECT TO authenticated USING (public.agent_can_access());
CREATE POLICY agent_company_scope_insert ON public.agent_company_scope FOR INSERT TO authenticated WITH CHECK (public.agent_can_configure());
CREATE POLICY agent_company_scope_update ON public.agent_company_scope FOR UPDATE TO authenticated
  USING (public.agent_can_configure()) WITH CHECK (public.agent_can_configure());

GRANT SELECT ON public.agent_module_catalog TO authenticated;
CREATE POLICY agent_module_catalog_select ON public.agent_module_catalog FOR SELECT TO authenticated USING (public.agent_can_access());

GRANT SELECT, INSERT, UPDATE ON public.agent_module_access TO authenticated;
CREATE POLICY agent_module_access_select ON public.agent_module_access FOR SELECT TO authenticated USING (public.agent_can_access());
CREATE POLICY agent_module_access_insert ON public.agent_module_access FOR INSERT TO authenticated WITH CHECK (public.agent_can_configure());
CREATE POLICY agent_module_access_update ON public.agent_module_access FOR UPDATE TO authenticated
  USING (public.agent_can_configure()) WITH CHECK (public.agent_can_configure());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_admin_scope TO authenticated;
CREATE POLICY agent_admin_scope_select ON public.agent_admin_scope FOR SELECT TO authenticated
  USING (public.agent_can_configure() OR (public.agent_can_access() AND admin_id = auth.uid()));
CREATE POLICY agent_admin_scope_insert ON public.agent_admin_scope FOR INSERT TO authenticated WITH CHECK (public.agent_can_configure());
CREATE POLICY agent_admin_scope_update ON public.agent_admin_scope FOR UPDATE TO authenticated
  USING (public.agent_can_configure()) WITH CHECK (public.agent_can_configure());
CREATE POLICY agent_admin_scope_delete ON public.agent_admin_scope FOR DELETE TO authenticated USING (public.agent_can_configure());

-- People profiles: an Admin sees the people of the companies they cover.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_person_profile TO authenticated;
CREATE POLICY agent_person_profile_select ON public.agent_person_profile FOR SELECT TO authenticated
  USING (public.agent_can_configure()
         OR (public.agent_can_access() AND public.agent_in_scope(public.agent_company_of(person_id), NULL, NULL)));
CREATE POLICY agent_person_profile_insert ON public.agent_person_profile FOR INSERT TO authenticated WITH CHECK (public.agent_can_configure());
CREATE POLICY agent_person_profile_update ON public.agent_person_profile FOR UPDATE TO authenticated
  USING (public.agent_can_configure()) WITH CHECK (public.agent_can_configure());
CREATE POLICY agent_person_profile_delete ON public.agent_person_profile FOR DELETE TO authenticated USING (public.agent_can_configure());

-- Rules and runs
GRANT SELECT, UPDATE ON public.agent_rules TO authenticated;
CREATE POLICY agent_rules_select ON public.agent_rules FOR SELECT TO authenticated USING (public.agent_can_access());
CREATE POLICY agent_rules_update ON public.agent_rules FOR UPDATE TO authenticated
  USING (public.agent_can_configure()) WITH CHECK (public.agent_can_configure());

GRANT SELECT ON public.agent_rule_runs TO authenticated;
CREATE POLICY agent_rule_runs_select ON public.agent_rule_runs FOR SELECT TO authenticated USING (public.agent_can_access());

-- ── The Inbox: read only for clients, filtered by scope ─────────────────────
GRANT SELECT ON public.agent_flags TO authenticated;
CREATE POLICY agent_flags_select ON public.agent_flags FOR SELECT TO authenticated
  USING (public.agent_in_scope(company_id, module, person_id));

GRANT SELECT ON public.agent_flag_events TO authenticated;
CREATE POLICY agent_flag_events_select ON public.agent_flag_events FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.agent_flags f WHERE f.id = flag_id));

GRANT SELECT ON public.agent_messages TO authenticated;
CREATE POLICY agent_messages_select ON public.agent_messages FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.agent_flags f WHERE f.id = flag_id) OR (flag_id IS NULL AND public.agent_can_configure()));

GRANT SELECT ON public.agent_summaries TO authenticated;
CREATE POLICY agent_summaries_select ON public.agent_summaries FOR SELECT TO authenticated
  USING (public.agent_can_access() AND public.agent_in_scope(company_id, NULL, NULL));

GRANT SELECT ON public.agent_questions TO authenticated;
CREATE POLICY agent_questions_select ON public.agent_questions FOR SELECT TO authenticated
  USING (public.agent_can_access() AND (flag_id IS NULL OR EXISTS (SELECT 1 FROM public.agent_flags f WHERE f.id = flag_id)));

-- ── Chat: your own threads only ─────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_chat_threads TO authenticated;
CREATE POLICY agent_chat_threads_all ON public.agent_chat_threads FOR ALL TO authenticated
  USING (public.agent_can_access() AND user_id = auth.uid())
  WITH CHECK (public.agent_can_access() AND user_id = auth.uid());

GRANT SELECT, INSERT ON public.agent_chat_messages TO authenticated;
CREATE POLICY agent_chat_messages_select ON public.agent_chat_messages FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.agent_chat_threads t WHERE t.id = thread_id));
CREATE POLICY agent_chat_messages_insert ON public.agent_chat_messages FOR INSERT TO authenticated
  WITH CHECK (role = 'user' AND EXISTS (SELECT 1 FROM public.agent_chat_threads t WHERE t.id = thread_id));

-- ── Memory: anyone with access proposes, only a Super Admin approves ────────
GRANT SELECT, INSERT, UPDATE ON public.agent_memory TO authenticated;
CREATE POLICY agent_memory_select ON public.agent_memory FOR SELECT TO authenticated
  USING (public.agent_can_configure() OR (public.agent_can_access() AND (status = 'active' OR proposed_by = auth.uid())));
CREATE POLICY agent_memory_insert ON public.agent_memory FOR INSERT TO authenticated
  WITH CHECK (public.agent_can_configure() OR (public.agent_can_access() AND status = 'proposed' AND proposed_by = auth.uid()));
CREATE POLICY agent_memory_update ON public.agent_memory FOR UPDATE TO authenticated
  USING (public.agent_can_configure()) WITH CHECK (public.agent_can_configure());

-- ── Domains ─────────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_domain_list TO authenticated;
CREATE POLICY agent_domain_list_select ON public.agent_domain_list FOR SELECT TO authenticated USING (public.agent_can_access());
CREATE POLICY agent_domain_list_insert ON public.agent_domain_list FOR INSERT TO authenticated WITH CHECK (public.agent_can_configure());
CREATE POLICY agent_domain_list_update ON public.agent_domain_list FOR UPDATE TO authenticated
  USING (public.agent_can_configure()) WITH CHECK (public.agent_can_configure());
CREATE POLICY agent_domain_list_delete ON public.agent_domain_list FOR DELETE TO authenticated USING (public.agent_can_configure());

-- ── Connections, identities, snapshots, API keys: Super Admin only ──────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_connections TO authenticated;
CREATE POLICY agent_connections_all ON public.agent_connections FOR ALL TO authenticated
  USING (public.agent_can_configure()) WITH CHECK (public.agent_can_configure());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_identity_map TO authenticated;
CREATE POLICY agent_identity_map_all ON public.agent_identity_map FOR ALL TO authenticated
  USING (public.agent_can_configure()) WITH CHECK (public.agent_can_configure());

GRANT SELECT ON public.agent_schema_snapshots TO authenticated;
CREATE POLICY agent_schema_snapshots_select ON public.agent_schema_snapshots FOR SELECT TO authenticated USING (public.agent_can_configure());

-- Admins view proposals; deciding is a Super Admin action.
GRANT SELECT, UPDATE ON public.agent_feature_proposals TO authenticated;
CREATE POLICY agent_feature_proposals_select ON public.agent_feature_proposals FOR SELECT TO authenticated USING (public.agent_can_access());
CREATE POLICY agent_feature_proposals_update ON public.agent_feature_proposals FOR UPDATE TO authenticated
  USING (public.agent_can_configure()) WITH CHECK (public.agent_can_configure());

-- The key hash is never readable by a browser.
GRANT SELECT (id, name, key_prefix, scopes, rate_limit_per_min, created_by, created_at, last_used_at, revoked_at),
      UPDATE (revoked_at) ON public.agent_api_keys TO authenticated;
CREATE POLICY agent_api_keys_select ON public.agent_api_keys FOR SELECT TO authenticated USING (public.agent_can_configure());
CREATE POLICY agent_api_keys_update ON public.agent_api_keys FOR UPDATE TO authenticated
  USING (public.agent_can_configure()) WITH CHECK (public.agent_can_configure());

-- Usage is visible to everyone with access (read only); the audit log is wide for Super Admins, own actions for Admins.
GRANT SELECT ON public.agent_ai_usage TO authenticated;
CREATE POLICY agent_ai_usage_select ON public.agent_ai_usage FOR SELECT TO authenticated USING (public.agent_can_access());

GRANT SELECT ON public.agent_audit_log TO authenticated;
CREATE POLICY agent_audit_log_select ON public.agent_audit_log FOR SELECT TO authenticated
  USING (public.agent_can_configure() OR (public.agent_can_access() AND actor_id = auth.uid()));

-- agent_text_checks and the catalog's writes: no client policy at all (service role only).
