-- Fix: Ensure nc_meta and all base schemas are properly exposed to PostgREST.
-- Root cause: the original nc_meta migration did not GRANT USAGE or register
-- the schema in pgrst.db_schemas, so a PostgREST restart wipes the config
-- and all .schema('nc_meta') queries return 406 Not Acceptable.

-- 1. Grant access on nc_meta
GRANT USAGE ON SCHEMA nc_meta TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA nc_meta TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA nc_meta TO anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA nc_meta
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA nc_meta
  GRANT SELECT ON TABLES TO anon;

-- 2. Grant access on every existing base schema and register all in pgrst.db_schemas
DO $$
DECLARE
  _base RECORD;
  _current TEXT;
  _schemas TEXT[];
BEGIN
  -- Grant usage on each base schema
  FOR _base IN SELECT schema_name FROM nc_meta.bases LOOP
    IF _base.schema_name ~ '^[a-z][a-z0-9_]*$' THEN
      EXECUTE format('GRANT USAGE ON SCHEMA %I TO authenticated, anon', _base.schema_name);
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA %I TO authenticated', _base.schema_name);
      EXECUTE format('GRANT SELECT ON ALL TABLES IN SCHEMA %I TO anon', _base.schema_name);
    END IF;
  END LOOP;

  -- Read current pgrst.db_schemas config (use a subquery to avoid
  -- "set-returning functions are not allowed in WHERE")
  SELECT c INTO _current
    FROM (
      SELECT unnest(setconfig) AS c
        FROM pg_catalog.pg_db_role_setting
        JOIN pg_catalog.pg_roles ON pg_roles.oid = pg_db_role_setting.setrole
       WHERE rolname = 'authenticator'
    ) sub
   WHERE c LIKE 'pgrst.db_schemas=%'
   LIMIT 1;

  IF _current IS NULL THEN
    _schemas := ARRAY['public'];
  ELSE
    _schemas := string_to_array(replace(_current, 'pgrst.db_schemas=', ''), ', ');
  END IF;

  -- Ensure nc_meta is present
  IF NOT 'nc_meta' = ANY(_schemas) THEN
    _schemas := array_append(_schemas, 'nc_meta');
  END IF;

  -- Ensure every base schema is present
  FOR _base IN SELECT schema_name FROM nc_meta.bases LOOP
    IF _base.schema_name ~ '^[a-z][a-z0-9_]*$' AND NOT _base.schema_name = ANY(_schemas) THEN
      _schemas := array_append(_schemas, _base.schema_name);
    END IF;
  END LOOP;

  EXECUTE format(
    'ALTER ROLE authenticator SET pgrst.db_schemas = %L',
    array_to_string(_schemas, ', ')
  );
END
$$;

-- 3. Reload PostgREST config and schema cache
NOTIFY pgrst, 'reload config';
NOTIFY pgrst, 'reload schema';
