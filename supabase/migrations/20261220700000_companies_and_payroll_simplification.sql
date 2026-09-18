-- ═══════════════════════════════════════════════════════════════════════════════
-- Companies + Payroll simplification
-- ─────────────────────────────────────────────────────────────────────────────
-- KDOps runs payroll for TWO real companies (KD Squares and NDI) through one
-- instance, but the database has never had a first-class "company" concept —
-- confirmed by grepping every migration back to Feb 2026: company_settings is
-- a hardcoded singleton row, and a half-built "tenants" migration from May
-- 2026 (Phase 1A of turning KDOps into multi-tenant SaaS) was explicitly
-- documented as needing a "Phase 1B" to wire company_id into business tables —
-- that phase was never built.
--
-- Concrete, provable bug this causes today: compliance_filings is keyed
-- globally by (kind, period) with no company column. Approving KD Squares'
-- and NDI's payroll for the same calendar month causes the second approval's
-- auto_populate_filings_from_payroll() call to silently OVERWRITE the first
-- company's just-computed PAYE/Pension/NHF/NSITF amounts (see the
-- ON CONFLICT (kind, period) clauses in 20260802000000_compliance_autopilot.sql).
-- Filing packs also print whichever company's identity happens to be in the
-- single global company_settings row, regardless of which company the run
-- actually belongs to.
--
-- Separately: profiles.employee_category ("Payroll category" in the UI) and
-- pay_groups ("Pay group" in the UI) are two overlapping, confusingly-named
-- fields sitting side by side on every employee's profile. Every payroll
-- platform researched for this redesign (Gusto, Deel, BambooHR, Rippling)
-- collapses this into ONE concept — "Pay Group" — that carries schedule,
-- company, and classification (they call out "executive/director" by name as
-- a standard pay-group split) together. This migration does the same:
-- pay_groups becomes company-scoped, and employee_category is deprecated.
--
-- This migration is intentionally conservative about existing data it cannot
-- verify: it does NOT invent new pay groups, rename existing ones, or guess
-- which of the current 6 production pay_groups belong to which company. It
-- backfills everything to the KD Squares company (the only one previously
-- inferable from company_settings), leaving reassignment to NDI as a
-- deliberate, visible admin action in the redesigned UI — not a guess baked
-- into a migration.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. companies ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.companies (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  text        NOT NULL,
  short_code            text        NOT NULL UNIQUE,
  rc_number             text,
  tin                   text,
  address               text,
  default_state         text,
  pencom_employer_code  text,
  nhf_employer_code     text,
  nsitf_employer_code   text,
  itf_employer_code     text,
  -- Badge/switcher color so the two companies are visually unmistakable
  -- everywhere they appear (payroll run cards, compliance tiles, etc.).
  color                 text        NOT NULL DEFAULT '#2D7FF9',
  is_active             boolean     NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "companies_read" ON public.companies;
CREATE POLICY "companies_read" ON public.companies
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "companies_write" ON public.companies;
CREATE POLICY "companies_write" ON public.companies
  FOR ALL TO authenticated USING (
    public.current_user_role() IN ('super_admin', 'admin')
  );

CREATE OR REPLACE FUNCTION public.set_companies_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_companies_updated_at ON public.companies;
CREATE TRIGGER trg_companies_updated_at
  BEFORE UPDATE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.set_companies_updated_at();

-- Seed KD Squares from the existing company_settings singleton (the only
-- company this database has ever had real identity data for), and NDI as a
-- second real company with just a name — its RC number/TIN/employer codes
-- are unknown to this migration and must be filled in via Settings → Company
-- once this ships (a "Complete NDI's details" prompt is part of the redesign).
DO $$
DECLARE
  v_kds_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.companies WHERE short_code = 'KDS') THEN
    -- company_settings ended up with TWO disconnected sets of the same fields
    -- (rc_number/tin from the original migration, employer_rc_number/
    -- employer_tin added later by 20261002000000_statutory_export_fields.sql)
    -- — the exact "two overlapping fields" problem this whole redesign fixes,
    -- just discovered a second time. src/lib/statutory/index.ts already
    -- defensively falls back between them at read time
    -- (`cs.employer_tin ?? cs.tin ?? null`); this seed does the same fallback
    -- once, here, so companies ends up with exactly one authoritative value.
    INSERT INTO public.companies (
      name, short_code, rc_number, tin, address, default_state,
      pencom_employer_code, nhf_employer_code, nsitf_employer_code, itf_employer_code,
      color
    )
    SELECT
      COALESCE(cs.company_name, 'KD Squares Ltd'), 'KDS',
      COALESCE(cs.employer_rc_number, cs.rc_number),
      COALESCE(cs.employer_tin, cs.tin),
      cs.address,
      cs.state_of_business,
      cs.pencom_employer_code, cs.nhf_employer_code, cs.nsitf_employer_code, cs.itf_employer_code,
      '#2D7FF9'
    FROM public.company_settings cs
    WHERE cs.id = '00000000-0000-0000-0000-000000000001'
    RETURNING id INTO v_kds_id;

    -- company_settings had no row yet (fresh install) — seed a bare default.
    IF v_kds_id IS NULL THEN
      INSERT INTO public.companies (name, short_code, color)
      VALUES ('KD Squares Ltd', 'KDS', '#2D7FF9');
    END IF;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.companies WHERE short_code = 'NDI') THEN
    INSERT INTO public.companies (name, short_code, color)
    VALUES ('NDI', 'NDI', '#F97316');
  END IF;
