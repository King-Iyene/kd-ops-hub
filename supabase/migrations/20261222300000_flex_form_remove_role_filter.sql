-- Remove the role filter from person/multi_person pickers so all
-- active, non-anonymised profiles appear (e.g. field_staff, finance).

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
        'options', CASE
          WHEN fl.type IN ('person', 'multi_person') THEN
            COALESCE(fl.options, '{}'::jsonb) || jsonb_build_object('people', (
              SELECT COALESCE(jsonb_agg(jsonb_build_object('id', pd.id, 'full_name', pd.full_name) ORDER BY pd.full_name), '[]'::jsonb)
              FROM public.profiles_directory pd
              WHERE pd.is_anonymised = false
                AND pd.status IN ('active', 'invited')
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
