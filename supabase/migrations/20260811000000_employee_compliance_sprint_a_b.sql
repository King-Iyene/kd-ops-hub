-- =============================================================================
-- Employee compliance + profile completeness (Sprint A + B)
--
-- This migration is fully ADDITIVE and BACKWARD COMPATIBLE:
--   * Every new column is nullable with a safe default
--   * Per-employee toggle `use_salary_components` defaults to FALSE — existing
--     employees keep their flat salary_ngn behavior unchanged
--   * Company-wide toggle `nsitf_enabled` defaults to TRUE (the law requires it)
--     but payroll only adds the line if the flag is on
--   * Salary history table is created empty; existing salaries are NOT
--     backfilled to history (no history to know about). Future changes will
--     write rows automatically via trigger.
--
-- What's in this migration:
--   Sprint A — Compliance:
--     1. Salary components on profiles (basic/housing/transport/other_allowances)
--     2. Per-employee `use_salary_components` toggle (default FALSE)
--     3. Company-wide `nsitf_enabled` toggle (default TRUE)
--     4. Helper RPC `compute_employee_gross` — returns gross + statutory bases
--
--   Sprint B — Profile completeness:
--     1. profiles.reporting_manager_id (FK to profiles)
--     2. profiles.contract_start_date, contract_end_date
--     3. profiles.employment_type (full_time|contract|probation|intern|part_time)
--     4. profiles.pfa_name (Pension Fund Administrator name, separate from RSA PIN)
--     5. profiles.state_of_residence (for multi-state PAYE remittance)
--     6. salary_history table + auto-log trigger
-- =============================================================================

