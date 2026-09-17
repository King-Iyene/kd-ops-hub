// Retry/backoff schedule for webhook deliveries. Shared by webhook-dispatcher
// (schedules the retry after attempt 1 fails) and webhook-retry-worker
// (schedules every attempt after that) so the two can never disagree about
// how many attempts a delivery gets or how long to wait between them.
//
// 5 total attempts (1 original + 4 retries) spread over ~7.25 hours: enough
// to ride out a receiver's brief outage or deploy without hammering a
// permanently dead endpoint forever. Not Stripe's 3-day/16-attempt schedule
// on purpose — this is an internal ops platform's webhooks (n8n/Zapier-style
// endpoints), not a payments network with regulatory delivery guarantees.

export const MAX_DELIVERY_ATTEMPTS = 5;

const BACKOFF_MINUTES = [1, 15, 60, 360];

/**
 * `attemptNumberJustFailed` is the 1-based attempt that just failed.
 * Returns the delay in minutes before the next attempt, or null if
 * MAX_DELIVERY_ATTEMPTS has been reached and the delivery should be given up.
 */
export function nextRetryDelayMinutes(attemptNumberJustFailed: number): number | null {
  if (attemptNumberJustFailed >= MAX_DELIVERY_ATTEMPTS) return null;
  return BACKOFF_MINUTES[attemptNumberJustFailed - 1];
}
