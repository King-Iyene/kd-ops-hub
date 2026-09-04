import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { DatabaseShell } from '../components/DatabaseShell';
import { useDatabaseUI } from '../lib/store';

export default function DatabasePage() {
  const { baseId, tableId } = useParams<{ baseId?: string; tableId?: string }>();
  const setActiveBase = useDatabaseUI((s) => s.setActiveBase);
  const setActiveTable = useDatabaseUI((s) => s.setActiveTable);
  const activeBaseId = useDatabaseUI((s) => s.activeBaseId);
  const activeTableId = useDatabaseUI((s) => s.activeTableId);

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

  return <DatabaseShell />;
}
