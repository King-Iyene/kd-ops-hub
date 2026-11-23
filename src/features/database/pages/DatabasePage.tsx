import { useLayoutEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { DatabaseShell } from '../components/DatabaseShell';
import { useDatabaseUI } from '../lib/store';
import { useSlugResolver } from '../hooks/useSlugResolver';
import { prefetchTable } from '../hooks/usePrefetchTable';

export default function DatabasePage() {
  const { baseId: rawBase, tableId: rawTable, viewId: rawView } = useParams<{
    baseId?: string;
    tableId?: string;
    viewId?: string;
  }>();

  const setActiveBase = useDatabaseUI((s) => s.setActiveBase);
  const setActiveTable = useDatabaseUI((s) => s.setActiveTable);
  const setActiveView = useDatabaseUI((s) => s.setActiveView);
  const activeBaseId = useDatabaseUI((s) => s.activeBaseId);
  const activeTableId = useDatabaseUI((s) => s.activeTableId);

  const { data: resolved, isLoading } = useSlugResolver(rawBase, rawTable, rawView);
  const qc = useQueryClient();

  const baseId = resolved?.baseId;
  const tableId = resolved?.tableId;
  const viewId = resolved?.viewId;

  // The moment the table is known, start loading its context, columns, views and first page of rows.
  // This runs before the table screen has even mounted, so those requests are already on their way
  // (and shared) when its hooks ask for them. A layout effect so it is not held back by a paint.
  // Only when the table changes: switching views inside a table must not request another first page.
  const viewIdRef = useRef(viewId);
  viewIdRef.current = viewId;
  useLayoutEffect(() => {
    if (isLoading || !baseId || !tableId) return;
    void prefetchTable(qc, baseId, tableId, { viewId: viewIdRef.current });
  }, [qc, isLoading, baseId, tableId]);

  // The next three effects copy the address into the store. As layout effects the store is up to date
  // before the first paint, so a deep link never flashes the empty state for a frame.
  useLayoutEffect(() => {
    if (isLoading) return;
    if (baseId && baseId !== activeBaseId) {
      setActiveBase(baseId);
    } else if (!rawBase && activeBaseId) {
      setActiveBase(null);
    }
  }, [baseId, rawBase, isLoading, activeBaseId, setActiveBase]);

  useLayoutEffect(() => {
    if (isLoading) return;
    if (tableId && tableId !== activeTableId) {
      setActiveTable(tableId);
    }
  }, [tableId, isLoading, activeTableId, setActiveTable]);

  useLayoutEffect(() => {
    if (isLoading) return;
    if (viewId) {
      setActiveView(viewId);
    }
  }, [viewId, isLoading, setActiveView]);

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center h-full w-full" role="status" aria-live="polite">
        <div className="flex flex-col items-center gap-3">
          <div
            className="w-6 h-6 rounded-full border-2 border-current border-t-transparent animate-spin text-[#2D7FF9]"
            aria-hidden="true"
          />
          <span className="text-sm text-[#6A7184] dark:text-[#9AA2AF]">Loading…</span>
        </div>
      </div>
    );
  }

  return <DatabaseShell />;
}
