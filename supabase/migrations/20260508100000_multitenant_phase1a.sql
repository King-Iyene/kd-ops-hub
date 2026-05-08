-- Multi-tenancy Phase 1A — foundations.
--
-- This migration is the structural prep for KDOps to become a
-- multi-tenant SaaS. It DOES NOT yet add tenant_id to the 50+
-- business tables (employees, payment_batches, expenses, leave,
-- payroll_runs, etc.) — that's Phase 1B in the next focused
-- migration, where every table gets the column + a tenant-scoped
-- RLS policy.
--
-- What this migration ships:
--
--   1. `tenants` table — one row per company on the platform,
--      seeded with the existing implicit tenant under the
--      well-known UUID '00000000-0000-0000-0000-000000000001' so
--      every existing piece of data continues to belong to the
--      "KD Squares" tenant without a backfill across business
--      tables.
--
--   2. `profiles.tenant_id` and `company_settings.tenant_id` —
--      the two tables that genuinely vary per tenant from day
--      one. Existing rows backfilled to the seed tenant.
--
--   3. `current_tenant_id()` — security-definer helper that reads
--      the tenant from the calling user's profile. Future RLS
--      policies (Phase 1B) will compare row.tenant_id to this.
--
--   4. `handle_new_user_signup()` trigger — fires AFTER the
--      existing handle_new_user_invite trigger on auth.users
--      INSERT. When a brand-new auth user has neither a
--      pending_invites row NOR a profile yet, AND the signup
--      metadata carries a `signup_company_name`, this creates:
--        - a new tenants row
--        - a fresh company_settings row for that tenant
--        - the user's profile with role='super_admin' and
--          status='active'
--
--      Existing flows are untouched: invitees still get the
--      invite trigger; KD Squares' staff continue to land on the
--      seed tenant unchanged.
--
-- IMPORTANT — Phase 1B prerequisite:
--   Self-serve signup is wired here but the business tables
--   (payment_batches, expenses, employees, etc.) are NOT yet
--   tenant-scoped, so a brand-new tenant signing in could
--   theoretically see existing KD Squares records depending on
--   role-RLS. To be safe, the frontend gates self-serve signup
--   behind the `company_settings.allow_self_signup` boolean (off
--   by default) until Phase 1B tightens the RLS.

-- ── 1. tenants table ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.tenants (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  slug        text UNIQUE,
  status      text NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'suspended', 'cancelled')),
  plan        text NOT NULL DEFAULT 'starter'
                CHECK (plan IN ('starter', 'growth', 'business', 'enterprise')),
  -- Visual chrome — overrides for the BrandLogo + display name.
  logo_url    text,
  primary_color text,
  -- Optional custom domain for white-labelled deployments.
  custom_domain text UNIQUE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tenants_status_idx ON public.tenants (status);

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

-- Seed: the existing implicit tenant gets the well-known UUID so
-- every code path that already references that UUID continues to
-- work without a rewrite.
INSERT INTO public.tenants (id, name, slug, plan, status)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'KD Squares Ltd',
  'kd-squares',
  'enterprise',
  'active'
)
ON CONFLICT (id) DO NOTHING;

-- Read: a user can read their OWN tenant row (so the platform can
-- display the tenant name in the sidebar / header). Other tenants
-- are invisible.
DROP POLICY IF EXISTS "tenants_self_read" ON public.tenants;
CREATE POLICY "tenants_self_read" ON public.tenants
  FOR SELECT TO authenticated
  USING (
    id = (SELECT tenant_id FROM public.profiles WHERE profiles.id = auth.uid())
  );

-- Write: only the super_admin of that tenant can edit it (logo,
-- primary colour, plan changes happen via billing later).
DROP POLICY IF EXISTS "tenants_super_admin_write" ON public.tenants;
CREATE POLICY "tenants_super_admin_write" ON public.tenants
  FOR UPDATE TO authenticated
  USING (
    id = (SELECT tenant_id FROM public.profiles
          WHERE profiles.id = auth.uid() AND profiles.role = 'super_admin')
  );

-- ── 2. profiles.tenant_id + company_settings.tenant_id ────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS tenant_id uuid
  REFERENCES public.tenants(id) ON DELETE RESTRICT
  DEFAULT '00000000-0000-0000-0000-000000000001';

CREATE INDEX IF NOT EXISTS profiles_tenant_id_idx
  ON public.profiles (tenant_id);

ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS tenant_id uuid
  REFERENCES public.tenants(id) ON DELETE CASCADE
  DEFAULT '00000000-0000-0000-0000-000000000001';

