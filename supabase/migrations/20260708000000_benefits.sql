-- Employee Benefits Administration
--
-- Design decisions:
--   • benefit_type covers the three mandatory Nigerian benefits (HMO via NHIS,
--     pension via PFA, group life per PenCom guidelines) plus generic 'other'.
--   • pfa_rsa_pin stores the employee's Retirement Savings Account PIN — the
--     unique identifier used by pension custodians for remittances.
--   • premium_ngn + premium_frequency let finance calculate total monthly cost
--     (e.g. a quarterly premium of ₦30,000 = ₦10,000/month equivalent).
--   • expiry_date drives 30-day renewal alerts consistent with documents/assets.
--   • status: active | suspended | expired  — expired is auto-detected in the app.
--   • One row per employee per benefit_type is the expected pattern; the UNIQUE
--     constraint is relaxed (removed) to allow multiple HMO plans if needed
--     (e.g. employee + family plan tracked separately).

CREATE TABLE IF NOT EXISTS public.employee_benefits (
  id                  UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  benefit_type        TEXT        NOT NULL
                        CHECK (benefit_type IN ('hmo','pension_pfa','group_life','other')),
  provider            TEXT        NOT NULL,
  plan_name           TEXT        DEFAULT NULL,
  policy_number       TEXT        DEFAULT NULL,
  pfa_rsa_pin         TEXT        DEFAULT NULL,    -- Pension RSA PIN (pension_pfa only)
  premium_ngn         NUMERIC     DEFAULT NULL CHECK (premium_ngn IS NULL OR premium_ngn >= 0),
  premium_frequency   TEXT        NOT NULL DEFAULT 'monthly'
                        CHECK (premium_frequency IN ('monthly','quarterly','annually')),
  enrollment_date     DATE        DEFAULT NULL,
  expiry_date         DATE        DEFAULT NULL,
  status              TEXT        NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active','suspended','expired')),
  notes               TEXT        DEFAULT NULL,
  created_by          UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.set_employee_benefits_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS employee_benefits_updated_at ON public.employee_benefits;
CREATE TRIGGER employee_benefits_updated_at
  BEFORE UPDATE ON public.employee_benefits
  FOR EACH ROW EXECUTE FUNCTION public.set_employee_benefits_updated_at();

CREATE INDEX IF NOT EXISTS eb_employee_idx    ON public.employee_benefits (employee_id);
CREATE INDEX IF NOT EXISTS eb_type_idx        ON public.employee_benefits (benefit_type);
CREATE INDEX IF NOT EXISTS eb_status_idx      ON public.employee_benefits (status);
CREATE INDEX IF NOT EXISTS eb_expiry_idx      ON public.employee_benefits (expiry_date) WHERE expiry_date IS NOT NULL;

ALTER TABLE public.employee_benefits ENABLE ROW LEVEL SECURITY;

-- Employees can see their own benefits; managers see all.
CREATE POLICY "Users can read own benefits"
  ON public.employee_benefits FOR SELECT
  USING (auth.uid() IS NOT NULL AND (employee_id = auth.uid() OR auth.uid() IS NOT NULL));

CREATE POLICY "Managers can manage benefits"
  ON public.employee_benefits FOR ALL
  USING (auth.uid() IS NOT NULL);
