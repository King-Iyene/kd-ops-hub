-- Repair receipts (expenses.category = 'repair') got NONE of the
-- anti-fraud infrastructure fuel receipts already have: no duplicate-image
-- detection, no amount-vs-receipt mismatch check, no anomaly flag, no
-- distinct admin notification. This closes that gap by mirroring the
-- fuel_requests columns added in 20261002001500/20261002001600 onto the
-- generic expenses table (which repairs — and every other expense
-- category — flow through).
--
-- receipt_original_sha256 is hashed BEFORE the driver-name/timestamp
-- watermark is burned in, same reasoning as fuel: the watermark embeds a
-- timestamp, so hashing the post-watermark file would make identical
-- source photos hash differently every time and defeat duplicate
-- detection entirely.

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS is_anomaly boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS anomaly_type text,
  ADD COLUMN IF NOT EXISTS receipt_original_sha256 text,
  ADD COLUMN IF NOT EXISTS receipt_has_exif boolean;

CREATE INDEX IF NOT EXISTS idx_expenses_receipt_original_sha256
  ON public.expenses (receipt_original_sha256)
  WHERE receipt_original_sha256 IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_expenses_is_anomaly
  ON public.expenses (is_anomaly)
  WHERE is_anomaly = true;

COMMENT ON COLUMN public.expenses.is_anomaly IS
  'Set when a receipt-time check (duplicate image, OCR amount mismatch) flags this expense for admin review. Mirrors fuel_requests.is_anomaly.';
COMMENT ON COLUMN public.expenses.anomaly_type IS
  'Comma-separated flag types, e.g. duplicate_receipt,amount_mismatch. Mirrors fuel_requests.anomaly_type.';
COMMENT ON COLUMN public.expenses.receipt_original_sha256 IS
  'SHA-256 of the receipt image BEFORE watermarking, used to detect the same photo being reused across multiple expense claims. Mirrors fuel_requests.receipt_original_sha256.';
COMMENT ON COLUMN public.expenses.receipt_has_exif IS
  'Whether the uploaded receipt JPEG carried EXIF camera metadata. NULL means not applicable or the check could not run. Informational only — never trust this alone. Mirrors fuel_requests.receipt_has_exif.';

NOTIFY pgrst, 'reload schema';
