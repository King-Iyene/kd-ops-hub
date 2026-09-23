-- Automation engine: run history, scheduler support, and transition tracking
-- Part of Phase 3-4 of the automation engine build

-- 1. Automation runs table — logs every execution with full context
CREATE TABLE IF NOT EXISTS nc_meta.automation_runs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id UUID NOT NULL REFERENCES nc_meta.automations(id) ON DELETE CASCADE,
  trigger_event TEXT NOT NULL,                -- record.created | record.updated | record.deleted | scheduled
  record_id     TEXT,                         -- the triggering record's ID (null for scheduled)
  status        TEXT NOT NULL DEFAULT 'running'
                CHECK (status IN ('running','success','partial','error','skipped')),
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at   TIMESTAMPTZ,
  duration_ms   INTEGER,
  action_results JSONB DEFAULT '[]'::jsonb,   -- [{actionId, type, success, error?, durationMs}]
  error_message TEXT,
  context       JSONB DEFAULT '{}'::jsonb,    -- {record, oldRecord} snapshot for debugging
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_automation_runs_automation ON nc_meta.automation_runs(automation_id);
CREATE INDEX idx_automation_runs_status     ON nc_meta.automation_runs(status);
CREATE INDEX idx_automation_runs_started    ON nc_meta.automation_runs(started_at DESC);

-- RLS: authenticated users can read all runs (same pattern as automations table)
ALTER TABLE nc_meta.automation_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read automation runs"
  ON nc_meta.automation_runs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert automation runs"
  ON nc_meta.automation_runs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Service role full access to automation runs"
  ON nc_meta.automation_runs FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 2. Add scheduling and tracking columns to automations table
ALTER TABLE nc_meta.automations
  ADD COLUMN IF NOT EXISTS last_run_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS run_count     INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error    TEXT,
  ADD COLUMN IF NOT EXISTS schedule_cron TEXT;          -- cron expression for scheduled triggers

-- 3. Transition state tracking — stores which records currently match conditions
--    Used to detect FROM not-matching TO matching transitions
CREATE TABLE IF NOT EXISTS nc_meta.automation_condition_state (
  automation_id UUID NOT NULL REFERENCES nc_meta.automations(id) ON DELETE CASCADE,
  record_id     TEXT NOT NULL,
  matched       BOOLEAN NOT NULL DEFAULT false,
  checked_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (automation_id, record_id)
);

ALTER TABLE nc_meta.automation_condition_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role manages condition state"
  ON nc_meta.automation_condition_state FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can read condition state"
  ON nc_meta.automation_condition_state FOR SELECT TO authenticated USING (true);