END $$;

-- Now that companies.* holds the real KD Squares statutory identity, drop the
-- duplicated columns from company_settings so there is exactly one source of
-- truth for legal/statutory identity going forward. company_settings keeps
-- everything else (branding, cash/runway tracking, fiscal year, timezone,
-- social links) — those are genuinely single-business operational settings,
-- not something this pass is splitting per company.
ALTER TABLE public.company_settings
  DROP COLUMN IF EXISTS rc_number,
  DROP COLUMN IF EXISTS tin,
  DROP COLUMN IF EXISTS employer_rc_number,
  DROP COLUMN IF EXISTS employer_tin,
  DROP COLUMN IF EXISTS address,
  DROP COLUMN IF EXISTS state_of_business,
  DROP COLUMN IF EXISTS pencom_employer_code,
  DROP COLUMN IF EXISTS nhf_employer_code,
  DROP COLUMN IF EXISTS nsitf_employer_code,
  DROP COLUMN IF EXISTS itf_employer_code;

-- ── 2. pay_groups.company_id — the ONE place company assignment starts ──────
ALTER TABLE public.pay_groups
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);

UPDATE public.pay_groups
SET company_id = (SELECT id FROM public.companies WHERE short_code = 'KDS')
WHERE company_id IS NULL;

ALTER TABLE public.pay_groups ALTER COLUMN company_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pay_groups_company_id ON public.pay_groups (company_id);

-- A pay group name only needs to be unique WITHIN a company now — "Staff" can
-- exist for both KD Squares and NDI without colliding.
ALTER TABLE public.pay_groups DROP CONSTRAINT IF EXISTS pay_groups_name_key;
CREATE UNIQUE INDEX IF NOT EXISTS pay_groups_company_name_uniq
  ON public.pay_groups (company_id, name);

COMMENT ON COLUMN public.pay_groups.company_id IS
  'Which company this pay group belongs to. An employee''s company is derived from their pay_group_id — there is no separate company field on profiles by design (one source of truth).';

-- ── 3. payroll_runs.company_id ──────────────────────────────────────────────
ALTER TABLE public.payroll_runs
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);

-- Backfill: prefer the run's own pay_group_id -> company. Next, try to infer
-- a single company from the payroll_segment's include_pay_group_ids (a run
-- drafted by picking one pay-group "quick filter" card). Anything left
-- (legacy unsegmented "all staff" runs) defaults to KD Squares, since that is
-- the only company this database has ever had explicit identity for.
UPDATE public.payroll_runs pr
SET company_id = pg.company_id
FROM public.pay_groups pg
WHERE pr.company_id IS NULL AND pr.pay_group_id = pg.id;

