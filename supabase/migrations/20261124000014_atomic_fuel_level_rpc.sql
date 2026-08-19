-- Atomic vehicle fuel-level update RPC.
--
-- Replaces the non-atomic read-modify-write pattern used by 6+ call
-- sites in Fleet.tsx. The function takes a delta (positive for adding
-- fuel, negative for consumption) and atomically applies it, clamping
-- to [0, tank_capacity_litres].
--
-- An optional p_set_absolute parameter overrides the delta behavior
-- and sets the level to an exact value (for recalculation scenarios).

CREATE OR REPLACE FUNCTION public.adjust_vehicle_fuel_level(
  p_vehicle_id uuid,
  p_delta_litres numeric,
  p_set_absolute numeric DEFAULT NULL,
  p_last_refuel_at timestamptz DEFAULT NULL
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_level numeric;
  v_cap numeric;
BEGIN
  -- Lock the row to serialize concurrent updates
  SELECT tank_capacity_litres INTO v_cap
  FROM public.vehicles
  WHERE id = p_vehicle_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vehicle not found: %', p_vehicle_id;
  END IF;

  IF v_cap IS NULL OR v_cap <= 0 THEN
    v_cap := 999999;
  END IF;

  IF p_set_absolute IS NOT NULL THEN
    v_new_level := GREATEST(0, LEAST(v_cap, p_set_absolute));
  ELSE
    UPDATE public.vehicles
    SET current_fuel_litres = GREATEST(0, LEAST(v_cap, COALESCE(current_fuel_litres, 0) + p_delta_litres)),
        last_refuel_at = COALESCE(p_last_refuel_at, last_refuel_at),
        updated_at = now()
    WHERE id = p_vehicle_id
    RETURNING current_fuel_litres INTO v_new_level;

    RETURN v_new_level;
  END IF;

  UPDATE public.vehicles
  SET current_fuel_litres = v_new_level,
      last_refuel_at = COALESCE(p_last_refuel_at, last_refuel_at),
      updated_at = now()
  WHERE id = p_vehicle_id;

  RETURN v_new_level;
END;
$$;

COMMENT ON FUNCTION public.adjust_vehicle_fuel_level(uuid, numeric, numeric, timestamptz) IS
  'Atomically adjusts a vehicle''s fuel level by a delta (or sets it absolutely), '
  'clamping to [0, tank_capacity]. Uses FOR UPDATE to serialize concurrent callers.';

REVOKE ALL ON FUNCTION public.adjust_vehicle_fuel_level(uuid, numeric, numeric, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.adjust_vehicle_fuel_level(uuid, numeric, numeric, timestamptz)
  TO authenticated, service_role;
