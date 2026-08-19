-- Automatically keep vehicles.total_mileage_km in sync with the highest
-- odometer reading seen across trip_logs, fuel_requests, expenses (repairs),
-- and vehicle_inspections.
--
-- The column existed but was never written to by the application.  This
-- trigger ensures it always reflects the maximum odometer value recorded
-- for a given vehicle (odometer readings only go up).

-- -----------------------------------------------------------------------
-- 1. Shared trigger function
-- -----------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_update_vehicle_total_mileage()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _vehicle_id uuid;
  _reading    numeric;
BEGIN
  -- Determine the vehicle id and the odometer reading from the source row.
  -- Each source table stores these in differently-named columns.

  IF TG_TABLE_NAME = 'trip_logs' THEN
    _vehicle_id := NEW.vehicle_id;
    -- Use the end-of-trip odometer; fall back to start if end is not yet set
    -- (trip still in_progress).
    _reading := COALESCE(NEW.odometer_end, NEW.odometer_start);

  ELSIF TG_TABLE_NAME = 'fuel_requests' THEN
    _vehicle_id := NEW.vehicle_id;
    _reading := NEW.odometer;

  ELSIF TG_TABLE_NAME = 'expenses' THEN
    _vehicle_id := NEW.vehicle_id;
    _reading := NEW.repair_odometer_km;

  ELSIF TG_TABLE_NAME = 'vehicle_inspections' THEN
    _vehicle_id := NEW.vehicle_id;
    _reading := NEW.odometer_km;

  ELSE
    -- Unknown source table; do nothing.
    RETURN NEW;
  END IF;

  -- Skip if we have no vehicle or no reading.
  IF _vehicle_id IS NULL OR _reading IS NULL THEN
    RETURN NEW;
  END IF;

  -- Update total_mileage_km to the greater of the current value and the
  -- new reading.  GREATEST + COALESCE handles NULL (first-ever reading).
  UPDATE public.vehicles
  SET    total_mileage_km = GREATEST(COALESCE(total_mileage_km, 0), _reading),
         updated_at       = now()
  WHERE  id = _vehicle_id;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_update_vehicle_total_mileage() IS
  'Keeps vehicles.total_mileage_km at the high-water mark of all odometer '
  'readings seen in trip_logs, fuel_requests, expenses, and vehicle_inspections.';

-- -----------------------------------------------------------------------
-- 2. Attach triggers (idempotent — drop first if they already exist)
-- -----------------------------------------------------------------------

-- trip_logs: fires on INSERT (new trip / clock-in) and UPDATE (clock-out
-- sets odometer_end).
DROP TRIGGER IF EXISTS trg_trip_logs_update_vehicle_mileage ON public.trip_logs;
CREATE TRIGGER trg_trip_logs_update_vehicle_mileage
  AFTER INSERT OR UPDATE OF odometer_start, odometer_end
  ON public.trip_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_update_vehicle_total_mileage();

-- fuel_requests: fires when a fuel request is created or its odometer is
-- edited.
DROP TRIGGER IF EXISTS trg_fuel_requests_update_vehicle_mileage ON public.fuel_requests;
CREATE TRIGGER trg_fuel_requests_update_vehicle_mileage
  AFTER INSERT OR UPDATE OF odometer
  ON public.fuel_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_update_vehicle_total_mileage();

-- expenses: only repair expenses carry an odometer reading
-- (repair_odometer_km).  The trigger fires on every insert/update but the
-- function short-circuits when the column is NULL.
DROP TRIGGER IF EXISTS trg_expenses_update_vehicle_mileage ON public.expenses;
CREATE TRIGGER trg_expenses_update_vehicle_mileage
  AFTER INSERT OR UPDATE OF repair_odometer_km
  ON public.expenses
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_update_vehicle_total_mileage();

-- vehicle_inspections: odometer_km is recorded during inspections.
DROP TRIGGER IF EXISTS trg_vehicle_inspections_update_vehicle_mileage ON public.vehicle_inspections;
CREATE TRIGGER trg_vehicle_inspections_update_vehicle_mileage
  AFTER INSERT OR UPDATE OF odometer_km
  ON public.vehicle_inspections
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_update_vehicle_total_mileage();

-- -----------------------------------------------------------------------
-- 3. Backfill: set total_mileage_km to the historical maximum for each
--    vehicle so existing data is correct immediately.
-- -----------------------------------------------------------------------

UPDATE public.vehicles v
SET    total_mileage_km = sub.max_reading,
       updated_at       = now()
FROM (
  SELECT vehicle_id, MAX(reading) AS max_reading
  FROM (
    -- trip_logs: take the greater of start and end per row
    SELECT vehicle_id,
           GREATEST(COALESCE(odometer_start, 0), COALESCE(odometer_end, 0)) AS reading
    FROM   public.trip_logs
    WHERE  odometer_start IS NOT NULL OR odometer_end IS NOT NULL

    UNION ALL

    -- fuel_requests
    SELECT vehicle_id, odometer AS reading
    FROM   public.fuel_requests
    WHERE  odometer IS NOT NULL

    UNION ALL

    -- expenses (repairs)
    SELECT vehicle_id, repair_odometer_km AS reading
    FROM   public.expenses
    WHERE  vehicle_id IS NOT NULL
      AND  repair_odometer_km IS NOT NULL

    UNION ALL

    -- vehicle_inspections
    SELECT vehicle_id, odometer_km AS reading
    FROM   public.vehicle_inspections
    WHERE  odometer_km IS NOT NULL
  ) readings
  GROUP BY vehicle_id
) sub
WHERE v.id = sub.vehicle_id
  AND COALESCE(v.total_mileage_km, 0) < sub.max_reading;
