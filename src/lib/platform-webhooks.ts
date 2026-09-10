import { supabase } from '@/lib/supabase';

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
    .catch((err) => {
      console.warn('[KDOps] Platform webhook dispatch failed:', err?.message ?? err);
    });
}
