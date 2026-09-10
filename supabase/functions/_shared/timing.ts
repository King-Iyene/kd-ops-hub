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
  const enc = new TextEncoder();
  const a = enc.encode(provided);
  const b = enc.encode(expected);
  // Always iterate over the expected length so the loop duration doesn't
  // leak the expected secret's length. XOR with 0xFF when provided is
  // shorter so mismatched lengths still traverse the full expected array.
  const lenDiff = a.length ^ b.length;
  let diff = lenDiff;
  for (let i = 0; i < b.length; i++) {
    diff |= (i < a.length ? a[i] : 0xFF) ^ b[i];
  }
  return diff === 0;
}
