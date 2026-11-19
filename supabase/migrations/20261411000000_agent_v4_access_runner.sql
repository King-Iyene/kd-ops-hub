-- Ops Agent v4 (1 of 5): Super Admin only, a runner that picks up new rules by itself, sensitive modules can be switched on.
--
--   1. agent_can_access / agent_in_scope / agent_my_scope: Super Admin only. Admins see nothing of the agent any more
--      (their old per-Admin scope rows stay in the tables, unused).
--   2. agent_run_rules runs every enabled rule that has a function agent_rule_<code>(timestamptz), and skips a rule whose module
--      is switched off. A new rule is therefore: one function + one row in agent_rules.
--   3. Sensitive modules (payroll, loans, ...) can be switched on by a Super Admin. The agent never gets a read view of them;
--      their rules only count things ("3 loan requests have waited 5 days") and never carry amounts, bank details or documents.
--   4. agent_domain_set / agent_domain_remove: the site lists, written from the Inbox ("add this site to the approved list").
--
-- Rollback: supabase/rollbacks/20261411_agent_v4_down.sql

-- ── 1. Super Admin only ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.agent_can_access()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT coalesce(public.agent_role() = 'super_admin', false)
$$;

CREATE OR REPLACE FUNCTION public.agent_in_scope(p_company uuid, p_module text, p_person uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT coalesce(public.agent_role() = 'super_admin', false)
$$;

CREATE OR REPLACE FUNCTION public.agent_my_scope()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_role text := public.agent_role();
BEGIN
  IF v_role IS DISTINCT FROM 'super_admin' THEN
    RETURN jsonb_build_object('role', v_role, 'access', false);
  END IF;
  RETURN jsonb_build_object('role', v_role, 'access', true, 'configure', true, 'companies', NULL, 'modules', NULL);
END $$;

-- ── 3. Sensitive modules may be switched on, by a Super Admin only ─────────
CREATE OR REPLACE FUNCTION public.agent_module_access_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.enabled AND auth.uid() IS NOT NULL AND NOT public.agent_can_configure() THEN
    RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;

-- ── 2. The runner ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.agent_run_rules(p_now timestamptz DEFAULT now(), p_trigger text DEFAULT 'schedule')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  s public.agent_settings%ROWTYPE;
  v_code text; v_res jsonb; v_t0 timestamptz; v_created integer := 0; v_resolved integer := 0; v_errors text[] := '{}'; v_c integer; v_r integer;
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext('agent_run_rules')) THEN RETURN jsonb_build_object('skipped', true); END IF;
  SELECT * INTO s FROM public.agent_settings WHERE id;
  v_t0 := clock_timestamp();

  FOR v_code IN
    SELECT r.code FROM public.agent_rules r
     WHERE r.enabled AND r.status = 'ready'
       AND to_regprocedure('public.agent_rule_' || lower(r.code) || '(timestamp with time zone)') IS NOT NULL
       AND (r.module_key IS NULL OR coalesce((SELECT a.enabled FROM public.agent_module_access a WHERE a.module_key = r.module_key), false))
     ORDER BY r.code
  LOOP
    BEGIN
      EXECUTE format('SELECT public.agent_rule_%s($1)', lower(v_code)) INTO v_res USING p_now;
      v_c := coalesce((v_res ->> 'created')::integer, 0); v_r := coalesce((v_res ->> 'resolved')::integer, 0);
      v_created := v_created + v_c; v_resolved := v_resolved + v_r;
      IF v_c > 0 OR v_r > 0 THEN
        INSERT INTO public.agent_rule_runs (rule_code, trigger, started_at, finished_at, flags_created, flags_resolved) VALUES (v_code, p_trigger, v_t0, clock_timestamp(), v_c, v_r);
      END IF;
      -- the rule works again: close any "rule failed" item for it
      PERFORM public.agent_resolve_flags('SY03', ARRAY[v_code], NULL, p_now);
    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors || v_code;
      INSERT INTO public.agent_rule_runs (rule_code, trigger, started_at, finished_at, error) VALUES (v_code, p_trigger, v_t0, clock_timestamp(), left(SQLERRM, 300));
      PERFORM public.agent_raise_flag('SY03', NULL, NULL, 'system', v_code, to_char(p_now AT TIME ZONE s.timezone, 'YYYY-MM-DD'), 'medium', 'Rule failed: ' || v_code,
                'The monitor could not run this rule: ' || left(SQLERRM, 200), jsonb_build_object('rule', v_code), NULL, p_now);
    END;
  END LOOP;

  -- A rule that was switched off stops showing items that only it could close.
  UPDATE public.agent_flags f SET status = 'auto_resolved', updated_at = p_now
   WHERE f.status IN ('open', 'snoozed') AND f.rule_code <> 'SY03'
     AND EXISTS (SELECT 1 FROM public.agent_rules r WHERE r.code = f.rule_code AND NOT r.enabled);

  -- Snoozed items wake up when their time is over.
  UPDATE public.agent_flags SET status = 'open', snoozed_until = NULL, updated_at = p_now WHERE status = 'snoozed' AND snoozed_until < p_now;
  IF extract(minute FROM p_now) = 0 THEN DELETE FROM public.agent_rule_runs WHERE started_at < p_now - interval '14 days'; END IF;

  INSERT INTO public.agent_monitor_state (key, value, updated_at)
  VALUES ('last_run', jsonb_build_object('at', p_now, 'ok', cardinality(v_errors) = 0, 'ms', round(extract(epoch FROM (clock_timestamp() - v_t0)) * 1000),
                                         'created', v_created, 'resolved', v_resolved, 'errors', to_jsonb(v_errors), 'trigger', p_trigger), now())
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at;
  RETURN jsonb_build_object('created', v_created, 'resolved', v_resolved, 'errors', to_jsonb(v_errors));
