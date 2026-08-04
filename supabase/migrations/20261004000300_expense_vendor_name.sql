-- Repair (and other expense) descriptions were blending "what was done"
-- and "who was paid" into one free-text field — e.g. "Replaced front tyre
-- — Mekunwen Auto Parts, Lekki". Every major expense platform (Expensify,
-- Ramp, QuickBooks, Zoho Expense) keeps vendor/merchant as its own field,
-- separate from the description, because it's needed for vendor-level
-- spend analysis and reuse/collusion detection that free text can't
-- reliably support.
--
-- This also lets OCR populate something meaningful: the vendor line a
-- receipt scan extracts (OcrResult.description) now lands here instead of
-- being string-concatenated into the description the driver typed.

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS vendor_name text;

COMMENT ON COLUMN public.expenses.vendor_name IS
  'Vendor/merchant/garage name, kept separate from description. OCR-prefillable from the receipt scan, confirmable/correctable by the submitter.';

NOTIFY pgrst, 'reload schema';
