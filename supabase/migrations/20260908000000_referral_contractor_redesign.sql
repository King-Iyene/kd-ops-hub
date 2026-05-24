-- =============================================================================
-- Finance Phase 2 (redesign) — referrers are CONTRACTORS, programme per referral.
--
-- Replaces the hand-typed partner roster: a referrer/affiliate is simply an
-- existing contractor, picked from the dropdown when logging a referral. The
-- commission roster is then derived automatically (group referrals by referrer
-- contractor, split by programme). A small override table lets the team type a
-- count for accounts referred before tracking. Single flow, single source.
--
-- Supersedes referral_partners + referrals.referral_partner_id (left in place,
-- unused, to avoid a destructive drop).
-- =============================================================================

-- The contractor who made the referral (the person we pay).
ALTER TABLE public.referrals
  ADD COLUMN IF NOT EXISTS referrer_contractor_id uuid REFERENCES public.contractors(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_referrals_referrer_contractor
  ON public.referrals (referrer_contractor_id);

COMMENT ON COLUMN public.referrals.referrer_contractor_id IS
  'The contractor credited with this referral. Programme is is_affiliate '
  '(false = referral, true = affiliate), chosen per referral.';

-- Manual count override per contractor per programme (for accounts referred
-- before tracking). When set, it replaces the auto-count — never adds to it.
CREATE TABLE IF NOT EXISTS public.commission_overrides (
  contractor_id uuid    NOT NULL REFERENCES public.contractors(id) ON DELETE CASCADE,
  is_affiliate  boolean NOT NULL DEFAULT false,
  manual_count  integer CHECK (manual_count IS NULL OR manual_count >= 0),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  updated_by    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  PRIMARY KEY (contractor_id, is_affiliate)
);

ALTER TABLE public.commission_overrides ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='commission_overrides' AND policyname='commission_overrides_read') THEN
    CREATE POLICY commission_overrides_read ON public.commission_overrides
      FOR SELECT TO authenticated
      USING (public.get_my_role() IN ('super_admin','admin','finance'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='commission_overrides' AND policyname='commission_overrides_write') THEN
    CREATE POLICY commission_overrides_write ON public.commission_overrides
      FOR ALL TO authenticated
      USING (public.get_my_role() IN ('super_admin','admin','finance'))
      WITH CHECK (public.get_my_role() IN ('super_admin','admin','finance'));
  END IF;
END;
$$;
