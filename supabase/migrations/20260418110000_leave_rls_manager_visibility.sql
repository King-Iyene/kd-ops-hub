-- Allow managers to see all leave requests.
-- Previously only the submitting employee could read their own rows,
-- so admins/managers couldn't approve anything through the UI.
--
-- Uses the SECURITY DEFINER helper current_user_role() to avoid infinite
-- recursion on the profiles table RLS.

DROP POLICY IF EXISTS "leave_select" ON public.leave_requests;

CREATE POLICY "leave_select" ON public.leave_requests
  FOR SELECT TO authenticated
  USING (
    employee_id = auth.uid()
    OR public.current_user_role() IN ('super_admin', 'admin', 'finance', 'operations')
  );
