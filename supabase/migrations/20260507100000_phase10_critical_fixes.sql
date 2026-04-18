-- =============================================================================
-- KDOps Phase 10 — Critical fixes: missing columns, RLS, name split, permissions
-- =============================================================================

-- ======================== PROFILES ========================
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS first_name text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_name text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS permissions jsonb DEFAULT '{}';

-- Backfill first/last from full_name
UPDATE public.profiles
SET first_name = split_part(full_name, ' ', 1),
    last_name = CASE
      WHEN position(' ' in full_name) > 0
      THEN substring(full_name from position(' ' in full_name) + 1)
      ELSE ''
    END
WHERE first_name IS NULL AND full_name IS NOT NULL;

-- ======================== CONTRACTORS ========================
ALTER TABLE public.contractors ADD COLUMN IF NOT EXISTS first_name text;
ALTER TABLE public.contractors ADD COLUMN IF NOT EXISTS last_name text;
ALTER TABLE public.contractors ADD COLUMN IF NOT EXISTS tags text[] DEFAULT ARRAY[]::text[];

UPDATE public.contractors
SET first_name = split_part(full_name, ' ', 1),
    last_name = CASE
      WHEN position(' ' in full_name) > 0
      THEN substring(full_name from position(' ' in full_name) + 1)
      ELSE ''
    END
WHERE first_name IS NULL AND full_name IS NOT NULL;

-- ======================== CONTACTS ========================
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS first_name text;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS last_name text;

UPDATE public.contacts
SET first_name = split_part(full_name, ' ', 1),
    last_name = CASE
      WHEN position(' ' in full_name) > 0
      THEN substring(full_name from position(' ' in full_name) + 1)
      ELSE ''
    END
WHERE first_name IS NULL AND full_name IS NOT NULL;

-- ======================== SUBSCRIPTIONS ========================
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS next_renewal_date date;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS vendor text;

-- ======================== BUDGETS ========================
ALTER TABLE public.budgets ADD COLUMN IF NOT EXISTS department_id uuid REFERENCES public.departments(id);
ALTER TABLE public.budgets ADD COLUMN IF NOT EXISTS period_start date;
ALTER TABLE public.budgets ADD COLUMN IF NOT EXISTS period_end date;

-- ======================== DOCUMENTS ========================
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS tags text[] DEFAULT ARRAY[]::text[];

-- ======================== EXPENSES RLS FIX ========================
DROP POLICY IF EXISTS "expenses_policy" ON public.expenses;
DROP POLICY IF EXISTS "Authenticated users can view own expenses" ON public.expenses;
DROP POLICY IF EXISTS "Authenticated users can create expenses" ON public.expenses;
DROP POLICY IF EXISTS "Admins can manage expenses" ON public.expenses;
DROP POLICY IF EXISTS "expenses_select" ON public.expenses;
DROP POLICY IF EXISTS "expenses_insert" ON public.expenses;
DROP POLICY IF EXISTS "expenses_update" ON public.expenses;

CREATE POLICY "expenses_select" ON public.expenses FOR SELECT TO authenticated
USING (
  submitted_by = auth.uid()
  OR public.current_user_role() IN ('super_admin', 'admin', 'finance')
);

CREATE POLICY "expenses_insert" ON public.expenses FOR INSERT TO authenticated
WITH CHECK (submitted_by = auth.uid());

CREATE POLICY "expenses_update" ON public.expenses FOR UPDATE TO authenticated
USING (
  public.current_user_role() IN ('super_admin', 'admin', 'finance')
);

-- ======================== LEAVE RLS FIX ========================
DROP POLICY IF EXISTS "leave_policy" ON public.leave_requests;
DROP POLICY IF EXISTS "Users can view own leave" ON public.leave_requests;
DROP POLICY IF EXISTS "Users can create own leave" ON public.leave_requests;
DROP POLICY IF EXISTS "Admins can manage leave" ON public.leave_requests;
DROP POLICY IF EXISTS "leave_select" ON public.leave_requests;
DROP POLICY IF EXISTS "leave_insert" ON public.leave_requests;
DROP POLICY IF EXISTS "leave_update" ON public.leave_requests;

CREATE POLICY "leave_select" ON public.leave_requests FOR SELECT TO authenticated
USING (
  employee_id = auth.uid()
  OR public.current_user_role() IN ('super_admin', 'admin', 'finance', 'operations')
);

CREATE POLICY "leave_insert" ON public.leave_requests FOR INSERT TO authenticated
WITH CHECK (employee_id = auth.uid());

CREATE POLICY "leave_update" ON public.leave_requests FOR UPDATE TO authenticated
USING (
  public.current_user_role() IN ('super_admin', 'admin', 'finance', 'operations')
);

-- ======================== CONTRACTOR APPLICATIONS ========================
-- Add first/last name to contractor_applications too
ALTER TABLE public.contractor_applications ADD COLUMN IF NOT EXISTS first_name text;
ALTER TABLE public.contractor_applications ADD COLUMN IF NOT EXISTS last_name text;
