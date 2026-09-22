-- Add paystack_recipient_code to ndi_transfers so the edge function's
-- initiate_transfer integrity check can resolve NDI transfers the same
-- way it resolves batch_items and personal_transfers.

ALTER TABLE ndi_transfers
  ADD COLUMN IF NOT EXISTS paystack_recipient_code text;

-- Also add failure_reason column if missing (used by updateNdiTransferStatus)
ALTER TABLE ndi_transfers
  ADD COLUMN IF NOT EXISTS failure_reason text;
