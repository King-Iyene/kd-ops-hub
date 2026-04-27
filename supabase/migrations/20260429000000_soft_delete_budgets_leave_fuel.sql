-- Soft deletes for budgets, leave_requests, and fuel_requests.
-- Mirrors the pattern used for expenses/documents (migration 20260428000000).

ALTER TABLE public.budgets
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

CREATE INDEX IF NOT EXISTS budgets_deleted_at_idx
  ON public.budgets (deleted_at)
  WHERE deleted_at IS NULL;

ALTER TABLE public.leave_requests
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

CREATE INDEX IF NOT EXISTS leave_requests_deleted_at_idx
  ON public.leave_requests (deleted_at)
  WHERE deleted_at IS NULL;

ALTER TABLE public.fuel_requests
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

CREATE INDEX IF NOT EXISTS fuel_requests_deleted_at_idx
  ON public.fuel_requests (deleted_at)
  WHERE deleted_at IS NULL;
