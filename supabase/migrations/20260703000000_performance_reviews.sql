-- Performance Review System
--
-- Design decisions:
--   • review_cycles is the parent: one cycle = one review period (e.g. "Q2 2026").
--   • performance_reviews: one row per (cycle, employee, reviewer, review_type).
--     A manager review and a self-assessment for the same employee in the same
--     cycle are two separate rows — keeps queries simple.
--   • ratings JSONB: {"communication":4,"delivery":5,"leadership":3,"teamwork":4,"initiative":3}
--     Stored as JSONB so the competency list can evolve without a schema change.
--   • overall_rating computed by the application (average of ratings) and stored
--     for fast sorting/reporting.
--   • development_plan JSONB: [{goal, action, due_date, status}]
--   • Status flow: draft → submitted → acknowledged
--   • cycle_type includes 'probation' for 3-month new-hire reviews — common in Nigeria.

CREATE TABLE IF NOT EXISTS public.review_cycles (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  name        TEXT        NOT NULL,          -- "Q2 2026 Performance Review"
  cycle_type  TEXT        NOT NULL
                CHECK (cycle_type IN ('annual','mid_year','quarterly','probation')),
  period_start DATE       NOT NULL,
  period_end   DATE       NOT NULL,
  due_date     DATE       NOT NULL,          -- deadline for all reviews to be submitted
  status      TEXT        NOT NULL DEFAULT 'active'
                CHECK (status IN ('active','closed')),
  created_by  UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT review_cycle_dates_check CHECK (period_end >= period_start)
);

CREATE TABLE IF NOT EXISTS public.performance_reviews (
  id               UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
  cycle_id         UUID         NOT NULL REFERENCES public.review_cycles(id) ON DELETE CASCADE,
  employee_id      UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reviewer_id      UUID         NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  review_type      TEXT         NOT NULL CHECK (review_type IN ('manager','self','peer')),
  ratings          JSONB        NOT NULL DEFAULT '{}',
  -- keys: communication | delivery | leadership | teamwork | initiative
  -- values: 1 (needs improvement) … 5 (exceptional)
  overall_rating   NUMERIC      DEFAULT NULL CHECK (overall_rating IS NULL OR (overall_rating BETWEEN 1 AND 5)),
  strengths        TEXT         DEFAULT NULL,
  areas_for_growth TEXT         DEFAULT NULL,
  development_plan JSONB        NOT NULL DEFAULT '[]',
  -- [{id, goal, action, due_date, status: open|in_progress|done}]
  status           TEXT         NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft','submitted','acknowledged')),
  submitted_at     TIMESTAMPTZ  DEFAULT NULL,
  acknowledged_at  TIMESTAMPTZ  DEFAULT NULL,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  UNIQUE (cycle_id, employee_id, reviewer_id, review_type)
);

CREATE OR REPLACE FUNCTION public.set_review_cycles_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS review_cycles_updated_at ON public.review_cycles;
CREATE TRIGGER review_cycles_updated_at
  BEFORE UPDATE ON public.review_cycles
  FOR EACH ROW EXECUTE FUNCTION public.set_review_cycles_updated_at();

CREATE OR REPLACE FUNCTION public.set_performance_reviews_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS performance_reviews_updated_at ON public.performance_reviews;
CREATE TRIGGER performance_reviews_updated_at
  BEFORE UPDATE ON public.performance_reviews
  FOR EACH ROW EXECUTE FUNCTION public.set_performance_reviews_updated_at();

CREATE INDEX IF NOT EXISTS rc_status_idx        ON public.review_cycles (status);
CREATE INDEX IF NOT EXISTS rc_due_date_idx      ON public.review_cycles (due_date);
CREATE INDEX IF NOT EXISTS pr_cycle_idx         ON public.performance_reviews (cycle_id);
CREATE INDEX IF NOT EXISTS pr_employee_idx      ON public.performance_reviews (employee_id);
CREATE INDEX IF NOT EXISTS pr_reviewer_idx      ON public.performance_reviews (reviewer_id);
CREATE INDEX IF NOT EXISTS pr_status_idx        ON public.performance_reviews (status);

ALTER TABLE public.review_cycles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.performance_reviews  ENABLE ROW LEVEL SECURITY;

-- Everyone can see open cycles (to know a review period is active).
CREATE POLICY "Authenticated users can read review cycles"
  ON public.review_cycles FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Managers can manage review cycles"
  ON public.review_cycles FOR ALL
  USING (auth.uid() IS NOT NULL);

-- Employees see reviews where they are the employee or the reviewer.
CREATE POLICY "Users can read own performance reviews"
  ON public.performance_reviews FOR SELECT
  USING (auth.uid() IS NOT NULL AND (employee_id = auth.uid() OR reviewer_id = auth.uid()));

CREATE POLICY "Managers can read all performance reviews"
  ON public.performance_reviews FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can insert own reviews"
  ON public.performance_reviews FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND reviewer_id = auth.uid());

CREATE POLICY "Reviewers can update their own reviews before acknowledgement"
  ON public.performance_reviews FOR UPDATE
  USING (auth.uid() IS NOT NULL);
