-- =============================================================================
-- KDOps Phase 11 — Comprehensive schema fixes, name split, RLS, storage
-- Run this ONCE against production Supabase via SQL Editor.
-- Safe to re-run: all ALTER TABLE statements use IF NOT EXISTS.
-- =============================================================================

-- ======================== NAME SPLIT ========================
-- Splits existing full_name into first_name + last_name across all person tables.
-- Required by: Employee profiles, Contractor profiles, Contact cards, /join form.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS first_name text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_name text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS permissions jsonb DEFAULT '{}'; -- Per-user feature access flags (GHL-style toggles)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS tags text[] DEFAULT ARRAY[]::text[]; -- Freeform labels for filtering/segmentation

UPDATE public.profiles
SET first_name = split_part(full_name, ' ', 1),
    last_name = CASE WHEN position(' ' in full_name) > 0
      THEN substring(full_name from position(' ' in full_name) + 1) ELSE '' END
WHERE first_name IS NULL AND full_name IS NOT NULL; -- Only backfills rows not yet split

ALTER TABLE public.contractors ADD COLUMN IF NOT EXISTS first_name text;
ALTER TABLE public.contractors ADD COLUMN IF NOT EXISTS last_name text;
ALTER TABLE public.contractors ADD COLUMN IF NOT EXISTS tags text[] DEFAULT ARRAY[]::text[];

UPDATE public.contractors
SET first_name = split_part(full_name, ' ', 1),
    last_name = CASE WHEN position(' ' in full_name) > 0
      THEN substring(full_name from position(' ' in full_name) + 1) ELSE '' END
WHERE first_name IS NULL AND full_name IS NOT NULL;

ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS first_name text;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS last_name text;

UPDATE public.contacts
SET first_name = split_part(full_name, ' ', 1),
    last_name = CASE WHEN position(' ' in full_name) > 0
      THEN substring(full_name from position(' ' in full_name) + 1) ELSE '' END
WHERE first_name IS NULL AND full_name IS NOT NULL;

-- Contractor applications (/join form submissions) — no backfill needed, new rows only
ALTER TABLE public.contractor_applications ADD COLUMN IF NOT EXISTS first_name text;
ALTER TABLE public.contractor_applications ADD COLUMN IF NOT EXISTS last_name text;


-- ======================== SUBSCRIPTIONS FIX ========================
-- Adds missing columns that caused "column does not exist" errors on subscription creation.
-- next_renewal_date = when the subscription renews (user-facing)
-- next_billing_date = when the payment will be charged (may differ from renewal)
-- vendor = the supplier name (e.g. Zoho, Slack, AWS)

ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS next_renewal_date date;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS next_billing_date date;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS vendor text;


-- ======================== BUDGETS FIX ========================
-- Adds missing columns that caused "departmental_id column not found" errors.
-- department_id = FK to departments table (required for budget categorisation)
-- period_start / period_end = the date range this budget covers

ALTER TABLE public.budgets ADD COLUMN IF NOT EXISTS department_id uuid REFERENCES public.departments(id);
ALTER TABLE public.budgets ADD COLUMN IF NOT EXISTS period_start date;
ALTER TABLE public.budgets ADD COLUMN IF NOT EXISTS period_end date;


-- ======================== DOCUMENTS FIX ========================
-- Adds missing columns that caused document upload failures.
-- description = optional human-readable note about the document
-- tags = freeform labels for document filtering

ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS tags text[] DEFAULT ARRAY[]::text[];


-- ======================== STORAGE BUCKETS ========================
-- Creates Supabase Storage buckets for file uploads.
-- Both are private (public = false) — files require authenticated access.
-- ON CONFLICT DO NOTHING = safe to re-run if buckets already exist.

INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('receipts', 'receipts', false)
ON CONFLICT (id) DO NOTHING;


-- ======================== EXPENSES RLS FIX ========================
-- Previous RLS policies were too restrictive — employees could not see their own submissions.
-- New policy: employees see their own expenses; admin/finance/super_admin see all.
-- DROP IF EXISTS on all known previous policy names to ensure clean slate before recreating.

DROP POLICY IF EXISTS "expenses_policy" ON public.expenses;
DROP POLICY IF EXISTS "Authenticated users can view own expenses" ON public.expenses;
DROP POLICY IF EXISTS "Authenticated users can create expenses" ON public.expenses;
DROP POLICY IF EXISTS "Admins can manage expenses" ON public.expenses;
DROP POLICY IF EXISTS "expenses_select" ON public.expenses;
DROP POLICY IF EXISTS "expenses_insert" ON public.expenses;
DROP POLICY IF EXISTS "expenses_update" ON public.expenses;

