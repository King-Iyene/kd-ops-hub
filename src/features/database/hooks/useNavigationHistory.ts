import { useEffect } from 'react';
import { useDatabaseUI } from '../lib/store';
import { NAV_KEYS, parseIdList, readStored, writeStored } from '../lib/navStorage';
import { addRecentId } from '../lib/recents';
import { useBases } from './useBases';
import { useTables } from './useTables';
import { useViews } from './useViews';
import { recordRecentItem } from './useNavPrefs';

/**
 * Remembers where the user has been, for the command palette's "Recent" list
 * and the tab strip's "recently used" tabs. Writes only to localStorage, never
 * to the database, and only when the open base, table or view changes.
 * Mount once, in the shell.
 */
export function useNavigationHistory(): void {
  const activeBaseId = useDatabaseUI((s) => s.activeBaseId);
  const activeTableId = useDatabaseUI((s) => s.activeTableId);
  const activeViewId = useDatabaseUI((s) => s.activeViewId);
  const { data: bases } = useBases();
  const { data: tables } = useTables(activeBaseId);
  const { data: views } = useViews(activeTableId);

  const baseName = bases?.find((b) => b.id === activeBaseId)?.name;
  const table = tables?.find((t) => t.id === activeTableId && t.base_id === activeBaseId);
  const view = views?.find((v) => v.id === activeViewId && v.table_id === activeTableId);

  useEffect(() => {
    if (activeBaseId && baseName) {
      recordRecentItem({ kind: 'base', id: activeBaseId, label: baseName, baseId: activeBaseId });
    }
  }, [activeBaseId, baseName]);

  const tableName = table?.name;
  useEffect(() => {
    if (!activeBaseId || !activeTableId || !tableName) return;
    recordRecentItem({ kind: 'table', id: activeTableId, label: tableName, baseId: activeBaseId, tableId: activeTableId });
    const key = NAV_KEYS.recentTables(activeBaseId);
    const current = parseIdList(readStored(key));
    if (current[0] !== activeTableId) writeStored(key, JSON.stringify(addRecentId(current, activeTableId)));
  }, [activeBaseId, activeTableId, tableName]);

  const viewName = view?.name;
  useEffect(() => {
    if (!activeBaseId || !activeTableId || !activeViewId || !viewName) return;
    recordRecentItem({ kind: 'view', id: activeViewId, label: viewName, baseId: activeBaseId, tableId: activeTableId });
  }, [activeBaseId, activeTableId, activeViewId, viewName]);
}
