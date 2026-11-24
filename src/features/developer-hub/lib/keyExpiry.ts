/** Expiry choices offered when creating an API key. */

export const EXPIRY_MS: Record<string, number> = {
  '30d': 30 * 86_400_000,
  '90d': 90 * 86_400_000,
  '1y': 365 * 86_400_000,
};

/** ISO timestamp for an expiry choice ('never', empty or unknown means no expiry). */
export function expiresAtFromOption(opt: string | null, now: number = Date.now()): string | null {
  if (!opt || opt === 'never') return null;
  if (!Object.prototype.hasOwnProperty.call(EXPIRY_MS, opt)) return null;
  return new Date(now + EXPIRY_MS[opt]).toISOString();
}
