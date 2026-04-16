-- =============================================================================
-- KDOps — Phase 4: world-class v1
--
--   • Fix infinite-recursion risk on profile-based RLS via a SECURITY DEFINER
--     helper function.
--   • Guarantee a `receipts` Storage bucket exists alongside `documents`.
--   • Add Tasks, Compliance Filings, Company Announcements, Payroll Runs,
--     Approval Comments, Pending Invites, Company Settings.
--   • Block deactivated users on login by refusing profile reads for them.
--
-- All changes are idempotent — safe to run with `supabase db push`.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Helper: current_user_role() — SECURITY DEFINER bypasses RLS so cross-table
-- policies can check a caller's role without re-querying profiles under RLS
-- (which caused the recursion).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$;

-- Also expose an active-flag check so deactivated accounts can be short-circuited
-- from cross-table policies without RLS recursion.
CREATE OR REPLACE FUNCTION public.current_user_is_active()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(status, 'active') = 'active'
  FROM public.profiles
  WHERE id = auth.uid()
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_is_active() TO authenticated;

-- -----------------------------------------------------------------------------
-- Fix 1 — profiles RLS recursion
-- -----------------------------------------------------------------------------
-- Drop any past policies (both the names the user listed and the ones created
-- in earlier migrations).
DROP POLICY IF EXISTS "profiles_policy" ON public.profiles;
DROP POLICY IF EXISTS "profiles_auth" ON public.profiles;
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins and managers can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can manage profiles" ON public.profiles;
DROP POLICY IF EXISTS "Super admins can manage profiles" ON public.profiles;
DROP POLICY IF EXISTS "Allow insert on signup" ON public.profiles;
DROP POLICY IF EXISTS "profiles_read_own" ON public.profiles;

-- Own row: read / insert / update.
CREATE POLICY "profiles_read_own" ON public.profiles
  FOR SELECT TO authenticated USING (auth.uid() = id);

CREATE POLICY "profiles_insert_self" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_update_self" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id);

-- Managers (admin / super_admin / finance / operations) can read everyone.
-- This uses the SECURITY DEFINER helper so there is NO recursive RLS evaluation.
CREATE POLICY "profiles_read_managers" ON public.profiles
  FOR SELECT TO authenticated USING (
    public.current_user_role() IN ('super_admin', 'admin', 'finance', 'operations')
  );

-- Admin / Super Admin can update any profile.
CREATE POLICY "profiles_update_admins" ON public.profiles
  FOR UPDATE TO authenticated USING (
    public.current_user_role() IN ('super_admin', 'admin')
  );

-- -----------------------------------------------------------------------------
-- Storage buckets: documents + receipts
-- -----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('receipts', 'receipts', false)
ON CONFLICT (id) DO NOTHING;

-- Authenticated users can read / upload / modify in both buckets. Fine-grained
-- per-file authorization lives at the application layer (receipts belong to a
-- specific expense row; documents carry a visible_to_roles array).
DROP POLICY IF EXISTS "Authenticated can read documents bucket" ON storage.objects;
DROP POLICY IF EXISTS "Managers upload to documents bucket" ON storage.objects;
DROP POLICY IF EXISTS "Uploader or admin modifies documents bucket" ON storage.objects;
DROP POLICY IF EXISTS "Uploader or admin deletes from documents bucket" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated read documents storage" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated write documents storage" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated update documents storage" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated delete documents storage" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated read receipts storage" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated write receipts storage" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated update receipts storage" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated delete receipts storage" ON storage.objects;

CREATE POLICY "Authenticated read documents storage" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id IN ('documents', 'receipts'));

CREATE POLICY "Authenticated write documents storage" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id IN ('documents', 'receipts'));

CREATE POLICY "Authenticated update documents storage" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id IN ('documents', 'receipts'));

CREATE POLICY "Authenticated delete documents storage" ON storage.objects
  FOR DELETE TO authenticated USING (
    bucket_id IN ('documents', 'receipts')
    AND (
      owner = auth.uid()
      OR public.current_user_role() IN ('super_admin', 'admin')
    )
  );

