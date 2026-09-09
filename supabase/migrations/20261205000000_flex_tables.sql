-- Flex Tables: a lightweight, standalone Airtable-style table builder.
-- Deliberately NOT part of the existing nc_meta "Database" feature — a
-- separate JSONB-backed schema so it never touches that dynamic-DDL system.
-- Lives in the Workspace/Productivity nav as the third module after
-- Tasks and Goals.

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.flex_tables (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  description  TEXT,
  icon         TEXT NOT NULL DEFAULT 'Table2',
  color        TEXT NOT NULL DEFAULT '#6366f1',
  created_by   UUID REFERENCES auth.users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- field.type: text | long_text | number | date | checkbox | select |
--             multi_select | person | multi_person | task_link | url | email | phone
-- field.options: { choices?: [{id,label,color}] } — used by select/multi_select
CREATE TABLE IF NOT EXISTS public.flex_fields (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id     UUID NOT NULL REFERENCES public.flex_tables(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  type         TEXT NOT NULL DEFAULT 'text',
  options      JSONB NOT NULL DEFAULT '{}',
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- data: { [field_id]: value } — shape depends on the field's type
CREATE TABLE IF NOT EXISTS public.flex_records (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id     UUID NOT NULL REFERENCES public.flex_tables(id) ON DELETE CASCADE,
  data         JSONB NOT NULL DEFAULT '{}',
  created_by   UUID REFERENCES auth.users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- fields: [{ field_id, required, condition: {field_id, value} | null }] — ordered
CREATE TABLE IF NOT EXISTS public.flex_forms (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id     UUID NOT NULL REFERENCES public.flex_tables(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  description  TEXT,
  share_token  TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(12), 'hex'),
  is_enabled   BOOLEAN NOT NULL DEFAULT true,
  fields       JSONB NOT NULL DEFAULT '[]',
  created_by   UUID REFERENCES auth.users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_flex_fields_table ON public.flex_fields(table_id);
CREATE INDEX IF NOT EXISTS idx_flex_records_table ON public.flex_records(table_id);
CREATE INDEX IF NOT EXISTS idx_flex_forms_table ON public.flex_forms(table_id);
CREATE INDEX IF NOT EXISTS idx_flex_forms_token ON public.flex_forms(share_token);

ALTER TABLE public.flex_tables  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flex_fields  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flex_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flex_forms   ENABLE ROW LEVEL SECURITY;

-- Internal, collaborative tool — any signed-in employee can use it, same
-- permissive model as the rest of the Workspace/Productivity nav.
DROP POLICY IF EXISTS "flex_tables_all" ON public.flex_tables;
CREATE POLICY "flex_tables_all" ON public.flex_tables FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "flex_fields_all" ON public.flex_fields;
CREATE POLICY "flex_fields_all" ON public.flex_fields FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "flex_records_all" ON public.flex_records;
CREATE POLICY "flex_records_all" ON public.flex_records FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "flex_forms_all" ON public.flex_forms;
CREATE POLICY "flex_forms_all" ON public.flex_forms FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Public (anon-safe) access to the shareable form, entirely via RPC —
-- no direct anon grants on the tables themselves.
CREATE OR REPLACE FUNCTION public.get_flex_form(p_share_token text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result json;
BEGIN
  SELECT json_build_object(
    'form', json_build_object(
      'id', f.id, 'name', f.name, 'description', f.description, 'fields', f.fields
    ),
    'table', json_build_object('id', t.id, 'name', t.name),
    'fields', COALESCE((
      SELECT json_agg(json_build_object(
        'id', fl.id, 'name', fl.name, 'type', fl.type, 'options', fl.options
      ) ORDER BY fl.sort_order)
      FROM public.flex_fields fl WHERE fl.table_id = f.table_id
    ), '[]'::json)
  ) INTO result
  FROM public.flex_forms f
  JOIN public.flex_tables t ON t.id = f.table_id
  WHERE f.share_token = p_share_token AND f.is_enabled = true;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_flex_form(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_flex_form(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.submit_flex_form(p_share_token text, p_data jsonb)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_table_id uuid;
BEGIN
  SELECT table_id INTO v_table_id
  FROM public.flex_forms
  WHERE share_token = p_share_token AND is_enabled = true;

  IF v_table_id IS NULL THEN
    RETURN false;
  END IF;

  INSERT INTO public.flex_records (table_id, data) VALUES (v_table_id, p_data);
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_flex_form(text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_flex_form(text, jsonb) TO anon, authenticated;
