-- ----------------------------------------------------------------------------
-- Cache Paystack recipient_code on profiles to avoid creating a new recipient
-- on every payment.
--
-- Today every batch_item creates its own transferrecipient via Paystack — for
-- a 50-employee monthly payroll that's 50 unnecessary API calls. Caching the
-- recipient_code on the profile means we hit /transferrecipient once when an
-- employee is onboarded (or when their bank details change), then reuse the
-- code forever. The recipient_code is invalidated automatically by clearing
-- this column whenever bank_account_number or bank_code changes.
--
-- We also stamp `paystack_recipient_verified_at` so admins can see when the
-- bank details were last validated end-to-end against Paystack.
-- ----------------------------------------------------------------------------

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS paystack_recipient_code TEXT,
  ADD COLUMN IF NOT EXISTS paystack_recipient_verified_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS profiles_paystack_recipient_idx
  ON public.profiles (paystack_recipient_code)
  WHERE paystack_recipient_code IS NOT NULL;

COMMENT ON COLUMN public.profiles.paystack_recipient_code IS
  'Cached Paystack transferrecipient code (RCP_xxxx). Reused on every payment to that profile. Cleared automatically by trigger when the underlying bank details change.';
COMMENT ON COLUMN public.profiles.paystack_recipient_verified_at IS
  'Timestamp of the last successful Paystack recipient creation. Useful for ops to know how stale the cached code is.';

-- Trigger: clear the cached recipient_code if bank details change. The next
-- payment for this profile will re-verify the (potentially new) account by
-- creating a fresh recipient.
CREATE OR REPLACE FUNCTION public.invalidate_paystack_recipient_on_bank_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF (NEW.bank_account_number IS DISTINCT FROM OLD.bank_account_number)
     OR (NEW.bank_code IS DISTINCT FROM OLD.bank_code)
     OR (NEW.bank_name IS DISTINCT FROM OLD.bank_name) THEN
    NEW.paystack_recipient_code := NULL;
    NEW.paystack_recipient_verified_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_invalidate_paystack_recipient ON public.profiles;
CREATE TRIGGER profiles_invalidate_paystack_recipient
  BEFORE UPDATE OF bank_account_number, bank_code, bank_name ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.invalidate_paystack_recipient_on_bank_change();

COMMENT ON FUNCTION public.invalidate_paystack_recipient_on_bank_change IS
  'Clears the cached Paystack recipient_code whenever a profile''s bank details change so the next payment refreshes the recipient.';