-- -----------------------------------------------------------------------------
-- company_settings (singleton — id hardcoded to a well-known UUID)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.company_settings (
  id uuid PRIMARY KEY DEFAULT '00000000-0000-0000-0000-000000000001',
  company_name text NOT NULL DEFAULT 'KD Squares Ltd',
  rc_number text,
  tin text,
  address text,
  logo_url text,
  fiscal_year_start_month integer NOT NULL DEFAULT 1
    CHECK (fiscal_year_start_month BETWEEN 1 AND 12),
  currency_code text NOT NULL DEFAULT 'NGN',
  usd_rate numeric,
  -- JSON map of category → max ₦ allowed before block.
  expense_limits jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Above this ₦ amount, a payment batch requires two approvers.
  dual_approval_threshold_ngn numeric NOT NULL DEFAULT 1000000,
  paystack_secret_configured boolean NOT NULL DEFAULT false,
  airtable_api_key_configured boolean NOT NULL DEFAULT false,
  audit_log_retention_days integer NOT NULL DEFAULT 365,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.company_settings (id)
VALUES ('00000000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_settings_read" ON public.company_settings;
CREATE POLICY "company_settings_read" ON public.company_settings
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "company_settings_write" ON public.company_settings;
CREATE POLICY "company_settings_write" ON public.company_settings
  FOR UPDATE TO authenticated USING (
    public.current_user_role() IN ('super_admin', 'admin')
  );

-- -----------------------------------------------------------------------------
-- announcements
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text,
  tone text NOT NULL DEFAULT 'info'
    CHECK (tone IN ('info', 'success', 'warning', 'danger', 'gold')),
  posted_by uuid REFERENCES public.profiles(id),
  -- Announcement expires at this date (nullable = runs until dismissed).
  expires_at timestamptz,
  -- Users who dismissed the banner on their own device (tracked client-side).
  dismissed_by_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "announcements_read_all" ON public.announcements;
CREATE POLICY "announcements_read_all" ON public.announcements
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "announcements_write_admins" ON public.announcements;
CREATE POLICY "announcements_write_admins" ON public.announcements
  FOR ALL TO authenticated USING (
    public.current_user_role() IN ('super_admin', 'admin')
  );

-- -----------------------------------------------------------------------------
-- tasks + task_comments
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  assignee_id uuid REFERENCES public.profiles(id),
  due_date date,
  priority text NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('critical', 'high', 'normal', 'low')),
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'in_progress', 'blocked', 'complete')),
  created_by uuid REFERENCES public.profiles(id),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tasks_assignee_idx ON public.tasks (assignee_id);
CREATE INDEX IF NOT EXISTS tasks_status_idx ON public.tasks (status);
CREATE INDEX IF NOT EXISTS tasks_due_date_idx ON public.tasks (due_date);

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tasks_read" ON public.tasks;
CREATE POLICY "tasks_read" ON public.tasks
  FOR SELECT TO authenticated USING (
    assignee_id = auth.uid()
    OR created_by = auth.uid()
    OR public.current_user_role() IN ('super_admin', 'admin', 'finance', 'operations')
  );

DROP POLICY IF EXISTS "tasks_write" ON public.tasks;
CREATE POLICY "tasks_write" ON public.tasks
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.task_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES public.profiles(id),
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS task_comments_task_idx ON public.task_comments (task_id);

ALTER TABLE public.task_comments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "task_comments_all" ON public.task_comments;
CREATE POLICY "task_comments_all" ON public.task_comments
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- -----------------------------------------------------------------------------
-- compliance_filings — PAYE, Pension, VAT, WHT, TCC, CAC, ITF, NSITF
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.compliance_filings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL
    CHECK (kind IN ('paye', 'pension', 'vat', 'wht', 'tcc', 'cac', 'itf', 'nsitf')),
  period text NOT NULL,
  due_date date NOT NULL,
  filed_at timestamptz,
  filed_by uuid REFERENCES public.profiles(id),
  amount_ngn numeric,
  reference text,
  notes text,
  status text NOT NULL DEFAULT 'upcoming'
    CHECK (status IN ('upcoming', 'due', 'overdue', 'filed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, period)
);

CREATE INDEX IF NOT EXISTS compliance_filings_due_idx
  ON public.compliance_filings (due_date);

ALTER TABLE public.compliance_filings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "compliance_read" ON public.compliance_filings;
CREATE POLICY "compliance_read" ON public.compliance_filings
  FOR SELECT TO authenticated USING (
    public.current_user_role() IN ('super_admin', 'admin', 'finance', 'operations')
  );

DROP POLICY IF EXISTS "compliance_write" ON public.compliance_filings;
CREATE POLICY "compliance_write" ON public.compliance_filings
  FOR ALL TO authenticated USING (
    public.current_user_role() IN ('super_admin', 'admin', 'finance')
  );

-- -----------------------------------------------------------------------------
-- approval_comments — polymorphic comments attached to any approvable entity
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.approval_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL
    CHECK (entity_type IN ('batch', 'expense', 'fuel', 'budget', 'leave')),
  entity_id uuid NOT NULL,
  author_id uuid REFERENCES public.profiles(id),
  author_name text,
  action text NOT NULL
    CHECK (action IN ('comment', 'approve', 'reject', 'delegate', 'escalate')),
  body text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS approval_comments_entity_idx
  ON public.approval_comments (entity_type, entity_id);

ALTER TABLE public.approval_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "approval_comments_all" ON public.approval_comments;
CREATE POLICY "approval_comments_all" ON public.approval_comments
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- -----------------------------------------------------------------------------
-- payroll_runs + payroll_run_items
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payroll_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Year-month string, e.g. "2026-04".
  period text NOT NULL UNIQUE,
  total_contractor_ngn numeric NOT NULL DEFAULT 0,
  total_employee_ngn numeric NOT NULL DEFAULT 0,
  total_expenses_ngn numeric NOT NULL DEFAULT 0,
  paye_ngn numeric NOT NULL DEFAULT 0,
  pension_ngn numeric NOT NULL DEFAULT 0,
  nhf_ngn numeric NOT NULL DEFAULT 0,
  total_burn_ngn numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'pending_approval', 'approved', 'paid')),
  created_by uuid REFERENCES public.profiles(id),
  approved_by uuid REFERENCES public.profiles(id),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.payroll_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payroll_read" ON public.payroll_runs;
