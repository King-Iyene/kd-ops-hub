-- log_fleet_activity() is a shared trigger function used by:
--   · fleet_trip_audit    on trip_logs         (redundant — app calls logAudit() already)
--   · fleet_fuel_audit    on fuel_requests
--   · fleet_maintenance_audit on vehicle_maintenance
--
-- The function was written with wrong audit_logs column names:
--   user_id   → should be performed_by
--   action    → should be action_type
--
-- Fix: drop only the trip_logs trigger (app handles that audit row itself),
-- then replace the function with correct column names so fuel_requests and
-- vehicle_maintenance triggers continue to work without errors.

-- 1. Drop the trip_logs trigger only (leave the shared function intact for now)
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT t.tgname
    FROM pg_trigger t
    JOIN pg_class c ON t.tgrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE c.relname = 'trip_logs'
      AND n.nspname = 'public'
      AND NOT t.tgisinternal
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.trip_logs', rec.tgname);
  END LOOP;
END;
$$;

-- 2. Fix the shared function to use the correct audit_logs column names
CREATE OR REPLACE FUNCTION public.log_fleet_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id   uuid;
  v_actor_name text;
  v_action     text;
  v_desc       text;
BEGIN
  -- Resolve the acting user from whichever FK column is present on this table
  v_actor_id := COALESCE(
    (NEW).driver_id,
    (NEW).submitted_by,
    (NEW).created_by,
    auth.uid()
  );

  -- Build a human-readable action_type and description
  v_action := TG_TABLE_NAME || '_' || lower(TG_OP);
  v_desc   := initcap(replace(TG_TABLE_NAME, '_', ' ')) || ' ' || lower(TG_OP) || 'd';

  -- Look up the actor's name
  SELECT full_name INTO v_actor_name
  FROM public.profiles
  WHERE id = v_actor_id;

  INSERT INTO public.audit_logs (action_type, description, performed_by, performed_by_name)
  VALUES (v_action, v_desc, v_actor_id, v_actor_name);

  RETURN NEW;
END;
$$;
