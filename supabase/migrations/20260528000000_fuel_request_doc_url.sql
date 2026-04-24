-- Add optional supporting-document URL to fuel requests. Populated from the
-- new "Supporting Document" upload on the New Fuel Request form. Stored in
-- the 'receipts' Storage bucket under fuel-request-docs/<id>-<filename>.

ALTER TABLE public.fuel_requests
  ADD COLUMN IF NOT EXISTS request_doc_url text;