UPDATE public.payroll_runs pr
SET company_id = inferred.company_id
FROM (
  SELECT ps.id AS segment_id, MIN(pg2.company_id) AS company_id
  FROM public.payroll_segments ps
  CROSS JOIN LATERAL jsonb_array_elements_text(
    COALESCE(ps.filter_rules -> 'include_pay_group_ids', '[]'::jsonb)
  ) AS grp(pay_group_id)
  JOIN public.pay_groups pg2 ON pg2.id::text = grp.pay_group_id
  GROUP BY ps.id
  HAVING COUNT(DISTINCT pg2.company_id) = 1  -- only when unambiguous (exactly one company)
) inferred
WHERE pr.company_id IS NULL AND pr.payroll_segment_id = inferred.segment_id;

UPDATE public.payroll_runs
SET company_id = (SELECT id FROM public.companies WHERE short_code = 'KDS')
WHERE company_id IS NULL;

ALTER TABLE public.payroll_runs ALTER COLUMN company_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payroll_runs_company_id ON public.payroll_runs (company_id);

-- The period-uniqueness indexes from 20261101000000 need company scoping too
-- — otherwise KD Squares and NDI still can't both have an unsegmented run in
-- the same month, which is exactly the two-company scenario in play here.
DROP INDEX IF EXISTS payroll_runs_period_no_segment_uniq;
DROP INDEX IF EXISTS payroll_runs_period_segment_uniq;

CREATE UNIQUE INDEX IF NOT EXISTS payroll_runs_company_period_no_segment_uniq
  ON public.payroll_runs (company_id, period)
  WHERE payroll_segment_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS payroll_runs_company_period_segment_uniq
  ON public.payroll_runs (company_id, period, payroll_segment_id)
  WHERE payroll_segment_id IS NOT NULL;

-- payroll_runs_schedule_period_uniq (added 20260914) uniquely constrains
-- (pay_schedule_id, period) with NO company column at all. pay_schedules is
-- a shared table of schedule *definitions* that pay_groups from EITHER
-- company can reuse (see schedule_auto_draft below) — once two companies
-- share the same schedule, this constraint would block the second
-- company's auto-generated draft for the same period outright. Superseded
-- by payroll_runs_company_period_no_segment_uniq above, which enforces the
-- actual intended invariant (one unsegmented run per company per period).
ALTER TABLE public.payroll_runs DROP CONSTRAINT IF EXISTS payroll_runs_schedule_period_uniq;

-- ── 4. compliance_filings.company_id — fixes the real overwrite bug ────────
ALTER TABLE public.compliance_filings
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);

UPDATE public.compliance_filings cf
SET company_id = pr.company_id
FROM public.payroll_runs pr
WHERE cf.company_id IS NULL AND cf.payroll_run_id = pr.id;

-- Manually-entered filings (VAT/CAC/TCC — never linked to a payroll run)
-- default to KD Squares; an admin can re-tag them per-company from the
-- redesigned Compliance page once this ships.
UPDATE public.compliance_filings
SET company_id = (SELECT id FROM public.companies WHERE short_code = 'KDS')
WHERE company_id IS NULL;

ALTER TABLE public.compliance_filings ALTER COLUMN company_id SET NOT NULL;

ALTER TABLE public.compliance_filings DROP CONSTRAINT IF EXISTS compliance_filings_kind_period_key;
CREATE UNIQUE INDEX IF NOT EXISTS compliance_filings_company_kind_period_uniq
  ON public.compliance_filings (company_id, kind, period);

CREATE INDEX IF NOT EXISTS idx_compliance_filings_company_id ON public.compliance_filings (company_id);

