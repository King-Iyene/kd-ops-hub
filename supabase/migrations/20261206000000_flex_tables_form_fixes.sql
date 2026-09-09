-- Fix: public form's person-field name list wasn't reliably showing up.
-- Rewrite using jsonb_build_object/jsonb_agg consistently throughout
-- (the previous version mixed json_agg output into jsonb_build_object,
-- which relies on an implicit json->jsonb cast — rewritten to remove
-- any doubt).
--
-- Also adds get_flex_form_tasks: lets a public form's "linked tasks"
-- field, when configured to filter by a person field, fetch just that
-- one person's open (non-complete) assigned tasks — never the full
-- task list — so the field can actually be filled in on a shared form.

CREATE OR REPLACE FUNCTION public.get_flex_form(p_share_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'form', jsonb_build_object(
      'id', f.id, 'name', f.name, 'description', f.description, 'fields', f.fields
    ),
    'table', jsonb_build_object('id', t.id, 'name', t.name),
    'fields', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', fl.id, 'name', fl.name, 'type', fl.type,
        -- Person/multi-person fields need a name list to render a picker
        -- whose values line up with the ids the form's conditions were
        -- built against. Only id + full_name are exposed — no email,
        -- phone, or other profile data reaches the public form.
        'options', CASE
          WHEN fl.type IN ('person', 'multi_person') THEN
            COALESCE(fl.options, '{}'::jsonb) || jsonb_build_object('people', (
              SELECT COALESCE(jsonb_agg(jsonb_build_object('id', pd.id, 'full_name', pd.full_name) ORDER BY pd.full_name), '[]'::jsonb)
              FROM public.profiles_directory pd
              WHERE pd.is_anonymised = false AND pd.status IN ('active', 'invited')
            ))
          ELSE COALESCE(fl.options, '{}'::jsonb)
        END
      ) ORDER BY fl.sort_order)
      FROM public.flex_fields fl WHERE fl.table_id = f.table_id
    ), '[]'::jsonb)
  ) INTO result
  FROM public.flex_forms f
  JOIN public.flex_tables t ON t.id = f.table_id
  WHERE f.share_token = p_share_token AND f.is_enabled = true;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_flex_form(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_flex_form(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_flex_form_tasks(p_share_token text, p_assignee_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_form_id uuid;
  result jsonb;
BEGIN
  -- Only proceeds for a token that maps to a currently enabled form —
  -- never returns anything for a disabled/unknown link.
  SELECT f.id INTO v_form_id
  FROM public.flex_forms f
  WHERE f.share_token = p_share_token AND f.is_enabled = true;

  IF v_form_id IS NULL OR p_assignee_id IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', sub.id, 'title', sub.title)), '[]'::jsonb)
  INTO result
  FROM (
    SELECT id, title FROM public.tasks
    WHERE assignee_id = p_assignee_id AND status <> 'complete'
    ORDER BY created_at DESC
    LIMIT 200
  ) sub;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_flex_form_tasks(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_flex_form_tasks(text, uuid) TO anon, authenticated;
