-- Ops Agent v2: always-on AI, Chat data tools, Connections and inbound API keys.
--
--   1. AI is on by default (no mode or AI switch to flip). The mode column stays for history; nothing reads it.
--   2. Connections: one more kind ("api").
--   3. Secrets: write-only helpers over Vault (service role only). The Claude key and every connection secret
--      live there. Nothing returns a secret to a browser.
--   4. Inbound API keys: create (Super Admin), verify (service role), per key rate limit.
--   5. agent_inbound_create: turns an inbound webhook call into an Inbox item.
--   6. agent_chat_tool: the only way chat reads business data. Every row passes agent_in_scope for the signed in user.
--
-- Additive. Rollback: supabase/rollbacks/20261409_agent_v2_down.sql

-- ── 1. AI on ───────────────────────────────────────────────────────────────
ALTER TABLE public.agent_settings ALTER COLUMN ai_enabled SET DEFAULT true;
UPDATE public.agent_settings SET ai_enabled = true WHERE NOT ai_enabled;

-- ── 2. Connection kinds ────────────────────────────────────────────────────
ALTER TABLE public.agent_connections DROP CONSTRAINT IF EXISTS agent_connections_kind_check;
ALTER TABLE public.agent_connections
  ADD CONSTRAINT agent_connections_kind_check CHECK (kind IN ('cliq', 'slack', 'email', 'webhook', 'n8n', 'whatsapp', 'api'));

