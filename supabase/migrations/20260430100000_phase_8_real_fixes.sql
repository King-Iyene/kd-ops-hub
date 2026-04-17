-- =============================================================================
-- KDOps — Phase 8: real bug fixes
--
-- • Add salary_ngn to profiles for payroll calculations.
-- • Ensure notifications RLS allows system inserts (for approval flows).
-- =============================================================================

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS salary_ngn numeric DEFAULT 0;

-- Ensure any authenticated user can insert notifications (e.g. when submitting
-- an expense and notifying approvers, the submitter needs INSERT rights).
DROP POLICY IF EXISTS "Users can create notifications for themselves" ON public.notifications;
DROP POLICY IF EXISTS "Authenticated can create notifications" ON public.notifications;
CREATE POLICY "Authenticated can insert notifications" ON public.notifications
  FOR INSERT TO authenticated WITH CHECK (true);
