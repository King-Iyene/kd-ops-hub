-- ─────────────────────────────────────────────────────────────────────────
-- Root-cause fix #2: documents legacy NOT NULL columns + fuel→expense link
--
-- 1. The live `documents` table has legacy NOT NULL columns (`name` and
--    possibly others) that the application never sets. Each upload fails
--    with a different "null value in column X" error as we discover them.
--    This migration drops NOT NULL on every column the app does NOT
--    manage, in a single shot, so the upload can succeed regardless of
--    which old schema variant the table was created with.
--
-- 2. Add `fuel_request_id` link on `expenses` so a fuel request is
--    visible in Expenses (and reports) the moment it is submitted —
--    not only after approval. The expenses row is created paired with
--    the fuel_request and updated when the request status changes.
--
-- 3. Add `receipt_url` column on expenses if missing (used by repair).
-- ─────────────────────────────────────────────────────────────────────────

-- ── 1. Documents: drop NOT NULL on legacy / unmanaged columns ───────────

DO $migration$
DECLARE
  col record;
  managed_cols text[] := ARRAY[
    'id', 'title', 'category', 'description', 'expires_at',
    'storage_path', 'file_url', 'mime_type', 'file_size_bytes',
    'employee_id', 'uploaded_by', 'tags', 'visible_to_roles',
    'department_id', 'created_at', 'updated_at'
  ];
BEGIN
  -- Special handling: if a 'name' column exists and is NOT NULL, backfill
  -- from title before relaxing the constraint so existing rows stay valid.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'documents' AND column_name = 'name'
  ) THEN
    UPDATE public.documents SET name = COALESCE(name, title, 'Untitled') WHERE name IS NULL;
  END IF;

  -- General sweep: drop NOT NULL on any column that:
  --   - is currently NOT NULL,
  --   - has no default value,
  --   - is not in our managed list.
  -- This way, future legacy columns we haven't yet discovered still don't
  -- block uploads.
  FOR col IN
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'documents'
      AND is_nullable = 'NO'
      AND column_default IS NULL
      AND column_name <> ALL(managed_cols)
  LOOP
    BEGIN
      EXECUTE format('ALTER TABLE public.documents ALTER COLUMN %I DROP NOT NULL', col.column_name);
    EXCEPTION WHEN OTHERS THEN
      -- Best-effort: ignore columns that can't be altered (e.g. PK).
      NULL;
    END;
  END LOOP;
END $migration$;

-- ── 2. Expenses: link a row to its source fuel_request ─────────────────

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS fuel_request_id uuid
    REFERENCES public.fuel_requests(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS expenses_fuel_request_idx
  ON public.expenses (fuel_request_id);

-- ── 3. Defensive: receipt_url column for repair receipts (used in code) ─

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS receipt_url text;

NOTIFY pgrst, 'reload schema';
