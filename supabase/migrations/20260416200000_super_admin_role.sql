-- Extend the profiles.role check constraint to allow 'super_admin'.
-- Super Admin is a human-only role with full access plus the ability to
-- simulate any other role in the UI (view-only). There is no separate
-- super_admin flag — it simply lives alongside the existing roles.
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('super_admin', 'admin', 'finance', 'operations', 'field_staff', 'driver'));

-- Super admins can manage any profile (mirrors the existing admin policy).
DROP POLICY IF EXISTS "Super admins can manage profiles" ON public.profiles;
CREATE POLICY "Super admins can manage profiles" ON public.profiles
  FOR UPDATE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'super_admin'
    )
  );

-- Super admins, admins, finance and operations can read the full roster
-- (needed to populate the Employees page and the audit performer names).
DROP POLICY IF EXISTS "Admins and managers can view all profiles" ON public.profiles;
CREATE POLICY "Admins and managers can view all profiles" ON public.profiles
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('super_admin', 'admin', 'finance', 'operations')
    )
  );
