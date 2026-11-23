/**
 * The grid loads more rows as you scroll. The board, calendar, timeline and gantt show everything at once, so
 * they need all the rows, not just the first page, or they quietly show a fraction of the table.
 */

export const VIEWS_THAT_NEED_ALL_ROWS = new Set(['kanban', 'calendar', 'timeline', 'gantt']);

/** Past this many rows a board or calendar is unusable and slow; the screen says so and asks for a filter. */
export const ALL_ROWS_CAP = 5000;

export function viewNeedsAllRows(viewType: string): boolean {
  return VIEWS_THAT_NEED_ALL_ROWS.has(viewType);
}

export function shouldLoadMoreForView(input: {
  viewType: string;
  loaded: number;
  hasNextPage: boolean;
  isFetching: boolean;
  cap?: number;
}): boolean {
  const { viewType, loaded, hasNextPage, isFetching, cap = ALL_ROWS_CAP } = input;
  return viewNeedsAllRows(viewType) && hasNextPage && !isFetching && loaded < cap;
}

/** What to tell the person above such a view, or null when everything is there. */
export function describeViewLoad(input: {
  viewType: string;
  loaded: number;
  total: number;
  hasNextPage: boolean;
  cap?: number;
}): { kind: 'loading' | 'capped'; text: string } | null {
  const { viewType, loaded, total, hasNextPage, cap = ALL_ROWS_CAP } = input;
  if (!viewNeedsAllRows(viewType) || !hasNextPage || total <= loaded) return null;
  if (loaded >= cap) {
    return { kind: 'capped', text: `Showing the first ${loaded.toLocaleString()} of ${total.toLocaleString()} records. Use a filter to narrow it down.` };
  }
  return { kind: 'loading', text: `Loading all records… ${loaded.toLocaleString()} of ${total.toLocaleString()}` };
}
