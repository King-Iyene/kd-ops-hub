-- Link subscriptions to the vendors table so the vendor field is connected,
-- not free-text. Backfill vendor_id for existing rows that match by name.

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS vendor_id uuid REFERENCES public.vendors(id);

UPDATE public.subscriptions s
SET vendor_id = v.id
FROM public.vendors v
WHERE s.vendor = v.name AND s.vendor_id IS NULL;
