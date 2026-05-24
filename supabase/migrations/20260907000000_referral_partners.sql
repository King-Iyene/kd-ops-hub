-- =============================================================================
-- Finance Phase 2 (proper) — referral/affiliate PARTNER roster.
--
-- Problem this fixes: the referrals table recorded the referrer as whoever added
-- the row (the admin), and "who referred them" was free text saved only to the
-- audit log. So commissions could not be attributed to a real affiliate.
--
-- This adds a roster of referral/affiliate PARTNERS (the people we pay), and
-- links each referred account to one. A partner's payable account count is then
-- the auto-count of linked qualifying referrals, OR a manual count the team
-- types to override it (verified, not guessed). Distinct referral vs affiliate
-- programmes via `type`. Additive only.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.referral_partners (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name             text NOT NULL,
  type                  text NOT NULL DEFAULT 'referral' CHECK (type IN ('referral','affiliate')),
  email                 text,
  status                text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  -- Optional override of the auto-count. NULL = use the auto-count of linked
  -- qualifying referrals. When set, this number is used instead (no doubling).
  manual_account_count  integer CHECK (manual_account_count IS NULL OR manual_account_count >= 0),
  notes                 text,
  created_by            uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_referral_partners_type_status
  ON public.referral_partners (type, status);

COMMENT ON TABLE public.referral_partners IS
  'Roster of people we pay referral/affiliate commissions to. Each referred '
  'account (referrals.referral_partner_id) links to one; payable count = the '
  'auto-count of linked active referrals, overridden by manual_account_count '
  'when set.';

ALTER TABLE public.referral_partners ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='referral_partners' AND policyname='referral_partners_read') THEN
    CREATE POLICY referral_partners_read ON public.referral_partners
      FOR SELECT TO authenticated
      USING (public.get_my_role() IN ('super_admin','admin','finance'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='referral_partners' AND policyname='referral_partners_write') THEN
    CREATE POLICY referral_partners_write ON public.referral_partners
      FOR ALL TO authenticated
      USING (public.get_my_role() IN ('super_admin','admin','finance'))
      WITH CHECK (public.get_my_role() IN ('super_admin','admin','finance'));
  END IF;
END;
$$;

-- Link each referred account to the partner who referred it.
ALTER TABLE public.referrals
  ADD COLUMN IF NOT EXISTS referral_partner_id uuid REFERENCES public.referral_partners(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_referrals_partner ON public.referrals (referral_partner_id);
