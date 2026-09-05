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

  const { data: resolved } = useSlugResolver(rawBase, rawTable, rawView);

  const baseId = resolved?.baseId;
  const tableId = resolved?.tableId;
  const viewId = resolved?.viewId;

  useEffect(() => {
    if (baseId && baseId !== activeBaseId) {
      setActiveBase(baseId);
    } else if (!baseId && activeBaseId) {
      setActiveBase(null);
    }
  }, [baseId]);

  useEffect(() => {
    if (tableId && tableId !== activeTableId) {
      setActiveTable(tableId);
    }
  }, [tableId]);

  useEffect(() => {
    if (viewId) {
      setActiveView(viewId);
    }
  }, [viewId]);

  return <DatabaseShell />;
}