-- ── 5. tax_remittances — repurpose the already-unused org_id column ─────────
-- org_id was added in 20261120000003_remittance_tracking.sql, declared in the
-- unique constraint, but never actually set or read anywhere in the app
-- (verified: zero references outside its own migration). Renaming it in
-- place is a safe, zero-data-loss change.
ALTER TABLE public.tax_remittances RENAME COLUMN org_id TO company_id;
ALTER TABLE public.tax_remittances
  ADD CONSTRAINT tax_remittances_company_id_fkey
    FOREIGN KEY (company_id) REFERENCES public.companies(id);

UPDATE public.tax_remittances tr
SET company_id = pr.company_id
FROM public.payroll_runs pr
WHERE tr.company_id IS NULL AND tr.payroll_run_id = pr.id;

UPDATE public.tax_remittances
SET company_id = (SELECT id FROM public.companies WHERE short_code = 'KDS')
WHERE company_id IS NULL;

ALTER TABLE public.tax_remittances ALTER COLUMN company_id SET NOT NULL;

-- ── 6. Wire up the two already-existing-but-dead company_id columns ────────
-- (added 20261031000000 "for future multi-tenant readiness", never used —
-- confirmed zero reads/writes anywhere in the app). Added NOT VALID: this
-- migration doesn't control what's already in these columns the way it does
-- for tables it backfills itself above, so it must never be able to fail on
-- an unexpected stray value in old data. New rows are still fully validated
-- going forward; VALIDATE CONSTRAINT can be run later once the data's been
-- audited if retroactive enforcement is ever wanted.
ALTER TABLE public.employee_earnings
  ADD CONSTRAINT employee_earnings_company_id_fkey
    FOREIGN KEY (company_id) REFERENCES public.companies(id) NOT VALID;

ALTER TABLE public.bank_payment_files
  ADD CONSTRAINT bank_payment_files_company_id_fkey
    FOREIGN KEY (company_id) REFERENCES public.companies(id) NOT VALID;

-- ── 7. payment_batches.company_id — Director Disbursements need this too ───
-- (a "director_salary"/"director_drawings" draw is meaningless without
-- knowing which company it's drawn from)
ALTER TABLE public.payment_batches
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);

CREATE INDEX IF NOT EXISTS idx_payment_batches_company_id
  ON public.payment_batches (company_id) WHERE company_id IS NOT NULL;

-- ── 8. Deprecate employee_category — collapsed into pay_groups ─────────────
-- Soft-deprecate (rename + drop the CHECK) rather than hard-drop: preserves
-- any incidentally-set values with zero risk, while fully removing it from
-- active use. Application code stops reading/writing this column entirely.
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_employee_category_check;

ALTER TABLE public.profiles
  RENAME COLUMN employee_category TO employee_category_deprecated_unused;

COMMENT ON COLUMN public.profiles.employee_category_deprecated_unused IS
  'Deprecated 2026-12-20: collapsed into pay_groups (now company-scoped) to match how Gusto/Deel/BambooHR model this — one concept, not two overlapping ones. No longer read or written by the app. Kept (not dropped) only to avoid destroying any incidentally-set historical data.';

-- Two trigger functions reference employee_category by name in raw PL/pgSQL
-- (NEW.employee_category / to_jsonb(...) - 'employee_category') — unlike
-- constraints and indexes, a column rename does NOT rewrite these, so both
-- would throw "column does not exist" on the very next profile UPDATE if left
-- unpatched. Re-pointing them at the renamed column is a pure mechanical fix
-- with zero behavior change (both guards keep exempting/gating exactly the
-- same now-deprecated column they always did).

