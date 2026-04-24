-- Fuel request budget enforcement.
--
-- 1. carry_forward_ngn on vehicles — stores unspent budget rolled over from
--    the prior week. Capped at 50% of weekly_budget_ngn by the rollover job
--    (P2-006). This column is the source of truth; the rollover job writes it.
--
-- 2. 'budget_blocked' status — written when a driver submits a request that
--    exceeds the vehicle's remaining weekly budget. Admins can approve these
--    as budget exceptions without going through the normal approval flow.
--
-- 3. budget_exception columns — a clean, queryable audit trail separate from
--    free-text admin_note (which is also updated for human readability).

-- -----------------------------------------------------------------------
-- carry_forward balance on vehicles
-- -----------------------------------------------------------------------

ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS carry_forward_ngn numeric NOT NULL DEFAULT 0;

-- -----------------------------------------------------------------------
-- Extend the status CHECK to include 'budget_blocked'
-- -----------------------------------------------------------------------

ALTER TABLE public.fuel_requests
  DROP CONSTRAINT IF EXISTS fuel_requests_status_check;

ALTER TABLE public.fuel_requests
  ADD CONSTRAINT fuel_requests_status_check CHECK (
    status IN (
      'pending',
      'approved',
      'rejected',
      'payment_sent',
      'receipt_uploaded',
      'completed',
      'budget_blocked'
    )
  );

-- -----------------------------------------------------------------------
-- Budget exception audit columns on fuel_requests
-- -----------------------------------------------------------------------

ALTER TABLE public.fuel_requests
  ADD COLUMN IF NOT EXISTS budget_exception     boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS budget_exception_by  uuid        REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS budget_exception_at  timestamptz;
