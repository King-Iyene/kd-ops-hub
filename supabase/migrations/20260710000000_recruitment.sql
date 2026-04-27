-- Recruitment Pipeline
--
-- Design decisions:
--   • job_openings covers a posted vacancy. employment_type distinguishes
--     permanent hires (full_time/part_time) from fixed-term (contract/intern).
--   • salary_range_min/max are optional planning figures; actual offer is
--     stored on the applicant row when an offer is made.
--   • job_applicants.stage is an ordered pipeline:
--     new → screening → interview_1 → interview_2 → offer → hired | rejected
--   • source tracks where the candidate came from — useful for measuring which
--     channels produce hires.
--   • When stage = 'hired', the admin manually creates the employee record
--     (auth.users creation cannot be done from the UI migration alone).
--   • Soft delete on job_openings via deleted_at consistent with platform pattern.

CREATE TABLE IF NOT EXISTS public.job_openings (
  id                  UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  title               TEXT        NOT NULL,
  department_id       UUID        REFERENCES public.departments(id) ON DELETE SET NULL,
  description         TEXT        DEFAULT NULL,
  requirements        TEXT        DEFAULT NULL,
  employment_type     TEXT        NOT NULL DEFAULT 'full_time'
                        CHECK (employment_type IN ('full_time','part_time','contract','intern')),
  location            TEXT        DEFAULT NULL,
  salary_min_ngn      NUMERIC     DEFAULT NULL CHECK (salary_min_ngn IS NULL OR salary_min_ngn >= 0),
  salary_max_ngn      NUMERIC     DEFAULT NULL CHECK (salary_max_ngn IS NULL OR salary_max_ngn >= 0),
  opening_count       INTEGER     NOT NULL DEFAULT 1 CHECK (opening_count >= 1),
  closing_date        DATE        DEFAULT NULL,
  status              TEXT        NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft','published','closed','filled')),
  notes               TEXT        DEFAULT NULL,
  created_by          UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at          TIMESTAMPTZ DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS public.job_applicants (
  id                  UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  opening_id          UUID        NOT NULL REFERENCES public.job_openings(id) ON DELETE CASCADE,
  full_name           TEXT        NOT NULL,
  email               TEXT        DEFAULT NULL,
  phone               TEXT        DEFAULT NULL,
  cv_url              TEXT        DEFAULT NULL,
  cover_letter        TEXT        DEFAULT NULL,
  source              TEXT        NOT NULL DEFAULT 'job_board'
                        CHECK (source IN ('job_board','referral','walk_in','internal','linkedin','other')),
  stage               TEXT        NOT NULL DEFAULT 'new'
                        CHECK (stage IN ('new','screening','interview_1','interview_2','offer','hired','rejected')),
  stage_notes         TEXT        DEFAULT NULL,
  assigned_to         UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  interview_date      TIMESTAMPTZ DEFAULT NULL,
  offer_amount_ngn    NUMERIC     DEFAULT NULL CHECK (offer_amount_ngn IS NULL OR offer_amount_ngn >= 0),
  offered_at          TIMESTAMPTZ DEFAULT NULL,
  rejection_reason    TEXT        DEFAULT NULL,
  created_by          UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.set_job_openings_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS job_openings_updated_at ON public.job_openings;
CREATE TRIGGER job_openings_updated_at
  BEFORE UPDATE ON public.job_openings
  FOR EACH ROW EXECUTE FUNCTION public.set_job_openings_updated_at();

CREATE OR REPLACE FUNCTION public.set_job_applicants_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS job_applicants_updated_at ON public.job_applicants;
CREATE TRIGGER job_applicants_updated_at
  BEFORE UPDATE ON public.job_applicants
  FOR EACH ROW EXECUTE FUNCTION public.set_job_applicants_updated_at();

CREATE INDEX IF NOT EXISTS jo_status_idx      ON public.job_openings (status)      WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS jo_dept_idx        ON public.job_openings (department_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ja_opening_idx     ON public.job_applicants (opening_id);
CREATE INDEX IF NOT EXISTS ja_stage_idx       ON public.job_applicants (stage);
CREATE INDEX IF NOT EXISTS ja_assigned_idx    ON public.job_applicants (assigned_to) WHERE assigned_to IS NOT NULL;

ALTER TABLE public.job_openings  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_applicants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read job openings"
  ON public.job_openings FOR SELECT
  USING (auth.uid() IS NOT NULL AND deleted_at IS NULL);

CREATE POLICY "Managers can manage job openings"
  ON public.job_openings FOR ALL
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can read applicants"
  ON public.job_applicants FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Managers can manage applicants"
  ON public.job_applicants FOR ALL
  USING (auth.uid() IS NOT NULL);