CREATE OR REPLACE FUNCTION public.guard_profile_role_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  caller_role text := public.current_user_role();
BEGIN
  IF current_user <> 'authenticated' THEN
    RETURN NEW;
  END IF;

  IF caller_role = 'super_admin' THEN
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      NEW.permissions := '{}'::jsonb;
    END IF;
    RETURN NEW;
  END IF;

  IF caller_role = 'admin' THEN
    IF NEW.role IS DISTINCT FROM OLD.role AND NEW.role = 'super_admin' THEN
      RAISE EXCEPTION 'Permission denied: only super_admin can assign super_admin role'
        USING ERRCODE = '42501';
    END IF;
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      NEW.permissions := '{}'::jsonb;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'Permission denied: only admin or super_admin can change role'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Permission denied: only admin or super_admin can change status'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.salary_ngn             IS DISTINCT FROM OLD.salary_ngn
     OR NEW.paye_enabled        IS DISTINCT FROM OLD.paye_enabled
     OR NEW.pension_enabled     IS DISTINCT FROM OLD.pension_enabled
     OR NEW.nhf_enabled         IS DISTINCT FROM OLD.nhf_enabled
     OR NEW.nhis_enabled        IS DISTINCT FROM OLD.nhis_enabled
     OR NEW.pension_pin         IS DISTINCT FROM OLD.pension_pin
     OR NEW.nhf_number          IS DISTINCT FROM OLD.nhf_number
     OR NEW.nhis_number         IS DISTINCT FROM OLD.nhis_number
     OR NEW.tax_id              IS DISTINCT FROM OLD.tax_id
     OR NEW.tin                 IS DISTINCT FROM OLD.tin
     OR NEW.nin                 IS DISTINCT FROM OLD.nin
     OR NEW.employee_number     IS DISTINCT FROM OLD.employee_number
     OR NEW.employment_type     IS DISTINCT FROM OLD.employment_type
     OR NEW.start_date          IS DISTINCT FROM OLD.start_date
     OR NEW.job_title           IS DISTINCT FROM OLD.job_title
     OR NEW.annual_leave_days   IS DISTINCT FROM OLD.annual_leave_days
     OR NEW.department_id       IS DISTINCT FROM OLD.department_id
     OR NEW.bank_name           IS DISTINCT FROM OLD.bank_name
     OR NEW.bank_account_number IS DISTINCT FROM OLD.bank_account_number
     OR NEW.bank_account_name   IS DISTINCT FROM OLD.bank_account_name
     OR NEW.use_salary_components IS DISTINCT FROM OLD.use_salary_components
     OR NEW.basic_ngn             IS DISTINCT FROM OLD.basic_ngn
     OR NEW.housing_ngn           IS DISTINCT FROM OLD.housing_ngn
     OR NEW.transport_ngn         IS DISTINCT FROM OLD.transport_ngn
     OR NEW.other_allowances_ngn  IS DISTINCT FROM OLD.other_allowances_ngn
     OR NEW.permissions           IS DISTINCT FROM OLD.permissions
     OR NEW.reporting_manager_id  IS DISTINCT FROM OLD.reporting_manager_id
     OR NEW.pfa_name              IS DISTINCT FROM OLD.pfa_name
     OR NEW.pfa_code              IS DISTINCT FROM OLD.pfa_code
     OR NEW.voluntary_pension_pct IS DISTINCT FROM OLD.voluntary_pension_pct
     OR NEW.pay_group_id          IS DISTINCT FROM OLD.pay_group_id
     OR NEW.contract_end_date     IS DISTINCT FROM OLD.contract_end_date
     OR NEW.notice_period_days    IS DISTINCT FROM OLD.notice_period_days
     OR NEW.employee_category_deprecated_unused IS DISTINCT FROM OLD.employee_category_deprecated_unused
  THEN
    RAISE EXCEPTION 'Permission denied: salary, statutory, employment and bank fields are HR-managed. Bank changes must go through the bank-account change request workflow.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public._trg_profiles_restrict_finance_update()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.current_user_role() = 'finance' AND auth.uid() IS DISTINCT FROM NEW.id THEN
    IF (to_jsonb(NEW) - 'pay_group_id' - 'employee_category_deprecated_unused')
       IS DISTINCT FROM
       (to_jsonb(OLD) - 'pay_group_id' - 'employee_category_deprecated_unused')
    THEN
      RAISE EXCEPTION 'Finance may only update pay_group_id (and, for now, the deprecated employee_category field) on another employee''s profile';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- ── 9. auto_populate_filings_from_payroll — company-scope the upserts ──────
