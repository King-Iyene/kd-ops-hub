-- Receipt-accountability module for Fleet.
--
-- Adds the columns needed to:
--   1. Trace a repair expense back to the vehicle + service item it closes
--      (repairs previously had no vehicle_id, so admin had no idea which
--      car was fixed and vehicle_maintenance never got updated).
--   2. Store a SHA-256 of every uploaded receipt image for tamper-evidence
--      (Phase 3 — receipts are watermarked with driver/timestamp/GPS client
--      side, then hashed; the hash is immutable audit proof the image on
--      file hasn't been swapped after upload).
--   3. Let admins configure a pump-price benchmark used for the anomaly
--      cross-check (Phase 5) — flags a fuel request where amount ÷ litres
--      diverges heavily from the going NG pump price.
--
-- Nothing here touches payments, transfers, or approval logic.

-- 1. expenses — repair-specific linkage (only populated when category='repair')
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS vehicle_id uuid REFERENCES public.vehicles(id),
  ADD COLUMN IF NOT EXISTS service_type text,
  ADD COLUMN IF NOT EXISTS repair_odometer_km numeric,
  ADD COLUMN IF NOT EXISTS maintenance_item_id uuid REFERENCES public.vehicle_maintenance(id),
  ADD COLUMN IF NOT EXISTS receipt_sha256 text;

CREATE INDEX IF NOT EXISTS idx_expenses_vehicle_id ON public.expenses(vehicle_id) WHERE vehicle_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_expenses_repair_no_receipt
  ON public.expenses(submitted_by, created_at)
  WHERE category = 'repair' AND receipt_url IS NULL AND deleted_at IS NULL;

-- 2. vehicle_maintenance — link back to the expense that closed the item,
--    plus a denormalised receipt_url so the maintenance dialog can show a
--    "view receipt" link without a join.
ALTER TABLE public.vehicle_maintenance
  ADD COLUMN IF NOT EXISTS expense_id uuid REFERENCES public.expenses(id),
  ADD COLUMN IF NOT EXISTS receipt_url text;

-- 3. fuel_requests — receipt tamper-evidence hash
ALTER TABLE public.fuel_requests
  ADD COLUMN IF NOT EXISTS receipt_sha256 text;

CREATE INDEX IF NOT EXISTS idx_fuel_requests_awaiting_receipt
  ON public.fuel_requests(driver_id, payment_sent_at)
  WHERE status = 'payment_sent' AND deleted_at IS NULL;

-- 4. company_settings — pump-price benchmark for the anomaly cross-check.
--    Nigerian PMS pump price fluctuates; admins can update this in Settings.
--    Default is a placeholder — the first admin visit to Fleet Settings
--    should confirm/update it against today's actual price.
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS fuel_price_ngn_per_litre numeric NOT NULL DEFAULT 950;
