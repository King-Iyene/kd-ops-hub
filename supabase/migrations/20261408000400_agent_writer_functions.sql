-- Ops Agent, Phase 1 (5 of 6): the functions the agent writes through, plus two Settings helpers.
--
--   agent_log_ai_usage(...)            service role only: one row per Claude call
--   agent_audit_write(...)             service role only: audit row on behalf of a person (edge functions)
--   agent_ai_budget_state()            spend vs budget: ok / warn (80%) / off (100%)
--   agent_suggest_person_profiles(..)  Super Admin: propose group and manager for everyone
--   agent_seed_domains()               Super Admin: copy Track's site rules into the domain list
--
-- Rollback: supabase/rollbacks/20261408_agent_down.sql

CREATE OR REPLACE FUNCTION public.agent_log_ai_usage(
  p_feature text, p_model text,
  p_input_tokens integer, p_cached_input_tokens integer, p_cache_write_tokens integer, p_output_tokens integer,
  p_cost_usd numeric, p_ok boolean DEFAULT true, p_error text DEFAULT NULL, p_user uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.agent_ai_usage (feature, model, input_tokens, cached_input_tokens, cache_write_tokens, output_tokens, cost_usd, ok, error, user_id)
  VALUES (left(p_feature, 80), left(p_model, 80), greatest(coalesce(p_input_tokens, 0), 0), greatest(coalesce(p_cached_input_tokens, 0), 0),
          greatest(coalesce(p_cache_write_tokens, 0), 0), greatest(coalesce(p_output_tokens, 0), 0),
          greatest(coalesce(p_cost_usd, 0), 0), coalesce(p_ok, true), left(p_error, 500), p_user)
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.agent_log_ai_usage(text, text, integer, integer, integer, integer, numeric, boolean, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agent_log_ai_usage(text, text, integer, integer, integer, integer, numeric, boolean, text, uuid) TO service_role;

-- Edge functions run as the service role (no signed-in user), so they say who acted.
CREATE OR REPLACE FUNCTION public.agent_audit_write(p_actor uuid, p_action text, p_entity_type text DEFAULT NULL, p_entity_id text DEFAULT NULL, p_detail jsonb DEFAULT '{}')
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  INSERT INTO public.agent_audit_log (actor_id, action, entity_type, entity_id, detail)
  VALUES (p_actor, left(p_action, 120), p_entity_type, p_entity_id, public.agent_shorten_json(p_detail))
$$;
REVOKE ALL ON FUNCTION public.agent_audit_write(uuid, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agent_audit_write(uuid, text, text, text, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.agent_ai_budget_state()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  s public.agent_settings%ROWTYPE;
  v_day_start timestamptz;
  v_month_start timestamptz;
  v_day numeric;
  v_month numeric;
  v_level text := 'ok';
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.agent_can_access() THEN
    RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO s FROM public.agent_settings WHERE id;
  v_day_start := date_trunc('day', now() AT TIME ZONE s.timezone) AT TIME ZONE s.timezone;
  v_month_start := date_trunc('month', now() AT TIME ZONE s.timezone) AT TIME ZONE s.timezone;
  SELECT coalesce(sum(cost_usd), 0) INTO v_day FROM public.agent_ai_usage WHERE created_at >= v_day_start;
  SELECT coalesce(sum(cost_usd), 0) INTO v_month FROM public.agent_ai_usage WHERE created_at >= v_month_start;

  IF v_month >= s.monthly_ai_budget_usd OR v_day >= s.daily_ai_budget_usd THEN
    v_level := 'off';
  ELSIF v_month >= 0.8 * s.monthly_ai_budget_usd OR v_day >= 0.8 * s.daily_ai_budget_usd THEN
    v_level := 'warn';
  END IF;

  RETURN jsonb_build_object(
    'level', v_level,
    'ai_enabled', s.ai_enabled,
    'spent_today_usd', round(v_day, 4),
    'spent_month_usd', round(v_month, 4),
    'daily_budget_usd', s.daily_ai_budget_usd,
    'monthly_budget_usd', s.monthly_ai_budget_usd
  );
END $$;
REVOKE ALL ON FUNCTION public.agent_ai_budget_state() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agent_ai_budget_state() TO authenticated, service_role;

-- Proposes a group and manager for every active person. Never overwrites a group set by hand.
--   leadership: people in the pay groups passed in (default: the pay group named "KDS - Directors")
--   placement:  people with an active placement
--   core:       everyone else who belongs to a company (has a pay group)
-- People without a pay group have no company and are skipped.
CREATE OR REPLACE FUNCTION public.agent_suggest_person_profiles(p_leadership_pay_groups uuid[] DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_leadership uuid[];
  v_written integer;
  v_manual integer;
  v_no_company integer;
BEGIN
  IF NOT public.agent_can_configure() THEN RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501'; END IF;

  v_leadership := coalesce(p_leadership_pay_groups,
    ARRAY(SELECT id FROM public.pay_groups WHERE lower(btrim(name)) = 'kds - directors'));

  SELECT count(*) INTO v_no_company FROM public.profiles p
   WHERE p.status = 'active' AND coalesce(p.is_anonymised, false) = false AND p.pay_group_id IS NULL;

  WITH people AS (
    SELECT p.id, p.reporting_manager_id,
           CASE
             WHEN p.pay_group_id = ANY (v_leadership) THEN 'leadership'
             WHEN EXISTS (SELECT 1 FROM public.placements pl WHERE pl.employee_id = p.id AND pl.status = 'active') THEN 'placement'
             ELSE 'core'
           END AS grp
      FROM public.profiles p
     WHERE p.status = 'active' AND coalesce(p.is_anonymised, false) = false AND p.pay_group_id IS NOT NULL
  ), up AS (
    INSERT INTO public.agent_person_profile AS a (person_id, group_name, group_source, manager_id, updated_by)
    SELECT id, grp, 'auto', reporting_manager_id, auth.uid() FROM people
    ON CONFLICT (person_id) DO UPDATE
      SET group_name = EXCLUDED.group_name,
          manager_id = coalesce(a.manager_id, EXCLUDED.manager_id),
          updated_by = auth.uid()
      WHERE a.group_source = 'auto' OR a.group_name IS NULL
    RETURNING 1
  )
  SELECT count(*) INTO v_written FROM up;

  SELECT count(*) INTO v_manual FROM public.agent_person_profile WHERE group_source = 'manual' AND group_name IS NOT NULL;

  RETURN jsonb_build_object('written', v_written, 'kept_manual', v_manual, 'skipped_no_company', v_no_company);
END $$;
REVOKE ALL ON FUNCTION public.agent_suggest_person_profiles(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agent_suggest_person_profiles(uuid[]) TO authenticated;

-- Copies Track's site rules into the domain list: productive -> approved, unproductive -> unproductive.
-- Only rules that name a site (a dot in the app name, no window-title condition).
CREATE OR REPLACE FUNCTION public.agent_seed_domains()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_count integer;
BEGIN
  IF NOT public.agent_can_configure() THEN RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501'; END IF;
  WITH ins AS (
    INSERT INTO public.agent_domain_list (domain, category, source, created_by)
    SELECT DISTINCT ON (d) d, CASE r.category WHEN 'productive' THEN 'approved' ELSE 'unproductive' END, 'productivity_rules', auth.uid()
      FROM public.time_productivity_rules r
      CROSS JOIN LATERAL (SELECT regexp_replace(lower(btrim(r.app_name_contains)), '^www\.', '') AS d) x
     WHERE r.category IN ('productive', 'unproductive')
       AND r.title_contains IS NULL
       AND r.app_name_contains LIKE '%.%'
       AND r.app_name_contains !~ '\s'
    ON CONFLICT DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM ins;
  RETURN v_count;
END $$;
REVOKE ALL ON FUNCTION public.agent_seed_domains() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agent_seed_domains() TO authenticated;
