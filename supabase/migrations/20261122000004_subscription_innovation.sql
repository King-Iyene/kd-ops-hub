-- =============================================================================
-- Subscription Innovation: Payment Ledger, Payment Methods, Priority & Decision
--
-- Inspired by Brex/Ramp/Spendesk subscription management:
--   1. billing_day — which day of month each sub renews (cash flow calendar)
--   2. payment_method — which card/account pays (spend-per-method analytics)
--   3. priority — high/medium/low business criticality
--   4. decision — keep/kill/undecided workflow with projected savings
--   5. cost_original — face-value cost in native currency
--   6. subscription_payments — monthly payment ledger (like placement_payments)
--   7. updated_at — track last modification time
-- =============================================================================

-- ── New columns on subscriptions ─────────────────────────────────────────

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS billing_day      integer,
  ADD COLUMN IF NOT EXISTS payment_method   text,
  ADD COLUMN IF NOT EXISTS priority         text DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS decision         text DEFAULT 'undecided',
  ADD COLUMN IF NOT EXISTS cost_original    numeric,
  ADD COLUMN IF NOT EXISTS updated_at       timestamptz DEFAULT now();

DO $$ BEGIN
  ALTER TABLE public.subscriptions
    ADD CONSTRAINT subscriptions_billing_day_check
      CHECK (billing_day IS NULL OR (billing_day >= 1 AND billing_day <= 31));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.subscriptions
    ADD CONSTRAINT subscriptions_priority_check
      CHECK (priority IN ('high', 'medium', 'low'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.subscriptions
    ADD CONSTRAINT subscriptions_decision_check
      CHECK (decision IN ('keep', 'kill', 'undecided'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Fix the broken generic set_updated_at trigger
DROP TRIGGER IF EXISTS set_updated_at ON public.subscriptions;

CREATE OR REPLACE FUNCTION public.set_subscriptions_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER set_subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_subscriptions_updated_at();

-- ── Unique vendor name index ─────────────────────────────────────────────

CREATE UNIQUE INDEX IF NOT EXISTS idx_vendors_name_unique
  ON public.vendors(name) WHERE deleted_at IS NULL;

-- ── Subscription payments ledger ─────────────────────────────────────────
-- Mirrors placement_payments: one row per subscription per month.
-- Tracks whether each month's payment was actually made.

CREATE TABLE IF NOT EXISTS public.subscription_payments (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id  uuid NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  month            date NOT NULL,
  status           text NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('paid', 'pending', 'skipped', 'overdue')),
  amount_ngn       numeric,
  amount_usd       numeric,
  fx_rate_used     numeric,
  payment_method   text,
  paid_at          timestamptz,
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (subscription_id, month)
);

ALTER TABLE public.subscription_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read subscription payments"
  ON public.subscription_payments FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert subscription payments"
  ON public.subscription_payments FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update subscription payments"
  ON public.subscription_payments FOR UPDATE TO authenticated
  USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_sub_payments_sub_id ON public.subscription_payments(subscription_id);
CREATE INDEX IF NOT EXISTS idx_sub_payments_month ON public.subscription_payments(month);
CREATE INDEX IF NOT EXISTS idx_sub_payments_status ON public.subscription_payments(status);

CREATE OR REPLACE FUNCTION public.set_subscription_payments_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER set_subscription_payments_updated_at
  BEFORE UPDATE ON public.subscription_payments
  FOR EACH ROW EXECUTE FUNCTION public.set_subscription_payments_updated_at();
