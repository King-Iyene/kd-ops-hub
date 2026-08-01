-- Leave Policies (Nigerian Labour Act compliant defaults).
--
-- Adds a leave_policies table that HR can extend/override. Ships with
-- 7 seed policies covering the standard Nigerian entitlements. Existing
-- leave_requests + leave_balances tables are untouched — this is
-- additive scaffolding for a proper leave-type library.
--
-- NO changes to payments, RLS or payroll math.

CREATE TABLE IF NOT EXISTS public.leave_policies (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code          text UNIQUE NOT NULL,
  name          text NOT NULL,
  description   text,
  -- Yearly entitlement in DAYS. Maternity is 112 days (16 weeks ×7).
  default_days  numeric NOT NULL DEFAULT 0,
  -- 'accrual' entitlements accumulate each month; 'entitlement' policies
  -- reset annually; 'unpaid' has no balance tracking.
  accrual_type  text NOT NULL DEFAULT 'entitlement'
    CHECK (accrual_type IN ('entitlement', 'accrual', 'unpaid', 'special')),
  gender        text CHECK (gender IS NULL OR gender IN ('male', 'female')),
  paid          boolean NOT NULL DEFAULT true,
  requires_medical_cert boolean NOT NULL DEFAULT false,
  min_tenure_months     int NOT NULL DEFAULT 0,
  carry_over_days       numeric NOT NULL DEFAULT 0,
  color         text,
  is_system     boolean NOT NULL DEFAULT false,
  active        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.leave_policies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read leave policies" ON public.leave_policies;
CREATE POLICY "Anyone can read leave policies" ON public.leave_policies
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admin manages leave policies" ON public.leave_policies;
CREATE POLICY "Admin manages leave policies" ON public.leave_policies
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p
                 WHERE p.id = auth.uid() AND p.role IN ('super_admin', 'admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p
                      WHERE p.id = auth.uid() AND p.role IN ('super_admin', 'admin')));

-- ── Seed the standard Nigerian Labour Act entitlements ────────────────────

INSERT INTO public.leave_policies
  (code, name, description, default_days, accrual_type,
   gender, paid, requires_medical_cert, min_tenure_months,
   carry_over_days, color, is_system)
VALUES
  ('annual', 'Annual Leave',
   'Statutory minimum of 6 working days after 12 months. Best-practice default: 20 days.',
   20, 'entitlement', NULL, true, false, 12, 5, '#0ea5e9', true),

  ('sick', 'Sick Leave',
   'Up to 12 working days per year with medical certification (Labour Act s.16).',
   12, 'entitlement', NULL, true, true, 0, 0, '#f97316', true),

  ('maternity', 'Maternity Leave',
   '16 weeks (12 statutory + 4 recommended) — half pay for statutory portion (Labour Act s.54).',
   112, 'special', 'female', true, true, 6, 0, '#ec4899', true),

  ('paternity', 'Paternity Leave',
   'Not statutory in NG federal law; best-practice 5 working days for new fathers.',
   5, 'special', 'male', true, false, 0, 0, '#8b5cf6', true),

  ('compassionate', 'Compassionate Leave',
   'Bereavement / family emergency — 3 days per occurrence.',
   3, 'special', NULL, true, false, 0, 0, '#64748b', true),

  ('casual', 'Casual Leave',
   'Short personal errands — 5 days per year, non-carrying.',
   5, 'entitlement', NULL, true, false, 0, 0, '#84cc16', true),

  ('study', 'Study Leave',
   'Approved further-education — 10 days per year, subject to HR approval.',
   10, 'entitlement', NULL, true, false, 12, 0, '#14b8a6', true),

  ('unpaid', 'Unpaid Leave',
   'Extended absence beyond entitlements — no pay, no accrual.',
   0, 'unpaid', NULL, false, false, 0, 0, '#94a3b8', true)
ON CONFLICT (code) DO NOTHING;

COMMENT ON TABLE public.leave_policies IS
  'Leave type library. Seeded with NG Labour Act defaults; HR can add/deactivate policies.';

NOTIFY pgrst, 'reload schema';
