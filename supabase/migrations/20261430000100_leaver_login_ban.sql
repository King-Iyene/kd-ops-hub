-- =============================================================================
-- S2: a deactivated (offboarded) person can no longer sign in
--
-- Offboarding (complete_offboarding, soft_delete_employee) and the Deactivate button only set
-- profiles.status = 'inactive'. Nothing stopped the login itself: only screens checked the status, so a
-- leaver could still sign in and call the API with a valid token.
--
-- Fix: a SECURITY DEFINER trigger on profiles keeps auth.users.banned_until in step with profiles.status.
--
--   profiles.status values that exist (CHECK constraint profiles_status_check, 20260422100000):
--     'active'    a working account
--     'invited'   invited, not signed in yet (profile id is a placeholder until the invite is accepted)
--     'inactive'  has left: set by complete_offboarding, soft_delete_employee and the Deactivate button
--   There is no 'terminated' / 'on_leave' / 'suspended' status; leave is a separate table (leave_requests).
--   So the ONLY leaver status is 'inactive'. 'invited' is never banned.
--
--   status -> 'inactive'  : auth.users.banned_until = 'infinity' (skipped for a super_admin, see below)
--   status -> 'active'    : the ban is lifted, but only a ban this trigger could have set ('infinity'),
--                           so a manual, time-limited ban from the Supabase dashboard is left alone
--
-- A super_admin is never banned, so the owner cannot be locked out by a mistaken status change; the skip is
-- written to audit_logs. If the ban cannot be written (any error), the status change still goes through and
-- the failure is written to audit_logs, so offboarding is never blocked by this trigger.
--
-- Existing sign-ins: a ban stops new sign-ins and token refresh. An access token already issued stays valid
-- until it expires (the Supabase default is one hour). Signing the person out is not part of this change.
--
-- Backfill of people who are ALREADY inactive is deliberately NOT in this migration (the lead decides, after
-- looking at who they are). The one-line statement is in supabase/danger-scripts/leaver_login_backfill.sql.
-- Rollback: supabase/rollbacks/20261430_leaver_login_ban_down.sql
-- =============================================================================

CREATE OR REPLACE FUNCTION public.sync_leaver_login_ban()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  -- Statuses that really mean "this person has left". Keep in step with profiles_status_check.
  c_leaver_statuses constant text[] := ARRAY['inactive'];
BEGIN
  -- Only act when the status really changed (an UPDATE that re-sets the same value must not touch auth.users).
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status = ANY (c_leaver_statuses) THEN
    IF NEW.role = 'super_admin' THEN
      -- The owner account is never banned.
      BEGIN
        INSERT INTO public.audit_logs (action_type, description, performed_by_name)
        VALUES ('leaver_login_ban_skipped',
                'Login ban skipped: ' || coalesce(NEW.email, NEW.id::text) || ' is a super_admin whose status was set to ' || NEW.status || '. Their sign-in stays enabled.',
                'system');
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'sync_leaver_login_ban: could not write the audit row (%)', SQLERRM;
      END;
      RAISE WARNING 'sync_leaver_login_ban: not banning super_admin % (status %)', NEW.id, NEW.status;
      RETURN NEW;
    END IF;

    BEGIN
      UPDATE auth.users
         SET banned_until = 'infinity'::timestamptz
       WHERE id = NEW.id
         AND (banned_until IS NULL OR banned_until < 'infinity'::timestamptz);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'sync_leaver_login_ban: could not ban % (%)', NEW.id, SQLERRM;
      BEGIN
        INSERT INTO public.audit_logs (action_type, description, performed_by_name)
        VALUES ('leaver_login_ban_failed',
                'Could not block sign-in for ' || coalesce(NEW.email, NEW.id::text) || ': ' || SQLERRM, 'system');
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
    END;

  ELSIF NEW.status = 'active' AND TG_OP = 'UPDATE' THEN
    BEGIN
      UPDATE auth.users
         SET banned_until = NULL
       WHERE id = NEW.id
         AND banned_until = 'infinity'::timestamptz;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'sync_leaver_login_ban: could not lift the ban on % (%)', NEW.id, SQLERRM;
      BEGIN
        INSERT INTO public.audit_logs (action_type, description, performed_by_name)
        VALUES ('leaver_login_ban_failed',
                'Could not re-enable sign-in for ' || coalesce(NEW.email, NEW.id::text) || ': ' || SQLERRM, 'system');
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
    END;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.sync_leaver_login_ban() IS
  'Keeps auth.users.banned_until in step with profiles.status: inactive -> banned (never a super_admin), '
  'active -> ban lifted. See 20261430000100_leaver_login_ban.sql.';

-- Nobody calls this directly; it only runs as a trigger.
REVOKE ALL ON FUNCTION public.sync_leaver_login_ban() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS sync_leaver_login_ban_trg ON public.profiles;
CREATE TRIGGER sync_leaver_login_ban_trg
  AFTER INSERT OR UPDATE OF status ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_leaver_login_ban();
