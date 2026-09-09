-- Restrict Person/Multi-person pickers (grid, form builder, and the
-- public shared form) to Operations, Admin, and Super Admin — Field
-- Staff and Finance should never appear in a "select a name" dropdown
-- for Tables/Forms.

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
        -- phone, or other profile data reaches the public form. Limited
        -- to Operations/Admin/Super Admin roles — Field Staff and
        -- Finance never appear here.
        'options', CASE
          WHEN fl.type IN ('person', 'multi_person') THEN
            COALESCE(fl.options, '{}'::jsonb) || jsonb_build_object('people', (
              SELECT COALESCE(jsonb_agg(jsonb_build_object('id', pd.id, 'full_name', pd.full_name) ORDER BY pd.full_name), '[]'::jsonb)
              FROM public.profiles_directory pd
              WHERE pd.is_anonymised = false
                AND pd.status IN ('active', 'invited')
                AND pd.role IN ('operations', 'admin', 'super_admin')
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
