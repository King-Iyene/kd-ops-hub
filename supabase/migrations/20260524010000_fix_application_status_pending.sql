-- Align the contractor_applications status workflow:
-- 1. Backfill all existing 'pending_review' rows to 'pending' so they appear
--    in the Pending tab (which now filters status = 'pending' only).
-- 2. Change the column default from 'pending_review' to 'pending' so new
--    submissions arrive with the correct status.
--
-- NOTE: After running this migration, also update JoinForm.tsx line 169
--   from  status: 'pending_review'
--   to    status: 'pending'
-- so new form submissions match the new default.

UPDATE public.contractor_applications
SET    status = 'pending'
WHERE  status = 'pending_review';

ALTER TABLE public.contractor_applications
  ALTER COLUMN status SET DEFAULT 'pending';
