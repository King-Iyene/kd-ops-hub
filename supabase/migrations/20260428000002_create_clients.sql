-- Client tracking module
-- Tracks active clients, prospects, and inactive accounts with
-- contract values, contact info, and soft-delete support.

CREATE TABLE IF NOT EXISTS public.clients (
  id                  UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
  name                TEXT         NOT NULL,
  industry            TEXT         DEFAULT NULL,
  status              TEXT         NOT NULL DEFAULT 'prospect'
                        CHECK (status IN ('active', 'inactive', 'prospect')),
  contract_value_ngn  NUMERIC      DEFAULT 0 NOT NULL
                        CHECK (contract_value_ngn >= 0 AND contract_value_ngn <= 5000000000),
  contact_person      TEXT         DEFAULT NULL,
  email               TEXT         DEFAULT NULL,
  phone               TEXT         DEFAULT NULL,
  website             TEXT         DEFAULT NULL,
  address             TEXT         DEFAULT NULL,
  start_date          DATE         DEFAULT NULL,
  notes               TEXT         DEFAULT NULL,
  created_by          UUID         REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ  DEFAULT now() NOT NULL,
  updated_at          TIMESTAMPTZ  DEFAULT now() NOT NULL,
  deleted_at          TIMESTAMPTZ  DEFAULT NULL
);

-- Keep updated_at current automatically
CREATE OR REPLACE FUNCTION public.set_clients_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS clients_updated_at ON public.clients;
CREATE TRIGGER clients_updated_at
  BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.set_clients_updated_at();

-- Performance indexes
CREATE INDEX IF NOT EXISTS clients_status_idx
  ON public.clients (status) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS clients_name_idx
  ON public.clients (lower(name)) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS clients_deleted_at_idx
  ON public.clients (deleted_at);

-- Row Level Security
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read clients"
  ON public.clients FOR SELECT
  USING (auth.uid() IS NOT NULL AND deleted_at IS NULL);

CREATE POLICY "Managers can insert clients"
  ON public.clients FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Managers can update clients"
  ON public.clients FOR UPDATE
  USING (auth.uid() IS NOT NULL);
