import { useState, useMemo, useCallback } from 'react';
import { Database, Plus, Table2, Search, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CreateBaseDialog } from '../components/CreateBaseDialog';
import { useDatabaseUI } from '../lib/store';
import { useDatabaseNavigate } from '../hooks/useNavigate';
import { useBases } from '../hooks/useBases';
import { useTables } from '../hooks/useTables';
import type { Base } from '../types';

const DEFAULT_COLORS = [
  '#2D7FF9', '#0D9488', '#8B5CF6', '#F59E0B', '#EF4444', '#10B981',
  '#EC4899', '#6366F1', '#14B8A6', '#F97316',
];

function pickColor(name: string): string {
  const hash = Math.abs(name.split('').reduce((a, c) => a + c.charCodeAt(0), 0));
  return DEFAULT_COLORS[hash % DEFAULT_COLORS.length];
}

function getTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function BaseCardTableCount({ baseId }: { baseId: string }) {
  const { data } = useTables(baseId);
  const count = data?.length ?? 0;
  return (
    <span className="flex items-center gap-1">
      <Table2 size={12} />
      {count} {count === 1 ? 'table' : 'tables'}
    </span>
  );
}

function BaseCard({ base, onSelect }: { base: Base; onSelect: () => void }) {
  const color = base.color || pickColor(base.name);
  const timeAgo = getTimeAgo(base.updated_at);

  return (
    <button
      onClick={onSelect}
      className="flex flex-col p-4 rounded-xl border border-[#E5E5E5] dark:border-[hsl(200,25%,18%)] bg-white dark:bg-[hsl(200,30%,10%)] hover:border-[#2D7FF9] dark:hover:border-[#2D7FF9] hover:shadow-md transition-all text-left group"
    >
      <div className="flex items-start gap-3 mb-3">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 text-lg"
          style={{ backgroundColor: color + '18' }}
        >
          {base.icon ? (
            <span>{base.icon}</span>
          ) : (
            <Database size={20} style={{ color }} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold text-[#374151] dark:text-[hsl(200,25%,88%)] group-hover:text-[#2D7FF9] truncate">
            {base.name}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3 mt-auto text-[11px] text-[#9AA2AF]">
        <BaseCardTableCount baseId={base.id} />
        <span className="flex items-center gap-1">
          <Clock size={12} />
          {timeAgo}
        </span>
      </div>
    </button>
  );
}

export function EmptyState() {
  const [createOpen, setCreateOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const activeBaseId = useDatabaseUI((s) => s.activeBaseId);
  const { navigateToBase } = useDatabaseNavigate();
  const { data: bases } = useBases();

  const filteredBases = useMemo(
    () =>
      (bases ?? []).filter((b) =>
        b.name.toLowerCase().includes(searchQuery.toLowerCase())
      ),
    [bases, searchQuery]
  );

  const handleSelect = useCallback(
    (id: string) => () => navigateToBase(id),
    [navigateToBase]
  );

  // If a base is selected but has no tables, show the "no tables" state
  if (activeBaseId) {
    return (
      <div className="flex-1 flex items-center justify-center bg-white dark:bg-[hsl(200,30%,8%)]">
        <div className="text-center space-y-4 max-w-sm">
          <div className="mx-auto w-14 h-14 rounded-xl bg-[#F0F3FF] dark:bg-[hsl(220,30%,14%)] flex items-center justify-center">
            <Table2 size={28} className="text-[#2D7FF9]" />
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
    <div className="flex-1 bg-[#F9F9FA] dark:bg-[hsl(200,30%,8%)] overflow-y-auto">
      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold text-[#374151] dark:text-[hsl(200,25%,92%)]">
            Your Bases
          </h1>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#9AA2AF]" />
              <input
                type="text"
                placeholder="Filter bases..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-3 py-1.5 text-[13px] rounded-lg border border-[#E5E5E5] dark:border-[hsl(200,25%,18%)] bg-white dark:bg-[hsl(200,30%,10%)] text-[#374151] dark:text-[hsl(200,25%,88%)] placeholder:text-[#9AA2AF] focus:outline-none focus:border-[#2D7FF9] w-48"
              />
            </div>
          </div>
        </div>

        {/* Base grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 mb-6">
          {/* Create Base card */}
          <button
            onClick={() => setCreateOpen(true)}
            className="flex flex-col items-center justify-center p-4 rounded-xl border-2 border-dashed border-[#D1D5DB] dark:border-[hsl(200,25%,22%)] hover:border-[#2D7FF9] dark:hover:border-[#2D7FF9] bg-white/50 dark:bg-[hsl(200,30%,12%)] transition-all min-h-[120px] group"
          >
            <div className="w-10 h-10 rounded-full bg-[#2D7FF9]/10 flex items-center justify-center mb-2 group-hover:bg-[#2D7FF9]/20 transition-colors">
              <Plus size={20} className="text-[#2D7FF9]" />
            </div>
            <span className="text-[13px] font-medium text-[#6A7184] group-hover:text-[#2D7FF9]">
              Create Base
            </span>
          </button>

          {filteredBases.map((base) => (
            <BaseCard
              key={base.id}
              base={base}
              onSelect={handleSelect(base.id)}
            />
          ))}
        </div>

        {filteredBases.length === 0 && searchQuery && (
          <div className="text-center py-12">
            <p className="text-[13px] text-[#9AA2AF]">No bases match &ldquo;{searchQuery}&rdquo;</p>
          </div>
        )}

        {(bases ?? []).length === 0 && !searchQuery && (
          <div className="text-center py-8">
            <p className="text-[13px] text-[#9AA2AF]">
              No bases yet. Create one or import from Airtable to get started.
            </p>
          </div>
        )}
      </div>

      <CreateBaseDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        template={null}
      />
    </div>
  );
}
