-- Store the bank-verified account name on batch_items
--
-- When Paystack creates a transfer recipient it resolves the account name
-- from the bank's NUBAN record. That verified name is what the receiving
-- bank prints on the beneficiary's statement — it may differ from the
-- full_name the operator entered. We store it here so the KD Ops receipt
-- "Sent to" field shows the verified name, not the manually-entered one.

ALTER TABLE public.batch_items
  ADD COLUMN IF NOT EXISTS account_name text;

COMMENT ON COLUMN public.batch_items.account_name IS
  'Bank-verified account name returned by Paystack on recipient creation.
   Displayed on receipts instead of the operator-entered full_name.';
