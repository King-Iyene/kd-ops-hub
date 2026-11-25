/**
 * A filter on a linked record ("Month contains 2025") is answered in two steps: the server lists the ids of the
 * matching rows, then the rows are fetched with `id in (...)`. With ~1,700 ids that request address is about
 * 66 KB, far past what the server accepts, so the request failed and the screen quietly kept showing the previous
 * view's rows. Here the ids are asked for in small groups instead, and the groups are put back together in order.
 *
 * Pure (no Supabase) so the merging can be tested.
 */

/** Ids per request: 120 x ~39 characters keeps the address under 5 KB. */
export const MAX_IDS_PER_REQUEST = 120;

export function chunkIds<T>(ids: readonly T[], size: number = MAX_IDS_PER_REQUEST): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < ids.length; i += size) out.push(ids.slice(i, i + size));
  return out;
}

export interface OrderKey {
  col: string;
  ascending: boolean;
}

type Row = Record<string, unknown> & { id: string };

function compareValues(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  const sa = String(a);
  const sb = String(b);
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

/** Row order the way the database sorts: empty values last when ascending, first when descending. */
export function compareRows(a: Row, b: Row, order: readonly OrderKey[]): number {
  for (const { col, ascending } of order) {
    const va = a[col];
    const vb = b[col];
    const aNull = va === null || va === undefined;
    const bNull = vb === null || vb === undefined;
    if (aNull && bNull) continue;
    if (aNull) return ascending ? 1 : -1;
    if (bNull) return ascending ? -1 : 1;
    const c = compareValues(va, vb);
    if (c !== 0) return ascending ? c : -c;
  }
  return 0;
}

/** The ids of rows `from..to` (inclusive) of the combined, sorted list. */
export function pickPageIds(rows: readonly Row[], order: readonly OrderKey[], from: number, to: number): string[] {
  const seen = new Set<string>();
  const unique = rows.filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)));
  return unique
    .sort((a, b) => compareRows(a, b, order))
    .slice(from, to + 1)
    .map((r) => r.id);
}

/** How many ids a request would carry, so callers can decide whether to split. */
export function needsSplitting(ids: readonly unknown[] | null | undefined): boolean {
  return !!ids && ids.length > MAX_IDS_PER_REQUEST;
}