CREATE POLICY "payroll_read" ON public.payroll_runs
  FOR SELECT TO authenticated USING (
    public.current_user_role() IN ('super_admin', 'admin', 'finance')
  );

DROP POLICY IF EXISTS "payroll_write" ON public.payroll_runs;
CREATE POLICY "payroll_write" ON public.payroll_runs
  FOR ALL TO authenticated USING (
    public.current_user_role() IN ('super_admin', 'admin', 'finance')
  );

CREATE TABLE IF NOT EXISTS public.payroll_run_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_run_id uuid NOT NULL REFERENCES public.payroll_runs(id) ON DELETE CASCADE,
  employee_id uuid REFERENCES public.profiles(id),
  employee_name text NOT NULL,
  gross_ngn numeric NOT NULL DEFAULT 0,
  paye_ngn numeric NOT NULL DEFAULT 0,
  pension_ngn numeric NOT NULL DEFAULT 0,
  nhf_ngn numeric NOT NULL DEFAULT 0,
  net_ngn numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payroll_run_items_run_idx
  ON public.payroll_run_items (payroll_run_id);

ALTER TABLE public.payroll_run_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payroll_items_all" ON public.payroll_run_items;
CREATE POLICY "payroll_items_all" ON public.payroll_run_items
  FOR ALL TO authenticated USING (
    public.current_user_role() IN ('super_admin', 'admin', 'finance')
  );

-- -----------------------------------------------------------------------------
-- pending_invites — records the admin-initiated invite intent. An Edge
-- Function or signed-in admin can actually send the magic-link via Supabase
-- Auth — this table just stores the intent + pre-assigned role so KDOps
-- applies it when the user signs up.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pending_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  full_name text,
  role text NOT NULL
    CHECK (role IN ('admin', 'finance', 'operations', 'field_staff')),
  phone text,
  invited_by uuid REFERENCES public.profiles(id),
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pending_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invites_read_managers" ON public.pending_invites;
CREATE POLICY "invites_read_managers" ON public.pending_invites
  FOR SELECT TO authenticated USING (
    public.current_user_role() IN ('super_admin', 'admin', 'finance', 'operations')
  );

DROP POLICY IF EXISTS "invites_write_admins" ON public.pending_invites;
CREATE POLICY "invites_write_admins" ON public.pending_invites
  FOR ALL TO authenticated USING (
    public.current_user_role() IN ('super_admin', 'admin')
  );

-- When the invited user eventually signs up, auto-apply their pre-assigned
-- role. Uses SECURITY DEFINER so it can write to profiles without RLS.
CREATE OR REPLACE FUNCTION public.handle_new_user_invite()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  invite record;
BEGIN
  SELECT * INTO invite FROM public.pending_invites WHERE email = NEW.email LIMIT 1;
  IF FOUND THEN
    UPDATE public.profiles
    SET role = invite.role,
        phone = COALESCE(invite.phone, phone),
        full_name = COALESCE(NULLIF(NEW.raw_user_meta_data->>'full_name', ''), invite.full_name, full_name)
    WHERE id = NEW.id;
    UPDATE public.pending_invites SET accepted_at = now() WHERE id = invite.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_invite_accepted ON auth.users;
CREATE TRIGGER on_invite_accepted
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_invite();

-- -----------------------------------------------------------------------------
-- Extend notifications with a priority + module column for the notification
-- intelligence UI.
-- -----------------------------------------------------------------------------
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS module text;
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS priority text DEFAULT 'normal';

-- -----------------------------------------------------------------------------
-- Contractor extensions: tags, onboarding checklist fields
-- -----------------------------------------------------------------------------
ALTER TABLE public.contractors
  ADD COLUMN IF NOT EXISTS tags text[] DEFAULT ARRAY[]::text[];
ALTER TABLE public.contractors
  ADD COLUMN IF NOT EXISTS onboarding_complete boolean DEFAULT false;
ALTER TABLE public.contractors
  ADD COLUMN IF NOT EXISTS agreement_signed boolean DEFAULT false;
ALTER TABLE public.contractors
  ADD COLUMN IF NOT EXISTS onboarded_at timestamptz;

-- -----------------------------------------------------------------------------
-- Vehicle maintenance records
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.vehicle_maintenance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  service_date date NOT NULL,
  service_type text NOT NULL,
  odometer numeric,
  cost_ngn numeric DEFAULT 0,
  next_service_due date,
  notes text,
  logged_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vehicle_maintenance_vehicle_idx
  ON public.vehicle_maintenance (vehicle_id);

ALTER TABLE public.vehicle_maintenance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vehicle_maintenance_all" ON public.vehicle_maintenance;
CREATE POLICY "vehicle_maintenance_all" ON public.vehicle_maintenance
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
