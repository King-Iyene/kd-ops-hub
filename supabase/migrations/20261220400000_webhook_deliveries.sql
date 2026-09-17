-- Webhook delivery log. Until now, webhook-dispatcher only ever wrote a
-- rolling failure_count/last_triggered_at onto nc_meta.webhooks — a webhook
-- could fail 9 times, auto-deactivate on the 10th (increment_webhook_failure),
-- and the developer would have zero record of *why*: no status code, no
-- response body, no error, no timestamps for individual attempts. The only
-- diagnostic tool was the manual "Test" ping, which doesn't reflect real
-- traffic. This table gives every real delivery attempt a row.

CREATE TABLE IF NOT EXISTS nc_meta.webhook_deliveries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id      UUID NOT NULL REFERENCES nc_meta.webhooks(id) ON DELETE CASCADE,
  event           TEXT NOT NULL,
  base_id         UUID,
  table_id        UUID,
  request_url     TEXT NOT NULL,
  success         BOOLEAN NOT NULL,
  response_status INTEGER,
  response_body   TEXT,
  error_message   TEXT,
  duration_ms     INTEGER,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_webhook_recent
  ON nc_meta.webhook_deliveries (webhook_id, created_at DESC);

ALTER TABLE nc_meta.webhook_deliveries ENABLE ROW LEVEL SECURITY;

-- Same ownership model as nc_meta.webhooks itself: a delivery is visible to
-- whoever created the webhook it belongs to. Inserts come only from the
-- webhook-dispatcher edge function via the service-role key, which bypasses
-- RLS, so no INSERT policy is needed for the authenticated role.
DROP POLICY IF EXISTS "Authenticated users can view their webhook deliveries" ON nc_meta.webhook_deliveries;
CREATE POLICY "Authenticated users can view their webhook deliveries"
  ON nc_meta.webhook_deliveries FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM nc_meta.webhooks w
    WHERE w.id = webhook_deliveries.webhook_id AND w.created_by = auth.uid()
  ));

-- Retention: keep only the most recent 50 deliveries per webhook so this
-- table can't grow unbounded for a chatty webhook. Trimmed after each
-- insert rather than via a separate cron job.
CREATE OR REPLACE FUNCTION nc_meta.trim_webhook_deliveries()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM nc_meta.webhook_deliveries
  WHERE webhook_id = NEW.webhook_id
    AND id NOT IN (
      SELECT id FROM nc_meta.webhook_deliveries
      WHERE webhook_id = NEW.webhook_id
      ORDER BY created_at DESC
      LIMIT 50
    );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_trim_webhook_deliveries ON nc_meta.webhook_deliveries;
CREATE TRIGGER trg_trim_webhook_deliveries
  AFTER INSERT ON nc_meta.webhook_deliveries
  FOR EACH ROW
  EXECUTE FUNCTION nc_meta.trim_webhook_deliveries();