CREATE UNIQUE INDEX IF NOT EXISTS company_settings_tenant_id_idx
  ON public.company_settings (tenant_id);

-- A self-signup gate: the operator of any tenant can flip this ON
-- in their settings UI when they're ready for self-serve signups.
-- Defaults OFF until Phase 1B ring-fences business tables.
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS allow_self_signup boolean NOT NULL DEFAULT false;

-- Backfill: every existing profile and the existing settings row
-- now belong to the seed tenant. The DEFAULT does this for new
-- rows; the explicit UPDATE catches anything legacy that somehow
-- has tenant_id NULL.
UPDATE public.profiles
SET tenant_id = '00000000-0000-0000-0000-000000000001'
WHERE tenant_id IS NULL;

UPDATE public.company_settings
SET tenant_id = '00000000-0000-0000-0000-000000000001'
WHERE tenant_id IS NULL;

-- ── 3. current_tenant_id() helper ─────────────────────────────────
--
-- Future RLS policies (Phase 1B) compare row.tenant_id to this.
-- SECURITY DEFINER + STABLE so it can be called from any policy
-- without recursion concerns.

CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
$$;

GRANT EXECUTE ON FUNCTION public.current_tenant_id() TO authenticated;

-- ── 4. handle_new_user_signup trigger ─────────────────────────────
--
-- When a fresh auth user signs up via the public /signup form, the
-- request carries `signup_company_name` in `raw_user_meta_data`.
-- The existing handle_new_user_invite trigger runs first and
-- handles the invitee path — it short-circuits when the email
-- isn't in `pending_invites`. This new trigger then runs and
-- creates the tenant + profile pair when:
--
--   • There is no existing profile for this auth user yet (the
--     invite trigger didn't claim it).
--   • The metadata includes a non-empty `signup_company_name`.
--
-- The two conditions guarantee that legacy signup paths (admin
-- creates an auth user manually, password reset flows, etc.)
-- don't accidentally mint tenants.

CREATE OR REPLACE FUNCTION public.handle_new_user_signup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_name text;
  v_full_name    text;
  v_existing     uuid;
  v_new_tenant   uuid;
BEGIN
  -- Skip if invite trigger already wrote a profile.
  SELECT id INTO v_existing FROM public.profiles WHERE id = NEW.id;
  IF FOUND THEN RETURN NEW; END IF;

  v_company_name := COALESCE(NULLIF(NEW.raw_user_meta_data->>'signup_company_name', ''), '');
  IF v_company_name = '' THEN RETURN NEW; END IF;

  v_full_name := COALESCE(
    NULLIF(NEW.raw_user_meta_data->>'full_name', ''),
    split_part(NEW.email, '@', 1)
  );

  -- Create the tenant row.
  INSERT INTO public.tenants (name, slug, plan, status)
  VALUES (
    v_company_name,
    lower(regexp_replace(v_company_name, '[^a-zA-Z0-9]+', '-', 'g')) || '-' ||
      substr(NEW.id::text, 1, 8),
    'starter',
    'active'
  )
  RETURNING id INTO v_new_tenant;

  -- Create the user's profile as the tenant's first super_admin.
  INSERT INTO public.profiles (id, email, full_name, role, status, tenant_id)
  VALUES (NEW.id, NEW.email, v_full_name, 'super_admin', 'active', v_new_tenant);

  -- Seed a company_settings row for the new tenant. The row's
  -- primary key is its own UUID; the tenant is referenced via
  -- company_settings.tenant_id (UNIQUE) so the existing
  -- ".eq('id', '0…01')" lookups in the codebase continue to work
  -- against the SEED tenant only — new tenants will use a future
  -- ".eq('tenant_id', current_tenant_id())" pattern that ships in
  -- the Phase 1B refactor.
  INSERT INTO public.company_settings (id, tenant_id, company_name)
  VALUES (gen_random_uuid(), v_new_tenant, v_company_name);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_signup ON auth.users;
CREATE TRIGGER on_auth_user_created_signup
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user_signup();

-- The order matters: the existing on_auth_user_created_invite
-- trigger fires first; this signup trigger only acts when no
-- profile was created by the invite path. PostgreSQL fires
-- multiple AFTER triggers alphabetically by name, and
-- "on_auth_user_created_signup" sorts after the invite trigger so
-- the order is correct without needing extra config.

NOTIFY pgrst, 'reload schema';
