/** Column summary maths for the grid footer. Pure, so it can be tested. */

export function isFilled(value: unknown): boolean {
  if (value == null || value === '') return false;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

export function toNumbers(values: readonly unknown[]): number[] {
  return values
    .map((v) => (typeof v === 'number' ? v : parseFloat(String(v))))
    .filter((n) => Number.isFinite(n));
}

export function median(nums: readonly number[]): number | null {
  if (nums.length === 0) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** How many different non-empty values there are (lists compare by their contents). */
export function uniqueCount(values: readonly unknown[]): number {
  const seen = new Set<string>();
  for (const v of values) {
    if (!isFilled(v)) continue;
    seen.add(typeof v === 'object' ? JSON.stringify(v) : String(v));
  }
  return seen.size;
}

/** The earliest and latest of a column of dates, as the original values. */
export function dateExtremes(values: readonly unknown[]): { earliest: string | null; latest: string | null } {
  let earliest: { t: number; v: string } | null = null;
  let latest: { t: number; v: string } | null = null;
  for (const raw of values) {
    if (!isFilled(raw)) continue;
    const v = String(raw);
    const t = Date.parse(v);
    if (Number.isNaN(t)) continue;
    if (!earliest || t < earliest.t) earliest = { t, v };
    if (!latest || t > latest.t) latest = { t, v };
  }
  return { earliest: earliest?.v ?? null, latest: latest?.v ?? null };
}

export function countChecked(values: readonly unknown[]): number {
  return values.filter((v) => v === true || v === 'true' || v === 1).length;
}
