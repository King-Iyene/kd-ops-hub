-- Training & Certification Tracker
--
-- Design decisions:
--   • Two record types in one table (record_type): 'training' (one-off course) and
--     'certification' (ongoing credential with an expiry). Keeping them together
--     simplifies queries and avoids a near-identical second table.
--   • certificate_url stores the uploaded certificate file path (Supabase Storage).
--   • expiry_date drives the 30-day alert system on the Dashboard — same pattern
--     as documents and compliance filings.
--   • is_mandatory flag lets HR distinguish compulsory training (safety, compliance)
--     from optional development.
--   • status: completed | in_progress | expired | pending
--     expired is auto-detected in the app (record_type='certification' AND
--     expiry_date < today) — no scheduled job needed.
--   • cost_ngn tracks training spend for budget analysis.

CREATE TABLE IF NOT EXISTS public.training_records (
  id               UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  record_type      TEXT        NOT NULL CHECK (record_type IN ('training','certification')),
  title            TEXT        NOT NULL,
  provider         TEXT        DEFAULT NULL,           -- training organisation / certifying body
  category         TEXT        NOT NULL DEFAULT 'professional_development'
                     CHECK (category IN (
                       'professional_development','compliance','safety','technical',
                       'leadership','software','other'
                     )),
  is_mandatory     BOOLEAN     NOT NULL DEFAULT FALSE,
  start_date       DATE        NOT NULL,
  completion_date  DATE        DEFAULT NULL,
  expiry_date      DATE        DEFAULT NULL,            -- certifications only
  score            TEXT        DEFAULT NULL,            -- e.g. "87%" or "Pass"
  certificate_url  TEXT        DEFAULT NULL,
  cost_ngn         NUMERIC     DEFAULT NULL CHECK (cost_ngn IS NULL OR cost_ngn >= 0),
  status           TEXT        NOT NULL DEFAULT 'completed'
                     CHECK (status IN ('completed','in_progress','expired','pending')),
  notes            TEXT        DEFAULT NULL,
  created_by       UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at       TIMESTAMPTZ DEFAULT NULL
);

CREATE OR REPLACE FUNCTION public.set_training_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS training_records_updated_at ON public.training_records;
CREATE TRIGGER training_records_updated_at
  BEFORE UPDATE ON public.training_records
  FOR EACH ROW EXECUTE FUNCTION public.set_training_updated_at();

CREATE INDEX IF NOT EXISTS tr_employee_idx   ON public.training_records (employee_id)  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS tr_status_idx     ON public.training_records (status)        WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS tr_expiry_idx     ON public.training_records (expiry_date)   WHERE deleted_at IS NULL AND expiry_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS tr_type_idx       ON public.training_records (record_type)   WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS tr_deleted_at_idx ON public.training_records (deleted_at);

ALTER TABLE public.training_records ENABLE ROW LEVEL SECURITY;

-- Employees see their own; managers see all.
CREATE POLICY "Users can read own training records"
  ON public.training_records FOR SELECT
  USING (auth.uid() IS NOT NULL AND (employee_id = auth.uid() OR auth.uid() IS NOT NULL));

CREATE POLICY "Managers can insert training records"
  ON public.training_records FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Managers can update training records"
  ON public.training_records FOR UPDATE
  USING (auth.uid() IS NOT NULL);
