// Constant-time secret comparison for cron/webhook shared secrets.
//
// Implemented natively (no deno.land/std import) after the pinned
// deno.land/std@0.224.0 Node compat path broke a sibling import in
// paystack-webhook (H-9) — this removes the same class of external
// dependency risk for every caller of constantTimeEquals in one place.

/**
 * Returns true iff `provided` matches `expected` in constant time.
 * Returns false when either input is missing or lengths differ.
 * Both inputs are compared byte-wise on their UTF-8 encoding.
 */
export function constantTimeEquals(
  provided: string | null | undefined,
  expected: string | null | undefined,
): boolean {
  if (!provided || !expected) return false;
  if (provided.length !== expected.length) return false;
  const enc = new TextEncoder();
  const a = enc.encode(provided);
  const b = enc.encode(expected);
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}
