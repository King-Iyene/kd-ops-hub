-- Track Flutterwave reconciliation runs for auditability.
-- Each invocation of the flutterwave-reconciliation edge function
-- records a row so finance can see when reconciliation happened,
-- who triggered it, and the outcome.

CREATE TABLE IF NOT EXISTS public.reconciliation_runs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider      text NOT NULL DEFAULT 'flutterwave',
  triggered_by  uuid REFERENCES auth.users(id),
  trigger_type  text NOT NULL DEFAULT 'manual',
  started_at    timestamptz NOT NULL DEFAULT now(),
  completed_at  timestamptz,
  items_checked integer NOT NULL DEFAULT 0,
  succeeded     integer NOT NULL DEFAULT 0,
  failed        integer NOT NULL DEFAULT 0,
  unchanged     integer NOT NULL DEFAULT 0,
  error_message text,
  metadata      jsonb DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.reconciliation_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reconciliation_runs_read" ON public.reconciliation_runs;
CREATE POLICY "reconciliation_runs_read" ON public.reconciliation_runs
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('super_admin', 'admin', 'operations')
    )
  );

DROP POLICY IF EXISTS "reconciliation_runs_service_insert" ON public.reconciliation_runs;
CREATE POLICY "reconciliation_runs_service_insert" ON public.reconciliation_runs
  FOR INSERT TO service_role WITH CHECK (true);

DROP POLICY IF EXISTS "reconciliation_runs_service_update" ON public.reconciliation_runs;
CREATE POLICY "reconciliation_runs_service_update" ON public.reconciliation_runs
  FOR UPDATE TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE public.reconciliation_runs IS 'Audit trail for payment reconciliation executions';
