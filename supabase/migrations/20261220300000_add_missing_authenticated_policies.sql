-- Fixes a real regression introduced by 20261220200000: that migration only
-- added the standard "authenticated: true" policies to tables that had ZERO
-- existing policies. Some tables already had a set of FOUR policies — but
-- every one of them was scoped to the `anon` role only ("anon_select",
-- "anon_insert", "anon_update", "anon_delete"), with no policy at all for
-- `authenticated`. Those tables' RLS was disabled before, so the anon-only
-- policies were dormant and the schema-level GRANT to `authenticated`
-- governed access directly — real logged-in users could see their data.
-- The instant RLS got enabled on them, Postgres started enforcing those
-- policies for real: no policy matches `authenticated` at all, so every
-- logged-in user's queries returned zero rows, while anyone holding just the
-- public anon key (no login) could still fully read AND write the table.
--
-- This migration adds the missing "Authenticated users can ..." policies to
-- every nc_* table that doesn't already have one — restoring real user
-- access. It deliberately does NOT touch the anon_* policies; whether those
-- should be removed is a separate decision (they may or may not be tied to
-- the public shared-view feature) and is being raised with the user
-- separately rather than silently dropped here.

DO $$
DECLARE
  rec RECORD;
  has_auth_select BOOLEAN;
BEGIN
  FOR rec IN
    SELECT schemaname, tablename
    FROM pg_tables
    WHERE schemaname LIKE 'nc\_%' ESCAPE '\'
      AND schemaname <> 'nc_meta'
  LOOP
    BEGIN
      SELECT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = rec.schemaname
          AND tablename = rec.tablename
          AND 'authenticated' = ANY(roles)
          AND cmd = 'SELECT'
      ) INTO has_auth_select;

      IF NOT has_auth_select THEN
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
    EXCEPTION WHEN duplicate_object THEN
      -- A same-named policy already exists (e.g. re-run after a partial
      -- prior application) — nothing more to do for this table.
      NULL;
    WHEN OTHERS THEN
      RAISE WARNING 'Could not add authenticated policies to %.%: %', rec.schemaname, rec.tablename, SQLERRM;
    END;
  END LOOP;
END $$;
