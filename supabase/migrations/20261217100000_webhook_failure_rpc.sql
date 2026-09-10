-- Missing RPC that webhook-dispatcher calls on failed deliveries.
-- Atomically increments failure_count and deactivates after 10 consecutive failures.

CREATE OR REPLACE FUNCTION nc_meta.increment_webhook_failure(webhook_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE nc_meta.webhooks
  SET failure_count = failure_count + 1,
      is_active = CASE WHEN failure_count + 1 >= 10 THEN false ELSE is_active END
  WHERE id = webhook_id;
END;
$$;

COMMENT ON FUNCTION nc_meta.increment_webhook_failure IS
  'Increment webhook failure counter; auto-deactivate after 10 consecutive failures.';
