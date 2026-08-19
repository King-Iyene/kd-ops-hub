-- LOW finding: trip_logs_select_all was USING(true) — any authenticated
-- field_staff account could read every other driver's trip data (routes,
-- timestamps) directly via the Supabase client, even though the app's own
-- UI only ever shows an admin all trips vs. an employee their own
-- (src/pages/Fleet.tsx: `isAdmin ? tripLogs : myTripLogs`). trip_logs_update
-- /_delete in the same source migration already scope correctly
-- (current_user_role() IN admin/operations OR driver_id = auth.uid()) —
-- this brings SELECT in line with them.
DROP POLICY IF EXISTS "trip_logs_select_all" ON public.trip_logs;
CREATE POLICY "trip_logs_select_all"
  ON public.trip_logs FOR SELECT TO authenticated
  USING (
    public.current_user_role() IN ('super_admin','admin','operations')
    OR driver_id = auth.uid()
  );

-- MEDIUM finding: employee_deductions and employee_earnings both had
-- SELECT open to every authenticated user ("payroll view needs all
-- employees' deductions"), letting any employee/driver/contractor with a
-- login read every other employee's salary deductions and earnings
-- breakdown. Verified no legitimate self-service use case needs this:
-- EmployeeProfile.tsx (the only frontend reader besides Payroll.tsx) is
-- routed behind RoleGuard roles={['super_admin','admin']} — an employee
-- can never reach it for their own record either. Scoping SELECT to match
-- the sibling "Finance roles can manage" policy already on both tables.
DROP POLICY IF EXISTS "Authenticated can read deductions" ON public.employee_deductions;
CREATE POLICY "Authenticated can read deductions"
  ON public.employee_deductions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('super_admin', 'admin', 'finance')
        AND status = 'active'
    )
  );

DROP POLICY IF EXISTS "Authenticated can read earnings" ON public.employee_earnings;
CREATE POLICY "Authenticated can read earnings"
  ON public.employee_earnings
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('super_admin', 'admin', 'finance')
        AND status = 'active'
    )
  );
