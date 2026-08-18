// Constant-time secret comparison for cron/webhook shared secrets.
// Wraps std's timingSafeEqual so callers don't repeat the length + encode
// boilerplate on every check.

import { timingSafeEqual } from "https://deno.land/std@0.224.0/crypto/timing_safe_equal.ts";

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
  return timingSafeEqual(enc.encode(provided), enc.encode(expected));
}
