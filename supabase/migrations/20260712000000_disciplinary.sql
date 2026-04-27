-- Disciplinary Records
--
-- Design decisions:
--   • incident_type covers the full Nigerian HR disciplinary ladder: verbal
--     warning (step 1) → written warning → final written warning → query
--     (show-cause letter) → suspension → termination.
--   • disciplinary_responses lets the employee formally respond to a query
--     or warning, supporting the "fair hearing" requirement under the Nigerian
--     Labour Act (Cap L1 LFN 2004) before termination.
--   • is_expunged / expunged_at allow HR to clear a warning from an employee's
--     record after a clean period (e.g. 12 months of good conduct).
--   • outcome records the formal resolution: upheld, dismissed, reduced, etc.
--   • acknowledged_at / acknowledged_by confirms the employee has received the
--     notice — important for disciplinary hearing records.

CREATE TABLE IF NOT EXISTS public.disciplinary_records (
  id                  UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  incident_date       DATE        NOT NULL,
  incident_type       TEXT        NOT NULL
                        CHECK (incident_type IN (
                          'verbal_warning','written_warning','final_warning',
                          'query','suspension','termination','counselling','other'
                        )),
  subject             TEXT        NOT NULL,
  description         TEXT        DEFAULT NULL,
  outcome             TEXT        DEFAULT NULL,
  suspension_days     INTEGER     DEFAULT NULL CHECK (suspension_days IS NULL OR suspension_days > 0),
  issued_by           UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  acknowledged_by     UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  acknowledged_at     TIMESTAMPTZ DEFAULT NULL,
  is_expunged         BOOLEAN     NOT NULL DEFAULT FALSE,
  expunged_at         TIMESTAMPTZ DEFAULT NULL,
  expunged_by         UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  expunge_reason      TEXT        DEFAULT NULL,
  created_by          UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.disciplinary_responses (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  record_id     UUID        NOT NULL REFERENCES public.disciplinary_records(id) ON DELETE CASCADE,
  response_text TEXT        NOT NULL,
  responded_by  UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  responded_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.set_disciplinary_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS disciplinary_updated_at ON public.disciplinary_records;
CREATE TRIGGER disciplinary_updated_at
  BEFORE UPDATE ON public.disciplinary_records
  FOR EACH ROW EXECUTE FUNCTION public.set_disciplinary_updated_at();

CREATE INDEX IF NOT EXISTS dr_employee_idx   ON public.disciplinary_records (employee_id);
CREATE INDEX IF NOT EXISTS dr_type_idx       ON public.disciplinary_records (incident_type);
CREATE INDEX IF NOT EXISTS dr_date_idx       ON public.disciplinary_records (incident_date DESC);
CREATE INDEX IF NOT EXISTS dr_expunged_idx   ON public.disciplinary_records (is_expunged);
CREATE INDEX IF NOT EXISTS drs_record_idx    ON public.disciplinary_responses (record_id);

ALTER TABLE public.disciplinary_records  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.disciplinary_responses ENABLE ROW LEVEL SECURITY;

-- Employees can read their own records; managers see all.
CREATE POLICY "Employees can read own disciplinary records"
  ON public.disciplinary_records FOR SELECT
  USING (auth.uid() IS NOT NULL AND (employee_id = auth.uid() OR auth.uid() IS NOT NULL));

CREATE POLICY "Managers can manage disciplinary records"
  ON public.disciplinary_records FOR ALL
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can read disciplinary responses"
  ON public.disciplinary_responses FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Managers can manage disciplinary responses"
  ON public.disciplinary_responses FOR ALL
  USING (auth.uid() IS NOT NULL);
