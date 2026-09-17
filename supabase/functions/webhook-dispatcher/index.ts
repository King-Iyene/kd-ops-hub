/**
 * Webhook Dispatcher Edge Function
 *
 * Dispatches webhooks to external URLs when database events occur.
 * Called from the client after record create/update/delete events.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders } from '../_shared/cors.ts';

function json(body: Record<string, unknown>, status = 200, req?: Request): Response {
  const cors = req ? getCorsHeaders(req) : { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

function encodeHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

  let body: { event: string; baseId: string; tableId: string; record?: unknown; oldRecord?: unknown; shareToken?: string; formToken?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400, req);
  }

  const { event, baseId, tableId, record, oldRecord, shareToken, formToken } = body;
  if (!event || !baseId || !tableId) {
    return json({ error: 'Missing required fields: event, baseId, tableId' }, 400, req);
  }
  if (!UUID_RE.test(baseId) || !UUID_RE.test(tableId)) {
    return json({ error: 'baseId and tableId must be valid UUIDs' }, 400, req);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  if (shareToken) {
    // Database shared-view submission — authorize via the nc_meta share token.
    const { data: sharedView, error: shareError } = await supabase
      .schema('nc_meta')
      .from('shared_views')
      .select('table_id, is_enabled')
      .eq('share_token', shareToken)
      .eq('is_enabled', true)
      .eq('table_id', tableId)
      .maybeSingle();

    if (shareError || !sharedView) {
      return json({ error: 'Invalid or disabled share token' }, 403, req);
    }
  } else if (formToken) {
    // Public form submission (flex table form or task form) — the visitor has
    // no user session, so authorize via the form's own token/id.
    let valid = false;

    // Try flex_forms (share_token is a text string)
    const { data: flexForm } = await supabase
      .from('flex_forms')
      .select('id')
      .eq('share_token', formToken)
      .eq('is_enabled', true)
      .maybeSingle();

    if (flexForm) {
      valid = true;
    } else if (UUID_RE.test(formToken)) {
      // Try task_forms (id is a UUID)
      const { data: taskForm } = await supabase
        .from('task_forms')
        .select('id')
        .eq('id', formToken)
        .eq('is_active', true)
        .maybeSingle();

      if (taskForm) valid = true;
    }

    if (!valid) {
      return json({ error: 'Invalid or disabled form token' }, 403, req);
    }
  } else {
    // Authenticated app path — validate the caller's JWT and, using a client
    // scoped to that user's identity (so RLS applies), confirm they actually
    // have access to the base being reported on. This prevents any
    // authenticated caller from triggering webhook dispatch for a base they
    // don't have access to.
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${bearer}` } },
    });

    const { data: userData, error: authError } = await userClient.auth.getUser(bearer);
    if (authError || !userData?.user) {
      return json({ error: 'Invalid or expired session' }, 401, req);
    }

    // Platform-wide webhooks use the nil-UUID sentinel — skip per-base access check
    const PLATFORM_BASE_ID = '00000000-0000-0000-0000-000000000000';
    if (baseId !== PLATFORM_BASE_ID) {
      const { data: baseRow, error: baseError } = await userClient
        .schema('nc_meta')
        .from('bases')
        .select('id')
        .eq('id', baseId)
        .maybeSingle();

      if (baseError || !baseRow) {
        return json({ error: 'Base not found or access denied' }, 403, req);
      }
    }
  }

  // Fetch active webhooks matching this event: base-specific, platform-wide
  // (nil UUID), base-wide (table_id IS NULL), or scoped to this table.
  const PLATFORM_SENTINEL = '00000000-0000-0000-0000-000000000000';
  const { data: webhooks, error: fetchError } = await supabase
    .schema('nc_meta')
    .from('webhooks')
    .select('id, url, secret, headers, events')
    .or(`base_id.eq.${baseId},base_id.eq.${PLATFORM_SENTINEL}`)
    .eq('is_active', true)
    .or(`table_id.is.null,table_id.eq.${tableId},table_id.eq.${PLATFORM_SENTINEL}`)
    .contains('events', [event]);

  if (fetchError) {
    console.error('[webhook-dispatcher] Failed to fetch webhooks:', fetchError.message);
    return json({ error: 'Failed to fetch webhooks' }, 500, req);
  }

  const uniqueWebhooks = webhooks ?? [];

  if (uniqueWebhooks.length === 0) {
    return json({ dispatched: 0 }, 200, req);
  }

  const payload = JSON.stringify({
    event,
    timestamp: new Date().toISOString(),
    base_id: baseId,
    table_id: tableId,
    payload: record ?? null,
    old_payload: oldRecord ?? null,
  });

  let dispatched = 0;
  const failedIds: string[] = [];
  const deliveryRows: Record<string, unknown>[] = [];

  for (const wh of uniqueWebhooks) {
    const startedAt = Date.now();
    try {
      const hdrs: Record<string, string> = {
        'Content-Type': 'application/json',
        'User-Agent': 'KDOps-Webhook/1.0',
        ...(wh.headers ?? {}),
      };

      if (wh.secret) {
        const key = await crypto.subtle.importKey(
          'raw', new TextEncoder().encode(wh.secret),
          { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
        );
        const sig = encodeHex(new Uint8Array(
          await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload)),
        ));
        hdrs['X-KDOps-Signature'] = `sha256=${sig}`;
      }

      const resp = await fetch(wh.url, {
        method: 'POST',
        headers: hdrs,
        body: payload,
        signal: AbortSignal.timeout(10_000),
      });
      const responseText = await resp.text().catch(() => '');

      if (resp.ok) {
        dispatched++;
      } else {
        failedIds.push(wh.id);
      }

      deliveryRows.push({
        webhook_id: wh.id,
        event,
        base_id: baseId,
        table_id: tableId,
        request_url: wh.url,
        success: resp.ok,
        response_status: resp.status,
        response_body: responseText.slice(0, 2000),
        duration_ms: Date.now() - startedAt,
      });
    } catch (err) {
      failedIds.push(wh.id);
      deliveryRows.push({
        webhook_id: wh.id,
        event,
        base_id: baseId,
        table_id: tableId,
        request_url: wh.url,
        success: false,
        error_message: String((err as Error)?.message ?? err).slice(0, 2000),
        duration_ms: Date.now() - startedAt,
      });
    }
  }

  // Best-effort: a logging failure should never take down the actual dispatch.
  if (deliveryRows.length > 0) {
    await supabase.schema('nc_meta').from('webhook_deliveries').insert(deliveryRows).then(({ error }) => {
      if (error) console.warn('[webhook-dispatcher] Failed to log deliveries:', error.message);
    });
  }

  // Update last_triggered_at for successful webhooks
  const successIds = uniqueWebhooks.map((w) => w.id).filter((id: string) => !failedIds.includes(id));
  if (successIds.length > 0) {
    await supabase
      .schema('nc_meta')
      .from('webhooks')
      .update({ last_triggered_at: new Date().toISOString(), failure_count: 0 })
      .in('id', successIds)
      .then(({ error }) => {
        if (error) console.warn('[webhook-dispatcher] Failed to update last_triggered_at:', error.message);
      });
  }

  // Increment failure_count for failed webhooks
  if (failedIds.length > 0) {
    for (const id of failedIds) {
      await supabase.rpc('increment_webhook_failure', { webhook_id: id }).catch(() => {
        // Fallback: just log
        console.warn(`[webhook-dispatcher] Failed to increment failure_count for ${id}`);
      });
    }
  }

  return json({ dispatched, failed: failedIds.length }, 200, req);
});
