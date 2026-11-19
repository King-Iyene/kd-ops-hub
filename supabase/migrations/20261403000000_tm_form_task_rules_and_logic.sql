-- Task module forms: which tasks a Task question offers, and conditions that
-- show or hide a question based on an earlier answer.
--
-- 1. Task questions no longer list every open task. A Task field's settings
--    (tm_table_fields.config) choose:
--      task_statuses       text[]  statuses to offer. Default: in_progress,
--                                  in_review, blocked (not "to do", not done)
--      overdue_grace_days  integer tasks overdue by more than this many days
--                                  are left out. Default 2. Tasks due today or
--                                  in the future are always offered.
--      task_undated        boolean also offer tasks with no due date.
--                                  Default true.
--    The same rule decides what the form lists and what a submission may
--    pick (tm_form_submit re-checks it on the server).
--
-- 2. tm_forms.logic holds show/hide rules, keyed by question (field) id:
--      { "<field id>": { "mode": "show" | "hide",
--                        "match": "all" | "any",
--                        "conditions": [ { "field": "<earlier field id>",
--                                          "op": "is", "value": "On track" } ] } }
--    Rules are evaluated in the order the questions appear. A question that
--    is hidden has its answer thrown away and counts as unanswered for any
--    later rule, so a rule can only ever look at questions above it.

ALTER TABLE public.tm_forms ADD COLUMN IF NOT EXISTS logic jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.tm_forms DROP CONSTRAINT IF EXISTS tm_forms_logic_shape;
ALTER TABLE public.tm_forms ADD CONSTRAINT tm_forms_logic_shape CHECK (jsonb_typeof(logic) = 'object');

-- ── Which tasks a Task question may offer ───────────────────────────────
CREATE OR REPLACE FUNCTION public.tm_form_task_eligible(p_status text, p_due date, p_config jsonb)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    p_status = ANY (
      CASE WHEN coalesce(jsonb_typeof(p_config -> 'task_statuses'), '') = 'array'
                AND jsonb_array_length(p_config -> 'task_statuses') > 0
           THEN ARRAY(SELECT jsonb_array_elements_text(p_config -> 'task_statuses'))
           ELSE ARRAY['in_progress', 'in_review', 'blocked'] END
    )
    AND CASE
      WHEN p_due IS NULL THEN (p_config ->> 'task_undated') IS DISTINCT FROM 'false'
      ELSE p_due >= current_date - CASE WHEN (p_config ->> 'overdue_grace_days') ~ '^[0-9]{1,4}$'
                                        THEN (p_config ->> 'overdue_grace_days')::integer ELSE 2 END
    END
$$;

-- ── Conditions ──────────────────────────────────────────────────────────
-- Does one answer satisfy one condition? Never returns NULL.
CREATE OR REPLACE FUNCTION public.tm_form_cond_met(p_ans jsonb, p_op text, p_val jsonb)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_empty boolean := p_ans IS NULL OR p_ans IN ('null'::jsonb, '""'::jsonb, '[]'::jsonb, 'false'::jsonb);
  v_texts text[];
  v_want text[];
  v_val text := p_val #>> '{}';
  v_a numeric;
  v_b numeric;
