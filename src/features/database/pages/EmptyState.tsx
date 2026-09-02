import { useState } from 'react';
import { Database } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CreateBaseDialog } from '../components/CreateBaseDialog';

export function EmptyState() {
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center space-y-4">
        <div className="mx-auto w-14 h-14 rounded-full bg-[#006994]/10 flex items-center justify-center">
          <Database size={28} className="text-[#006994]" />
        </div>
        <div>
          <p className="text-sm font-medium text-[#0F172A]">No table selected</p>
          <p className="text-xs text-[#475569] mt-1">
            Select a table from the sidebar, or create your first base
          </p>
        </div>
        <Button
          className="bg-[#006994] hover:bg-[#005a7d]"
          size="sm"
          onClick={() => setCreateOpen(true)}
        >
          Create Base
        </Button>
      </div>
      <CreateBaseDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
