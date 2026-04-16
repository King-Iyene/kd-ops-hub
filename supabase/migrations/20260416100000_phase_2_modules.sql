-- =============================================================================
-- KDOps — Phase 2: Approvals, Subscriptions, Budgets, Documents, Departments
-- =============================================================================
-- Adds all supporting tables, RLS policies, and the documents storage bucket.
-- Uses IF NOT EXISTS / DROP POLICY IF EXISTS guards so this migration is safe
-- to re-run against databases where the user already created some of these
-- tables ahead of time.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Helper: a profile row of the current user (used widely)
-- -----------------------------------------------------------------------------
-- (No-op if it already exists; we reference auth.uid() directly in policies.)

-- -----------------------------------------------------------------------------
-- departments
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view departments" ON public.departments;
CREATE POLICY "Authenticated can view departments" ON public.departments
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins manage departments" ON public.departments;
CREATE POLICY "Admins manage departments" ON public.departments
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Seed with common KD Squares departments if table is empty. Using WHERE NOT
-- EXISTS so re-running the migration does nothing on a populated table.
INSERT INTO public.departments (name, description)
SELECT * FROM (VALUES
  ('Finance', 'Accounting, treasury, payroll'),
  ('Operations', 'Field operations and logistics'),
  ('Engineering', 'Product and technology'),
  ('People', 'HR, culture and admin'),
  ('Sales', 'Business development and revenue')
) AS s(name, description)
WHERE NOT EXISTS (SELECT 1 FROM public.departments);

-- -----------------------------------------------------------------------------
-- subscriptions
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  vendor text,
  category text NOT NULL DEFAULT 'software',
  amount_ngn numeric NOT NULL DEFAULT 0,
  billing_cycle text NOT NULL DEFAULT 'monthly'
    CHECK (billing_cycle IN ('monthly', 'quarterly', 'yearly')),
  next_renewal_date date NOT NULL,
  last_renewed_at date,
  owner_id uuid REFERENCES public.profiles(id),
  department_id uuid REFERENCES public.departments(id),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled')),
  notes text,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS subscriptions_next_renewal_idx
  ON public.subscriptions (next_renewal_date);

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Managers view subscriptions" ON public.subscriptions;
CREATE POLICY "Managers view subscriptions" ON public.subscriptions
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'finance', 'operations')
    )
  );

DROP POLICY IF EXISTS "Admins and finance manage subscriptions" ON public.subscriptions;
CREATE POLICY "Admins and finance manage subscriptions" ON public.subscriptions
  FOR ALL TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'finance')
    )
  );

-- -----------------------------------------------------------------------------
-- budgets + budget_items
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  department_id uuid REFERENCES public.departments(id),
  total_amount_ngn numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'pending_approval', 'approved', 'rejected', 'closed')),
  notes text,
  created_by uuid REFERENCES public.profiles(id),
  approved_by uuid REFERENCES public.profiles(id),
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Managers view budgets" ON public.budgets;
CREATE POLICY "Managers view budgets" ON public.budgets
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'finance', 'operations')
    )
  );

DROP POLICY IF EXISTS "Admins and finance manage budgets" ON public.budgets;
CREATE POLICY "Admins and finance manage budgets" ON public.budgets
  FOR ALL TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'finance')
    )
  );

CREATE TABLE IF NOT EXISTS public.budget_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_id uuid NOT NULL REFERENCES public.budgets(id) ON DELETE CASCADE,
  category text NOT NULL,
  description text,
  planned_amount_ngn numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS budget_items_budget_id_idx
  ON public.budget_items (budget_id);

ALTER TABLE public.budget_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Managers view budget items" ON public.budget_items;
CREATE POLICY "Managers view budget items" ON public.budget_items
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'finance', 'operations')
    )
  );

DROP POLICY IF EXISTS "Admins and finance manage budget items" ON public.budget_items;
CREATE POLICY "Admins and finance manage budget items" ON public.budget_items
  FOR ALL TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'finance')
    )
  );

-- -----------------------------------------------------------------------------
-- documents
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  category text NOT NULL DEFAULT 'general',
  storage_path text NOT NULL,
  mime_type text,
  file_size_bytes bigint,
  expires_at date,
  description text,
  tags text[] DEFAULT '{}',
  department_id uuid REFERENCES public.departments(id),
  uploaded_by uuid REFERENCES public.profiles(id),
  -- Which roles are allowed to read this document
  visible_to_roles text[] NOT NULL DEFAULT ARRAY['admin', 'finance', 'operations']::text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS documents_expires_at_idx
  ON public.documents (expires_at);

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

-- Users can read a document if their role is in visible_to_roles.
DROP POLICY IF EXISTS "Role-based read on documents" ON public.documents;
CREATE POLICY "Role-based read on documents" ON public.documents
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.role = ANY(documents.visible_to_roles) OR p.role = 'admin')
    )
  );

-- Admin/Finance/Operations can upload documents.
DROP POLICY IF EXISTS "Managers insert documents" ON public.documents;
CREATE POLICY "Managers insert documents" ON public.documents
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'finance', 'operations')
    )
  );

-- Uploader or admin can update/delete.
DROP POLICY IF EXISTS "Uploader or admin updates documents" ON public.documents;
CREATE POLICY "Uploader or admin updates documents" ON public.documents
  FOR UPDATE TO authenticated USING (
    uploaded_by = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "Uploader or admin deletes documents" ON public.documents;
CREATE POLICY "Uploader or admin deletes documents" ON public.documents
  FOR DELETE TO authenticated USING (
    uploaded_by = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- -----------------------------------------------------------------------------
-- Audit log: extend allowed action_types for the new modules.
-- The audit_logs table has a plain text action_type column (no enum) so
-- nothing needs changing here, but we document the expected values for
-- future schema generation.
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- Storage: documents bucket
-- -----------------------------------------------------------------------------
-- Private bucket; all access goes through the API and RLS on storage.objects.
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Authenticated can read documents bucket" ON storage.objects;
CREATE POLICY "Authenticated can read documents bucket" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'documents');

DROP POLICY IF EXISTS "Managers upload to documents bucket" ON storage.objects;
CREATE POLICY "Managers upload to documents bucket" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'documents'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'finance', 'operations')
    )
  );

DROP POLICY IF EXISTS "Uploader or admin modifies documents bucket" ON storage.objects;
CREATE POLICY "Uploader or admin modifies documents bucket" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'documents'
    AND (
      owner = auth.uid()
      OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    )
  );

DROP POLICY IF EXISTS "Uploader or admin deletes from documents bucket" ON storage.objects;
CREATE POLICY "Uploader or admin deletes from documents bucket" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'documents'
    AND (
      owner = auth.uid()
      OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    )
  );
