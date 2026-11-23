import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { ensureTableBootstrap } from './tableBootstrap';
import { DEFAULT_RECORDS_PAGE_SIZE, infiniteRecordsOptions } from './useRecords';
import { createHoverPrefetcher, predictInitialRecordParams } from '../lib/prefetch';

/**
 * Load a table's context, columns, views and first page of rows ahead of the
 * click. Cheap to call repeatedly: whatever is already fresh in the cache is
 * not requested again, and concurrent calls share one request.
 *
 * `viewId` is the view named in the address, if any (it changes which rows the
 * grid asks for first, see predictInitialRecordParams).
 */
export async function prefetchTable(
  qc: QueryClient,
  baseId: string,
  tableId: string,
  options: { viewId?: string | null; firstPage?: boolean } = {},
): Promise<void> {
  try {
    const boot = await ensureTableBootstrap(qc, baseId, tableId);
    if (options.firstPage === false) return;
    const { filters, sorts } = predictInitialRecordParams(boot.views, options.viewId);
    await qc.prefetchInfiniteQuery(
      infiniteRecordsOptions({
        baseId,
        tableId,
        pageSize: DEFAULT_RECORDS_PAGE_SIZE,
        filters,
        sorts,
      }),
    );
  } catch {
    /* a prefetch that fails is not worth reporting; the grid asks again when the table is opened */
  }
}

/**
 * Start the combined table request as soon as the table is known, before the
 * columns, views and rows hooks run. Effects of one component run in order, so
 * calling this first means those hooks find the request already in flight.
 */
export function useEnsureTableBootstrap(baseId: string | null | undefined, tableId: string | null | undefined) {
  const qc = useQueryClient();
  useLayoutEffect(() => {
    if (!baseId || !tableId) return;
    ensureTableBootstrap(qc, baseId, tableId).catch(() => {});
  }, [qc, baseId, tableId]);
}

const HOVER_DELAY_MS = 120;

function saveDataOn(): boolean {
  try {
    return !!(navigator as unknown as { connection?: { saveData?: boolean } }).connection?.saveData;
  } catch {
    return false;
  }
}

export interface TablePrefetchHandlers {
  onPointerEnter: () => void;
  onPointerLeave: () => void;
  onFocus: () => void;
  onBlur: () => void;
}

/**
 * Hover and focus prefetching for table lists (sidebar, tab bar).
 *
 *   const prefetch = usePrefetchTable();
 *   <button {...prefetch.handlersFor(baseId, table.id)}>...</button>
 *
 * The pointer (or keyboard focus) has to rest on a table for 120 ms before
 * anything is requested, and leaving cancels the wait, so sweeping the mouse
 * across a long list loads nothing. Nothing is requested when the browser is in
 * data-saver mode.
 */
export function usePrefetchTable(options: { delayMs?: number } = {}) {
  const qc = useQueryClient();
  const delayMs = options.delayMs ?? HOVER_DELAY_MS;
  // key -> [baseId, tableId], so the countdown callback (which only gets the key) can run.
  const targets = useRef(new Map<string, [string, string]>());

  const prefetcher = useMemo(
    () =>
      createHoverPrefetcher({
        delayMs,
        run: (key) => {
          const target = targets.current.get(key);
          if (target && !saveDataOn()) void prefetchTable(qc, target[0], target[1]);
        },
      }),
    [qc, delayMs],
  );

  useEffect(() => () => prefetcher.cancelAll(), [prefetcher]);

  const schedule = useCallback(
    (baseId: string, tableId: string) => {
      targets.current.set(tableId, [baseId, tableId]);
      prefetcher.schedule(tableId);
    },
    [prefetcher],
  );
  const cancel = useCallback((tableId: string) => prefetcher.cancel(tableId), [prefetcher]);

  const handlersFor = useCallback(
    (baseId: string, tableId: string): TablePrefetchHandlers => ({
      onPointerEnter: () => schedule(baseId, tableId),
      onPointerLeave: () => cancel(tableId),
      onFocus: () => schedule(baseId, tableId),
      onBlur: () => cancel(tableId),
    }),
    [schedule, cancel],
  );

  return { schedule, cancel, handlersFor };
}
