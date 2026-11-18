-- =============================================================================
-- Full, permanent removal of three modules, at the user's explicit request
-- (no archiving, no soft-disable): the Task module built this session
-- (every "tk_" prefixed object), the separate pre-existing Goals feature
-- (goals, goal_tasks), and the separate pre-existing Tables/"flex tables"
-- feature (flex_tables, flex_fields, flex_records, flex_forms).
--
-- Deliberately does NOT touch the legacy plain "tasks" table or
-- "profiles"/"profiles_directory" — those are still read live by
-- Dashboard, Projects, and EmployeeProfile for unrelated functionality
-- and were never part of this request. CASCADE on the goals/goal_tasks
-- drops only drops the foreign key constraint tasks.goal_id/goal_tasks
-- carried toward them, never the tasks table or its rows.
-- =============================================================================

-- ── Task module: every object prefixed "tk_", found dynamically so this
-- stays complete regardless of which migration originally created it.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT table_name FROM information_schema.views
           WHERE table_schema = 'public' AND table_name LIKE 'tk\_%' ESCAPE '\'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS public.%I CASCADE', r.table_name);
  END LOOP;

  FOR r IN SELECT table_name FROM information_schema.tables
           WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
             AND table_name LIKE 'tk\_%' ESCAPE '\'
  LOOP
    EXECUTE format('DROP TABLE IF EXISTS public.%I CASCADE', r.table_name);
  END LOOP;

  FOR r IN SELECT p.oid::regprocedure::text AS sig
           FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public' AND p.proname LIKE 'tk\_%' ESCAPE '\'
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %s CASCADE', r.sig);
  END LOOP;

  FOR r IN SELECT t.typname FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
           WHERE n.nspname = 'public' AND t.typname LIKE 'tk\_%' ESCAPE '\'
             AND t.typtype IN ('e', 'c')
  LOOP
    EXECUTE format('DROP TYPE IF EXISTS public.%I CASCADE', r.typname);
  END LOOP;
END;
$$;

-- ── Goals feature.
DROP TABLE IF EXISTS public.goal_tasks CASCADE;
DROP TABLE IF EXISTS public.goals CASCADE;

-- ── Tables ("flex tables") feature.
DROP TABLE IF EXISTS public.flex_records CASCADE;
DROP TABLE IF EXISTS public.flex_forms CASCADE;
DROP TABLE IF EXISTS public.flex_fields CASCADE;
DROP TABLE IF EXISTS public.flex_tables CASCADE;