-- ──────────────────────────────────────────────────────────────────────────
-- 1. Salary components — Sprint A foundation
-- ──────────────────────────────────────────────────────────────────────────
-- Why split? Nigerian law (PRA 2014, NHF Act) computes pension and NHF on
-- specific salary components, not full gross:
--   * Pension base = Basic + Housing + Transport (PRA 2014 s.4)
--   * NHF base     = Basic only (NHF Act s.4)
-- Until now we computed both off gross — over-deducting whenever an employee
-- earned meal/utility/other allowances. These columns let us be correct.
--
-- Backward compat: if use_salary_components = FALSE, payroll continues to
-- treat salary_ngn as a flat gross (today's behavior). Switching the flag
-- on for an employee unlocks the new math.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS basic_ngn               numeric(14,2),
  ADD COLUMN IF NOT EXISTS housing_ngn             numeric(14,2),
  ADD COLUMN IF NOT EXISTS transport_ngn           numeric(14,2),
  ADD COLUMN IF NOT EXISTS other_allowances_ngn    numeric(14,2),
  ADD COLUMN IF NOT EXISTS use_salary_components   boolean NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.profiles.basic_ngn IS
  'Monthly basic salary. Used as the base for NHF (2.5%). Only consulted when use_salary_components=TRUE.';
COMMENT ON COLUMN public.profiles.housing_ngn IS
  'Monthly housing allowance. Part of pension base.';
COMMENT ON COLUMN public.profiles.transport_ngn IS
  'Monthly transport allowance. Part of pension base.';
COMMENT ON COLUMN public.profiles.other_allowances_ngn IS
  'Other allowances (meal, utility, car maintenance, etc.) — taxable but NOT in pension/NHF base.';
COMMENT ON COLUMN public.profiles.use_salary_components IS
  'Per-employee toggle. FALSE (default) keeps the legacy flat-salary behavior. TRUE switches payroll to use components for pension/NHF correctness.';

-- Guardrail: when use_salary_components is on, basic_ngn must be > 0.
-- This is a soft check — we don't enforce it as a constraint because
-- migrations might toggle then fill, but the app surfaces the invariant.

-- ──────────────────────────────────────────────────────────────────────────
-- 2. Company-wide NSITF toggle — Sprint A
-- ──────────────────────────────────────────────────────────────────────────
-- NSITF (1% of total monthly payroll, employer-borne) is legally required
-- for all Nigerian employers with 5+ staff. Default ON. Operators can flip
-- it off via Settings → Compliance for testing or if the company is exempt.

ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS nsitf_enabled          boolean NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS itf_enabled            boolean NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS salary_components_default boolean NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.company_settings.nsitf_enabled IS
  'When TRUE (default), payroll runs add NSITF (1% of total payroll) to employer cost. Legally required for firms with 5+ staff.';
COMMENT ON COLUMN public.company_settings.itf_enabled IS
  'When TRUE (default), payroll runs include ITF (1% of annual payroll) in the annual-cost report. Required for firms with 5+ staff or ≥ ₦50M turnover.';
COMMENT ON COLUMN public.company_settings.salary_components_default IS
  'When TRUE, new employee invites pre-set use_salary_components=TRUE. Existing employees unaffected.';

-- ──────────────────────────────────────────────────────────────────────────
-- 3. Helper RPC — resolve gross + statutory bases for an employee
-- ──────────────────────────────────────────────────────────────────────────
-- Centralised so payroll, payslip generation, and EWA accrual all see the
-- same numbers. Returns:
--   gross_monthly        — what the employee earns (sum of components OR flat salary_ngn)
--   pension_base_monthly — basic + housing + transport (or gross if components off)
--   nhf_base_monthly     — basic (or gross if components off)
--
-- When use_salary_components=FALSE, the legacy "gross is everything" rule
-- applies to every base — this preserves today's behavior exactly.

CREATE OR REPLACE FUNCTION public.compute_employee_gross(p_employee_id uuid)
RETURNS TABLE (
  gross_monthly        numeric,
  pension_base_monthly numeric,
  nhf_base_monthly     numeric,
  using_components     boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prof   record;
  v_gross  numeric;
  v_pen    numeric;
  v_nhf    numeric;
BEGIN
  SELECT salary_ngn,
         basic_ngn,
         housing_ngn,
         transport_ngn,
         other_allowances_ngn,
         use_salary_components
    INTO v_prof
    FROM public.profiles
   WHERE id = p_employee_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 0::numeric, 0::numeric, 0::numeric, FALSE;
    RETURN;
  END IF;

  IF v_prof.use_salary_components THEN
    v_gross := COALESCE(v_prof.basic_ngn,0)
             + COALESCE(v_prof.housing_ngn,0)
             + COALESCE(v_prof.transport_ngn,0)
             + COALESCE(v_prof.other_allowances_ngn,0);
    v_pen   := COALESCE(v_prof.basic_ngn,0)
             + COALESCE(v_prof.housing_ngn,0)
             + COALESCE(v_prof.transport_ngn,0);
    v_nhf   := COALESCE(v_prof.basic_ngn,0);
  ELSE
    v_gross := COALESCE(v_prof.salary_ngn,0);
    v_pen   := v_gross;
    v_nhf   := v_gross;
  END IF;

  RETURN QUERY SELECT v_gross, v_pen, v_nhf, v_prof.use_salary_components;
END;
$$;

GRANT EXECUTE ON FUNCTION public.compute_employee_gross(uuid) TO authenticated;

COMMENT ON FUNCTION public.compute_employee_gross IS
  'Single source of truth for an employee''s gross + statutory deduction bases. Honours the use_salary_components toggle. Use in payroll, payslip, EWA accrual.';

-- ──────────────────────────────────────────────────────────────────────────
-- 4. Profile completeness — Sprint B
-- ──────────────────────────────────────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS reporting_manager_id  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS contract_start_date   date,
  ADD COLUMN IF NOT EXISTS contract_end_date     date,
  ADD COLUMN IF NOT EXISTS employment_type       text CHECK (
        employment_type IS NULL OR employment_type IN (
          'full_time','contract','probation','intern','part_time'
        )),
  ADD COLUMN IF NOT EXISTS pfa_name              text,
  ADD COLUMN IF NOT EXISTS state_of_residence    text;

COMMENT ON COLUMN public.profiles.reporting_manager_id IS
  'Direct manager. Used for leave approval routing, org chart, performance review hierarchy.';
COMMENT ON COLUMN public.profiles.contract_start_date IS
  'Employment start date — drives probation review timing, tenure calculations, leave accrual eligibility (Labour Act: annual leave after 12 months).';
COMMENT ON COLUMN public.profiles.contract_end_date IS
  'Contract expiry — for contract/intern employment types. NULL for permanent staff.';
COMMENT ON COLUMN public.profiles.employment_type IS
  'Employment classification. Drives probation flows (3-month review for probation), contract expiry alerts.';
COMMENT ON COLUMN public.profiles.pfa_name IS
  'Pension Fund Administrator (e.g. ARM Pension, Stanbic IBTC). Separate from pension_pin which is the RSA number.';
COMMENT ON COLUMN public.profiles.state_of_residence IS
  'Nigerian state for PAYE remittance routing. PAYE is paid to the State IRS where the employee resides, not where the company is HQ''d.';

CREATE INDEX IF NOT EXISTS profiles_reporting_manager_idx
  ON public.profiles(reporting_manager_id)
  WHERE reporting_manager_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS profiles_employment_type_idx
  ON public.profiles(employment_type)
  WHERE employment_type IS NOT NULL;

-- ──────────────────────────────────────────────────────────────────────────
-- 5. salary_history — audit trail of every salary change
-- ──────────────────────────────────────────────────────────────────────────
-- Every salary edit creates a row here. Lets HR see promotions, increments,
-- and answer "what was Adeola earning in Q1?". Also feeds the upcoming
-- salary increment workflow.

CREATE TABLE IF NOT EXISTS public.salary_history (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id       uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  effective_date    date NOT NULL DEFAULT CURRENT_DATE,

  -- snapshot of the change
  old_salary_ngn       numeric(14,2),
  new_salary_ngn       numeric(14,2),
  old_basic_ngn        numeric(14,2),
  new_basic_ngn        numeric(14,2),
  old_housing_ngn      numeric(14,2),
  new_housing_ngn      numeric(14,2),
  old_transport_ngn    numeric(14,2),
  new_transport_ngn    numeric(14,2),
  old_other_ngn        numeric(14,2),
  new_other_ngn        numeric(14,2),

  change_type       text NOT NULL DEFAULT 'edit' CHECK (change_type IN (
                      'edit','increment','promotion','demotion','correction','onboarding'
                    )),
  reason            text,

  changed_by        uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  changed_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS salary_history_employee_idx
  ON public.salary_history(employee_id, effective_date DESC);

ALTER TABLE public.salary_history ENABLE ROW LEVEL SECURITY;

-- RLS: admins/super_admins/finance see everything. Employee sees own history.
DROP POLICY IF EXISTS salary_history_self_read ON public.salary_history;
CREATE POLICY salary_history_self_read ON public.salary_history
  FOR SELECT TO authenticated
  USING (
    employee_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles p
                WHERE p.id = auth.uid()
                  AND p.role IN ('super_admin','admin','finance'))
  );

DROP POLICY IF EXISTS salary_history_admin_write ON public.salary_history;
CREATE POLICY salary_history_admin_write ON public.salary_history
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p
             WHERE p.id = auth.uid()
               AND p.role IN ('super_admin','admin','finance'))
  );

