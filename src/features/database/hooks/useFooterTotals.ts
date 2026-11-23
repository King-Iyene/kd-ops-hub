import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { FieldMeta, Filter, FilterGroup, RecordRow } from '../types';
import type { SummaryFunction } from '../lib/store';
import { footerPlan, patchFooterRows } from '../lib/footerColumns';
import { FOOTER_ROW_CAP, fetchColumnValues } from './useRecords';

/**
 * Exact footer totals.
 *
 * The grid loads rows a hundred at a time, so a footer computed from the loaded
 * rows only covers what has been scrolled into view. When the table has more
 * rows than are loaded, this reads just the summarised columns of every row that
 * matches the view's filters (a thousand rows per request) and hands them to the
 * footer, which then totals the whole filtered table. It starts after the first
 * rows are on screen, so it never delays them.
 *
 * The query is kept apart from the rows' own cache keys, so scrolling (which
 * loads more pages) does not re-read it. It is re-read, after a short pause,
 * when the rows are invalidated: an edit, a delete, or a teammate's change.
 */

const footerKey = (baseId: string | null | undefined, tableId: string | null | undefined) =>
  ['nc', 'footer', baseId, tableId] as const;

/** Wait this long after the last change before re-reading, so a burst of edits makes one request. */
const REFRESH_DELAY_MS = 1200;

export interface FooterTotals {
  /** Every row that matches the view, with just the summarised columns. Undefined until loaded, or when it would be too large. */
  rows: RecordRow[] | undefined;
  /** The fields `rows` can total exactly. */
  fieldIds: ReadonlySet<string>;
}

const NO_FIELDS: ReadonlySet<string> = new Set<string>();

export function useFooterTotals(params: {
  baseId: string | null | undefined;
  tableId: string | null | undefined;
  filters?: Filter[];
  filterGroups?: FilterGroup[];
  search?: string;
  fields: FieldMeta[];
  summaryFunctions: Record<string, SummaryFunction>;
  /** Rows loaded so far, and rows in the whole filtered table. */
  loadedCount: number;
  totalCount: number;
  /** False until the first rows have arrived. (Not tied to a sort change: the totals do not depend on the sort.) */
  enabled: boolean;
}): FooterTotals {
  const { baseId, tableId, filters, filterGroups, search, fields, summaryFunctions, loadedCount, totalCount, enabled } = params;
  const qc = useQueryClient();

  const plan = useMemo(() => footerPlan(fields, summaryFunctions), [fields, summaryFunctions]);
  const columnsKey = plan.columns.join(',');

  // Only worth a request when the loaded rows are not already the whole table, and the table is not too big to read.
  const wanted = enabled && !!baseId && !!tableId && plan.needed && totalCount > loadedCount && totalCount <= FOOTER_ROW_CAP;

  const query = useQuery({
    queryKey: [...footerKey(baseId, tableId), filters, filterGroups, search, columnsKey],
    enabled: wanted,
    staleTime: 60_000,
    gcTime: 2 * 60_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { rows, truncated } = await fetchColumnValues(
        qc,
        { baseId: baseId!, tableId: tableId!, filters, filterGroups, search },
        plan.columns,
      );
      // Cut short at the cap: a total of part of the rows would look exact and be wrong.
      return truncated ? null : rows;
    },
  });

  // Keep the totals current:
  //  - when a record save starts, apply it to the footer's rows at once, so the total moves with the cell;
  //  - when a save finishes (or fails), and when the rows are invalidated by anything else (a teammate's
  //    change, a link edit), read again once things settle. Every save re-arms the same timer, so a burst of
  //    edits makes one read, and the read always starts after the last save has landed.
  useEffect(() => {
    if (!baseId || !tableId) return undefined;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        void qc.invalidateQueries({ queryKey: footerKey(baseId, tableId) });
      }, REFRESH_DELAY_MS);
    };

    const unsubscribeRows = qc.getQueryCache().subscribe((event) => {
      if (event.type !== 'updated' || event.action.type !== 'invalidate') return;
      const key = event.query.queryKey;
      if (key[0] !== 'nc' || key[1] !== 'records' || key[2] !== baseId || key[3] !== tableId) return;
      scheduleRefresh();
    });

    const unsubscribeSaves = qc.getMutationCache().subscribe((event) => {
      if (event.type !== 'updated') return;
      const key = event.mutation.options.mutationKey;
      if (!key || key[0] !== 'nc' || key[1] !== 'user-save') return;
      const variables = event.mutation.state.variables as { baseId?: string; tableId?: string } | undefined;
      if (variables?.baseId !== baseId || variables?.tableId !== tableId) return;

      if (event.action.type === 'pending') {
        qc.setQueriesData<RecordRow[] | null>({ queryKey: footerKey(baseId, tableId) }, (old) =>
          Array.isArray(old) ? patchFooterRows(old, variables) : old,
        );
      } else if (event.action.type === 'success' || event.action.type === 'error') {
        scheduleRefresh();
      }
    });

    return () => {
      unsubscribeRows();
      unsubscribeSaves();
      if (timer) clearTimeout(timer);
    };
  }, [qc, baseId, tableId]);

  const rows = wanted && query.data ? query.data : undefined;
  return { rows, fieldIds: rows ? plan.fieldIds : NO_FIELDS };
}
