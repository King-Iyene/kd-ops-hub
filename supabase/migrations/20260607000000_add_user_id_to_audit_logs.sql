-- audit_logs was missing a user_id column that some inserts expect.
-- Add it as a nullable FK to profiles, consistent with performed_by.

ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES public.profiles(id);