-- Same logic as before, except every ON CONFLICT target now includes
-- company_id, so approving two companies' payroll for the same month can
-- never again overwrite each other's compliance numbers.
CREATE OR REPLACE FUNCTION public.auto_populate_filings_from_payroll(
  p_payroll_run_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run               RECORD;
  v_company_id        UUID;
  v_period            TEXT;
  v_paye_due_date     DATE;
  v_pension_due_date  DATE;
  v_nhf_due_date      DATE;
  v_nsitf_due_date    DATE;
  v_year              INT;
  v_month             INT;
  v_next_month        DATE;
  v_pension_breakdown JSONB;
  v_paye_breakdown    JSONB;
  v_nsitf_amount      NUMERIC;
  v_pension_employer  NUMERIC;
  v_summary           JSONB;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin', 'finance', 'super_admin')
  ) THEN
    RAISE EXCEPTION 'Only admin or finance roles can populate compliance filings'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_run FROM public.payroll_runs WHERE id = p_payroll_run_id;
  IF v_run IS NULL THEN
    RAISE EXCEPTION 'Payroll run % not found', p_payroll_run_id;
  END IF;

  v_company_id := v_run.company_id;
  v_period := v_run.period;
  v_year   := split_part(v_period, '-', 1)::INT;
  v_month  := split_part(v_period, '-', 2)::INT;
  v_next_month := make_date(v_year, v_month, 1) + INTERVAL '1 month';

  v_paye_due_date    := (v_next_month + INTERVAL '9 days')::DATE;
  v_pension_due_date := (v_next_month + INTERVAL '6 days')::DATE;
  v_nhf_due_date     := (v_next_month + INTERVAL '14 days')::DATE;
  v_nsitf_due_date   := (v_next_month + INTERVAL '14 days')::DATE;

  SELECT jsonb_agg(jsonb_build_object(
    'employee_id', employee_id,
    'paye_ngn', paye_ngn,
    'pension_ngn', pension_ngn,
    'nhf_ngn', nhf_ngn,
    'gross_ngn', gross_ngn
  ) ORDER BY paye_ngn DESC)
  INTO v_paye_breakdown
  FROM public.payroll_run_items
  WHERE payroll_run_id = p_payroll_run_id;

  SELECT jsonb_agg(row_to_json(g))
  INTO v_pension_breakdown
  FROM (
    SELECT
      COALESCE(eb.provider, 'Unknown PFA')                AS pfa,
      COUNT(DISTINCT pri.employee_id)                     AS rsa_count,
      ROUND(SUM(pri.pension_ngn))                         AS employee_amount_ngn,
      ROUND(SUM(pri.pension_ngn) * 1.25)                  AS employer_amount_ngn,
      ROUND(SUM(pri.pension_ngn) * 2.25)                  AS total_amount_ngn
    FROM public.payroll_run_items pri
    LEFT JOIN public.employee_benefits eb
           ON eb.employee_id = pri.employee_id
          AND eb.benefit_type = 'pension_pfa'
          AND eb.status = 'active'
    WHERE pri.payroll_run_id = p_payroll_run_id
      AND pri.pension_ngn > 0
    GROUP BY COALESCE(eb.provider, 'Unknown PFA')
    ORDER BY total_amount_ngn DESC
  ) g;

  v_nsitf_amount := ROUND(COALESCE(v_run.total_employee_ngn, 0) * 0.01);
  v_pension_employer := ROUND(COALESCE(v_run.pension_ngn, 0) * 1.25);

  INSERT INTO public.compliance_filings (
    company_id, kind, period, due_date, amount_ngn, status,
    payroll_run_id, auto_calculated_at, breakdown_json, notes
  )
  VALUES (
    v_company_id, 'paye', v_period, v_paye_due_date, v_run.paye_ngn,
    CASE WHEN v_paye_due_date < CURRENT_DATE THEN 'overdue'
         WHEN v_paye_due_date <= CURRENT_DATE + 3 THEN 'due'
         ELSE 'upcoming' END,
    p_payroll_run_id, now(), v_paye_breakdown,
    'Auto-populated from payroll ' || v_period
  )
  ON CONFLICT (company_id, kind, period) DO UPDATE SET
    amount_ngn = EXCLUDED.amount_ngn,
    payroll_run_id = EXCLUDED.payroll_run_id,
    auto_calculated_at = now(),
    breakdown_json = EXCLUDED.breakdown_json,
    due_date = COALESCE(public.compliance_filings.due_date, EXCLUDED.due_date)
  WHERE public.compliance_filings.filed_at IS NULL;

  INSERT INTO public.compliance_filings (
    company_id, kind, period, due_date, amount_ngn, status,
    payroll_run_id, auto_calculated_at, breakdown_json, notes
  )
  VALUES (
    v_company_id, 'pension', v_period, v_pension_due_date,
    COALESCE(v_run.pension_ngn, 0) + v_pension_employer,
    CASE WHEN v_pension_due_date < CURRENT_DATE THEN 'overdue'
         WHEN v_pension_due_date <= CURRENT_DATE + 3 THEN 'due'
         ELSE 'upcoming' END,
    p_payroll_run_id, now(), v_pension_breakdown,
    'Employee 8% + employer 10% — split per PFA in breakdown'
  )
  ON CONFLICT (company_id, kind, period) DO UPDATE SET
    amount_ngn = EXCLUDED.amount_ngn,
    payroll_run_id = EXCLUDED.payroll_run_id,
    auto_calculated_at = now(),
    breakdown_json = EXCLUDED.breakdown_json,
    due_date = COALESCE(public.compliance_filings.due_date, EXCLUDED.due_date)
  WHERE public.compliance_filings.filed_at IS NULL;

  IF COALESCE(v_run.nhf_ngn, 0) > 0 THEN
    INSERT INTO public.compliance_filings (
      company_id, kind, period, due_date, amount_ngn, status,
      payroll_run_id, auto_calculated_at, notes
    )
    VALUES (
      v_company_id, 'nhf', v_period, v_nhf_due_date, v_run.nhf_ngn,
      CASE WHEN v_nhf_due_date < CURRENT_DATE THEN 'overdue'
           WHEN v_nhf_due_date <= CURRENT_DATE + 3 THEN 'due'
           ELSE 'upcoming' END,
      p_payroll_run_id, now(),
      'Auto-populated NHF from payroll ' || v_period
    )
    ON CONFLICT (company_id, kind, period) DO UPDATE SET
      amount_ngn = EXCLUDED.amount_ngn,
      payroll_run_id = EXCLUDED.payroll_run_id,
      auto_calculated_at = now(),
      due_date = COALESCE(public.compliance_filings.due_date, EXCLUDED.due_date)
    WHERE public.compliance_filings.filed_at IS NULL;
  END IF;

  IF v_nsitf_amount > 0 THEN
    INSERT INTO public.compliance_filings (
      company_id, kind, period, due_date, amount_ngn, status,
      payroll_run_id, auto_calculated_at, notes
    )
    VALUES (
      v_company_id, 'nsitf', v_period, v_nsitf_due_date, v_nsitf_amount,
      CASE WHEN v_nsitf_due_date < CURRENT_DATE THEN 'overdue'
           WHEN v_nsitf_due_date <= CURRENT_DATE + 3 THEN 'due'
           ELSE 'upcoming' END,
      p_payroll_run_id, now(),
      'Auto-populated 1% NSITF (employer) from payroll ' || v_period
    )
    ON CONFLICT (company_id, kind, period) DO UPDATE SET
      amount_ngn = EXCLUDED.amount_ngn,
      payroll_run_id = EXCLUDED.payroll_run_id,
      auto_calculated_at = now(),
      due_date = COALESCE(public.compliance_filings.due_date, EXCLUDED.due_date)
    WHERE public.compliance_filings.filed_at IS NULL;
  END IF;

  v_summary := jsonb_build_object(
    'company_id', v_company_id,
    'period', v_period,
    'payroll_run_id', p_payroll_run_id,
    'paye_ngn', v_run.paye_ngn,
    'pension_employee_ngn', v_run.pension_ngn,
    'pension_employer_ngn', v_pension_employer,
    'pension_total_ngn', COALESCE(v_run.pension_ngn, 0) + v_pension_employer,
    'pfa_count', COALESCE(jsonb_array_length(v_pension_breakdown), 0),
    'nhf_ngn', COALESCE(v_run.nhf_ngn, 0),
    'nsitf_ngn', v_nsitf_amount
  );

  RETURN v_summary;