BEGIN
  -- The answer as a list of text values (one for a single answer).
  IF p_ans IS NULL OR jsonb_typeof(p_ans) = 'null' THEN
    v_texts := '{}';
  ELSIF jsonb_typeof(p_ans) = 'array' THEN
    SELECT coalesce(array_agg(e #>> '{}'), '{}') INTO v_texts FROM jsonb_array_elements(p_ans) e;
  ELSE
    v_texts := ARRAY[p_ans #>> '{}'];
  END IF;

  CASE p_op
    WHEN 'is_empty' THEN RETURN v_empty;
    WHEN 'not_empty' THEN RETURN NOT v_empty;
    WHEN 'checked' THEN RETURN p_ans = 'true'::jsonb;
    WHEN 'unchecked' THEN RETURN p_ans IS DISTINCT FROM 'true'::jsonb;
    WHEN 'is', 'is_not' THEN
      RETURN (p_op = 'is') = coalesce((
        SELECT bool_or(t = v_val OR (t ~ '^-?[0-9]+(\.[0-9]+)?$' AND v_val ~ '^-?[0-9]+(\.[0-9]+)?$' AND t::numeric = v_val::numeric))
          FROM unnest(v_texts) t
      ), false);
    WHEN 'is_any_of', 'is_none_of' THEN
      IF jsonb_typeof(p_val) = 'array' THEN
        SELECT coalesce(array_agg(e #>> '{}'), '{}') INTO v_want FROM jsonb_array_elements(p_val) e;
      ELSE
        v_want := '{}';
      END IF;
      RETURN (p_op = 'is_any_of') = (v_texts && v_want);
    WHEN 'contains', 'not_contains' THEN
      RETURN (p_op = 'contains') = (coalesce(v_val, '') <> '' AND EXISTS (
        SELECT 1 FROM unnest(v_texts) t WHERE position(lower(v_val) in lower(t)) > 0
      ));
    WHEN 'gt', 'gte', 'lt', 'lte' THEN
      BEGIN
        v_a := (p_ans #>> '{}')::numeric;
        v_b := v_val::numeric;
      EXCEPTION WHEN others THEN
        RETURN false;
      END;
      IF v_a IS NULL OR v_b IS NULL THEN RETURN false; END IF;
      RETURN CASE p_op WHEN 'gt' THEN v_a > v_b WHEN 'gte' THEN v_a >= v_b WHEN 'lt' THEN v_a < v_b ELSE v_a <= v_b END;
    ELSE
      RETURN false;
  END CASE;
END
$$;

-- Is a question shown, given the answers of the questions shown above it?
-- A question with no (or an empty) rule is always shown.
CREATE OR REPLACE FUNCTION public.tm_form_rule_visible(p_rule jsonb, p_answers jsonb)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  c jsonb;
  v_met boolean;
  v_any boolean := false;
  v_all boolean := true;
BEGIN
  IF p_rule IS NULL OR coalesce(jsonb_typeof(p_rule), '') <> 'object'
     OR coalesce(jsonb_typeof(p_rule -> 'conditions'), '') <> 'array'
     OR jsonb_array_length(p_rule -> 'conditions') = 0 THEN
    RETURN true;
  END IF;
  FOR c IN SELECT * FROM jsonb_array_elements(p_rule -> 'conditions') LOOP
    v_met := public.tm_form_cond_met(p_answers -> (c ->> 'field'), c ->> 'op', c -> 'value');
    v_any := v_any OR v_met;
    v_all := v_all AND v_met;
  END LOOP;
  v_met := CASE WHEN p_rule ->> 'match' = 'any' THEN v_any ELSE v_all END;
  RETURN CASE WHEN p_rule ->> 'mode' = 'hide' THEN NOT v_met ELSE v_met END;
END
$$;

REVOKE ALL ON FUNCTION public.tm_form_task_eligible(text, date, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tm_form_cond_met(jsonb, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tm_form_rule_visible(jsonb, jsonb) FROM PUBLIC;

-- ── Form page data ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tm_form_load(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_form public.tm_forms;
  v_fields jsonb;
  v_has_person boolean;
  v_task_cfg jsonb;
  v_people jsonb := '[]'::jsonb;
  v_tasks jsonb := NULL;
  v_logic jsonb;
BEGIN
  v_form := public.tm_form_gate(p_token);

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', f.id, 'name', f.name, 'type', f.type,
           'config', jsonb_strip_nulls(jsonb_build_object(
             'required', f.config->'required', 'max_length', f.config->'max_length',
             'options', f.config->'options', 'currency', f.config->'currency',
             'decimals', f.config->'decimals', 'rating_max', f.config->'rating_max',
             'multiple', f.config->'multiple')))
           ORDER BY array_position(v_form.field_ids, f.id)), '[]'::jsonb)
    INTO v_fields
    FROM public.tm_table_fields f
   WHERE f.table_id = v_form.table_id
     AND f.id = ANY (v_form.field_ids)
     AND f.type NOT IN ('created_by', 'created_at', 'last_modified', 'auto_number', 'attachment');

  v_has_person := EXISTS (SELECT 1 FROM jsonb_array_elements(v_fields) e WHERE e->>'type' = 'person');

  IF v_has_person THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.full_name) ORDER BY p.full_name), '[]'::jsonb)
      INTO v_people
      FROM public.profiles p
     WHERE p.status = 'active' AND coalesce(p.is_anonymised, false) = false;
  END IF;

  -- Only the rules of questions that are on this form.
  SELECT coalesce(jsonb_object_agg(k, v), '{}'::jsonb)
    INTO v_logic
    FROM jsonb_each(v_form.logic) AS l(k, v)
   WHERE k IN (SELECT e ->> 'id' FROM jsonb_array_elements(v_fields) e);

  -- Kept for older copies of the form page: the first Task question's list
  -- when the form has no People question. The page now asks per question
  -- (tm_form_field_tasks).
  IF NOT v_has_person THEN
    SELECT f.config INTO v_task_cfg
      FROM public.tm_table_fields f
     WHERE f.table_id = v_form.table_id AND f.id = ANY (v_form.field_ids) AND f.type = 'task'
     ORDER BY array_position(v_form.field_ids, f.id) LIMIT 1;
    IF FOUND THEN
      SELECT coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'title', t.title) ORDER BY t.title), '[]'::jsonb)
        INTO v_tasks
        FROM (SELECT id, title FROM public.tm_tasks
               WHERE public.tm_form_task_eligible(status, due_date, v_task_cfg)
               ORDER BY due_date NULLS LAST, created_at DESC LIMIT 500) t;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'title', v_form.title,
    'description', v_form.description,
    'success_message', v_form.success_message,
    'fields', v_fields,
    'logic', v_logic,
    'people', v_people,
    'tasks', v_tasks
  );