-- SELECT: own records OR admin/finance roles
CREATE POLICY "expenses_select" ON public.expenses FOR SELECT TO authenticated
USING (
  submitted_by = auth.uid()
  OR public.current_user_role() IN ('super_admin', 'admin', 'finance')
);
-- INSERT: any authenticated user can submit an expense for themselves
CREATE POLICY "expenses_insert" ON public.expenses FOR INSERT TO authenticated
WITH CHECK (submitted_by = auth.uid());
-- UPDATE: only admin/finance can approve, reject, or edit
CREATE POLICY "expenses_update" ON public.expenses FOR UPDATE TO authenticated
USING (public.current_user_role() IN ('super_admin', 'admin', 'finance'));


-- ======================== LEAVE RLS FIX ========================
-- Previous policy blocked admins from seeing other users' leave requests.
-- New policy: employees see own requests; admin/finance/operations see all.

DROP POLICY IF EXISTS "leave_policy" ON public.leave_requests;
DROP POLICY IF EXISTS "Users can view own leave" ON public.leave_requests;
DROP POLICY IF EXISTS "Users can create own leave" ON public.leave_requests;
DROP POLICY IF EXISTS "Admins can manage leave" ON public.leave_requests;
DROP POLICY IF EXISTS "leave_select" ON public.leave_requests;
DROP POLICY IF EXISTS "leave_insert" ON public.leave_requests;
DROP POLICY IF EXISTS "leave_update" ON public.leave_requests;

-- SELECT: own records OR management roles
CREATE POLICY "leave_select" ON public.leave_requests FOR SELECT TO authenticated
USING (
  employee_id = auth.uid()
  OR public.current_user_role() IN ('super_admin', 'admin', 'finance', 'operations')
);
-- INSERT: employee submits their own leave only
CREATE POLICY "leave_insert" ON public.leave_requests FOR INSERT TO authenticated
WITH CHECK (employee_id = auth.uid());
-- UPDATE: only management roles can approve or reject
CREATE POLICY "leave_update" ON public.leave_requests FOR UPDATE TO authenticated
USING (public.current_user_role() IN ('super_admin', 'admin', 'finance', 'operations'));


-- ======================== CONTACT ACTIVITY LOG ========================
-- New table to track all actions taken on a contact record (calls, emails, status changes).
-- CASCADE delete: if the contact is deleted, all its activity logs are deleted too.

CREATE TABLE IF NOT EXISTS public.contact_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  action text NOT NULL,         -- e.g. 'email_sent', 'status_changed', 'note_added'
  detail text,                  -- optional free-text detail about the action
  performed_by uuid REFERENCES public.profiles(id), -- who did it (null = system)
  performed_by_name text,       -- denormalised name for display without a join
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.contact_activities ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read contact activity logs
DROP POLICY IF EXISTS "contact_activities_select" ON public.contact_activities;
CREATE POLICY "contact_activities_select" ON public.contact_activities
  FOR SELECT TO authenticated USING (true);

-- Only admin/finance/operations roles can write activity log entries
DROP POLICY IF EXISTS "contact_activities_insert" ON public.contact_activities;
CREATE POLICY "contact_activities_insert" ON public.contact_activities
  FOR ALL TO authenticated
  USING (public.current_user_role() IN ('super_admin', 'admin', 'finance', 'operations'));


-- ======================== TRANSACTIONS VIEW FIX ========================
-- IMPORTANT: Must DROP before recreating.
-- CREATE OR REPLACE VIEW fails if column structure has changed from the existing view.
-- This view unions three sources into one ledger: payment batches, batch items, expenses.

DROP VIEW IF EXISTS public.transactions_view;

CREATE VIEW public.transactions_view AS
-- Payment batches (bulk contractor disbursements and quick pays)
SELECT pb.id, pb.created_at,
  CASE WHEN pb.is_quick_pay THEN 'quick_pay' ELSE 'payment_batch' END AS txn_type,
  COALESCE(pb.payment_description, pb.name) AS description,
  COALESCE(pb.payment_category, 'contractor_payment') AS category,
  pb.total_amount AS amount_ngn,
  pb.status,
  pb.id::text AS reference,
  pb.created_by
FROM public.payment_batches pb

UNION ALL

-- Individual transfer line items within a batch (per-beneficiary status)
SELECT bi.id, bi.created_at,
  'transfer' AS txn_type,
  COALESCE(bi.full_name, 'Transfer') AS description,
  'contractor_payment' AS category,
  bi.amount_ngn,
  CASE WHEN bi.status = 'succeeded' THEN 'processed'
       WHEN bi.status = 'failed' THEN 'failed'
       WHEN bi.status = 'retry' THEN 'processing'
       ELSE 'pending' END AS status,
  COALESCE(bi.paystack_reference, bi.id::text) AS reference,
  NULL::uuid AS created_by
FROM public.batch_items bi

UNION ALL

-- Expense claims (internal staff reimbursements)
SELECT e.id, e.created_at,
  'expense' AS txn_type,
  COALESCE(e.description, e.category) AS description,
  e.category,
  e.amount_ngn,
  e.status,
  e.id::text AS reference,
  e.submitted_by AS created_by
FROM public.expenses e;

-- Grant read access to all authenticated users
GRANT SELECT ON public.transactions_view TO authenticated;
