// Shared "send one HTTP attempt to a webhook receiver" logic — used by
// webhook-retry-worker (automatic retries) and webhook-replay (manual
// operator-triggered resend). Kept in one place so both attempt types are
// signed, timed out, and truncated identically; webhook-dispatcher (the
// first-attempt, per-webhook-loop path) has its own inline copy since its
// loop also needs to build the payload string per iteration.

import { signWebhookPayload } from './webhook-signing.ts';

export interface WebhookTarget {
  url: string;
  secret: string | null;
  headers: Record<string, string> | null;
}

export interface WebhookAttemptResult {
  success: boolean;
  responseStatus: number | null;
  responseBody: string | null;
  errorMessage: string | null;
  durationMs: number;
}

export async function sendWebhookAttempt(wh: WebhookTarget, payloadJson: string): Promise<WebhookAttemptResult> {
  const startedAt = Date.now();
  try {
    const hdrs: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'KDOps-Webhook/1.0',
      ...(wh.headers ?? {}),
    };
    if (wh.secret) {
      hdrs['X-KDOps-Signature'] = await signWebhookPayload(wh.secret, payloadJson);
    }

    const resp = await fetch(wh.url, {
      method: 'POST',
      headers: hdrs,
      body: payloadJson,
      signal: AbortSignal.timeout(10_000),
    });
    const responseBody = (await resp.text().catch(() => '')).slice(0, 2000);
    return {
      success: resp.ok,
      responseStatus: resp.status,
      responseBody: responseBody || null,
      errorMessage: null,
      durationMs: Date.now() - startedAt,
    };
  } catch (err) {
    return {
      success: false,
      responseStatus: null,
      responseBody: null,
      errorMessage: String((err as Error)?.message ?? err).slice(0, 2000),
      durationMs: Date.now() - startedAt,
    };
  }
}
