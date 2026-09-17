// HMAC signing for outbound webhook payloads. Shared by webhook-dispatcher
// (first attempt) and webhook-retry-worker (every retry) so a receiver's
// signature verification never sees a signature computed a different way
// depending on which attempt happened to deliver it.
//
// Retries resend the EXACT payload string that was first computed (stored
// verbatim in webhook_deliveries.payload_json) rather than reconstructing it
// from parts — re-serializing could reorder keys or drift the `timestamp`
// field, which would both change the signed bytes and misrepresent the
// event as having happened at retry time instead of when it actually fired.

function encodeHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function signWebhookPayload(secret: string, payloadJson: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sigBytes = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payloadJson)),
  );
  return `sha256=${encodeHex(sigBytes)}`;
}
