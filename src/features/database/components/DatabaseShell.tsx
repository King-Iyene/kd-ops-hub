import { useState, useCallback } from 'react';
import { DatabaseTopBar } from './DatabaseTopBar';
import { DatabaseSidebar } from './DatabaseSidebar';
import { TableTabBar } from './TableTabBar';
import { useDatabaseUI } from '../lib/store';
import { TableView } from '../pages/TableView';
import { EmptyState } from '../pages/EmptyState';
import { ToastContainer } from './Toast';
import { KeyboardShortcutsDialog, useGlobalShortcuts } from './KeyboardShortcutsDialog';
import { GlobalSearchDialog } from './GlobalSearchDialog';
import { useRealtimeMetadata, usePresence } from '../hooks/useRealtime';

export function DatabaseShell() {
  const activeBaseId = useDatabaseUI((s) => s.activeBaseId);
  const activeTableId = useDatabaseUI((s) => s.activeTableId);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);

  const handleOpenShortcuts = useCallback(() => setShortcutsOpen(true), []);

  useGlobalShortcuts({
    onOpenShortcuts: handleOpenShortcuts,
  });

  useRealtimeMetadata();
  usePresence(activeBaseId ?? undefined);

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
    </div>
  );
}
