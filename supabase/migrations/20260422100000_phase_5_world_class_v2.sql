-- =============================================================================
-- KDOps — Phase 5: world-class v2
--
--   • Alias `get_my_role()` → `current_user_role()` (spec-named helper).
--   • Virtual card tracker, Knowledge base, Goals, Notification preferences.
--   • Audit log immutability (refuse update / delete at the DB layer).
--   • pending_invites: always an "invited" profile row so the employee is
--     visible in the roster before the user accepts the invite.
--
-- Idempotent — safe under `supabase db push`.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- get_my_role() — thin alias requested by the spec. Delegates to the existing
-- current_user_role() SECURITY DEFINER helper from migration 20260420100000.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT public.current_user_role();
$$;

GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated;

-- -----------------------------------------------------------------------------
-- virtual_cards — per-vendor spend control tracker
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.virtual_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_name text NOT NULL,
  last_four text,
  vendor text,
  subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  monthly_limit_ngn numeric NOT NULL DEFAULT 0,
  current_spend_ngn numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'deactivated')),
  notes text,
  assigned_to uuid REFERENCES public.profiles(id),
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS virtual_cards_status_idx ON public.virtual_cards (status);

ALTER TABLE public.virtual_cards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "virtual_cards_read" ON public.virtual_cards;
CREATE POLICY "virtual_cards_read" ON public.virtual_cards
  FOR SELECT TO authenticated USING (
    public.get_my_role() IN ('super_admin', 'admin', 'finance')
  );

DROP POLICY IF EXISTS "virtual_cards_write" ON public.virtual_cards;
CREATE POLICY "virtual_cards_write" ON public.virtual_cards
  FOR ALL TO authenticated USING (
    public.get_my_role() IN ('super_admin', 'admin', 'finance')
  );

-- -----------------------------------------------------------------------------
-- knowledge_articles — internal SOPs / wiki
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.knowledge_articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  slug text UNIQUE,
  category text NOT NULL DEFAULT 'general'
    CHECK (category IN ('finance', 'hr', 'operations', 'compliance', 'general', 'engineering')),
  body text NOT NULL DEFAULT '',
  visible_to_roles text[] NOT NULL DEFAULT
    ARRAY['super_admin', 'admin', 'finance', 'operations', 'field_staff', 'driver']::text[],
  version integer NOT NULL DEFAULT 1,
  author_id uuid REFERENCES public.profiles(id),
  updated_by uuid REFERENCES public.profiles(id),
  published boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.knowledge_articles ENABLE ROW LEVEL SECURITY;

-- Read: any authenticated user whose role appears in visible_to_roles OR they are admin/super_admin.
DROP POLICY IF EXISTS "knowledge_read" ON public.knowledge_articles;
CREATE POLICY "knowledge_read" ON public.knowledge_articles
  FOR SELECT TO authenticated USING (
    public.get_my_role() = ANY (visible_to_roles)
    OR public.get_my_role() IN ('super_admin', 'admin')
  );

DROP POLICY IF EXISTS "knowledge_write" ON public.knowledge_articles;
CREATE POLICY "knowledge_write" ON public.knowledge_articles
  FOR ALL TO authenticated USING (
    public.get_my_role() IN ('super_admin', 'admin', 'finance', 'operations')
  );

-- Version history — every update snapshots the prior body.
CREATE TABLE IF NOT EXISTS public.knowledge_article_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id uuid NOT NULL REFERENCES public.knowledge_articles(id) ON DELETE CASCADE,
  version integer NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  saved_by uuid REFERENCES public.profiles(id),
  saved_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.knowledge_article_versions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "knowledge_versions_all" ON public.knowledge_article_versions;
CREATE POLICY "knowledge_versions_all" ON public.knowledge_article_versions
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- -----------------------------------------------------------------------------
-- goals — lightweight quarterly OKR-style tracker
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  scope text NOT NULL DEFAULT 'individual'
    CHECK (scope IN ('company', 'team', 'individual')),
  owner_id uuid REFERENCES public.profiles(id),
  department_id uuid REFERENCES public.departments(id),
  quarter text NOT NULL,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'in_progress', 'complete', 'missed')),
  progress_pct integer NOT NULL DEFAULT 0 CHECK (progress_pct BETWEEN 0 AND 100),
  created_by uuid REFERENCES public.profiles(id),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "goals_read" ON public.goals;
CREATE POLICY "goals_read" ON public.goals
  FOR SELECT TO authenticated USING (
    owner_id = auth.uid()
    OR scope = 'company'
    OR public.get_my_role() IN ('super_admin', 'admin', 'finance', 'operations')
  );

