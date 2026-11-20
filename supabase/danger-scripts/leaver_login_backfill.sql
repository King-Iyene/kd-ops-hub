-- =============================================================================
-- One-time backfill for 20261430000000_leaver_login_ban.sql: block sign-in for people who are ALREADY inactive.
-- The trigger only fires on a status change, so existing leavers are not covered until this is run.
--
-- Not a migration on purpose: run it by hand AFTER the migration is live and AFTER checking the list in step 1.
-- Opt-in guard, same convention as the other scripts here:   SET kdops.allow_leaver_login_backfill = 'true';
--
-- 1. Who it would affect (look at this first; a super_admin is never banned):
--      SELECT id, email, full_name, role FROM public.profiles WHERE status = 'inactive' ORDER BY full_name;
-- 2. Apply:
-- =============================================================================
DO $$
BEGIN
  IF coalesce(current_setting('kdops.allow_leaver_login_backfill', true), '') <> 'true' THEN
    RAISE EXCEPTION 'Refusing to run: SET kdops.allow_leaver_login_backfill = ''true'' first.';
  END IF;
END $$;

UPDATE auth.users u
   SET banned_until = 'infinity'
  FROM public.profiles p
 WHERE p.id = u.id AND p.status = 'inactive' AND p.role <> 'super_admin'
   AND (u.banned_until IS NULL OR u.banned_until < 'infinity');
