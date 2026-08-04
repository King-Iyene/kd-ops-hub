-- Fuel receipt OCR already extracts a date off the receipt (OcrResult.date)
-- but the app silently discarded it — no field to confirm/correct it, no
-- staleness check. Every major expense platform (Expensify, Ramp, Brex)
-- flags a receipt whose date is far older than the submission date, since
-- that's a common pattern for recycled or backdated receipts. This adds
-- the column so the app can do the same.

ALTER TABLE public.fuel_requests
  ADD COLUMN IF NOT EXISTS receipt_date date;

COMMENT ON COLUMN public.fuel_requests.receipt_date IS
  'Date printed on the physical receipt, confirmed/corrected from OCR at upload time. Used only for a stale-receipt sanity check (see stale_receipt anomaly type) — never trust this alone since handwritten dates OCR unreliably.';

NOTIFY pgrst, 'reload schema';
