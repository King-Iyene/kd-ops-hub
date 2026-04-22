-- Vehicle fuel balance tracking.
-- tank_capacity_litres: total tank size so we can show "35L / 60L"
-- current_fuel_litres:  live balance updated on fuel approval and trip log
-- last_refuel_at:       timestamp of last approved fuel top-up
-- avg_km_per_litre:     vehicle efficiency used to estimate consumption per trip

ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS tank_capacity_litres numeric NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS current_fuel_litres  numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_refuel_at        timestamptz,
  ADD COLUMN IF NOT EXISTS avg_km_per_litre      numeric NOT NULL DEFAULT 10;

-- Clamp balance to [0, tank_capacity] so it never goes negative or over full
CREATE OR REPLACE FUNCTION public.clamp_fuel_balance()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.current_fuel_litres < 0 THEN
    NEW.current_fuel_litres := 0;
  END IF;
  IF NEW.tank_capacity_litres > 0 AND NEW.current_fuel_litres > NEW.tank_capacity_litres THEN
    NEW.current_fuel_litres := NEW.tank_capacity_litres;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clamp_fuel ON public.vehicles;
CREATE TRIGGER trg_clamp_fuel
  BEFORE UPDATE ON public.vehicles
  FOR EACH ROW EXECUTE FUNCTION public.clamp_fuel_balance();
