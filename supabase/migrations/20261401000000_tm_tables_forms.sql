-- Task module tables: the full set of field types, auto numbers, and forms
-- with a shareable link.
--
-- Field types (tm_table_fields.type). "person" is shown as People and
-- "task" as Task link; the stored names are kept so existing columns keep
-- working. Type-specific settings live in tm_table_fields.config:
--   required    boolean  — a form will not submit without it
--   max_length  integer  — text / long_text / link / email / phone
--   options     text[]   — single_select / multi_select
--   currency    text     — currency symbol, e.g. "₦"
--   decimals    integer  — number / currency
--   rating_max  integer  — rating (default 5)
--   multiple    boolean  — person / task: allow more than one
-- created_by / created_at / last_modified / auto_number are computed from
-- the record itself and are never stored in data or asked on a form.

ALTER TABLE public.tm_table_fields DROP CONSTRAINT IF EXISTS tm_table_fields_type_check;
ALTER TABLE public.tm_table_fields ADD CONSTRAINT tm_table_fields_type_check CHECK (type IN (
  'text', 'long_text', 'number', 'currency', 'date', 'checkbox', 'single_select', 'multi_select',
  'link', 'email', 'phone', 'person', 'task', 'attachment', 'rating',
  'created_by', 'created_at', 'last_modified', 'auto_number'
));

-- ── Auto number ─────────────────────────────────────────────────────────
-- Every record gets the next number in its table, never reused.
ALTER TABLE public.tm_table_records ADD COLUMN IF NOT EXISTS row_number integer;

CREATE OR REPLACE FUNCTION public.tm_table_records_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Serialise numbering per table so two inserts never get the same number.
  PERFORM pg_advisory_xact_lock(hashtext('tm_table_records_number'), hashtext(NEW.table_id::text));
  SELECT coalesce(max(r.row_number), 0) + 1 INTO NEW.row_number
    FROM public.tm_table_records r WHERE r.table_id = NEW.table_id;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS tm_table_records_number ON public.tm_table_records;
CREATE TRIGGER tm_table_records_number BEFORE INSERT ON public.tm_table_records
  FOR EACH ROW EXECUTE FUNCTION public.tm_table_records_number();

-- Number existing records in creation order without touching "last modified".
ALTER TABLE public.tm_table_records DISABLE TRIGGER tm_table_records_set_updated_at;
UPDATE public.tm_table_records r
   SET row_number = s.rn
  FROM (SELECT id, row_number() OVER (PARTITION BY table_id ORDER BY created_at, id) AS rn FROM public.tm_table_records) s
 WHERE s.id = r.id AND r.row_number IS NULL;
ALTER TABLE public.tm_table_records ENABLE TRIGGER tm_table_records_set_updated_at;

-- ── Forms ───────────────────────────────────────────────────────────────
-- A form asks some of a table's fields and adds a record per submission.
-- Its link is /tf/<token>. "members" forms need a signed-in, active
-- employee; "public" forms work for anyone with the link.
CREATE TABLE IF NOT EXISTS public.tm_forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id uuid NOT NULL REFERENCES public.tm_tables(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text, '-', ''),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  description text CHECK (description IS NULL OR length(description) <= 2000),
  field_ids uuid[] NOT NULL DEFAULT '{}',
  access text NOT NULL DEFAULT 'members' CHECK (access IN ('members', 'public')),
  is_open boolean NOT NULL DEFAULT true,
  success_message text CHECK (success_message IS NULL OR length(success_message) <= 500),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tm_forms_table_id_idx ON public.tm_forms(table_id);

DROP TRIGGER IF EXISTS tm_forms_set_updated_at ON public.tm_forms;
CREATE TRIGGER tm_forms_set_updated_at BEFORE UPDATE ON public.tm_forms
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.tm_forms ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tm_forms_select ON public.tm_forms;
CREATE POLICY tm_forms_select ON public.tm_forms FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS tm_forms_write ON public.tm_forms;
CREATE POLICY tm_forms_write ON public.tm_forms FOR ALL TO authenticated
  USING (public.current_user_role() IN ('admin', 'super_admin'))
  WITH CHECK (public.current_user_role() IN ('admin', 'super_admin'));

