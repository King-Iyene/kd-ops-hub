-- ─────────────────────────────────────────────────────────────────────────
-- Root-cause fixes for three production-blocking bugs:
--
-- 1. The `documents` table on the live DB is missing several columns
--    (title, category, storage_path, ...) because the original
--    `CREATE TABLE IF NOT EXISTS` was a no-op against an existing
--    incomplete table. Earlier defensive migrations only patched some
--    columns, leaving uploads failing with "Could not find the
--    'X' column of 'documents' in the schema cache".
--
--    This migration adds every column the application expects with
--    `ADD COLUMN IF NOT EXISTS`, sets sensible defaults so existing
--    rows remain valid, and reloads the PostgREST schema cache.
--
-- 2. The expenses RLS policy `expenses_insert` requires
--    `submitted_by = auth.uid()`. When an admin/finance user approves
--    a fuel request, the code inserts an expense whose `submitted_by`
--    is the driver's id — not the approver's — so the RLS check fails
--    silently and no expense row is created. This migration relaxes
--    the insert policy to also allow privileged roles to insert on
--    behalf of any user.
--
-- 3. (Code change in the same commit) — file preview in private
--    buckets uses signed URLs instead of stored public URLs.
-- ─────────────────────────────────────────────────────────────────────────

-- ── 1. Documents table: ensure every expected column exists ─────────────

ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS title              text,
  ADD COLUMN IF NOT EXISTS category           text,
  ADD COLUMN IF NOT EXISTS storage_path       text,
  ADD COLUMN IF NOT EXISTS mime_type          text,
  ADD COLUMN IF NOT EXISTS file_size_bytes    bigint,
  ADD COLUMN IF NOT EXISTS expires_at         date,
  ADD COLUMN IF NOT EXISTS description        text,
  ADD COLUMN IF NOT EXISTS tags               text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS department_id      uuid REFERENCES public.departments(id),
  ADD COLUMN IF NOT EXISTS uploaded_by        uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS employee_id        uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS file_url           text,
  ADD COLUMN IF NOT EXISTS visible_to_roles   text[] NOT NULL DEFAULT ARRAY['admin','finance','operations']::text[],
  ADD COLUMN IF NOT EXISTS created_at         timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at         timestamptz NOT NULL DEFAULT now();

-- Backfill any rows that pre-date the title/category columns so they
-- don't break the UI listing.
UPDATE public.documents SET title    = COALESCE(title,    'Untitled')  WHERE title    IS NULL;
UPDATE public.documents SET category = COALESCE(category, 'general')   WHERE category IS NULL;

CREATE INDEX IF NOT EXISTS documents_expires_at_idx ON public.documents (expires_at);
CREATE INDEX IF NOT EXISTS documents_employee_id_idx ON public.documents (employee_id);
CREATE INDEX IF NOT EXISTS documents_uploaded_by_idx ON public.documents (uploaded_by);

-- ── 2. Expenses RLS: privileged roles may insert on behalf of others ────

DROP POLICY IF EXISTS "expenses_insert" ON public.expenses;
CREATE POLICY "expenses_insert" ON public.expenses FOR INSERT TO authenticated
WITH CHECK (
  submitted_by = auth.uid()
  OR public.current_user_role() IN ('super_admin', 'admin', 'finance')
);

NOTIFY pgrst, 'reload schema';
