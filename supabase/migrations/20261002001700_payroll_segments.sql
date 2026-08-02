-- ═══════════════════════════════════════════════════════════════════════════════
-- Payroll segments — reusable employee filters for selective payroll runs
-- ─────────────────────────────────────────────────────────────────────────────
-- Problem: creating a payroll draft or generating payslips always pulls every
-- active, non-driver employee with a salary. There is no way to run payroll
-- for just a subset (e.g. "everyone except directors", "administrative staff
-- only") without manually excluding people by hand each time.
--
-- This migration is purely additive:
--   1. profiles.employee_category — a new, nullable classification field
--      (administrative / domestic / security / executive / contractor).
--      NULL by default, so every existing row is unaffected until someone
--      tags it.
--   2. payroll_segments — named, reusable filter definitions. Filter logic
--      is evaluated in application code (src/lib/payroll-segments.ts), NOT
--      in SQL, so it stays simple, testable, and impossible to get wrong
--      with dynamic SQL.
--   3. payroll_runs.payroll_segment_id — nullable FK. NULL means "no
--      segment applied" — the exact current behavior (every active
--      non-driver employee with a salary). Existing and future runs that
--      never set this column behave identically to before this migration.
--
-- Note: this is a DIFFERENT concept from the existing `pay_groups` table
-- (added in 20260812200000_payroll_world_class.sql), which binds each
-- employee to exactly one payment SCHEDULE (weekly/monthly cadence — a
-- strict 1:1 partition). payroll_segments are reusable, possibly-
-- overlapping filters used to pick WHICH employees are included in a given
-- run — orthogonal to when they get paid.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. profiles.employee_category ───────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS employee_category text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_employee_category_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_employee_category_check
      CHECK (employee_category IS NULL OR employee_category IN (
        'administrative', 'domestic', 'security', 'executive', 'contractor'
      ));
  END IF;
END $$;

COMMENT ON COLUMN public.profiles.employee_category IS
  'Optional classification used by payroll_segments to filter who is included in a given payroll run (e.g. exclude "executive" or "domestic" from a run). NULL = uncategorized.';

-- ── 2. payroll_segments ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payroll_segments (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text        NOT NULL,
  description  text,
  -- Shape (all keys optional, evaluated as AND across dimensions):
  --   include_employee_categories: text[]
  --   exclude_employee_categories: text[]
  --   include_department_ids:      uuid[] (as text)
  --   exclude_department_ids:      uuid[] (as text)
  --   include_employment_types:    text[]
  --   exclude_employment_types:    text[]
  --   exclude_employee_ids:        uuid[] (as text) — manual one-off overrides
  filter_rules jsonb       NOT NULL DEFAULT '{}'::jsonb,
  is_active    boolean     NOT NULL DEFAULT true,
  created_by   uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- Uniqueness only among active segments — deleteSegment() in the UI
-- soft-deactivates (is_active = false) rather than hard-deletes, so a
-- retired name must be reusable for a new pay group.
CREATE UNIQUE INDEX IF NOT EXISTS idx_payroll_segments_active_name
  ON public.payroll_segments (name) WHERE is_active;

ALTER TABLE public.payroll_segments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "finance_admin_manage_payroll_segments" ON public.payroll_segments;
CREATE POLICY "finance_admin_manage_payroll_segments"
  ON public.payroll_segments FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('super_admin', 'admin', 'finance')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('super_admin', 'admin', 'finance')
    )
  );

CREATE OR REPLACE FUNCTION public.set_payroll_segments_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payroll_segments_updated_at ON public.payroll_segments;
CREATE TRIGGER trg_payroll_segments_updated_at
  BEFORE UPDATE ON public.payroll_segments
  FOR EACH ROW EXECUTE FUNCTION public.set_payroll_segments_updated_at();

-- ── 3. payroll_runs.payroll_segment_id ──────────────────────────────────────
ALTER TABLE public.payroll_runs
  ADD COLUMN IF NOT EXISTS payroll_segment_id uuid
    REFERENCES public.payroll_segments(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.payroll_runs.payroll_segment_id IS
  'Optional payroll_segments filter applied when this run was drafted. NULL = no filter, every active non-driver salaried employee is included (unchanged legacy behavior).';

-- ── 4. Seed a single safe default segment ───────────────────────────────────
-- Only "All Staff" is seeded — an empty filter that is functionally
-- identical to today's behavior. We deliberately do NOT seed category-based
-- segments (e.g. "excl. Executives") because employee_category starts NULL
-- for everyone; a segment filtering on it would silently return the same
-- "everyone" result until employees are actually tagged, which would be
-- confusing. Users create their own segments once they've categorized staff.
INSERT INTO public.payroll_segments (name, description, filter_rules, is_active)
VALUES (
  'All Staff',
  'Every active, salaried employee — the same set used for payroll runs today.',
  '{}'::jsonb,
  true
)
ON CONFLICT (name) WHERE is_active DO NOTHING;
