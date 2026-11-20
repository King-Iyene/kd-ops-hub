// webhook-inflow signature check, pure parts (no Deno APIs, so it can be unit tested).
//
// Scheme: the same one KD Ops uses when it SENDS webhooks (webhook-signing.ts, header X-KDOps-Signature): the sender
// computes HMAC-SHA256 of the raw request body with the automation's shared secret (trigger_config.secret) and sends
// `X-KDOps-Signature: sha256=<hex>`. The check fails closed: no secret configured on the automation means nobody can
// trigger it (the automation_id in the URL is an identifier, not a secret).

import { signWebhookPayload } from './webhook-signing.ts';
import { constantTimeEquals } from './timing.ts';

export const INFLOW_SIGNATURE_HEADER = 'x-kdops-signature';

export type InflowVerdict =
  | { ok: true }
  | { ok: false; status: 401 | 403; error: string };

export async function verifyInflowSignature(
  secret: unknown,
  rawBody: string,
  signatureHeader: string | null | undefined,
): Promise<InflowVerdict> {
  if (typeof secret !== 'string' || secret.trim() === '') {
    return { ok: false, status: 403, error: 'Webhook secret not configured for this automation' };
  }
  const provided = (signatureHeader ?? '').trim().toLowerCase();
  if (!provided) return { ok: false, status: 401, error: 'Missing X-KDOps-Signature header' };
  const expected = (await signWebhookPayload(secret, rawBody)).toLowerCase();
  if (!constantTimeEquals(provided, expected)) return { ok: false, status: 401, error: 'Invalid signature' };
  return { ok: true };
}
