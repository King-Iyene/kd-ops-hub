-- ----------------------------------------------------------------------------
-- Employee dependents & beneficiaries.
--
-- Tracks family members (spouse, children, parents, etc.) attached to an
-- employee record — who to enroll on HMO, who is a nominated beneficiary
-- for group life / pension, and general next-of-kin-adjacent detail that
-- profiles.next_of_kin_* was never meant to carry more than one of.
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.employee_dependents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  relationship text NOT NULL
    CHECK (relationship IN ('spouse', 'child', 'parent', 'sibling', 'other')),
  date_of_birth date,
  gender text CHECK (gender IN ('male', 'female')),
  phone text,
  is_beneficiary boolean DEFAULT false,
  is_hmo_enrolled boolean DEFAULT false,
  hmo_plan_id text,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS employee_dependents_employee_idx
  ON public.employee_dependents (employee_id);

DROP TRIGGER IF EXISTS set_updated_at ON public.employee_dependents;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.employee_dependents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.employee_dependents ENABLE ROW LEVEL SECURITY;

-- Employees read their own dependents; admins/HR-adjacent roles read all.
DROP POLICY IF EXISTS "employee_dependents_read" ON public.employee_dependents;
CREATE POLICY "employee_dependents_read" ON public.employee_dependents
  FOR SELECT TO authenticated USING (
    employee_id = auth.uid()
    OR public.current_user_role() IN ('super_admin', 'admin', 'finance', 'operations')
  );

-- Employees manage their own dependents; admins manage anyone's.
DROP POLICY IF EXISTS "employee_dependents_write" ON public.employee_dependents;
CREATE POLICY "employee_dependents_write" ON public.employee_dependents
  FOR ALL TO authenticated USING (
    employee_id = auth.uid()
    OR public.current_user_role() IN ('super_admin', 'admin')
  ) WITH CHECK (
    employee_id = auth.uid()
    OR public.current_user_role() IN ('super_admin', 'admin')
  );

COMMENT ON TABLE public.employee_dependents IS
  'Spouse/children/other dependents per employee — beneficiary and HMO enrollment status feed group life and HMO administration.';
