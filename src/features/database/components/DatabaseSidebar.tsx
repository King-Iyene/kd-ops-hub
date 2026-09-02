import { useState } from 'react';
import { Table2, ChevronDown, Plus, LayoutGrid } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useDatabaseUI } from '../lib/store';
import { useBases, useTables, useViews } from '../hooks';
import { CreateTableDialog } from './CreateTableDialog';
import { CreateBaseDialog } from './CreateBaseDialog';

export function DatabaseSidebar() {
  const {
    activeBaseId,
    activeTableId,
    activeViewId,
    sidebarOpen,
    setActiveBase,
    setActiveTable,
    setActiveView,
  } = useDatabaseUI();

  const { data: bases } = useBases();
  const { data: tables } = useTables(activeBaseId);
  const { data: views } = useViews(activeTableId);

  const [createTableOpen, setCreateTableOpen] = useState(false);
  const [createBaseOpen, setCreateBaseOpen] = useState(false);

  const activeBase = bases?.find((b: any) => b.id === activeBaseId);

  if (!sidebarOpen) return null;

  return (
    <aside className="w-[260px] bg-white border-r border-[#E2E8F0] flex flex-col shrink-0 overflow-hidden">
      {/* Base selector */}
      <div className="p-3 border-b border-[#E2E8F0]">
        <button
          className="w-full flex items-center justify-between px-2 py-1.5 rounded hover:bg-gray-50 text-left"
          onClick={() => {
            /* Could open a popover; for now cycle through or show dialog */
          }}
        >
          <span className="text-xs font-medium text-[#0F172A] truncate">
            {activeBase?.name ?? 'Select a base'}
          </span>
          <ChevronDown size={14} className="text-[#475569] shrink-0" />
        </button>

        {/* Base list dropdown inline */}
        <div className="mt-1 space-y-0.5 max-h-[160px] overflow-y-auto">
          {bases?.map((base: any) => (
            <button
              key={base.id}
              className={cn(
                'w-full text-left px-2 py-1 rounded text-xs truncate',
                base.id === activeBaseId
                  ? 'bg-[#006994]/10 text-[#006994] font-medium'
                  : 'text-[#475569] hover:bg-gray-50'
              )}
              onClick={() => setActiveBase(base.id)}
            >
              {base.icon ? `${base.icon} ` : ''}
              {base.name}
            </button>
          ))}
        </div>

        <Button
          variant="ghost"
          size="sm"
          className="w-full mt-1 text-[11px] text-[#006994] justify-start gap-1 h-7"
          onClick={() => setCreateBaseOpen(true)}
        >
          <Plus size={12} /> New Base
        </Button>
      </div>

      {/* Tables */}
      {activeBaseId && (
        <div className="flex-1 overflow-y-auto">
          <div className="px-3 pt-3 pb-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]">
              Tables
            </span>
          </div>
          <div className="space-y-0.5 px-2">
            {tables?.map((table: any) => (
              <button
                key={table.id}
                className={cn(
                  'w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs text-left transition-colors',
                  table.id === activeTableId
                    ? 'bg-[#006994]/5 text-[#006994] font-medium border-l-2 border-[#006994]'
                    : 'text-[#0F172A] hover:bg-gray-50'
                )}
                onClick={() => setActiveTable(table.id)}
              >
                <Table2 size={14} className="shrink-0" />
                <span className="truncate">{table.name}</span>
              </button>
            ))}
          </div>
          <div className="px-2 mt-1">
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-[11px] text-[#006994] justify-start gap-1 h-7"
              onClick={() => setCreateTableOpen(true)}
            >
              <Plus size={12} /> New Table
            </Button>
          </div>

          {/* Views */}
          {activeTableId && (
            <div className="mt-4">
              <div className="px-3 pb-1">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]">
                  Views
                </span>
              </div>
              <div className="space-y-0.5 px-2">
                {views?.map((view: any) => (
                  <button
                    key={view.id}
                    className={cn(
                      'w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs text-left',
                      view.id === activeViewId
                        ? 'bg-[#006994]/5 text-[#006994] font-medium'
                        : 'text-[#0F172A] hover:bg-gray-50'
                    )}
                    onClick={() => setActiveView(view.id)}
                  >
                    <LayoutGrid size={14} className="shrink-0" />
                    <span className="truncate">{view.name}</span>
                  </button>
                ))}
              </div>
              <div className="px-2 mt-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-[11px] text-[#006994] justify-start gap-1 h-7"
                >
                  <Plus size={12} /> New View
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      <CreateTableDialog open={createTableOpen} onOpenChange={setCreateTableOpen} />
      <CreateBaseDialog open={createBaseOpen} onOpenChange={setCreateBaseOpen} />
    </aside>
  );
}
