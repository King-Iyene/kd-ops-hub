-- Deduplicate people in person/multi_person pickers so the same
-- full_name doesn't appear twice when profiles_directory has duplicate rows.

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
              SELECT COALESCE(jsonb_agg(jsonb_build_object('id', dp.id, 'full_name', dp.full_name) ORDER BY dp.full_name), '[]'::jsonb)
              FROM (
                SELECT DISTINCT ON (regexp_replace(pd.full_name, '\s+', ' ', 'g')) pd.id, pd.full_name
                FROM public.profiles_directory pd
                WHERE pd.is_anonymised = false
                  AND pd.status IN ('active', 'invited')
                ORDER BY regexp_replace(pd.full_name, '\s+', ' ', 'g'), pd.created_at DESC
              ) dp
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
