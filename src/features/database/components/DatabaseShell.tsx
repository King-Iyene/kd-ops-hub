import { useState, useCallback, useEffect } from 'react';
import { DatabaseTopBar } from './DatabaseTopBar';
import { DatabaseSidebar } from './DatabaseSidebar';
import { TableTabBar } from './TableTabBar';
import { useDatabaseUI } from '../lib/store';
import { useTables } from '../hooks/useTables';
import { useBases } from '../hooks/useBases';
import { TableView } from '../pages/TableView';
import { EmptyState } from '../pages/EmptyState';
import { ToastContainer } from './Toast';
import { KeyboardShortcutsDialog, useGlobalShortcuts } from './KeyboardShortcutsDialog';
import { GlobalSearchDialog } from './GlobalSearchDialog';
import { SearchReplaceDialog } from './SearchReplaceDialog';
import { useRealtimeMetadata, usePresence } from '../hooks/useRealtime';

export function DatabaseShell() {
  const activeBaseId = useDatabaseUI((s) => s.activeBaseId);
  const activeTableId = useDatabaseUI((s) => s.activeTableId);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [replaceOpen, setReplaceOpen] = useState(false);

  const handleOpenShortcuts = useCallback(() => setShortcutsOpen(true), []);
  const handleOpenReplace = useCallback(() => setReplaceOpen(true), []);

  useGlobalShortcuts({
    onOpenShortcuts: handleOpenShortcuts,
    onOpenReplace: handleOpenReplace,
  });

  useRealtimeMetadata();
  usePresence(activeBaseId ?? undefined);

  const { data: bases } = useBases();
  const { data: tables } = useTables(activeBaseId);
  useEffect(() => {
    const baseName = bases?.find((b: any) => b.id === activeBaseId)?.name;
    const tableName = tables?.find((t: any) => t.id === activeTableId)?.name;
    const parts = [tableName, baseName].filter(Boolean);
    document.title = parts.length ? `${parts.join(' · ')} — KDOps` : 'KDOps';
    return () => { document.title = 'KDOps'; };
  }, [activeBaseId, activeTableId, bases, tables]);

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-white dark:bg-[hsl(220,20%,10%)]">
      <DatabaseTopBar />
      <div className="flex flex-1 min-h-0">
        <DatabaseSidebar />
        <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
          {activeBaseId && <TableTabBar />}
          {activeTableId ? <TableView /> : <EmptyState />}
        </main>
      </div>
      <ToastContainer />
      <KeyboardShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
      <GlobalSearchDialog open={globalSearchOpen} onOpenChange={setGlobalSearchOpen} />
      <SearchReplaceDialog open={replaceOpen} onOpenChange={setReplaceOpen} />
    </div>
  );
}