END $$;

-- Raising an item honours the switch of its rule.
CREATE OR REPLACE FUNCTION public.agent_raise_flag(
  p_rule text, p_module text, p_person uuid, p_subject_type text, p_subject_id text, p_period text, p_severity text,
  p_title text, p_why text, p_evidence jsonb, p_action text DEFAULT NULL, p_now timestamptz DEFAULT now()
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_company uuid; v_manager uuid; v_id uuid; v_inserted boolean; v_prev text;
BEGIN
  -- A rule that is switched off raises nothing (SY03 always may).
  IF p_rule <> 'SY03' AND EXISTS (SELECT 1 FROM public.agent_rules r WHERE r.code = p_rule AND NOT r.enabled) THEN RETURN false; END IF;
  IF p_person IS NOT NULL THEN SELECT company_id, manager_id INTO v_company, v_manager FROM public.agent_team_v WHERE person_id = p_person; END IF;
  SELECT status INTO v_prev FROM public.agent_flags
   WHERE rule_code = p_rule AND subject_type = p_subject_type AND subject_id = p_subject_id AND period_key = p_period;

  INSERT INTO public.agent_flags AS f (company_id, module, rule_code, severity, subject_type, subject_id, person_id, manager_id, title, why,
                                       evidence, suggested_action, period_key, first_seen_at, last_seen_at, item_type)
  VALUES (v_company, p_module, p_rule, p_severity, p_subject_type, p_subject_id, p_person, v_manager, left(p_title, 200), left(coalesce(p_why, ''), 1000),
          coalesce(p_evidence, '{}'::jsonb), p_action, p_period, p_now, p_now, 'flag')
  ON CONFLICT ON CONSTRAINT agent_flags_dedupe DO UPDATE SET
    severity = EXCLUDED.severity, title = EXCLUDED.title, why = EXCLUDED.why, evidence = EXCLUDED.evidence,
    suggested_action = EXCLUDED.suggested_action, last_seen_at = p_now, updated_at = p_now,
    status = CASE WHEN f.status = 'auto_resolved' OR (f.status = 'snoozed' AND f.snoozed_until < p_now) THEN 'open' ELSE f.status END,
    snoozed_until = CASE WHEN f.status = 'snoozed' AND f.snoozed_until < p_now THEN NULL ELSE f.snoozed_until END,
    occurrence_count = CASE WHEN f.status = 'auto_resolved' THEN f.occurrence_count + 1 ELSE f.occurrence_count END
  RETURNING f.id, (xmax = 0) INTO v_id, v_inserted;

  IF v_inserted THEN
    INSERT INTO public.agent_flag_events (flag_id, kind, detail) VALUES (v_id, 'created', jsonb_build_object('rule', p_rule));
  ELSIF v_prev = 'auto_resolved' THEN
    INSERT INTO public.agent_flag_events (flag_id, kind, detail) VALUES (v_id, 'reopened', jsonb_build_object('rule', p_rule));
  END IF;
  RETURN v_inserted OR v_prev = 'auto_resolved';
END $$;

-- ── 4. The site lists ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.agent_clean_domain(p_raw text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT nullif(regexp_replace(regexp_replace(regexp_replace(lower(btrim(coalesce(p_raw, ''))), '^[a-z]+://', ''), '^www\.', ''), '[/?#:].*$', ''), '')
$$;

CREATE OR REPLACE FUNCTION public.agent_domain_set(p_domain text, p_category text, p_source text DEFAULT 'manual')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_d text := public.agent_clean_domain(p_domain); v_id uuid;
BEGIN
  IF NOT public.agent_can_configure() THEN RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501'; END IF;
  IF v_d IS NULL OR v_d !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$' THEN RAISE EXCEPTION 'bad_domain' USING ERRCODE = '22023'; END IF;
  IF p_category NOT IN ('approved', 'unproductive', 'unknown') THEN RAISE EXCEPTION 'bad_category' USING ERRCODE = '22023'; END IF;
  IF p_source NOT IN ('manual', 'ai_suggestion', 'seen') THEN p_source := 'manual'; END IF;
  INSERT INTO public.agent_domain_list (domain, category, company_id, team, source, created_by)
  VALUES (v_d, p_category, NULL, NULL, p_source, auth.uid())
  ON CONFLICT (domain, coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(team, ''))
  DO UPDATE SET category = EXCLUDED.category, source = EXCLUDED.source, created_by = EXCLUDED.created_by
  RETURNING id INTO v_id;
  -- Approved or marked unproductive: the open site flags for it are settled by the next check; run it now so the Inbox is current.
  PERFORM public.agent_run_rules();
  RETURN jsonb_build_object('id', v_id, 'domain', v_d, 'category', p_category);
END $$;

CREATE OR REPLACE FUNCTION public.agent_domain_remove(p_domain text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_n integer;
BEGIN
  IF NOT public.agent_can_configure() THEN RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501'; END IF;
  DELETE FROM public.agent_domain_list WHERE domain = public.agent_clean_domain(p_domain) AND company_id IS NULL AND team IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n > 0;
END $$;

REVOKE ALL ON FUNCTION public.agent_domain_set(text, text, text), public.agent_domain_remove(text), public.agent_clean_domain(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agent_domain_set(text, text, text), public.agent_domain_remove(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.agent_clean_domain(text) TO authenticated, service_role;
