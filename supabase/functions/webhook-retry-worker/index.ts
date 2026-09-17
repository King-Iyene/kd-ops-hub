/**
 * Webhook Retry Worker — cron-only edge function.
 *
 * Ticked once a minute by pg_cron (see the tick_webhook_retry_worker()
 * function + cron.schedule call in the webhook_retry migration). Picks up
 * every webhook_deliveries row whose next_retry_at is due, resends the
 * exact original payload, and records the outcome as a new attempt row.
 *
 * Retries go to the webhook's CURRENT url/secret/headers, not what was
 * recorded at the original send time — if the operator just fixed a typo'd
 * URL or rotated a secret, retries should benefit from that fix rather than
 * faithfully repeating the mistake that caused the failure.
 *
 * failure_count / auto-disable bookkeeping (nc_meta.webhooks) is entirely
 * owned by this worker, not by webhook-dispatcher: a delivery only counts
 * as a real failure once MAX_DELIVERY_ATTEMPTS is exhausted, so a receiver's
 * brief blip that succeeds on retry never risks auto-disabling the webhook.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders } from '../_shared/cors.ts';
import { sendWebhookAttempt } from '../_shared/webhook-delivery.ts';
import { nextRetryDelayMinutes } from '../_shared/webhook-retry.ts';
import { constantTimeEquals } from '../_shared/timing.ts';

const TICK_BATCH_SIZE = 50;

interface ClaimedDelivery {
  id: string;
  root_delivery_id: string;
  webhook_id: string;
  event: string;
  base_id: string | null;
  table_id: string | null;
  payload_json: string;
  attempt_number: number;
}

interface WebhookRow {
  id: string;
  url: string;
  secret: string | null;
  headers: Record<string, string> | null;
  is_active: boolean;
}

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }

  const cronSecret = req.headers.get('x-cron-secret');
  const expectedCron = Deno.env.get('CRON_SHARED_SECRET');
  if (!constantTimeEquals(cronSecret, expectedCron)) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Atomic claim (see claim_due_webhook_deliveries — FOR UPDATE SKIP LOCKED)
  // so an overlapping tick can never grab the same row this one just did.
  const { data: claimed, error: claimError } = await supabase
    .schema('nc_meta')
    .rpc('claim_due_webhook_deliveries', { p_limit: TICK_BATCH_SIZE });

  if (claimError) {
    console.error('[webhook-retry-worker] Failed to claim due retries:', claimError.message);
    return new Response(JSON.stringify({ error: 'Failed to claim due retries' }), {
      status: 500, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const dueDeliveries = (claimed ?? []) as ClaimedDelivery[];
  let retried = 0;
  let succeeded = 0;
  let givenUp = 0;

  if (dueDeliveries.length === 0) {
    return new Response(JSON.stringify({ due: 0, retried: 0, succeeded: 0, given_up: 0 }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const webhookIds = [...new Set(dueDeliveries.map((d) => d.webhook_id))];
  const { data: webhookRows, error: whError } = await supabase
    .schema('nc_meta')
    .from('webhooks')
    .select('id, url, secret, headers, is_active')
    .in('id', webhookIds);

  if (whError) {
    console.error('[webhook-retry-worker] Failed to fetch webhooks for claimed retries:', whError.message);
    return new Response(JSON.stringify({ error: 'Failed to fetch webhooks' }), {
      status: 500, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const webhookById = new Map<string, WebhookRow>((webhookRows ?? []).map((w) => [w.id, w as WebhookRow]));

  for (const d of dueDeliveries) {
    const wh = webhookById.get(d.webhook_id) ?? null;

    // Webhook was deleted, or the operator disabled it since this retry was
    // scheduled (manually, or via a PRIOR delivery's auto-disable) — either
    // way, retrying serves no purpose. The claim already cleared
    // next_retry_at, so just leave it be; this is not itself a delivery
    // failure worth counting.
    if (!wh || !wh.is_active) {
      continue;
    }

    retried++;
    const nextAttempt = d.attempt_number + 1;

    const result = await sendWebhookAttempt(wh, d.payload_json);
    const delayMinutes = result.success ? null : nextRetryDelayMinutes(nextAttempt);
    const exhausted = !result.success && delayMinutes === null;

    await supabase.schema('nc_meta').from('webhook_deliveries').insert({
      webhook_id: d.webhook_id,
      root_delivery_id: d.root_delivery_id,
      event: d.event,
      base_id: d.base_id,
      table_id: d.table_id,
      request_url: wh.url,
      payload_json: d.payload_json,
      attempt_number: nextAttempt,
      parent_delivery_id: d.id,
      success: result.success,
      response_status: result.responseStatus,
      response_body: result.responseBody,
      error_message: result.errorMessage,
      duration_ms: result.durationMs,
      given_up: exhausted,
      next_retry_at: result.success || exhausted ? null : new Date(Date.now() + delayMinutes! * 60_000).toISOString(),
    });

    if (result.success) {
      succeeded++;
      await supabase.schema('nc_meta').from('webhooks')
        .update({ last_triggered_at: new Date().toISOString(), failure_count: 0 })
        .eq('id', d.webhook_id);
    } else if (exhausted) {
      givenUp++;
      // Pre-existing bug fixed in passing: this RPC lives in nc_meta, not
      // public. Calling it without .schema('nc_meta') silently 404s and gets
      // swallowed by the catch below — so the 10-failure auto-disable this
      // feeds has likely never actually fired in production.
      await supabase.schema('nc_meta').rpc('increment_webhook_failure', { webhook_id: d.webhook_id }).then(({ error }) => {
        if (error) console.warn(`[webhook-retry-worker] Failed to increment failure_count for ${d.webhook_id}:`, error.message);
      });
    }
  }

  return new Response(JSON.stringify({ due: dueDeliveries.length, retried, succeeded, given_up: givenUp }), {
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
});