END
$$;

-- ── Tasks for one Task question ─────────────────────────────────────────
-- With a People question on the form: that person's tasks (nothing until a
-- person is picked). Without one: every task that fits the field's rule.
CREATE OR REPLACE FUNCTION public.tm_form_field_tasks(p_token text, p_field uuid, p_person uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_form public.tm_forms;
  v_cfg jsonb;
  v_has_person boolean;
BEGIN
  v_form := public.tm_form_gate(p_token);
  SELECT f.config INTO v_cfg
    FROM public.tm_table_fields f
   WHERE f.id = p_field AND f.table_id = v_form.table_id AND f.id = ANY (v_form.field_ids) AND f.type = 'task';
  IF NOT FOUND THEN RETURN '[]'::jsonb; END IF;

  v_has_person := EXISTS (
    SELECT 1 FROM public.tm_table_fields f
     WHERE f.table_id = v_form.table_id AND f.id = ANY (v_form.field_ids) AND f.type = 'person'
  );
  IF v_has_person AND p_person IS NULL THEN RETURN '[]'::jsonb; END IF;

  RETURN (
    SELECT coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'title', t.title, 'due_date', t.due_date)
                              ORDER BY t.due_date NULLS LAST, t.title), '[]'::jsonb)
      FROM (SELECT id, title, due_date FROM public.tm_tasks
             WHERE public.tm_form_task_eligible(status, due_date, v_cfg)
               AND (p_person IS NULL OR assignee_id = p_person)
             ORDER BY due_date NULLS LAST LIMIT 300) t
  );
END
$$;