DROP POLICY IF EXISTS "goals_write" ON public.goals;
CREATE POLICY "goals_write" ON public.goals
  FOR ALL TO authenticated USING (
    owner_id = auth.uid()
    OR public.get_my_role() IN ('super_admin', 'admin')
  );

-- -----------------------------------------------------------------------------
-- notification_preferences — per-user opt-in/out per module
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  email_approvals boolean NOT NULL DEFAULT true,
  email_payments boolean NOT NULL DEFAULT true,
  email_compliance boolean NOT NULL DEFAULT true,
  email_expenses boolean NOT NULL DEFAULT true,
  email_fleet boolean NOT NULL DEFAULT false,
  email_leave boolean NOT NULL DEFAULT true,
  in_app_sound boolean NOT NULL DEFAULT true,
  digest_frequency text NOT NULL DEFAULT 'immediate'
    CHECK (digest_frequency IN ('immediate', 'hourly', 'daily', 'never')),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notif_prefs_self" ON public.notification_preferences;
CREATE POLICY "notif_prefs_self" ON public.notification_preferences
  FOR ALL TO authenticated USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- Audit log immutability
--
-- The application never needs to edit or delete a historical audit entry.
-- Enforce that at the DB layer with a trigger that refuses any UPDATE or
-- DELETE on audit_logs — including from Super Admin.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_logs_refuse_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only — updates and deletes are not permitted';
END;
$$;

DROP TRIGGER IF EXISTS audit_logs_no_update ON public.audit_logs;
CREATE TRIGGER audit_logs_no_update
  BEFORE UPDATE ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.audit_logs_refuse_mutation();

DROP TRIGGER IF EXISTS audit_logs_no_delete ON public.audit_logs;
CREATE TRIGGER audit_logs_no_delete
  BEFORE DELETE ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.audit_logs_refuse_mutation();

-- -----------------------------------------------------------------------------
-- Onboarding checklist: boolean columns on contractors were added in phase 3.
-- Ensure a "kyc_document_uploaded" column exists too so the UI checklist has
-- four booleans plus the existing bank verification derived from account
-- number being 10 digits.
-- -----------------------------------------------------------------------------
ALTER TABLE public.contractors
  ADD COLUMN IF NOT EXISTS kyc_document_uploaded boolean DEFAULT false;

-- -----------------------------------------------------------------------------
-- Invited employees: when pending_invites is inserted, auto-create a
-- placeholder auth user is not possible without service role, but we can
-- pre-create a profile row with status='invited' using a SECURITY DEFINER
-- function. The profile is linked by email; the real auth user row created
-- when the employee clicks the OTP link will replace the placeholder id via
-- handle_new_user_invite() trigger.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.seed_invited_profile(
  p_email text,
  p_full_name text,
  p_phone text,
  p_role text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Nothing to do if this email already has a profile.
  IF EXISTS (SELECT 1 FROM public.profiles WHERE email = p_email) THEN
    RETURN;
  END IF;
  -- Placeholder id, replaced on sign-up via the auth trigger that updates
  -- role from pending_invites.
  INSERT INTO public.profiles (id, email, full_name, role, phone, status)
  VALUES (gen_random_uuid(), p_email, COALESCE(p_full_name, ''),
          p_role, p_phone, 'invited');
END;
$$;

GRANT EXECUTE ON FUNCTION public.seed_invited_profile(text, text, text, text)
  TO authenticated;

-- Broaden the profile status CHECK constraint to permit 'invited'.
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_status_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_status_check
  CHECK (status IN ('active', 'inactive', 'invited'));

-- Extend the existing invite-acceptance trigger to also copy
-- email/full_name/phone forward when the invited profile row already existed
-- under a placeholder id.
CREATE OR REPLACE FUNCTION public.handle_new_user_invite()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  invite record;
  existing record;
BEGIN
  SELECT * INTO invite FROM public.pending_invites WHERE email = NEW.email LIMIT 1;
  IF FOUND THEN
    -- Discard any placeholder profile row for this email (different id).
    SELECT * INTO existing FROM public.profiles WHERE email = NEW.email AND id <> NEW.id LIMIT 1;
    IF FOUND THEN
      DELETE FROM public.profiles WHERE id = existing.id;
    END IF;
    UPDATE public.profiles
    SET role = invite.role,
        phone = COALESCE(invite.phone, phone),
        full_name = COALESCE(NULLIF(NEW.raw_user_meta_data->>'full_name', ''), invite.full_name, full_name),
        status = 'active'
    WHERE id = NEW.id;
    UPDATE public.pending_invites SET accepted_at = now() WHERE id = invite.id;
  END IF;
  RETURN NEW;
END;
$$;
