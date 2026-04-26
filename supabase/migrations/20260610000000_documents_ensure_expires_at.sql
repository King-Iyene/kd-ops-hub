-- Ensures the documents table has every column the frontend expects.
-- Originally created in 20260416100000_phase_2_modules.sql, but on some
-- databases the table was provisioned without `expires_at`, causing uploads
-- to fail with "Could not find the 'expires_at' column of 'documents'
-- in the schema cache".
--
-- Idempotent — uses ADD COLUMN IF NOT EXISTS for every field.

ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS expires_at         date,
  ADD COLUMN IF NOT EXISTS mime_type          text,
  ADD COLUMN IF NOT EXISTS file_size_bytes    bigint,
  ADD COLUMN IF NOT EXISTS description        text,
  ADD COLUMN IF NOT EXISTS tags               text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS department_id      uuid REFERENCES public.departments(id),
  ADD COLUMN IF NOT EXISTS uploaded_by        uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS employee_id        uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS file_url           text,
  ADD COLUMN IF NOT EXISTS visible_to_roles   text[] NOT NULL DEFAULT ARRAY['admin', 'finance', 'operations']::text[];

CREATE INDEX IF NOT EXISTS documents_expires_at_idx
  ON public.documents (expires_at);
CREATE INDEX IF NOT EXISTS documents_employee_id_idx
  ON public.documents (employee_id);

COMMENT ON COLUMN public.documents.employee_id IS
  'When set, this document belongs to the given employee (e.g. their contract, NDA, ID copy). Distinct from uploaded_by (who performed the upload).';

-- Tell PostgREST to reload its schema cache so the new columns are visible
-- to the API immediately, without waiting for the next auto-refresh.
NOTIFY pgrst, 'reload schema';
