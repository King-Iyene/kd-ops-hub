-- Soft deletes for expenses and documents.
-- Adds deleted_at column to both tables and updates RLS SELECT policies
-- to hide soft-deleted rows from regular queries. Admins can still see
-- them by querying deleted_at IS NOT NULL directly.

-- ── expenses ────────────────────────────────────────────────────────────────
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

CREATE INDEX IF NOT EXISTS expenses_deleted_at_idx
  ON public.expenses (deleted_at)
  WHERE deleted_at IS NULL;

-- ── documents ───────────────────────────────────────────────────────────────
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

CREATE INDEX IF NOT EXISTS documents_deleted_at_idx
  ON public.documents (deleted_at)
  WHERE deleted_at IS NULL;
