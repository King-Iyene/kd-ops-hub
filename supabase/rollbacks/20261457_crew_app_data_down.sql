-- Rolls back 20261457000000_crew_app_data.sql. Agents lose their read access to the app data; crew_list_tables goes back to the long answer.
DROP FUNCTION IF EXISTS public.crew_read_app(uuid, text, jsonb, integer, text, boolean, text[]);
DROP FUNCTION IF EXISTS public.crew_list_sources(uuid);
DROP FUNCTION IF EXISTS public.crew_list_tables(uuid, text, uuid);
CREATE OR REPLACE FUNCTION public.crew_list_tables(p_agent uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, nc_meta, pg_temp AS $$
DECLARE perm public.crew_agent_private;
BEGIN
  SELECT * INTO perm FROM public.crew_agent_perms(p_agent);
  IF perm.agent_id IS NULL THEN RAISE EXCEPTION 'unknown or inactive agent'; END IF;
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object('base_id', b.id, 'base', b.name, 'table_id', t.id, 'table', t.name,
        'can_write', b.id = ANY (perm.allowed_write_bases),
        'fields', (SELECT jsonb_agg(jsonb_build_object('name', f.name, 'type', f.ui_type, 'options', f.options, 'primary', f.is_primary) ORDER BY f.position)
                     FROM nc_meta.fields f WHERE f.table_id = t.id AND NOT f.is_hidden AND NOT f.is_system))
      ORDER BY b.name, t.position)
    FROM nc_meta.bases b JOIN nc_meta.tables t ON t.base_id = b.id
    WHERE (b.id = ANY (perm.allowed_read_bases) OR b.id = ANY (perm.allowed_write_bases)) AND t.name NOT LIKE 'jn\_%'
  ), '[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.crew_list_tables(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crew_list_tables(uuid) TO service_role;
DROP TABLE IF EXISTS public.crew_app_sources;
DROP VIEW IF EXISTS public.crew_v_people;
DROP VIEW IF EXISTS public.crew_v_batch_items;
ALTER TABLE public.crew_agent_private DROP COLUMN IF EXISTS allowed_sources;
UPDATE public.crew_agent_private SET instructions = replace(instructions, E'\nREADING DATA CHEAPLY:', E'\nREADING-DATA-CHEAPLY-REMOVED:') WHERE instructions LIKE '%READING DATA CHEAPLY%';
