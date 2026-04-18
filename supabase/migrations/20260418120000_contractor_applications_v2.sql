-- Extend contractor_applications to match the updated /join form.
-- Table already exists; this is additive — no data loss.

ALTER TABLE public.contractor_applications
  ADD COLUMN IF NOT EXISTS linkedin_url   text,
  ADD COLUMN IF NOT EXISTS additional_info text,
  ADD COLUMN IF NOT EXISTS reviewed_by    uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS reviewed_at    timestamptz;

-- Backfill linkedin_url from the old column so existing rows carry forward.
UPDATE public.contractor_applications
SET    linkedin_url = linkedin_profile_url
WHERE  linkedin_url IS NULL AND linkedin_profile_url IS NOT NULL;

-- Widen the status constraint to accept 'pending' (new form default) while
-- keeping 'pending_review' valid for existing rows.
ALTER TABLE public.contractor_applications
  DROP CONSTRAINT IF EXISTS contractor_applications_status_check;

ALTER TABLE public.contractor_applications
  ADD CONSTRAINT contractor_applications_status_check
  CHECK (status IN ('pending', 'pending_review', 'approved', 'rejected'));

-- Fix RLS to use current_user_role() (avoids recursion on profiles).
DROP POLICY IF EXISTS "contractor_applications_read" ON public.contractor_applications;
CREATE POLICY "contractor_applications_read" ON public.contractor_applications
  FOR SELECT TO authenticated
  USING (public.current_user_role() IN ('super_admin', 'admin', 'finance', 'operations'));

DROP POLICY IF EXISTS "contractor_applications_update" ON public.contractor_applications;
CREATE POLICY "contractor_applications_update" ON public.contractor_applications
  FOR UPDATE TO authenticated
  USING (public.current_user_role() IN ('super_admin', 'admin', 'finance', 'operations'));
