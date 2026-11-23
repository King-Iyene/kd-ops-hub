/**
 * Pure helpers for loading a table's data ahead of the click. Kept free of
 * React and Supabase so they can be unit tested.
 */

import type { Filter, Sort } from '../types';

// ── Which rows will the grid ask for first? ────────────────────────────────

interface ViewLike {
  id: string;
  is_default?: boolean | null;
  filters?: Filter[] | null;
  sorts?: Sort[] | null;
}

export interface InitialRecordParams {
  filters: Filter[] | undefined;
  sorts: Sort[] | undefined;
}

/**
 * The filters and sorts the grid will use for its first page, worked out from
 * the table's views before the grid has applied any view.
 *
 * With no view in the address, the grid opens the default view (or the first)
 * and applies its saved filters and sorts. With a view in the address it does
 * not load that view's settings (it only marks it active), so the first page
 * is unfiltered. An empty list is passed as undefined, exactly as the grid
 * does, so the query key matches and the prefetched page is reused.
 */
export function predictInitialRecordParams(
  views: readonly ViewLike[] | undefined,
  urlViewId?: string | null,
): InitialRecordParams {
  if (urlViewId || !views || views.length === 0) return { filters: undefined, sorts: undefined };
  const view = views.find((v) => v.is_default) ?? views[0];
  return {
    filters: view.filters && view.filters.length > 0 ? view.filters : undefined,
    sorts: view.sorts && view.sorts.length > 0 ? view.sorts : undefined,
  };
}

// ── Should the grid hold its rows request back until a view is applied? ────

export interface ViewGateInput {
  /** The views list for the open table; undefined until it has loaded. */
  views: readonly { id: string }[] | undefined;
  /** True when `views` is a leftover from the previous table. */
  viewsArePlaceholder: boolean;
  /** The views request has failed at least once (so waiting longer is pointless). */
  viewsFailed: boolean;
  activeViewId: string | null;
}

/**
 * True when it is time to ask for rows. The grid opens a table with no filters
 * in its store and only learns the default view's saved filters and sorts a
 * moment later; asking for rows in between wastes a request on the wrong
 * filters and shows rows that then change. The views arrive together with the
 * columns, so the wait costs no network time.
 */
export function viewGateOpen({ views, viewsArePlaceholder, viewsFailed, activeViewId }: ViewGateInput): boolean {
  if (viewsFailed) return true;
  if (!views || viewsArePlaceholder) return false;
  if (views.length === 0) return true;
  return !!activeViewId && views.some((v) => v.id === activeViewId);
}

// ── Debounced, cancellable hover prefetch ──────────────────────────────────

export interface HoverPrefetcherOptions {
  /** How long the pointer (or focus) must rest on a table before anything is requested. */
  delayMs: number;
  /** Does the loading. Called at most once per rest on a table. */
  run: (key: string) => void;
  /** Injected so tests can drive time. */
  setTimeoutFn?: (fn: () => void, ms: number) => unknown;
  clearTimeoutFn?: (handle: unknown) => void;
}

export interface HoverPrefetcher {
  /** Start the countdown for a key; a repeat call for the same key keeps the countdown already running. */
  schedule(key: string): void;
  /** Stop the countdown for a key (the pointer left before it ended). */
  cancel(key: string): void;
  cancelAll(): void;
  /** Keys whose countdown is running. */
  pending(): string[];
}

export function createHoverPrefetcher(options: HoverPrefetcherOptions): HoverPrefetcher {
  const setT = options.setTimeoutFn ?? ((fn, ms) => setTimeout(fn, ms));
  const clearT = options.clearTimeoutFn ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  const timers = new Map<string, unknown>();

  return {
    schedule(key) {
      if (timers.has(key)) return;
      timers.set(
        key,
        setT(() => {
          timers.delete(key);
          options.run(key);
        }, options.delayMs),
      );
    },
    cancel(key) {
      const handle = timers.get(key);
      if (handle === undefined) return;
      clearT(handle);
      timers.delete(key);
    },
    cancelAll() {
      for (const handle of timers.values()) clearT(handle);
      timers.clear();
    },
    pending() {
      return [...timers.keys()];
    },
  };
}
