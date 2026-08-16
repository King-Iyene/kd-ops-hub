-- Performance module enhancements
--
-- development_plans: the TypeScript interface for this has existed for a
-- while but there was never a backing table or UI tab. This adds both.
-- A plan can stand alone (review_id NULL) or be tied to a specific review's
-- development_plan discussion.
--
-- No org_id column: this codebase has no multi-tenant `organizations` table
-- pattern anywhere else (checked all prior migrations), so it's skipped here
-- to match every other HR table (performance_reviews, goals, etc).

CREATE TABLE IF NOT EXISTS public.development_plans (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  review_id   UUID        REFERENCES public.performance_reviews(id) ON DELETE SET NULL,
  title       TEXT        NOT NULL,
  description TEXT,
  category    TEXT        NOT NULL DEFAULT 'other'
                CHECK (category IN ('technical', 'leadership', 'communication', 'domain', 'other')),
  target_date DATE,
  status      TEXT        NOT NULL DEFAULT 'not_started'
                CHECK (status IN ('not_started', 'in_progress', 'completed', 'cancelled')),
  progress    INTEGER     NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  created_by  UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.set_development_plans_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS development_plans_updated_at ON public.development_plans;
CREATE TRIGGER development_plans_updated_at
  BEFORE UPDATE ON public.development_plans
  FOR EACH ROW EXECUTE FUNCTION public.set_development_plans_updated_at();

CREATE INDEX IF NOT EXISTS dp_employee_idx     ON public.development_plans (employee_id);
CREATE INDEX IF NOT EXISTS dp_review_idx       ON public.development_plans (review_id);
CREATE INDEX IF NOT EXISTS dp_status_idx       ON public.development_plans (status);
CREATE INDEX IF NOT EXISTS dp_target_date_idx  ON public.development_plans (target_date);

ALTER TABLE public.development_plans ENABLE ROW LEVEL SECURITY;

-- Employees see their own plans; managers/HR-ish roles see everyone's, same
-- shape as "Managers can read all performance reviews" above.
DROP POLICY IF EXISTS "Users can read own development plans" ON public.development_plans;
CREATE POLICY "Users can read own development plans"
  ON public.development_plans FOR SELECT TO authenticated
  USING (
    employee_id = auth.uid()
    OR created_by = auth.uid()
    OR public.current_user_role() IN ('super_admin', 'admin', 'finance', 'operations')
  );

DROP POLICY IF EXISTS "Managers can insert development plans" ON public.development_plans;
CREATE POLICY "Managers can insert development plans"
  ON public.development_plans FOR INSERT TO authenticated
  WITH CHECK (
    employee_id = auth.uid()
    OR public.current_user_role() IN ('super_admin', 'admin', 'finance', 'operations')
  );

DROP POLICY IF EXISTS "Owners can update development plans" ON public.development_plans;
CREATE POLICY "Owners can update development plans"
  ON public.development_plans FOR UPDATE TO authenticated
  USING (
    employee_id = auth.uid()
    OR created_by = auth.uid()
    OR public.current_user_role() IN ('super_admin', 'admin', 'finance', 'operations')
  );

DROP POLICY IF EXISTS "Managers can delete development plans" ON public.development_plans;
CREATE POLICY "Managers can delete development plans"
  ON public.development_plans FOR DELETE TO authenticated
  USING (public.current_user_role() IN ('super_admin', 'admin', 'finance', 'operations'));