COMMENT ON TABLE public.salary_history IS
  'Append-only log of every salary or component change. Auto-populated by trigger on profiles UPDATE. Surfaced in Employee Profile → Salary History tab.';

-- Trigger: auto-log when any salary field on profiles changes
CREATE OR REPLACE FUNCTION public.log_salary_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only fire when one of the comp fields changed
  IF NEW.salary_ngn            IS DISTINCT FROM OLD.salary_ngn
     OR NEW.basic_ngn          IS DISTINCT FROM OLD.basic_ngn
     OR NEW.housing_ngn        IS DISTINCT FROM OLD.housing_ngn
     OR NEW.transport_ngn      IS DISTINCT FROM OLD.transport_ngn
     OR NEW.other_allowances_ngn IS DISTINCT FROM OLD.other_allowances_ngn THEN

    INSERT INTO public.salary_history (
      employee_id,
      old_salary_ngn,  new_salary_ngn,
      old_basic_ngn,   new_basic_ngn,
      old_housing_ngn, new_housing_ngn,
      old_transport_ngn, new_transport_ngn,
      old_other_ngn,   new_other_ngn,
      change_type,
      changed_by
    ) VALUES (
      NEW.id,
      OLD.salary_ngn,  NEW.salary_ngn,
      OLD.basic_ngn,   NEW.basic_ngn,
      OLD.housing_ngn, NEW.housing_ngn,
      OLD.transport_ngn, NEW.transport_ngn,
      OLD.other_allowances_ngn, NEW.other_allowances_ngn,
      'edit',
      auth.uid()
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_salary_change_log ON public.profiles;
CREATE TRIGGER profiles_salary_change_log
  AFTER UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.log_salary_change();

COMMENT ON FUNCTION public.log_salary_change IS
  'Auto-inserts a salary_history row whenever any monetary field on profiles changes. Trigger runs in SECURITY DEFINER so it bypasses RLS during the insert.';

-- ──────────────────────────────────────────────────────────────────────────
-- 6. Convenience view — current org chart (used by reporting_manager UI)
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.org_chart_v AS
SELECT
  e.id                          AS employee_id,
  e.full_name                   AS employee_name,
  e.email                       AS employee_email,
  e.job_title                   AS employee_title,
  e.department_id,
  d.name                        AS department_name,
  e.reporting_manager_id        AS manager_id,
  m.full_name                   AS manager_name,
  m.email                       AS manager_email
FROM public.profiles e
LEFT JOIN public.profiles    m ON m.id = e.reporting_manager_id
LEFT JOIN public.departments d ON d.id = e.department_id
WHERE e.status = 'active';

GRANT SELECT ON public.org_chart_v TO authenticated;

COMMENT ON VIEW public.org_chart_v IS
  'Flattened view of the live org chart for active employees. Used by the Employees page to show "Reports to" and for future org-chart visualisations.';
