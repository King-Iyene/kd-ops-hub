-- =============================================================================
-- KDOps — Referrals, Contacts, Public contractor form
-- =============================================================================

-- Referral code on every profile — generated once, never changes.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS referral_code text UNIQUE;

-- Backfill existing users with a referral code.
UPDATE public.profiles
SET referral_code = substring(md5(id::text || created_at::text) from 1 for 8)
WHERE referral_code IS NULL;

-- referrals table — tracks who referred whom.
CREATE TABLE IF NOT EXISTS public.referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  referred_email text NOT NULL,
  referred_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'signed_up', 'active', 'expired')),
  is_affiliate boolean NOT NULL DEFAULT false,
  commission_pct numeric NOT NULL DEFAULT 0,
  commission_earned_ngn numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  converted_at timestamptz
);

CREATE INDEX IF NOT EXISTS referrals_referrer_idx ON public.referrals (referrer_id);
CREATE INDEX IF NOT EXISTS referrals_email_idx ON public.referrals (referred_email);

ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "referrals_read" ON public.referrals;
CREATE POLICY "referrals_read" ON public.referrals
  FOR SELECT TO authenticated USING (
    referrer_id = auth.uid()
    OR public.get_my_role() IN ('super_admin', 'admin')
  );

DROP POLICY IF EXISTS "referrals_write" ON public.referrals;
CREATE POLICY "referrals_write" ON public.referrals
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- contacts table — lightweight CRM.
CREATE TABLE IF NOT EXISTS public.contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  email text,
  phone text,
  contact_type text NOT NULL DEFAULT 'lead'
    CHECK (contact_type IN ('lead', 'student', 'contact', 'partner')),
  source text,
  tags text[] DEFAULT ARRAY[]::text[],
  notes text,
  status text NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'contacted', 'qualified', 'converted', 'lost')),
  converted_to_contractor_id uuid REFERENCES public.contractors(id) ON DELETE SET NULL,
  converted_to_employee_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS contacts_email_idx ON public.contacts (email);
CREATE INDEX IF NOT EXISTS contacts_type_idx ON public.contacts (contact_type);

ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "contacts_read" ON public.contacts;
CREATE POLICY "contacts_read" ON public.contacts
  FOR SELECT TO authenticated USING (
    public.get_my_role() IN ('super_admin', 'admin', 'finance', 'operations')
  );

DROP POLICY IF EXISTS "contacts_write" ON public.contacts;
CREATE POLICY "contacts_write" ON public.contacts
  FOR ALL TO authenticated USING (
    public.get_my_role() IN ('super_admin', 'admin', 'finance', 'operations')
  );

-- Public contractor applications (from /join page). Stored separately so they
-- don't pollute the contractors table until admin approves.
CREATE TABLE IF NOT EXISTS public.contractor_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  email text NOT NULL,
  phone text,
  linkedin_full_name text,
  linkedin_email text,
  linkedin_profile_url text,
  bank_name text NOT NULL,
  account_name text,
  account_number text NOT NULL,
  default_amount_ngn numeric DEFAULT 0,
  referral_code text,
  status text NOT NULL DEFAULT 'pending_review'
    CHECK (status IN ('pending_review', 'approved', 'rejected')),
  rejection_reason text,
  approved_by uuid REFERENCES public.profiles(id),
  contractor_id uuid REFERENCES public.contractors(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS contractor_applications_status_idx
  ON public.contractor_applications (status);

ALTER TABLE public.contractor_applications ENABLE ROW LEVEL SECURITY;

-- Public access for INSERT (the /join page is unauthenticated).
DROP POLICY IF EXISTS "contractor_applications_public_insert" ON public.contractor_applications;
CREATE POLICY "contractor_applications_public_insert" ON public.contractor_applications
  FOR INSERT TO anon, authenticated WITH CHECK (true);

-- Managers can read + update applications.
DROP POLICY IF EXISTS "contractor_applications_read" ON public.contractor_applications;
CREATE POLICY "contractor_applications_read" ON public.contractor_applications
  FOR SELECT TO authenticated USING (
    public.get_my_role() IN ('super_admin', 'admin', 'finance', 'operations')
  );

DROP POLICY IF EXISTS "contractor_applications_update" ON public.contractor_applications;
CREATE POLICY "contractor_applications_update" ON public.contractor_applications
  FOR UPDATE TO authenticated USING (
    public.get_my_role() IN ('super_admin', 'admin', 'finance')
  );
