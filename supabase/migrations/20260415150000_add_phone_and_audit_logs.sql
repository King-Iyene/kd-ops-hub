-- Add phone column to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone text;

-- Expand the roles allowed on profiles to support the employee module
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'finance', 'operations', 'field_staff', 'driver'));

-- Add status column to profiles for employee (de)activation
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active'
  CHECK (status IN ('active', 'inactive'));

-- Create audit_logs table
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_type text NOT NULL,
  description text NOT NULL,
  performed_by uuid REFERENCES public.profiles(id),
  performed_by_name text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can read audit logs (for the activity feed on the dashboard)
DROP POLICY IF EXISTS "Authenticated users can view audit logs" ON public.audit_logs;
CREATE POLICY "Authenticated users can view audit logs" ON public.audit_logs
  FOR SELECT TO authenticated USING (true);

-- Authenticated users can write their own actions
DROP POLICY IF EXISTS "Authenticated users can create audit logs" ON public.audit_logs;
CREATE POLICY "Authenticated users can create audit logs" ON public.audit_logs
  FOR INSERT TO authenticated WITH CHECK (true);

-- Allow admins/finance/operations to view all profiles (for the employees page)
DROP POLICY IF EXISTS "Admins and managers can view all profiles" ON public.profiles;
CREATE POLICY "Admins and managers can view all profiles" ON public.profiles
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'finance', 'operations')
    )
  );

-- Allow admins to manage (update) any profile
DROP POLICY IF EXISTS "Admins can manage profiles" ON public.profiles;
CREATE POLICY "Admins can manage profiles" ON public.profiles
  FOR UPDATE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

-- Vehicle selection has been removed from the fleet module entirely.
-- Make vehicle_id optional so fuel_requests and trip_logs can be inserted
-- without a vehicle reference.
ALTER TABLE public.fuel_requests ALTER COLUMN vehicle_id DROP NOT NULL;
ALTER TABLE public.trip_logs ALTER COLUMN vehicle_id DROP NOT NULL;

-- Ensure field_staff can submit their own fuel requests and trip logs
DROP POLICY IF EXISTS "Employees can view own fuel requests" ON public.fuel_requests;
CREATE POLICY "Employees can view own fuel requests" ON public.fuel_requests
  FOR SELECT TO authenticated USING (driver_id = auth.uid());
DROP POLICY IF EXISTS "Employees can create fuel requests" ON public.fuel_requests;
CREATE POLICY "Employees can create fuel requests" ON public.fuel_requests
  FOR INSERT TO authenticated WITH CHECK (driver_id = auth.uid());

DROP POLICY IF EXISTS "Employees can view own trip logs" ON public.trip_logs;
CREATE POLICY "Employees can view own trip logs" ON public.trip_logs
  FOR SELECT TO authenticated USING (driver_id = auth.uid());
DROP POLICY IF EXISTS "Employees can create trip logs" ON public.trip_logs;
CREATE POLICY "Employees can create trip logs" ON public.trip_logs
  FOR INSERT TO authenticated WITH CHECK (driver_id = auth.uid());

-- Allow Admin and Finance roles to approve/reject fuel requests
DROP POLICY IF EXISTS "Admins and finance can manage fuel requests" ON public.fuel_requests;
CREATE POLICY "Admins and finance can manage fuel requests" ON public.fuel_requests
  FOR ALL TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'finance')
    )
  );
