-- =============================================================================
-- public.profiles was never added to the supabase_realtime publication, in
-- any migration across this project's history. useAuth.ts (line ~330)
-- subscribes to a postgres_changes UPDATE event on profiles, filtered to
-- the signed-in user's own row, specifically so that when an admin changes
-- someone's role (or status, or permissions) while their tab stays open,
-- the UI refetches immediately instead of showing a stale cached value
-- until their next sign-in. Without the table in the publication, Postgres
-- never streams the change at all — the subscription connects but no
-- event ever arrives, silently. The practical effect: a role change made
-- while someone is signed in doesn't reach their session until they
-- manually reload or sign out and back in, even though every server-side
-- permission check (including the Task module's tk_is_admin()) already
-- reflects the new value correctly. This showed up as "my Profile page
-- says I'm Admin but creating a Task space is rejected" — the Profile
-- page was reading the stale in-memory value; the database was right.
-- =============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'profiles'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
  END IF;
END;
$$;
