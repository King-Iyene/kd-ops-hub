-- Fleet anomaly detection.
--
-- RULE 1: distance_km > 500 → is_anomaly flagged on trip_logs (existing column), admin notified.
-- RULE 2: efficiency < 2 km/L or > 30 km/L → is_anomaly + anomaly_type on fuel_requests.
-- RULE 3: same-day duplicate fuel request for same vehicle → driver warned; note appended.
-- RULE 4: trip end > 100 km from vehicle home base → is_out_of_area on trip_logs.
--
-- Also adds anomaly review fields to both tables so admins can mark each flag
-- as "valid" or "fraudulent / error" with a required reason.

-- 1. fuel_requests: anomaly flag + type + review trail
ALTER TABLE public.fuel_requests
  ADD COLUMN IF NOT EXISTS is_anomaly           boolean      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS anomaly_type         text,
  ADD COLUMN IF NOT EXISTS anomaly_reviewed_by  uuid         REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS anomaly_reviewed_at  timestamptz,
  ADD COLUMN IF NOT EXISTS anomaly_review_note  text;

-- 2. vehicles: home base coordinates for out-of-area detection (RULE 4)
ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS home_base_lat  numeric(10,7),
  ADD COLUMN IF NOT EXISTS home_base_lng  numeric(10,7);

-- 3. trip_logs: out-of-area flag + review trail
ALTER TABLE public.trip_logs
  ADD COLUMN IF NOT EXISTS is_out_of_area       boolean      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS anomaly_reviewed_by  uuid         REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS anomaly_reviewed_at  timestamptz,
  ADD COLUMN IF NOT EXISTS anomaly_review_note  text;
