import { useState } from 'react';
import { Database, Plus, Table2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CreateBaseDialog } from '../components/CreateBaseDialog';
import { useDatabaseUI } from '../lib/store';

export function EmptyState() {
  const [createOpen, setCreateOpen] = useState(false);
  const activeBaseId = useDatabaseUI((s) => s.activeBaseId);

  if (activeBaseId) {
    return (
      <div className="flex-1 flex items-center justify-center bg-white dark:bg-[hsl(200,30%,8%)]">
        <div className="text-center space-y-4 max-w-sm">
          <div className="mx-auto w-14 h-14 rounded-xl bg-[#F0F3FF] dark:bg-[hsl(220,30%,14%)] flex items-center justify-center">
            <Table2 size={28} className="text-[#3366FF]" />
          </div>
          <div>
            <p className="text-[15px] font-semibold text-[#374151] dark:text-[hsl(200,25%,88%)]">
              No tables yet
            </p>
            <p className="text-[13px] text-[#6A7184] mt-1 leading-relaxed">
              Click the <strong>+</strong> button in the table bar above to create your first table.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex items-center justify-center bg-[#F9F9FA] dark:bg-[hsl(200,30%,8%)]">
      <div className="text-center space-y-5 max-w-sm">
        <div className="mx-auto w-16 h-16 rounded-2xl bg-[#3366FF]/10 flex items-center justify-center">
          <Database size={32} className="text-[#3366FF]" />
        </div>
        <div>
          <p className="text-base font-semibold text-[#374151] dark:text-[hsl(200,25%,88%)]">
            Welcome to KDOps Data
          </p>
          <p className="text-[13px] text-[#6A7184] mt-1.5 leading-relaxed">
            Select a base from the sidebar, or create a new one to get started.
          </p>
        </div>
        <Button
          className="bg-[#3366FF] hover:bg-[#2952CC] text-white gap-1.5"
          onClick={() => setCreateOpen(true)}
        >
          <Plus size={16} /> Create Base
        </Button>
      </div>
      <CreateBaseDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
