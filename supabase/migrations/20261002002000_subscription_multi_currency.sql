-- Multi-currency support for subscriptions.
-- Adds a currency column (NGN or USD) and an amount_usd field for USD-denominated
-- subscriptions. Existing rows stay NGN. The amount_ngn column continues to hold the
-- NGN-equivalent (snapshot at entry time for USD subs; authoritative for NGN subs).

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS currency CHAR(3) NOT NULL DEFAULT 'NGN';

ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_currency_check CHECK (currency IN ('NGN', 'USD'));

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS amount_usd NUMERIC DEFAULT NULL;

ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_amount_usd_check CHECK (
    (currency = 'NGN' AND amount_usd IS NULL)
    OR (currency = 'USD' AND amount_usd IS NOT NULL AND amount_usd >= 0)
  );

COMMENT ON COLUMN public.subscriptions.currency IS 'ISO 4217 currency code the subscription is denominated in.';
COMMENT ON COLUMN public.subscriptions.amount_usd IS 'Original USD amount when currency = USD. NULL for NGN subscriptions.';
COMMENT ON COLUMN public.subscriptions.amount_ngn IS 'NGN amount. For USD subs this is the snapshot NGN-equivalent at entry time; for NGN subs this is the authoritative amount.';

CREATE INDEX IF NOT EXISTS idx_subscriptions_currency
  ON public.subscriptions (currency) WHERE currency != 'NGN';
