/**
 * Webhook Replay — lets an operator manually resend a specific past
 * delivery on demand. Standard debugging/recovery tool on every mature
 * webhook platform (Stripe, GitHub, Svix): fix your receiver, then replay
 * the delivery that originally failed instead of waiting for a real event
 * or the automatic retry schedule.
 *
 * Deliberately NOT wired into the automatic retry/auto-disable machinery
 * (webhook-retry-worker): a replay never sets next_retry_at, and a failed
 * replay never increments failure_count. This is an operator probing a
 * receiver on purpose, not the platform's own reliability pipeline — it
 * shouldn't be able to push a webhook over its auto-disable threshold, and
 * shouldn't spawn further automatic retries the operator didn't ask for.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders } from '../_shared/cors.ts';
import { sendWebhookAttempt } from '../_shared/webhook-delivery.ts';

function json(body: Record<string, unknown>, status = 200, req?: Request): Response {
  const cors = req ? getCorsHeaders(req) : { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405, req);
  }

  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return json({ error: 'Missing authorization' }, 401, req);
  }
  const bearer = authHeader.slice(7);

  let body: { delivery_id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400, req);
  }
  if (!body.delivery_id) {
    return json({ error: 'Missing required field: delivery_id' }, 400, req);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // Scoped to the caller's own JWT so RLS enforces ownership — the existing
  // "Authenticated users can view their webhook deliveries" policy already
  // restricts this to deliveries whose webhook the caller created. No row
  // back means either it doesn't exist or isn't theirs; either way, 404.
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${bearer}` } },
  });
  const { data: delivery, error: deliveryError } = await userClient
    .schema('nc_meta')
    .from('webhook_deliveries')
    .select('id, webhook_id, root_delivery_id, event, base_id, table_id, payload_json, attempt_number')
    .eq('id', body.delivery_id)
    .maybeSingle();

  if (deliveryError || !delivery) {
    return json({ error: 'Delivery not found' }, 404, req);
  }
  if (!delivery.payload_json) {
    return json({ error: 'This delivery predates replay support and has no stored payload' }, 422, req);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const { data: wh, error: whError } = await supabase
    .schema('nc_meta')
    .from('webhooks')
    .select('id, url, secret, headers, is_active')
    .eq('id', delivery.webhook_id)
    .maybeSingle();

  if (whError || !wh) {
    return json({ error: 'Webhook not found' }, 404, req);
  }
  if (!wh.is_active) {
    return json({ error: 'Webhook is inactive — re-enable it before replaying a delivery' }, 409, req);
  }

  const result = await sendWebhookAttempt(wh, delivery.payload_json);

  await supabase.schema('nc_meta').from('webhook_deliveries').insert({
    webhook_id: delivery.webhook_id,
    root_delivery_id: delivery.root_delivery_id,
    parent_delivery_id: delivery.id,
    event: delivery.event,
    base_id: delivery.base_id,
    table_id: delivery.table_id,
    request_url: wh.url,
    payload_json: delivery.payload_json,
    attempt_number: delivery.attempt_number,
    is_replay: true,
    success: result.success,
    response_status: result.responseStatus,
    response_body: result.responseBody,
    error_message: result.errorMessage,
    duration_ms: result.durationMs,
    given_up: false,
    next_retry_at: null,
  }).then(({ error }) => {
    if (error) console.warn('[webhook-replay] Failed to log replay delivery:', error.message);
  });

  if (result.success) {
    await supabase.schema('nc_meta').from('webhooks')
      .update({ last_triggered_at: new Date().toISOString(), failure_count: 0 })
      .eq('id', delivery.webhook_id);
  }

  return json({
    success: result.success,
    response_status: result.responseStatus,
    response_body: result.responseBody,
    error_message: result.errorMessage,
    duration_ms: result.durationMs,
  }, 200, req);
});
