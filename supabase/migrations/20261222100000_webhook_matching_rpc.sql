-- RPC functions for the webhook-dispatcher edge function.
-- Run as SECURITY DEFINER so they have direct nc_meta access regardless
-- of the calling role or PostgREST schema exposure configuration.

-- 1. Find matching webhooks for an event
CREATE OR REPLACE FUNCTION public.get_matching_webhooks(
  p_event    text,
  p_base_id  uuid,
  p_table_id uuid
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = nc_meta, public
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id',      w.id,
    'url',     w.url,
    'secret',  w.secret,
    'headers', w.headers,
    'events',  w.events
  )), '[]'::jsonb)
  FROM nc_meta.webhooks w
  WHERE w.is_active = true
    AND (w.base_id = p_base_id OR w.base_id = '00000000-0000-0000-0000-000000000000')
    AND (w.table_id IS NULL OR w.table_id = p_table_id OR w.table_id = '00000000-0000-0000-0000-000000000000')
    AND p_event = ANY(w.events);
$$;

REVOKE ALL ON FUNCTION public.get_matching_webhooks(text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_matching_webhooks(text, uuid, uuid) TO service_role, authenticated;

-- 2. Log webhook delivery rows (best-effort from edge function)
CREATE OR REPLACE FUNCTION public.log_webhook_deliveries(p_rows jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = nc_meta, public
AS $$
BEGIN
  INSERT INTO nc_meta.webhook_deliveries (
    id, root_delivery_id, webhook_id, event, base_id, table_id,
    request_url, payload_json, attempt_number, success,
    response_status, response_body, error_message, duration_ms, next_retry_at
  )
  SELECT
    (r->>'id')::uuid,
    (r->>'root_delivery_id')::uuid,
    (r->>'webhook_id')::uuid,
    r->>'event',
    (r->>'base_id')::uuid,
    (r->>'table_id')::uuid,
    r->>'request_url',
    r->>'payload_json',
    (r->>'attempt_number')::int,
    (r->>'success')::boolean,
    (r->>'response_status')::int,
    r->>'response_body',
    r->>'error_message',
    (r->>'duration_ms')::int,
    CASE WHEN r->>'next_retry_at' IS NOT NULL THEN (r->>'next_retry_at')::timestamptz END
  FROM jsonb_array_elements(p_rows) AS r;
END;
$$;

REVOKE ALL ON FUNCTION public.log_webhook_deliveries(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_webhook_deliveries(jsonb) TO service_role;

-- 3. Update last_triggered_at for successfully dispatched webhooks
CREATE OR REPLACE FUNCTION public.update_webhook_success(p_ids uuid[])
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = nc_meta, public
AS $$
  UPDATE nc_meta.webhooks
  SET last_triggered_at = now(), failure_count = 0
  WHERE id = ANY(p_ids);
$$;

REVOKE ALL ON FUNCTION public.update_webhook_success(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_webhook_success(uuid[]) TO service_role;