-- Shared gate for the three form functions below: the form row if the
-- caller may use it, otherwise an exception with a message the form page
-- can show as-is.
CREATE OR REPLACE FUNCTION public.tm_form_gate(p_token text)
RETURNS public.tm_forms
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_form public.tm_forms;
BEGIN
  SELECT * INTO v_form FROM public.tm_forms WHERE token = p_token;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'form_not_found' USING HINT = 'This form does not exist or its link has changed.';
  END IF;
  IF v_form.access = 'members' AND NOT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.status = 'active'
  ) THEN
    RAISE EXCEPTION 'form_login_required' USING HINT = 'Sign in to KD Ops to fill in this form.';
  END IF;
  IF NOT v_form.is_open THEN
    RAISE EXCEPTION 'form_closed' USING HINT = 'This form is no longer accepting responses.';
  END IF;
  RETURN v_form;
END
$$;
REVOKE ALL ON FUNCTION public.tm_form_gate(text) FROM PUBLIC;

-- Everything the form page needs to draw itself. Never returns record data.
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
  v_has_task boolean;
  v_people jsonb := '[]'::jsonb;
  v_tasks jsonb := NULL;
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
  v_has_task := EXISTS (SELECT 1 FROM jsonb_array_elements(v_fields) e WHERE e->>'type' = 'task');

  IF v_has_person THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.full_name) ORDER BY p.full_name), '[]'::jsonb)
      INTO v_people
      FROM public.profiles p
     WHERE p.status = 'active' AND coalesce(p.is_anonymised, false) = false;
  END IF;

  -- With a People question, tasks are fetched per chosen person instead
  -- (tm_form_person_tasks). Without one, the form offers every open task.
  IF v_has_task AND NOT v_has_person THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'title', t.title) ORDER BY t.title), '[]'::jsonb)
      INTO v_tasks
      FROM (SELECT id, title FROM public.tm_tasks WHERE status <> 'done' ORDER BY created_at DESC LIMIT 500) t;
  END IF;

  RETURN jsonb_build_object(
    'title', v_form.title,
    'description', v_form.description,
    'success_message', v_form.success_message,
    'fields', v_fields,
    'people', v_people,
    'tasks', v_tasks
  );
END
$$;

-- Open tasks assigned to one person — what the Task question offers once
-- a person is picked.
CREATE OR REPLACE FUNCTION public.tm_form_person_tasks(p_token text, p_person uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_form public.tm_forms;
BEGIN
  v_form := public.tm_form_gate(p_token);
  IF NOT EXISTS (
    SELECT 1 FROM public.tm_table_fields f
     WHERE f.table_id = v_form.table_id AND f.id = ANY (v_form.field_ids) AND f.type = 'task'
  ) THEN
    RETURN '[]'::jsonb;
  END IF;
  RETURN (
    SELECT coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'title', t.title, 'due_date', t.due_date)
                              ORDER BY t.due_date NULLS LAST, t.title), '[]'::jsonb)
      FROM (SELECT id, title, due_date FROM public.tm_tasks
             WHERE assignee_id = p_person AND status <> 'done'
             ORDER BY due_date NULLS LAST LIMIT 200) t
  );
END
$$;

-- Validate a submission field by field and add it as a record.
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
  v_clean jsonb := '{}'::jsonb;
  v_people uuid[] := '{}';
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

  -- People answers first, so Task answers can be checked against them.
  FOR v_field IN
    SELECT f.id, f.name, f.type, f.config FROM public.tm_table_fields f
     WHERE f.table_id = v_form.table_id AND f.id = ANY (v_form.field_ids)
       AND f.type NOT IN ('created_by', 'created_at', 'last_modified', 'auto_number', 'attachment')
     ORDER BY (f.type = 'task'), array_position(v_form.field_ids, f.id)
  LOOP
    v_val := p_data -> v_field.id::text;
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
        -- One id, or a list of ids when the field allows several.
        IF jsonb_typeof(v_val) = 'string' THEN
          v_ids := ARRAY[v_val #>> '{}'];
        ELSIF jsonb_typeof(v_val) = 'array' AND coalesce((v_field.config->>'multiple')::boolean, false) THEN
          SELECT array_agg(e #>> '{}') INTO v_ids FROM jsonb_array_elements(v_val) e;
        ELSE
          RAISE EXCEPTION 'form_invalid' USING HINT = format('"%s" has an unexpected answer.', v_field.name);
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
            -- Only open tasks, and — when the form asks who you are — only
            -- that person's tasks.
            IF NOT EXISTS (
              SELECT 1 FROM public.tm_tasks t
               WHERE t.id = v_id::uuid AND t.status <> 'done'
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

REVOKE ALL ON FUNCTION public.tm_form_load(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tm_form_person_tasks(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tm_form_submit(text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tm_form_load(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tm_form_person_tasks(text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tm_form_submit(text, jsonb) TO anon, authenticated;
