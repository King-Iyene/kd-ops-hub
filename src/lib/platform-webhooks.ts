import { supabase } from '@/lib/supabase';
import { logWarn } from '@/lib/logger';

const PLATFORM_BASE_ID = '00000000-0000-0000-0000-000000000000';
const PLATFORM_TABLE_ID = '00000000-0000-0000-0000-000000000000';

/**
 * Fire platform-event webhooks (employee.created, expense.submitted, etc.).
 * Best-effort — failures are logged but never block the caller.
 */
export function dispatchPlatformWebhook(
  event: string,
  payload: Record<string, unknown>,
) {
  supabase.functions
    .invoke('webhook-dispatcher', {
      body: {
        event,
        baseId: PLATFORM_BASE_ID,
        tableId: PLATFORM_TABLE_ID,
        record: payload,
      },
    })
    .then(({ data, error }) => {
      if (error) logWarn('Webhooks', `dispatch ${event} failed:`, error.message);
      else if (data?.dispatched === 0) logWarn('Webhooks', `dispatch ${event}: 0 webhooks matched — check event name in Developer > Webhooks`);
    })
    .catch((err) => {
      logWarn('Webhooks', `dispatch ${event} failed:`, err?.message ?? err);
    });
}

/**
 * Fire webhooks from public form submissions (no authenticated user).
 *
 * Uses a direct fetch with the anon key to bypass Supabase gateway
 * JWT verification — the edge function must be deployed with
 * --no-verify-jwt and validates the formToken in its own code.
 */
export function dispatchFormWebhook(
  event: string,
  formToken: string,
  payload: Record<string, unknown>,
) {
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/webhook-dispatcher`;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

  fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${anonKey}`,
      'apikey': anonKey,
    },
    body: JSON.stringify({
      event,
      baseId: PLATFORM_BASE_ID,
      tableId: PLATFORM_TABLE_ID,
      formToken,
      record: payload,
    }),
  })
    .then(async (res) => {
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        logWarn('Webhooks', `form dispatch ${event} HTTP ${res.status}:`, text);
        return;
      }
      const json = await res.json().catch(() => ({}));
      if (json.dispatched === 0) {
        logWarn('Webhooks', `form dispatch ${event}: 0 webhooks matched — check event name in Developer > Webhooks. Hint: ${json.hint || 'none'}`);
      }
    })
    .catch((err) => {
      logWarn('Webhooks', `form dispatch ${event} failed:`, err?.message ?? err);
    });
}
