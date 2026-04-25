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

-- 2. Fix the shared function to use the correct audit_logs column names.
-- Uses to_jsonb(NEW) so we can safely read any column without crashing on
-- tables that don't have all fields (e.g. fuel_requests has driver_id but
-- not created_by; vehicle_maintenance has created_by but not driver_id).
CREATE OR REPLACE FUNCTION public.log_fleet_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row        jsonb;
  v_actor_id   uuid;
  v_actor_name text;
  v_action     text;
  v_desc       text;
BEGIN
  v_row := to_jsonb(NEW);

  -- Safely read whichever actor column this table has; missing keys return NULL
  v_actor_id := COALESCE(
    (v_row->>'driver_id')::uuid,
    (v_row->>'created_by')::uuid,
    auth.uid()
  );

  v_action := TG_TABLE_NAME || '_' || lower(TG_OP);
  v_desc   := initcap(replace(TG_TABLE_NAME, '_', ' ')) || ' ' || lower(TG_OP) || 'd';

  SELECT full_name INTO v_actor_name
  FROM public.profiles
  WHERE id = v_actor_id;

  INSERT INTO public.audit_logs (action_type, description, performed_by, performed_by_name)
  VALUES (v_action, v_desc, v_actor_id, v_actor_name);

  RETURN NEW;
END;
$$;
