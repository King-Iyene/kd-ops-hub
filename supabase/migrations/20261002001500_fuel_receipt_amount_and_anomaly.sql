-- Fuel receipt upload: capture the actual amount paid, distinct from the
-- originally requested amount, and make sure receipt-time anomaly checks
-- surface the same way request-time ones already do.
--
-- Context: fuel_requests.amount_ngn is the driver's ORIGINAL REQUEST
-- amount (used by budget checks, reports, the transfer itself) — it must
-- not be overwritten at receipt time. litres_est -> litres_filled already
-- established this request/actual split for litres; receipt_amount_ngn is
-- the amount-side counterpart, populated when the driver confirms/corrects
-- the real total from the physical receipt.
--
-- Previously the pump-price divergence check at receipt-upload time only
-- appended free text to admin_note — no is_anomaly flag, no notification.
-- An admin had to happen to read the note. The app code now sets
-- is_anomaly/anomaly_type on receipt-time flags too (price divergence,
-- request-vs-receipt amount mismatch, duplicate receipt image, low-
-- confidence OCR), so they show up in the same Anomalies view as
-- request-time flags and trigger the same admin notification.
--
-- receipt_original_sha256 is a SEPARATE hash from receipt_sha256: the
-- latter is computed after the driver-name/timestamp/GPS watermark is
-- burned into the image, so re-uploading the exact same source photo at
-- a different time produces a different receipt_sha256 every time — it
-- can't be used for duplicate-image detection. receipt_original_sha256
-- is hashed BEFORE watermarking so identical source photos always match.

ALTER TABLE public.fuel_requests
  ADD COLUMN IF NOT EXISTS receipt_amount_ngn numeric,
  ADD COLUMN IF NOT EXISTS receipt_original_sha256 text;

CREATE INDEX IF NOT EXISTS idx_fuel_requests_receipt_original_sha256
  ON public.fuel_requests (receipt_original_sha256)
  WHERE receipt_original_sha256 IS NOT NULL;

ALTER TABLE public.fuel_requests
  DROP CONSTRAINT IF EXISTS fuel_requests_receipt_amount_ngn_sane;

ALTER TABLE public.fuel_requests
  ADD CONSTRAINT fuel_requests_receipt_amount_ngn_sane
  CHECK (receipt_amount_ngn IS NULL OR (receipt_amount_ngn >= 0 AND receipt_amount_ngn <= 5000000));

COMMENT ON COLUMN public.fuel_requests.receipt_amount_ngn IS
  'Actual amount paid, confirmed/corrected from the physical receipt at upload time — distinct from amount_ngn (the originally requested amount). Mirrors litres_est -> litres_filled.';

COMMENT ON COLUMN public.fuel_requests.receipt_original_sha256 IS
  'SHA-256 of the receipt image BEFORE watermarking, used to detect the same photo being reused across multiple fuel requests. Do not use for tamper-evidence — that is receipt_sha256, hashed after watermarking to match what is actually in storage.';

NOTIFY pgrst, 'reload schema';
