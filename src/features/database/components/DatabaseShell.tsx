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
import { KeyboardShortcutsDialog } from './KeyboardShortcutsDialog';
import { useGlobalShortcuts } from './useGlobalShortcuts';
import { GlobalSearchDialog } from './GlobalSearchDialog';
import { CommandPalette } from './CommandPalette';
import { SearchReplaceDialog } from './SearchReplaceDialog';
import { useRealtimeMetadata, usePresence } from '../hooks/useRealtime';
import { useNavigationHistory } from '../hooks/useNavigationHistory';
import { OPEN_PALETTE_EVENT } from '../lib/shortcuts';

export function DatabaseShell() {
  const activeBaseId = useDatabaseUI((s) => s.activeBaseId);
  const activeTableId = useDatabaseUI((s) => s.activeTableId);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [globalSearchQuery, setGlobalSearchQuery] = useState('');
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [tablesOpen, setTablesOpen] = useState(false);
  const [replaceOpen, setReplaceOpen] = useState(false);

  const handleOpenShortcuts = useCallback(() => setShortcutsOpen(true), []);
  const handleOpenReplace = useCallback(() => setReplaceOpen(true), []);
  const handleTogglePalette = useCallback(() => setPaletteOpen((v) => !v), []);
  const handleOpenTables = useCallback(() => setTablesOpen(true), []);
  const handleSearchRecords = useCallback((query: string) => {
    setGlobalSearchQuery(query);
    setGlobalSearchOpen(true);
  }, []);
  // Ctrl+J needs a table strip to open into, and must not reach behind a modal dialog.
  const handleToggleTables = useCallback(() => {
    if (!activeBaseId) return;
    // Popovers are role="dialog" too but carry data-side; only a real modal blocks the shortcut.
    if (document.querySelector('[role="dialog"][data-state="open"]:not([data-side])')) return;
    setTablesOpen((v) => !v);
  }, [activeBaseId]);

  useGlobalShortcuts({
    onOpenShortcuts: handleOpenShortcuts,
    onOpenReplace: handleOpenReplace,
    onTogglePalette: handleTogglePalette,
    onToggleTables: handleToggleTables,
  });

  // Buttons elsewhere (the sidebar's search button) open the palette through this event.
  useEffect(() => {
    const open = () => setPaletteOpen(true);
    window.addEventListener(OPEN_PALETTE_EVENT, open);
    return () => window.removeEventListener(OPEN_PALETTE_EVENT, open);
  }, []);

  useRealtimeMetadata();
  usePresence(activeBaseId ?? undefined);
  useNavigationHistory();

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
          {activeBaseId && <TableTabBar tablesOpen={tablesOpen} onTablesOpenChange={setTablesOpen} />}
          {activeTableId ? <TableView /> : <EmptyState />}
        </main>
      </div>
      <ToastContainer />
      <KeyboardShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        onSearchRecords={handleSearchRecords}
        onBrowseTables={handleOpenTables}
      />
      <GlobalSearchDialog open={globalSearchOpen} onOpenChange={setGlobalSearchOpen} initialQuery={globalSearchQuery} />
      <SearchReplaceDialog open={replaceOpen} onOpenChange={setReplaceOpen} />
    </div>
  );
}
