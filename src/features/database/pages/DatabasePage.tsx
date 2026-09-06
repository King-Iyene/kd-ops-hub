import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { DatabaseShell } from '../components/DatabaseShell';
import { useDatabaseUI } from '../lib/store';
import { useSlugResolver } from '../hooks/useSlugResolver';

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

  const baseId = resolved?.baseId;
  const tableId = resolved?.tableId;
  const viewId = resolved?.viewId;

  useEffect(() => {
    if (isLoading) return;
    if (baseId && baseId !== activeBaseId) {
      setActiveBase(baseId);
    } else if (!rawBase && activeBaseId) {
      setActiveBase(null);
    }
  }, [baseId, rawBase, isLoading]);

  useEffect(() => {
    if (isLoading) return;
    if (tableId && tableId !== activeTableId) {
      setActiveTable(tableId);
    }
  }, [tableId, isLoading]);

  useEffect(() => {
    if (isLoading) return;
    if (viewId) {
      setActiveView(viewId);
    }
  }, [viewId, isLoading]);

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
