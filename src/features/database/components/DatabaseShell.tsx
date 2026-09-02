import { DatabaseTopBar } from './DatabaseTopBar';
import { DatabaseSidebar } from './DatabaseSidebar';
import { useDatabaseUI } from '../lib/store';
import { TableView } from '../pages/TableView';
import { EmptyState } from '../pages/EmptyState';

export function DatabaseShell() {
  const sidebarOpen = useDatabaseUI((s) => s.sidebarOpen);
  const activeTableId = useDatabaseUI((s) => s.activeTableId);

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-white">
      <DatabaseTopBar />
      <div className="flex flex-1 min-h-0">
        {sidebarOpen && <DatabaseSidebar />}
        <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
          {activeTableId ? <TableView /> : <EmptyState />}
        </main>
      </div>
    </div>
  );
}
