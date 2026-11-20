// Per-user send rate limit for send-email, pure parts (no Deno APIs, so it can be unit tested).
//
// The limiter counts rows in audit_logs (action_type = 'send_notification', one per send, per user_id) in the
// last minute. supabase-js does NOT throw on a failed query: it returns { error }. The limiter used to ignore
// that, so when it filtered on columns audit_logs does not have ("action", "table_name"), every check came back
// with count = null and was treated as 0: nothing was ever limited. A failed count must now fail closed.

export const SEND_RATE_LIMIT_MAX = 10;
export const SEND_RATE_LIMIT_WINDOW_MS = 60_000;
export const SEND_RATE_LIMIT_ACTION = 'send_notification';

export type RateDecision = 'allow' | 'limited' | 'unavailable';

export function decideSendRateLimit(count: number | null | undefined, error: unknown, max: number = SEND_RATE_LIMIT_MAX): RateDecision {
  if (error) return 'unavailable';
  if (typeof count !== 'number') return 'unavailable';
  return count >= max ? 'limited' : 'allow';
}

export function rateWindowStart(now: number = Date.now(), windowMs: number = SEND_RATE_LIMIT_WINDOW_MS): string {
  return new Date(now - windowMs).toISOString();
}
