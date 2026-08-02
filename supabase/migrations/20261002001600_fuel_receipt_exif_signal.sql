-- Adds a soft, informational signal to fuel receipts: whether the
-- uploaded JPEG carried an EXIF (camera metadata) segment.
--
-- Deliberately NOT wired into is_anomaly on its own. Missing EXIF is
-- common on completely legitimate receipt photos — WhatsApp, Telegram,
-- and most messaging/gallery apps strip it on their own re-encode — so
-- treating "no EXIF" as suspicious by itself would flag honest drivers
-- constantly. The app only surfaces it as extra context on a receipt
-- that a harder check (price divergence, amount mismatch, duplicate
-- image) has already flagged, for a human reviewer to weigh.

ALTER TABLE public.fuel_requests
  ADD COLUMN IF NOT EXISTS receipt_has_exif boolean;

COMMENT ON COLUMN public.fuel_requests.receipt_has_exif IS
  'Whether the uploaded receipt JPEG carried EXIF camera metadata. NULL means not applicable (non-JPEG, e.g. PDF/PNG) or the check could not run. Informational only — never trust this alone, see checkReceiptRequestDivergence/checkPumpPrice for the checks that actually drive is_anomaly.';

NOTIFY pgrst, 'reload schema';
