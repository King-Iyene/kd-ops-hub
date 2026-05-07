-- Defensive: ensure departments has the columns the UI expects.
--
-- The toast error "Could not find the 'description' column of 'departments'
-- in the schema cache" means PostgREST's cached schema is missing the
-- column. Two reasons that can happen:
--
--   1. The original CREATE TABLE in 20260416100000 used IF NOT EXISTS,
--      so if the table already existed (e.g. from an early version that
--      had only id+name), the column-add was silently skipped. ALTER
--      TABLE … ADD COLUMN IF NOT EXISTS fixes any drift.
--   2. PostgREST's schema cache is stale. Sending NOTIFY forces a
--      reload immediately so the next request sees the column.
--
-- Idempotent — safe to re-run.

ALTER TABLE public.departments
  ADD COLUMN IF NOT EXISTS description text;

ALTER TABLE public.departments
  ADD COLUMN IF NOT EXISTS head_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

NOTIFY pgrst, 'reload schema';
