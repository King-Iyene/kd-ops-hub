/**
 * How a table's rows are fetched as you scroll. The first page is small so something shows quickly; every later
 * page is larger, so reaching the bottom of a big table takes a handful of requests instead of dozens.
 */

/** Later pages are this many times the first page's size. */
export const LATER_PAGE_MULTIPLIER = 3;

/** How many rows to ask for starting at `offset`. */
export function pageSizeAt(offset: number, firstPageSize: number): number {
  return offset <= 0 ? firstPageSize : firstPageSize * LATER_PAGE_MULTIPLIER;
}

/** Where the next page starts, or undefined when everything has been fetched. */
export function nextOffset(offset: number, firstPageSize: number, totalCount: number): number | undefined {
  const next = Math.max(0, offset) + pageSizeAt(offset, firstPageSize);
  return next < totalCount ? next : undefined;
}

/** The inclusive range to request for a page. */
export function rangeFor(offset: number, firstPageSize: number): { from: number; to: number } {
  const from = Math.max(0, offset);
  return { from, to: from + pageSizeAt(from, firstPageSize) - 1 };
}
