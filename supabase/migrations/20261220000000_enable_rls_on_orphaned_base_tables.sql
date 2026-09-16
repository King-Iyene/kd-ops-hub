-- Retroactively enables RLS + the standard authenticated-access policies on
-- every per-base data table that is missing them.
--
-- Every base's data lives in its own dynamically-created schema (always
-- named "nc_<slug>_<timestamp>", see useBases.ts), and the edge function
-- that creates these tables (ddl-executor's handleCreateTable) always runs
-- ENABLE ROW LEVEL SECURITY plus four "authenticated: true" policies right
-- after CREATE TABLE — matching the same permissive-to-any-logged-in-user
-- model already used everywhere else in this schema (nc_meta's own tables
-- use identical `USING (true)` policies). But those statements were never
-- wrapped in a transaction, so a dropped connection or pool exhaustion
-- (both documented issues during large Airtable imports around 2026-09)
-- could let CREATE TABLE succeed while the RLS/policy statements after it
-- silently failed, leaving the table fully open: with RLS disabled, the
-- schema-level GRANT SELECT ON TABLES TO anon (needed for public shared-view
-- forms) applies unfiltered, so the table becomes readable by anyone with
-- the public anon key — logged in or not. Supabase's security advisor
-- flagged ~250 tables across several bases in exactly this state.
--
-- This closes the gap by bringing every affected table's RLS/policy state
-- in line with how a correctly-created table already behaves — not a new
-- access model, just finishing the one already in use. It's idempotent:
-- safe to run again, and skips any table that already has its own policies.

DO $$
DECLARE
  rec RECORD;
  policy_count INT;
BEGIN
  FOR rec IN
    SELECT schemaname, tablename
    FROM pg_tables
    WHERE schemaname LIKE 'nc\_%' ESCAPE '\'
      AND schemaname <> 'nc_meta'
  LOOP
    -- Enable RLS if it isn't already (covers both "disabled" and the
    -- pathological "enabled with zero policies" case the same way).
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', rec.schemaname, rec.tablename);

    SELECT count(*) INTO policy_count
    FROM pg_policies
    WHERE schemaname = rec.schemaname AND tablename = rec.tablename;

    IF policy_count = 0 THEN
      EXECUTE format(
        'CREATE POLICY "Authenticated users can select" ON %I.%I FOR SELECT TO authenticated USING (true)',
        rec.schemaname, rec.tablename
      );
      EXECUTE format(
        'CREATE POLICY "Authenticated users can insert" ON %I.%I FOR INSERT TO authenticated WITH CHECK (true)',
        rec.schemaname, rec.tablename
      );
      EXECUTE format(
        'CREATE POLICY "Authenticated users can update" ON %I.%I FOR UPDATE TO authenticated USING (true)',
        rec.schemaname, rec.tablename
      );
      EXECUTE format(
        'CREATE POLICY "Authenticated users can delete" ON %I.%I FOR DELETE TO authenticated USING (true)',
        rec.schemaname, rec.tablename
      );
    END IF;
  END LOOP;
END $$;
