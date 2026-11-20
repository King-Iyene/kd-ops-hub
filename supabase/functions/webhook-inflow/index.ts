/**
 * Webhook Inflow Edge Function
 *
 * Receives incoming webhooks from external services and triggers
 * automations configured with trigger_type = 'webhook_inflow'.
 *
 * URL: /functions/v1/webhook-inflow?automation_id=<uuid>
 *
 * The incoming JSON body becomes the "record" passed to automation actions.
 * Authentication: the request must carry `X-KDOps-Signature: sha256=<hex>`, the HMAC-SHA256 of the raw request body
 * keyed with the automation's shared secret (trigger_config.secret) — the same scheme KD Ops uses for the webhooks it
 * sends (see _shared/webhook-signing.ts). Fails closed: an automation with no secret cannot be triggered, because the
 * automation_id in the URL is only an identifier. Set the secret in the automation's trigger settings.
 *
 * Deploy: supabase functions deploy webhook-inflow --no-verify-jwt  (callers are external services with no Supabase JWT;
 * authentication is the signature check above).
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { INFLOW_SIGNATURE_HEADER, verifyInflowSignature } from '../_shared/webhook-inflow-core.ts';

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'content-type, x-kdops-signature',
    },
  });
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'content-type, x-kdops-signature',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
    });
  }

  if (req.method !== 'POST') {
    return json({ success: false, error: 'Method not allowed' }, 405);
  }

  const url = new URL(req.url);
  const automationId = url.searchParams.get('automation_id');
  if (!automationId) {
    return json({ success: false, error: 'Missing automation_id parameter' }, 400);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    global: { headers: { Authorization: `Bearer ${serviceRoleKey}` } },
  });

  // Read the raw body first: the signature covers the exact bytes that were sent.
  const rawBody = await req.text();

  const { data: automation, error: fetchErr } = await supabase
    .schema('nc_meta')
    .from('automations')
    .select('*')
    .eq('id', automationId)
    .eq('trigger_type', 'webhook_inflow')
    .eq('enabled', true)
    .maybeSingle();

  if (fetchErr) {
    return json({ success: false, error: fetchErr.message }, 500);
  }
  if (!automation) {
    return json({ success: false, error: 'Automation not found or not enabled' }, 404);
  }

  const verdict = await verifyInflowSignature(
    (automation.trigger_config as Record<string, unknown> | null)?.secret,
    rawBody,
    req.headers.get(INFLOW_SIGNATURE_HEADER),
  );
  if (!verdict.ok) {
    return json({ success: false, error: verdict.error }, verdict.status);
  }

  let incomingData: Record<string, any> = {};
  try {
    incomingData = JSON.parse(rawBody);
  } catch {
    return json({ success: false, error: 'Invalid JSON body' }, 400);
  }

  // Forward to the automation-runner with the incoming data as the record
  const { data, error } = await supabase.functions.invoke('automation-runner', {
    body: {
      event: 'record.created',
      baseId: automation.base_id,
      tableId: automation.table_id,
      record: { id: `webhook-${Date.now()}`, ...incomingData },
      oldRecord: {},
      _testAutomationId: automationId,
    },
  });

  if (error) {
    return json({ success: false, error: error.message }, 500);
  }

  return json({ success: true, message: 'Webhook processed', results: data?.results ?? [] });
});
