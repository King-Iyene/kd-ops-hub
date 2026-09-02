import { DatabaseTopBar } from './DatabaseTopBar';
import { DatabaseSidebar } from './DatabaseSidebar';
import { TableTabBar } from './TableTabBar';
import { useDatabaseUI } from '../lib/store';
import { TableView } from '../pages/TableView';
import { EmptyState } from '../pages/EmptyState';
import { ToastContainer } from './Toast';

export function DatabaseShell() {
  const activeBaseId = useDatabaseUI((s) => s.activeBaseId);
  const activeTableId = useDatabaseUI((s) => s.activeTableId);

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-white dark:bg-[hsl(200,30%,8%)]">
      <DatabaseTopBar />
      <div className="flex flex-1 min-h-0">
        <DatabaseSidebar />
        <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
          {activeBaseId && <TableTabBar />}
          {activeTableId ? <TableView /> : <EmptyState />}
        </main>
      </div>
      <ToastContainer />
    </div>
  );
}
