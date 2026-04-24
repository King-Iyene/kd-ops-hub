-- Post-payment accountability columns for fuel_requests.
--
-- New workflow: draft → pending → approved → payment_sent → receipt_uploaded → completed
--
-- receipt_url        — public URL of the driver's uploaded fuel receipt
-- payment_sent_at    — timestamp admin marks payment as sent
-- fuel_station_name  — station where driver actually filled up (may differ from request)
-- litres_filled      — actual litres put in (driver confirms on receipt upload)

ALTER TABLE public.fuel_requests
  ADD COLUMN IF NOT EXISTS receipt_url text,
  ADD COLUMN IF NOT EXISTS payment_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS fuel_station_name text,
  ADD COLUMN IF NOT EXISTS litres_filled numeric;
