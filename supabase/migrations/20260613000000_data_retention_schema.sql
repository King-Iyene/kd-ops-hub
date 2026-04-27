-- ─────────────────────────────────────────────────────────────────────────
-- Data Retention: schema + edge function support
--
-- Phase 2 of Settings → Data Retention. Adds:
--   • retention_policies — one row per data type that can be archived/cleaned
--   • retention_runs     — audit history (one row per cleanup run)
--   • storage.bucket "archives" — private bucket holding compressed archives
--
-- Rows are created (not updated) for each policy on first save by the UI.
-- Cleanup is performed by the data-retention-runner edge function which
-- reads enabled policies, archives matching rows to a JSON file in the
-- archives bucket, optionally deletes them, and logs to retention_runs.
--
-- Safety properties enforced here (in addition to the UI guards):
--   • RLS allows admin / super_admin only.
--   • all_paused boolean lets a single click pause every policy.
--   • A scheduled_first_run_at field forces the 7-day delay before first run.
--   • Documents are NOT a valid data_type (preventing accidental deletion of
--     legal records). Allowed: audit_logs, notifications, receipts.
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.retention_policies (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data_type       text NOT NULL UNIQUE
                  CHECK (data_type IN ('audit_logs', 'notifications', 'receipts')),
  mode            text NOT NULL DEFAULT 'off'
                  CHECK (mode IN ('off', 'archive', 'archive_delete')),
  retention_days  integer NOT NULL DEFAULT 365
                  CHECK (retention_days >= 30 AND retention_days <= 4000),
  enabled_by      uuid REFERENCES public.profiles(id),
  enabled_at      timestamptz,
  scheduled_first_run_at timestamptz,
  last_run_at     timestamptz,
  last_run_count  integer,
  last_run_status text,
  all_paused      boolean NOT NULL DEFAULT false,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.retention_runs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id       uuid REFERENCES public.retention_policies(id) ON DELETE CASCADE,
  data_type       text NOT NULL,
  mode            text NOT NULL,
  cutoff_date     timestamptz NOT NULL,
  started_at      timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz,
  items_archived  integer DEFAULT 0,
  items_deleted   integer DEFAULT 0,
  archive_path    text,
  status          text NOT NULL DEFAULT 'running'
                  CHECK (status IN ('running', 'success', 'partial', 'failed')),
  error_message   text,
  triggered_by    uuid REFERENCES public.profiles(id)
);

CREATE INDEX IF NOT EXISTS retention_runs_policy_idx ON public.retention_runs(policy_id, started_at DESC);
CREATE INDEX IF NOT EXISTS retention_runs_started_idx ON public.retention_runs(started_at DESC);

ALTER TABLE public.retention_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retention_runs     ENABLE ROW LEVEL SECURITY;

-- ── Policies: admin / super_admin only ───────────────────────────────────
DROP POLICY IF EXISTS "retention_policies_admin_all" ON public.retention_policies;
CREATE POLICY "retention_policies_admin_all" ON public.retention_policies
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin'))
  );

DROP POLICY IF EXISTS "retention_runs_admin_select" ON public.retention_runs;
CREATE POLICY "retention_runs_admin_select" ON public.retention_runs
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin'))
  );

DROP POLICY IF EXISTS "retention_runs_admin_insert" ON public.retention_runs;
CREATE POLICY "retention_runs_admin_insert" ON public.retention_runs
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin'))
  );

-- ── Auto updated_at on retention_policies ────────────────────────────────
CREATE OR REPLACE FUNCTION public.touch_retention_policies()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS retention_policies_touch ON public.retention_policies;
CREATE TRIGGER retention_policies_touch
  BEFORE UPDATE ON public.retention_policies
  FOR EACH ROW EXECUTE FUNCTION public.touch_retention_policies();

-- ── Archives storage bucket (private) ────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('archives', 'archives', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Admins read archives" ON storage.objects;
CREATE POLICY "Admins read archives" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'archives'
    AND EXISTS (SELECT 1 FROM public.profiles p
                WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin'))
  );

DROP POLICY IF EXISTS "Service-role writes archives" ON storage.objects;
CREATE POLICY "Service-role writes archives" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'archives'
    AND EXISTS (SELECT 1 FROM public.profiles p
                WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin'))
  );

NOTIFY pgrst, 'reload schema';
