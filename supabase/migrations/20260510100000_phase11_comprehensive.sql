-- =============================================================================
-- KDOps Phase 11 — Comprehensive schema fixes, name split, RLS, storage
-- =============================================================================

-- ======================== NAME SPLIT ========================
-- Profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS first_name text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_name text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS permissions jsonb DEFAULT '{}';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS tags text[] DEFAULT ARRAY[]::text[];

UPDATE public.profiles
SET first_name = split_part(full_name, ' ', 1),
    last_name = CASE WHEN position(' ' in full_name) > 0
      THEN substring(full_name from position(' ' in full_name) + 1) ELSE '' END
WHERE first_name IS NULL AND full_name IS NOT NULL;

-- Contractors
ALTER TABLE public.contractors ADD COLUMN IF NOT EXISTS first_name text;
ALTER TABLE public.contractors ADD COLUMN IF NOT EXISTS last_name text;
ALTER TABLE public.contractors ADD COLUMN IF NOT EXISTS tags text[] DEFAULT ARRAY[]::text[];

UPDATE public.contractors
SET first_name = split_part(full_name, ' ', 1),
    last_name = CASE WHEN position(' ' in full_name) > 0
      THEN substring(full_name from position(' ' in full_name) + 1) ELSE '' END
WHERE first_name IS NULL AND full_name IS NOT NULL;

-- Contacts
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS first_name text;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS last_name text;

UPDATE public.contacts
SET first_name = split_part(full_name, ' ', 1),
    last_name = CASE WHEN position(' ' in full_name) > 0
      THEN substring(full_name from position(' ' in full_name) + 1) ELSE '' END
WHERE first_name IS NULL AND full_name IS NOT NULL;

-- Contractor applications
ALTER TABLE public.contractor_applications ADD COLUMN IF NOT EXISTS first_name text;
ALTER TABLE public.contractor_applications ADD COLUMN IF NOT EXISTS last_name text;

-- ======================== SUBSCRIPTIONS FIX ========================
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS next_renewal_date date;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS next_billing_date date;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS vendor text;

-- ======================== BUDGETS FIX ========================
ALTER TABLE public.budgets ADD COLUMN IF NOT EXISTS department_id uuid REFERENCES public.departments(id);
ALTER TABLE public.budgets ADD COLUMN IF NOT EXISTS period_start date;
ALTER TABLE public.budgets ADD COLUMN IF NOT EXISTS period_end date;

-- ======================== DOCUMENTS FIX ========================
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS tags text[] DEFAULT ARRAY[]::text[];

-- Storage bucket for documents
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('receipts', 'receipts', false)
ON CONFLICT (id) DO NOTHING;

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
USING (public.current_user_role() IN ('super_admin', 'admin', 'finance'));

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
USING (public.current_user_role() IN ('super_admin', 'admin', 'finance', 'operations'));

-- ======================== CONTACT ACTIVITY LOG ========================
CREATE TABLE IF NOT EXISTS public.contact_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  action text NOT NULL,
  detail text,
  performed_by uuid REFERENCES public.profiles(id),
  performed_by_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.contact_activities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "contact_activities_select" ON public.contact_activities;
CREATE POLICY "contact_activities_select" ON public.contact_activities
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "contact_activities_insert" ON public.contact_activities;
CREATE POLICY "contact_activities_insert" ON public.contact_activities
  FOR ALL TO authenticated
  USING (public.current_user_role() IN ('super_admin', 'admin', 'finance', 'operations'));

-- ======================== TRANSACTIONS VIEW FIX ========================
CREATE OR REPLACE VIEW public.transactions_view AS
SELECT pb.id, pb.created_at,
  CASE WHEN pb.is_quick_pay THEN 'quick_pay' ELSE 'payment_batch' END AS txn_type,
  COALESCE(pb.payment_description, pb.name) AS description,
  COALESCE(pb.payment_category, 'contractor_payment') AS category,
  pb.total_amount AS amount_ngn, pb.status,
  pb.id::text AS reference, pb.created_by
FROM public.payment_batches pb
UNION ALL
SELECT bi.id, bi.created_at, 'transfer' AS txn_type,
  COALESCE(bi.full_name, 'Transfer') AS description,
  'contractor_payment' AS category, bi.amount_ngn,
  CASE WHEN bi.status = 'succeeded' THEN 'processed'
       WHEN bi.status = 'failed' THEN 'failed'
       WHEN bi.status = 'retry' THEN 'processing'
       ELSE 'pending' END AS status,
  COALESCE(bi.paystack_reference, bi.id::text) AS reference,
  NULL::uuid AS created_by
FROM public.batch_items bi
UNION ALL
SELECT e.id, e.created_at, 'expense' AS txn_type,
  COALESCE(e.description, e.category) AS description,
  e.category, e.amount_ngn, e.status,
  e.id::text AS reference, e.submitted_by AS created_by
FROM public.expenses e;

GRANT SELECT ON public.transactions_view TO authenticated;