END;
$$;

COMMENT ON FUNCTION public.auto_populate_filings_from_payroll IS
  'Idempotently populates compliance_filings (PAYE, pension, NHF, NSITF) for the given payroll run with per-PFA pension breakdown, scoped to the run''s company. Never overwrites filings that have already been marked filed. Returns a JSON summary.';

-- ── 10. schedule_auto_draft — one draft PER COMPANY sharing a schedule ─────
-- pay_schedules is a shared table of schedule *definitions* ("Monthly —
-- 25th", etc.) that pay_groups from EITHER company can point to via
-- pay_groups.pay_schedule_id — it was never given its own company_id, by
-- design, since the same schedule shape is meant to be reusable. The
-- pre-existing cron function created exactly one payroll_runs row per
-- schedule per period with no company_id at all: it would now fail outright
-- (company_id is NOT NULL), and even before this migration it silently
-- merged every company sharing a schedule into a single draft. Fixed to
-- loop per (schedule, company) pair, deriving each company from whichever
-- companies have an active pay_group on that schedule — a schedule with no
-- pay_groups yet (or none active) correctly produces no draft.
CREATE OR REPLACE FUNCTION public.schedule_auto_draft()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sched      public.pay_schedules%ROWTYPE;
  v_company_id uuid;
  v_pay_date   date;
  v_cutoff     date;
  v_period     text;
  v_count      integer := 0;
BEGIN
  FOR v_sched IN
    SELECT * FROM public.pay_schedules WHERE is_active = true
  LOOP
    SELECT pay_date INTO v_pay_date
    FROM public.next_pay_dates(v_sched.id, 1)
    LIMIT 1;

    CONTINUE WHEN v_pay_date IS NULL;
    CONTINUE WHEN current_date < (v_pay_date - v_sched.processing_lead_days);

    v_cutoff := v_pay_date - v_sched.cutoff_lead_days;

    IF v_sched.frequency IN ('weekly', 'biweekly') THEN
      v_period := to_char(v_pay_date, 'IYYY-"W"IW');
    ELSE
      v_period := to_char(v_pay_date - interval '1 month', 'YYYY-MM');
    END IF;

    FOR v_company_id IN
      SELECT DISTINCT pg.company_id
      FROM public.pay_groups pg
      WHERE pg.pay_schedule_id = v_sched.id
        AND pg.is_active = true
    LOOP
      CONTINUE WHEN EXISTS (
        SELECT 1 FROM public.payroll_runs
        WHERE pay_schedule_id = v_sched.id
          AND period = v_period
          AND company_id = v_company_id
      );

      INSERT INTO public.payroll_runs (
        company_id, period, status, pay_schedule_id, pay_date,
        cutoff_date, is_auto_generated,
        total_contractor_ngn, total_employee_ngn,
        total_expenses_ngn, paye_ngn, pension_ngn,
        nhf_ngn, total_burn_ngn
      ) VALUES (
        v_company_id, v_period,
        'draft',
        v_sched.id, v_pay_date,
        v_cutoff, true,
        0, 0, 0, 0, 0, 0, 0
      );

      v_count := v_count + 1;
    END LOOP;
  END LOOP;

  RETURN v_count;
END;
$$;