-- Older copies of the form page call this with just a person.
CREATE OR REPLACE FUNCTION public.tm_form_person_tasks(p_token text, p_person uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_form public.tm_forms;
  v_field uuid;
BEGIN
  v_form := public.tm_form_gate(p_token);
  SELECT f.id INTO v_field
    FROM public.tm_table_fields f
   WHERE f.table_id = v_form.table_id AND f.id = ANY (v_form.field_ids) AND f.type = 'task'
   ORDER BY array_position(v_form.field_ids, f.id) LIMIT 1;
  IF v_field IS NULL THEN RETURN '[]'::jsonb; END IF;
  RETURN public.tm_form_field_tasks(p_token, v_field, p_person);
END
$$;

-- ── Submit ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tm_form_submit(p_token text, p_data jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_form public.tm_forms;
  v_field record;
  v_val jsonb;
  v_eff jsonb := '{}'::jsonb;        -- answers to the questions that are shown
  v_shown uuid[] := '{}';
  v_clean jsonb := '{}'::jsonb;
  v_people uuid[] := '{}';
  v_has_person boolean;
  v_ids text[];
  v_id text;
  v_len integer;
  v_max integer;
  v_recent integer;
  v_record uuid;
BEGIN
  v_form := public.tm_form_gate(p_token);

  IF p_data IS NULL OR jsonb_typeof(p_data) <> 'object' OR length(p_data::text) > 50000 THEN
    RAISE EXCEPTION 'form_invalid' USING HINT = 'The answers could not be read. Please try again.';
  END IF;

  -- A light brake on flooding a public link.
  SELECT count(*) INTO v_recent FROM public.tm_table_records
   WHERE table_id = v_form.table_id AND created_at > now() - interval '1 minute';
  IF v_recent >= 60 THEN
    RAISE EXCEPTION 'form_busy' USING HINT = 'Too many responses right now. Please try again in a minute.';
  END IF;

  -- Pass 1 — which questions are shown. Top to bottom: a question hidden by
  -- its rule has its answer dropped, and later rules see it as unanswered.
  FOR v_field IN
    SELECT f.id FROM public.tm_table_fields f
     WHERE f.table_id = v_form.table_id AND f.id = ANY (v_form.field_ids)
       AND f.type NOT IN ('created_by', 'created_at', 'last_modified', 'auto_number', 'attachment')
     ORDER BY array_position(v_form.field_ids, f.id)
  LOOP
    IF public.tm_form_rule_visible(v_form.logic -> v_field.id::text, v_eff) THEN
      v_shown := v_shown || v_field.id;
      IF p_data ? v_field.id::text THEN
        v_eff := v_eff || jsonb_build_object(v_field.id::text, p_data -> v_field.id::text);
      END IF;
    END IF;
  END LOOP;

  v_has_person := EXISTS (
    SELECT 1 FROM public.tm_table_fields f WHERE f.id = ANY (v_shown) AND f.type = 'person'
  );

  -- Pass 2 — check the shown questions. People first, so Task answers can
  -- be checked against them.
  FOR v_field IN
    SELECT f.id, f.name, f.type, f.config FROM public.tm_table_fields f
     WHERE f.id = ANY (v_shown)
     ORDER BY (f.type = 'task'), array_position(v_form.field_ids, f.id)
  LOOP
    v_val := v_eff -> v_field.id::text;
    IF v_val IS NULL OR v_val = 'null'::jsonb OR v_val = '""'::jsonb OR v_val = '[]'::jsonb THEN
      IF coalesce((v_field.config->>'required')::boolean, false) THEN
        RAISE EXCEPTION 'form_required' USING HINT = format('"%s" is required.', v_field.name);
      END IF;
      CONTINUE;
    END IF;

    CASE
      WHEN v_field.type IN ('text', 'long_text', 'link', 'email', 'phone') THEN
        IF jsonb_typeof(v_val) <> 'string' THEN
          RAISE EXCEPTION 'form_invalid' USING HINT = format('"%s" must be text.', v_field.name);
        END IF;
        v_len := length(v_val #>> '{}');
        v_max := least(coalesce((v_field.config->>'max_length')::integer, 10000), 10000);
        IF v_len > v_max THEN
          RAISE EXCEPTION 'form_invalid' USING HINT = format('"%s" can be at most %s characters.', v_field.name, v_max);
        END IF;
        IF v_field.type = 'email' AND (v_val #>> '{}') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
          RAISE EXCEPTION 'form_invalid' USING HINT = format('"%s" must be an email address.', v_field.name);
        END IF;
        IF v_field.type = 'link' AND (v_val #>> '{}') !~* '^https?://\S+$' THEN
          RAISE EXCEPTION 'form_invalid' USING HINT = format('"%s" must be a web link starting with http:// or https://.', v_field.name);
        END IF;

      WHEN v_field.type IN ('number', 'currency', 'rating') THEN
        IF jsonb_typeof(v_val) <> 'number' THEN
          RAISE EXCEPTION 'form_invalid' USING HINT = format('"%s" must be a number.', v_field.name);
        END IF;
        IF v_field.type = 'rating' AND ((v_val #>> '{}')::numeric < 1
            OR (v_val #>> '{}')::numeric > coalesce((v_field.config->>'rating_max')::integer, 5)
            OR (v_val #>> '{}')::numeric <> trunc((v_val #>> '{}')::numeric)) THEN
          RAISE EXCEPTION 'form_invalid' USING HINT = format('"%s" is out of range.', v_field.name);
        END IF;

      WHEN v_field.type = 'date' THEN
        IF jsonb_typeof(v_val) <> 'string' OR (v_val #>> '{}') !~ '^\d{4}-\d{2}-\d{2}$' THEN
          RAISE EXCEPTION 'form_invalid' USING HINT = format('"%s" must be a date.', v_field.name);
        END IF;
        PERFORM (v_val #>> '{}')::date;

      WHEN v_field.type = 'checkbox' THEN
        IF jsonb_typeof(v_val) <> 'boolean' THEN
          RAISE EXCEPTION 'form_invalid' USING HINT = format('"%s" must be ticked or left blank.', v_field.name);
        END IF;

      WHEN v_field.type = 'single_select' THEN
        IF jsonb_typeof(v_val) <> 'string' OR NOT coalesce(v_field.config->'options', '[]'::jsonb) ? (v_val #>> '{}') THEN
          RAISE EXCEPTION 'form_invalid' USING HINT = format('Pick one of the options for "%s".', v_field.name);
        END IF;

      WHEN v_field.type = 'multi_select' THEN
        IF jsonb_typeof(v_val) <> 'array' OR EXISTS (
          SELECT 1 FROM jsonb_array_elements(v_val) e
           WHERE jsonb_typeof(e) <> 'string' OR NOT coalesce(v_field.config->'options', '[]'::jsonb) ? (e #>> '{}')
        ) THEN
          RAISE EXCEPTION 'form_invalid' USING HINT = format('Pick from the options for "%s".', v_field.name);
        END IF;

      WHEN v_field.type IN ('person', 'task') THEN
        IF jsonb_typeof(v_val) = 'string' THEN
          v_ids := ARRAY[v_val #>> '{}'];
        ELSIF jsonb_typeof(v_val) = 'array' AND coalesce((v_field.config->>'multiple')::boolean, false) THEN
          SELECT array_agg(e #>> '{}') INTO v_ids FROM jsonb_array_elements(v_val) e;
        ELSE
          RAISE EXCEPTION 'form_invalid' USING HINT = format('"%s" has an unexpected answer.', v_field.name);
        END IF;
        IF v_field.type = 'task' AND v_has_person AND cardinality(v_people) = 0 THEN
          RAISE EXCEPTION 'form_invalid' USING HINT = format('Choose a person before choosing a task for "%s".', v_field.name);
        END IF;
        FOREACH v_id IN ARRAY v_ids LOOP
          IF v_id !~ '^[0-9a-fA-F-]{36}$' THEN
            RAISE EXCEPTION 'form_invalid' USING HINT = format('"%s" has an unexpected answer.', v_field.name);
          END IF;
          IF v_field.type = 'person' THEN
            IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_id::uuid AND p.status = 'active') THEN
              RAISE EXCEPTION 'form_invalid' USING HINT = format('Pick someone from the list for "%s".', v_field.name);
            END IF;
            v_people := v_people || v_id::uuid;
          ELSE
            -- Only tasks the question may offer (its status / due-date rule),
            -- and — when the form asks who you are — only that person's.
            IF NOT EXISTS (
              SELECT 1 FROM public.tm_tasks t
               WHERE t.id = v_id::uuid
                 AND public.tm_form_task_eligible(t.status, t.due_date, v_field.config)
                 AND (cardinality(v_people) = 0 OR t.assignee_id = ANY (v_people))
            ) THEN
              RAISE EXCEPTION 'form_invalid' USING HINT = format('Pick one of the listed tasks for "%s".', v_field.name);
            END IF;
          END IF;
        END LOOP;
      ELSE
        CONTINUE;
    END CASE;

    v_clean := v_clean || jsonb_build_object(v_field.id::text, v_val);
  END LOOP;

  INSERT INTO public.tm_table_records (table_id, data, created_by)
  VALUES (v_form.table_id, v_clean, auth.uid())
  RETURNING id INTO v_record;
  RETURN v_record;
END
$$;

REVOKE ALL ON FUNCTION public.tm_form_field_tasks(text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tm_form_field_tasks(text, uuid, uuid) TO anon, authenticated;
-- Re-granted because CREATE OR REPLACE keeps existing grants, but state it.
GRANT EXECUTE ON FUNCTION public.tm_form_load(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tm_form_person_tasks(text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tm_form_submit(text, jsonb) TO anon, authenticated;
