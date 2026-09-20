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
    .then(({ error }) => {
      if (error) logWarn('Webhooks', `dispatch ${event} failed:`, error.message);
    })
    .catch((err) => {
      logWarn('Webhooks', `dispatch ${event} failed:`, err?.message ?? err);
    });
}

/**
 * Fire webhooks from public form submissions (no authenticated user).
 * Uses the form's own token for authorization instead of a user JWT.
 */
export function dispatchFormWebhook(
  event: string,
  formToken: string,
  payload: Record<string, unknown>,
) {
  supabase.functions
    .invoke('webhook-dispatcher', {
      body: {
        event,
        baseId: PLATFORM_BASE_ID,
        tableId: PLATFORM_TABLE_ID,
        formToken,
        record: payload,
      },
    })
    .then(({ error }) => {
      if (error) logWarn('Webhooks', `form dispatch ${event} failed:`, error.message);
    })
    .catch((err) => {
      logWarn('Webhooks', `form dispatch ${event} failed:`, err?.message ?? err);
    });
}
