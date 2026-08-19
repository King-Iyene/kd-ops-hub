-- Schema constraints and indexes from forensic audit findings.
--
-- 1. expenses.category CHECK constraint — enforces the 27-value vocabulary
--    already defined in src/lib/expense-categories.ts so a direct SQL edit,
--    bulk import, or future frontend bug can't insert a free-text value that
--    every downstream budget bucket and per-category limit silently ignores.
--
-- 2. payment_batches.scheduled_date index — the Dashboard upcoming-payments
--    widget and PaymentSchedule page both range-scan this column with no index.
--
-- 3. Drop the superseded full-table fuel_requests(status, created_at) index —
--    the newer partial index (WHERE deleted_at IS NULL) covers every real
--    query pattern, and the old one costs a write on every insert for no read
--    benefit.

-- ── 1. expenses.category CHECK ─────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'expenses_category_check'
  ) THEN
    ALTER TABLE public.expenses
      ADD CONSTRAINT expenses_category_check CHECK (
        category IN (
          'fuel', 'transport', 'mileage', 'parking_tolls',
          'accommodation', 'flight', 'meals', 'client_entertainment', 'per_diem',
          'office_supplies', 'printing', 'equipment', 'software',
          'utilities', 'diesel_generator', 'internet_data', 'airtime', 'rent',
          'repair', 'maintenance', 'insurance',
          'legal_professional', 'accounting_audit', 'training',
          'marketing', 'courier', 'bank_charges',
          'other'
        )
      );
  END IF;
END$$;

-- ── 2. payment_batches.scheduled_date index ────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_payment_batches_scheduled_date
  ON public.payment_batches (scheduled_date)
  WHERE deleted_at IS NULL AND scheduled_date IS NOT NULL;

-- ── 3. Drop superseded full-table fuel_requests index ──────────────────────
-- The newer idx_fuel_requests_status_created (partial, WHERE deleted_at IS
-- NULL) covers every real query pattern. The older full-table index
-- idx_fuel_requests_status_created_at is now pure write overhead.

DROP INDEX IF EXISTS public.idx_fuel_requests_status_created_at;
