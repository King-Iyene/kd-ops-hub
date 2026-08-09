-- The live documents table has file_url NOT NULL from an earlier schema
-- variant, but the application only uses storage_path. Uploads fail with
-- "null value in column file_url violates not-null constraint".
--
-- Fix: drop the NOT NULL constraint on file_url and backfill any nulls
-- from storage_path so existing rows stay consistent.

ALTER TABLE public.documents ALTER COLUMN file_url DROP NOT NULL;

UPDATE public.documents
SET    file_url = storage_path
WHERE  file_url IS NULL AND storage_path IS NOT NULL;

NOTIFY pgrst, 'reload schema';
