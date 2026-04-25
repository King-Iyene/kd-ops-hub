-- A trigger was manually applied to trip_logs that auto-inserted into
-- audit_logs using wrong column names (user_id, action) instead of
-- (performed_by, action_type). The app already calls logAudit() after
-- a successful insert, so the trigger is redundant and broken.
-- Drop all user-defined triggers on trip_logs.

DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT t.tgname, p.proname
    FROM pg_trigger t
    JOIN pg_proc p ON t.tgfoid = p.oid
    JOIN pg_class c ON t.tgrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE c.relname = 'trip_logs'
      AND n.nspname = 'public'
      AND NOT t.tgisinternal
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.trip_logs', rec.tgname);
    EXECUTE format('DROP FUNCTION IF EXISTS public.%I()', rec.proname);
  END LOOP;
END;
$$;