-- ── 3. Secrets in Vault ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.agent_secret_set(p_name text, p_value text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, vault, pg_temp AS $$
DECLARE v_id uuid;
BEGIN
  IF p_name !~ '^agent_[a-z0-9_]{1,80}$' THEN RAISE EXCEPTION 'bad_secret_name'; END IF;
  IF p_value IS NULL OR length(p_value) = 0 OR length(p_value) > 4000 THEN RAISE EXCEPTION 'bad_secret_value'; END IF;
  SELECT id INTO v_id FROM vault.secrets WHERE name = p_name;
  IF v_id IS NULL THEN
    PERFORM vault.create_secret(p_value, p_name, 'Ops Agent');
  ELSE
    PERFORM vault.update_secret(v_id, p_value, p_name, 'Ops Agent');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.agent_secret_get(p_name text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, vault, pg_temp AS $$
DECLARE v text;
BEGIN
  IF p_name !~ '^agent_[a-z0-9_]{1,80}$' THEN RETURN NULL; END IF;
  SELECT decrypted_secret INTO v FROM vault.decrypted_secrets WHERE name = p_name;
  RETURN v;
END $$;

CREATE OR REPLACE FUNCTION public.agent_secret_exists(p_name text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, vault, pg_temp AS $$
BEGIN
  RETURN EXISTS (SELECT 1 FROM vault.secrets WHERE name = p_name AND p_name ~ '^agent_[a-z0-9_]{1,80}$');
END $$;

CREATE OR REPLACE FUNCTION public.agent_secret_delete(p_name text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, vault, pg_temp AS $$
BEGIN
  IF p_name !~ '^agent_[a-z0-9_]{1,80}$' THEN RETURN; END IF;
  DELETE FROM vault.secrets WHERE name = p_name;
END $$;

REVOKE ALL ON FUNCTION public.agent_secret_set(text, text), public.agent_secret_get(text),
  public.agent_secret_exists(text), public.agent_secret_delete(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agent_secret_set(text, text), public.agent_secret_get(text),
  public.agent_secret_exists(text), public.agent_secret_delete(text) TO service_role;

-- ── 4. Inbound API keys ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.agent_api_hits (
  key_id uuid NOT NULL REFERENCES public.agent_api_keys(id) ON DELETE CASCADE,
  minute timestamptz NOT NULL,
  n integer NOT NULL DEFAULT 0,
  PRIMARY KEY (key_id, minute)
);
ALTER TABLE public.agent_api_hits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.agent_api_hits FROM PUBLIC, anon, authenticated;

-- The plain key is returned once, here, and never again; only its SHA-256 is stored.
CREATE OR REPLACE FUNCTION public.agent_api_key_create(p_name text, p_scopes text[] DEFAULT ARRAY['flags:read', 'flags:write'])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_key text; v_id uuid;
BEGIN
  IF NOT public.agent_can_configure() THEN RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501'; END IF;
  IF p_name IS NULL OR length(btrim(p_name)) = 0 OR length(p_name) > 80 THEN RAISE EXCEPTION 'bad_name'; END IF;
  IF p_scopes IS NULL OR cardinality(p_scopes) = 0 OR NOT (p_scopes <@ ARRAY['flags:read', 'flags:write']) THEN RAISE EXCEPTION 'bad_scopes'; END IF;
  v_key := 'kdagent_' || replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  INSERT INTO public.agent_api_keys (name, key_prefix, key_hash, scopes, created_by)
  VALUES (btrim(p_name), left(v_key, 12), encode(sha256(convert_to(v_key, 'utf8')), 'hex'), p_scopes, auth.uid())
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('id', v_id, 'key', v_key, 'prefix', left(v_key, 12));
END $$;
REVOKE ALL ON FUNCTION public.agent_api_key_create(text, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agent_api_key_create(text, text[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.agent_api_key_verify(p_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE k public.agent_api_keys%ROWTYPE; v_n integer;
BEGIN
  IF p_key IS NULL OR length(p_key) > 200 THEN RETURN NULL; END IF;
  SELECT * INTO k FROM public.agent_api_keys
   WHERE key_hash = encode(sha256(convert_to(p_key, 'utf8')), 'hex') AND revoked_at IS NULL;
  IF NOT FOUND THEN RETURN NULL; END IF;
  INSERT INTO public.agent_api_hits (key_id, minute, n) VALUES (k.id, date_trunc('minute', now()), 1)
  ON CONFLICT (key_id, minute) DO UPDATE SET n = public.agent_api_hits.n + 1
  RETURNING n INTO v_n;
  DELETE FROM public.agent_api_hits WHERE key_id = k.id AND minute < now() - interval '1 hour';
  UPDATE public.agent_api_keys SET last_used_at = now()
   WHERE id = k.id AND (last_used_at IS NULL OR last_used_at < now() - interval '5 minutes');
  RETURN jsonb_build_object('id', k.id, 'name', k.name, 'scopes', to_jsonb(k.scopes), 'limited', v_n > k.rate_limit_per_min);
END $$;
REVOKE ALL ON FUNCTION public.agent_api_key_verify(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agent_api_key_verify(text) TO service_role;

-- ── 5. Inbound webhook -> Inbox item ───────────────────────────────────────
-- Body: { title (required), message?, severity?, id? (your own reference; the same id updates the same item),
--         person_email?, data? }.  Calling again with the same id counts another occurrence.
CREATE OR REPLACE FUNCTION public.agent_inbound_create(p_key_id uuid, p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_title text := left(btrim(coalesce(p_payload ->> 'title', '')), 200);
  v_why text := left(coalesce(p_payload ->> 'message', ''), 2000);
  v_sev text := lower(coalesce(p_payload ->> 'severity', 'medium'));
  v_ext text := left(btrim(coalesce(nullif(p_payload ->> 'id', ''), gen_random_uuid()::text)), 120);
  v_person uuid;
  v_data jsonb := CASE WHEN jsonb_typeof(p_payload -> 'data') IN ('object', 'array') AND length((p_payload -> 'data')::text) <= 4000 THEN p_payload -> 'data' ELSE NULL END;
  v_id uuid; v_count integer;
BEGIN
  IF v_title = '' THEN RAISE EXCEPTION 'title_required'; END IF;
  IF v_sev NOT IN ('info', 'low', 'medium', 'high', 'critical') THEN v_sev := 'medium'; END IF;
  IF p_payload ->> 'person_email' IS NOT NULL THEN
    SELECT id INTO v_person FROM public.profiles
     WHERE lower(email) = lower(btrim(p_payload ->> 'person_email')) AND status = 'active' LIMIT 1;
  END IF;
  INSERT INTO public.agent_flags AS f (company_id, rule_code, severity, subject_type, subject_id, person_id, title, why, evidence, item_type, period_key)
  VALUES (public.agent_company_of(v_person), 'INBOUND', v_sev, 'system', v_ext, v_person, v_title, v_why,
          jsonb_strip_nulls(jsonb_build_object('source', 'inbound_api', 'key_id', p_key_id, 'data', v_data)), 'flag', '')
  ON CONFLICT ON CONSTRAINT agent_flags_dedupe DO UPDATE
    SET occurrence_count = f.occurrence_count + 1, last_seen_at = now(), title = EXCLUDED.title, why = EXCLUDED.why,
        severity = EXCLUDED.severity, evidence = EXCLUDED.evidence,
        status = CASE WHEN f.status = 'auto_resolved' THEN 'open' ELSE f.status END
  RETURNING f.id, f.occurrence_count INTO v_id, v_count;
  RETURN jsonb_build_object('id', v_id, 'occurrences', v_count);
END $$;
REVOKE ALL ON FUNCTION public.agent_inbound_create(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agent_inbound_create(uuid, jsonb) TO service_role;

-- ── 6. Chat data tools ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.agent_safe_date(p text)
RETURNS date LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF p IS NULL OR p !~ '^\d{4}-\d{2}-\d{2}$' THEN RETURN NULL; END IF;
  RETURN p::date;
EXCEPTION WHEN others THEN RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.agent_chat_tool(p_tool text, p_args jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp SET statement_timeout = '10s' AS $$
DECLARE
  s public.agent_settings%ROWTYPE;
  a jsonb := CASE WHEN jsonb_typeof(p_args) = 'object' THEN p_args ELSE '{}'::jsonb END;
  v_super boolean;
  v_limit integer := CASE WHEN a ->> 'limit' ~ '^\d{1,3}$' THEN least(greatest((a ->> 'limit')::integer, 1), 50) ELSE 25 END;
  v_today date;
  v_name text := nullif(btrim(left(a ->> 'name', 80)), '');
  v_status text := nullif(btrim(a ->> 'status'), '');
  v_group text := nullif(btrim(a ->> 'group'), '');
  v_from date := public.agent_safe_date(a ->> 'from');
  v_to date := public.agent_safe_date(a ->> 'to');
  v_day date;
  v_rows jsonb;
  v_out jsonb;
  v_date_field text; v_person_field text; v_setting_field text; v_working boolean;
  v_core_exists boolean;
BEGIN
  IF NOT public.agent_can_access() THEN RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501'; END IF;
  v_super := public.agent_can_configure();
  SELECT * INTO s FROM public.agent_settings WHERE id;
  v_today := (now() AT TIME ZONE s.timezone)::date;
  IF v_status IS NOT NULL AND v_status NOT IN ('to_do', 'in_progress', 'in_review', 'blocked', 'done') THEN v_status := NULL; END IF;
  IF v_group IS NOT NULL AND v_group NOT IN ('leadership', 'core', 'placement') THEN v_group := NULL; END IF;

  IF p_tool = 'people' THEN
    SELECT coalesce(jsonb_agg(r), '[]'::jsonb) INTO v_rows FROM (
      SELECT p.full_name AS name, p.job_title AS title, p.role, c.name AS company, ap.group_name AS "group", m.full_name AS manager
        FROM agent_read.v_people p
        LEFT JOIN agent_read.v_companies c ON c.id = p.company_id
        LEFT JOIN public.agent_person_profile ap ON ap.person_id = p.id
        LEFT JOIN agent_read.v_people m ON m.id = p.reporting_manager_id
       WHERE p.status = 'active'
         AND (v_name IS NULL OR p.full_name ILIKE '%' || v_name || '%')
         AND (v_group IS NULL OR ap.group_name = v_group)
         AND (v_super OR public.agent_in_scope(p.company_id, 'people', p.id))
       ORDER BY p.full_name LIMIT v_limit) r;
    v_out := jsonb_build_object('people', v_rows);

  ELSIF p_tool = 'tasks' THEN
    SELECT coalesce(jsonb_agg(r), '[]'::jsonb) INTO v_rows FROM (
      SELECT t.title, t.status, t.priority, t.due_date, p.full_name AS assignee,
             (t.due_date < v_today AND t.status <> 'done') AS overdue
        FROM agent_read.v_tasks t
        LEFT JOIN agent_read.v_people p ON p.id = t.assignee_id
       WHERE t.parent_id IS NULL
         AND CASE WHEN v_status IS NULL THEN t.status <> 'done' ELSE t.status = v_status END
         AND (lower(coalesce(a ->> 'overdue', 'false')) NOT IN ('true', 't', '1') OR (t.due_date < v_today AND t.status <> 'done'))
         AND (v_name IS NULL OR p.full_name ILIKE '%' || v_name || '%')
         AND (v_from IS NULL OR t.due_date >= v_from) AND (v_to IS NULL OR t.due_date <= v_to)
         AND (v_super OR public.agent_in_scope(t.company_id, 'task', t.assignee_id))
       ORDER BY t.due_date NULLS LAST, t.title LIMIT v_limit) r;
    v_out := jsonb_build_object('today', v_today, 'tasks', v_rows, 'note', 'Open tasks unless a status is given. Subtasks are not counted.');

  ELSIF p_tool = 'task_summary' THEN
    SELECT coalesce(jsonb_agg(r), '[]'::jsonb) INTO v_rows FROM (
      SELECT coalesce(p.full_name, 'Unassigned') AS assignee,
             count(*) FILTER (WHERE t.status <> 'done') AS open,
             count(*) FILTER (WHERE t.status <> 'done' AND t.due_date < v_today) AS overdue,
             count(*) FILTER (WHERE t.status = 'blocked') AS blocked,
             count(*) FILTER (WHERE t.status = 'in_review') AS in_review,
             count(*) FILTER (WHERE t.status <> 'done' AND t.due_date IS NULL) AS no_due_date,
             count(*) FILTER (WHERE t.status = 'done' AND t.completed_at >= now() - interval '7 days') AS completed_last_7_days
        FROM agent_read.v_tasks t
        LEFT JOIN agent_read.v_people p ON p.id = t.assignee_id
       WHERE t.parent_id IS NULL
         AND (v_super OR public.agent_in_scope(t.company_id, 'task', t.assignee_id))
       GROUP BY p.full_name
       ORDER BY 3 DESC, 2 DESC LIMIT 25) r;
    v_out := jsonb_build_object('today', v_today, 'by_assignee', v_rows);

  ELSIF p_tool = 'daily_reports' THEN
    v_day := coalesce(public.agent_safe_date(a ->> 'date'), v_today);
    v_working := extract(isodow FROM v_day)::integer = ANY (s.default_working_days);
    SELECT t.report_date_field INTO v_setting_field FROM public.tm_tables t WHERE t.id = s.report_table_id;
    SELECT f.id::text INTO v_person_field FROM agent_read.v_report_fields f WHERE f.type = 'person' ORDER BY f.position LIMIT 1;
    IF v_setting_field IS DISTINCT FROM 'created_at' THEN
      SELECT f.id::text INTO v_date_field FROM agent_read.v_report_fields f
       WHERE f.type = 'date' AND (v_setting_field IS NULL OR f.id::text = v_setting_field) ORDER BY f.position LIMIT 1;
      IF v_date_field IS NULL AND v_setting_field IS NOT NULL THEN
        SELECT f.id::text INTO v_date_field FROM agent_read.v_report_fields f WHERE f.type = 'date' ORDER BY f.position LIMIT 1;
      END IF;
    END IF;
    SELECT EXISTS (SELECT 1 FROM public.agent_person_profile WHERE group_name = 'core') INTO v_core_exists;

    WITH day_rows AS (
      SELECT r.data, r.created_by FROM agent_read.v_report_rows r
       WHERE coalesce(public.agent_safe_date(left(r.data ->> v_date_field, 10)), (r.created_at AT TIME ZONE 'Africa/Lagos')::date) = v_day
    ), submitted AS (
      SELECT DISTINCT e::uuid AS person_id
        FROM day_rows d
        CROSS JOIN LATERAL jsonb_array_elements_text(
          CASE WHEN v_person_field IS NULL THEN jsonb_build_array(d.created_by)
               WHEN jsonb_typeof(d.data -> v_person_field) = 'array' THEN d.data -> v_person_field
               WHEN jsonb_typeof(d.data -> v_person_field) = 'string' THEN jsonb_build_array(d.data -> v_person_field)
               ELSE '[]'::jsonb END) AS e
       WHERE e ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    ), expected AS (
      SELECT p.id, p.full_name, p.company_id, m.full_name AS manager
        FROM agent_read.v_people p
        LEFT JOIN public.agent_person_profile ap ON ap.person_id = p.id
        LEFT JOIN agent_read.v_people m ON m.id = p.reporting_manager_id
        LEFT JOIN agent_read.v_companies c ON c.id = p.company_id
       WHERE p.status = 'active'
         AND coalesce(ap.exemptions ->> 'reports', 'false') <> 'true'
         AND CASE WHEN v_core_exists THEN ap.group_name = 'core'
                  ELSE c.name ILIKE 'kd squares%' AND p.role <> 'field_staff' AND coalesce(p.job_title, '') !~* 'field\s*agent' END
         AND (v_super OR public.agent_in_scope(p.company_id, 'reports', p.id))
    ), on_leave AS (
      SELECT DISTINCT employee_id FROM agent_read.v_leave WHERE v_day BETWEEN start_date AND end_date
    )
    SELECT jsonb_build_object(
             'date', v_day, 'working_day', v_working,
             'expected', (SELECT count(*) FROM expected),
             'submitted', (SELECT count(*) FROM expected e WHERE e.id IN (SELECT person_id FROM submitted)),
             'missing', coalesce((SELECT jsonb_agg(jsonb_build_object('name', e.full_name, 'manager', e.manager) ORDER BY e.full_name)
                                    FROM expected e WHERE e.id NOT IN (SELECT person_id FROM submitted) AND e.id NOT IN (SELECT employee_id FROM on_leave)), '[]'::jsonb),
             'on_leave', coalesce((SELECT jsonb_agg(e.full_name ORDER BY e.full_name) FROM expected e WHERE e.id IN (SELECT employee_id FROM on_leave) AND e.id NOT IN (SELECT person_id FROM submitted)), '[]'::jsonb),
             'reported', coalesce((SELECT jsonb_agg(e.full_name ORDER BY e.full_name) FROM expected e WHERE e.id IN (SELECT person_id FROM submitted)), '[]'::jsonb))
      INTO v_out;
    v_out := v_out || jsonb_build_object('note', CASE WHEN s.report_table_id IS NULL THEN 'No daily report table is chosen in Settings.' WHEN NOT v_working THEN 'This is not a default working day.' ELSE 'Expected = the core group (or KD Squares staff who are not Field Agents when no groups are set), minus exemptions.' END);

  ELSIF p_tool = 'hours' THEN
    v_to := coalesce(v_to, v_today);
    v_from := coalesce(v_from, v_to - 6);
    IF v_to - v_from > 92 THEN v_from := v_to - 92; END IF;
    SELECT coalesce(jsonb_agg(r), '[]'::jsonb) INTO v_rows FROM (
      SELECT p.full_name AS person,
             round((sum(coalesce(e.duration_minutes, extract(epoch FROM (coalesce(e.end_time, now()) - e.start_time)) / 60.0)) / 60.0)::numeric, 2) AS hours,
             count(*) AS entries,
             bool_or(e.end_time IS NULL) AS timer_running_now
        FROM agent_read.v_time_entries e
        JOIN agent_read.v_people p ON p.id = e.employee_id
       WHERE e.start_time >= (v_from::timestamp AT TIME ZONE s.timezone)
         AND e.start_time < ((v_to + 1)::timestamp AT TIME ZONE s.timezone)
         AND (v_name IS NULL OR p.full_name ILIKE '%' || v_name || '%')
         AND (v_super OR public.agent_in_scope(e.company_id, 'track', e.employee_id))
       GROUP BY p.full_name ORDER BY 2 DESC LIMIT v_limit) r;
    v_out := jsonb_build_object('from', v_from, 'to', v_to, 'tracked_hours', v_rows);

  ELSIF p_tool = 'leave' THEN
    v_day := coalesce(public.agent_safe_date(a ->> 'date'), v_today);
    SELECT coalesce(jsonb_agg(r), '[]'::jsonb) INTO v_rows FROM (
      SELECT p.full_name AS person, l.start_date AS "from", l.end_date AS "to", l.is_half_day AS half_day, l.source
        FROM agent_read.v_leave l
        JOIN agent_read.v_people p ON p.id = l.employee_id
       WHERE v_day BETWEEN l.start_date AND l.end_date
         AND (v_super OR public.agent_in_scope(p.company_id, 'leave', p.id))
       ORDER BY p.full_name LIMIT v_limit) r;
    v_out := jsonb_build_object('date', v_day, 'on_approved_leave', v_rows);

  ELSIF p_tool = 'flags' THEN
    SELECT coalesce(jsonb_agg(r), '[]'::jsonb) INTO v_rows FROM (
      SELECT f.title, f.severity, f.rule_code, f.why, f.occurrence_count, f.last_seen_at, p.full_name AS person
        FROM public.agent_flags f
        LEFT JOIN agent_read.v_people p ON p.id = f.person_id
       WHERE f.status = 'open'
         AND (v_super OR public.agent_in_scope(f.company_id, f.module, f.person_id))
       ORDER BY CASE f.severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 WHEN 'low' THEN 4 ELSE 5 END, f.last_seen_at DESC
       LIMIT v_limit) r;
    v_out := jsonb_build_object('open_flags', v_rows);

  ELSIF p_tool = 'request_human_action' THEN
    -- The agent never edits or deletes anything. A request to do so becomes an Inbox item a person must act on.
    IF coalesce(btrim(a ->> 'title'), '') = '' THEN RAISE EXCEPTION 'title_required'; END IF;
    INSERT INTO public.agent_flags (company_id, rule_code, severity, subject_type, subject_id, title, why, item_type, assigned_to, period_key)
    VALUES (public.agent_company_of(auth.uid()), 'HUMAN_ACTION', 'medium', 'system', gen_random_uuid()::text,
            left(btrim(a ->> 'title'), 200), left(coalesce(a ->> 'details', ''), 2000), 'human_action', auth.uid(), '')
    RETURNING jsonb_build_object('created', true, 'id', id) INTO v_out;

  ELSE
    RAISE EXCEPTION 'unknown_tool';
  END IF;

  RETURN v_out || jsonb_build_object('tool', p_tool,
    'scope', CASE WHEN v_super THEN 'all companies and modules' ELSE 'limited to the companies and modules this person may see' END);
END $$;
REVOKE ALL ON FUNCTION public.agent_safe_date(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agent_safe_date(text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.agent_chat_tool(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agent_chat_tool(text, jsonb) TO authenticated;

-- ── 7. The edge functions run as the service role ──────────────────────────
-- Supabase normally grants it every table through default privileges; state it here so nothing depends on that.
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'agent\_%' LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO service_role', t);
  END LOOP;
END $$;
