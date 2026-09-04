import { useState } from 'react';
import {
  Plus, Pencil, Trash2, Table, Columns, History, Search,
  Filter, ChevronDown, Loader2,
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useAuditLog } from '../hooks/useAuditLog';
import type { AuditLogEntry } from '../types';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

type ActionType = AuditLogEntry['action'];

const ACTION_META: Record<ActionType, { label: string; color: string; darkColor: string; Icon: typeof Plus }> = {
  INSERT:       { label: 'Insert',       color: '#059669', darkColor: '#34D399', Icon: Plus },
  UPDATE:       { label: 'Update',       color: '#166EE1', darkColor: '#6B8AFF', Icon: Pencil },
  DELETE:       { label: 'Delete',       color: '#DC2626', darkColor: '#F87171', Icon: Trash2 },
  BULK_DELETE:  { label: 'Bulk Delete',  color: '#DC2626', darkColor: '#F87171', Icon: Trash2 },
  CREATE_TABLE: { label: 'Create Table', color: '#7C3AED', darkColor: '#A78BFA', Icon: Table },
  DELETE_TABLE: { label: 'Delete Table', color: '#7C3AED', darkColor: '#A78BFA', Icon: Table },
  CREATE_FIELD: { label: 'Create Field', color: '#7C3AED', darkColor: '#A78BFA', Icon: Columns },
  DELETE_FIELD: { label: 'Delete Field', color: '#7C3AED', darkColor: '#A78BFA', Icon: Columns },
};

const ALL_ACTIONS: ActionType[] = [
  'INSERT', 'UPDATE', 'DELETE', 'BULK_DELETE',
  'CREATE_TABLE', 'DELETE_TABLE', 'CREATE_FIELD', 'DELETE_FIELD',
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatTimestamp(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function ChangeDiff({ changes }: { changes: Record<string, { old: any; new: any }> }) {
  const entries = Object.entries(changes);
  if (entries.length === 0) return null;

  return (
    <div className="mt-2 rounded-md border border-[#E5E5E5] dark:border-[hsl(200,25%,18%)] overflow-hidden text-[12px]">
      {entries.map(([field, { old: oldVal, new: newVal }]) => (
        <div
          key={field}
          className="flex gap-2 px-2.5 py-1.5 border-b last:border-b-0 border-[#E5E5E5] dark:border-[hsl(200,25%,18%)] bg-[#FAFAFA] dark:bg-[hsl(200,30%,12%)]"
        >
          <span className="font-medium text-[#374151] dark:text-[hsl(200,25%,88%)] shrink-0 w-[120px] truncate" title={field}>
            {field}
          </span>
          <span className="text-red-500 dark:text-red-400 line-through truncate max-w-[180px]" title={String(oldVal ?? '')}>
            {oldVal === null || oldVal === undefined ? '(empty)' : String(oldVal)}
          </span>
          <span className="text-[#6A7184] dark:text-[hsl(200,25%,60%)]">&rarr;</span>
          <span className="text-green-600 dark:text-green-400 truncate max-w-[180px]" title={String(newVal ?? '')}>
            {newVal === null || newVal === undefined ? '(empty)' : String(newVal)}
          </span>
        </div>
      ))}
    </div>
  );
}

function EntryRow({ entry }: { entry: AuditLogEntry }) {
  const meta = ACTION_META[entry.action];
  const IconComp = meta.Icon;

  return (
    <div className="flex gap-3 px-4 py-3 border-b border-[#E5E5E5] dark:border-[hsl(200,25%,18%)] last:border-b-0 hover:bg-[#F9F9FA] dark:hover:bg-[hsl(200,30%,12%)] transition-colors">
      {/* Icon */}
      <div
        className="mt-0.5 h-7 w-7 rounded-full flex items-center justify-center shrink-0"
        style={{ backgroundColor: `${meta.color}18` }}
      >
        <IconComp size={14} style={{ color: meta.color }} className="dark:hidden" />
        <IconComp size={14} style={{ color: meta.darkColor }} className="hidden dark:block" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[13px] font-medium text-[#374151] dark:text-[hsl(200,25%,88%)]">
            {entry.user_email}
          </span>
          <span
            className="text-[11px] font-medium px-1.5 py-0.5 rounded"
            style={{
              backgroundColor: `${meta.color}18`,
              color: meta.color,
            }}
          >
            {meta.label}
          </span>
          <span className="text-[11px] text-[#6A7184] dark:text-[hsl(200,25%,60%)] ml-auto shrink-0">
            {formatTimestamp(entry.created_at)}
          </span>
        </div>
        <p className="text-[12px] text-[#6A7184] dark:text-[hsl(200,25%,60%)] mt-0.5 truncate">
          {entry.description}
        </p>
        {entry.action === 'UPDATE' && entry.changes && (
          <ChangeDiff changes={entry.changes} />
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main dialog                                                        */
/* ------------------------------------------------------------------ */

interface AuditLogDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  baseId: string | null;
}

export function AuditLogDialog({ open, onOpenChange, baseId }: AuditLogDialogProps) {
  const [page, setPage] = useState(0);
  const [actionFilter, setActionFilter] = useState<ActionType | 'ALL'>('ALL');
  const [search, setSearch] = useState('');

  const { data, isLoading } = useAuditLog(baseId, page, actionFilter, search);
  const filtered = data?.entries ?? [];
  const hasMore = data?.hasMore ?? false;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px] max-h-[85vh] flex flex-col p-0 gap-0">
        {/* Header */}
        <DialogHeader className="px-4 pt-4 pb-3 border-b border-[#E5E5E5] dark:border-[hsl(200,25%,18%)] shrink-0">
          <DialogTitle className="text-[15px] font-semibold flex items-center gap-2">
            <History size={16} className="text-[#166EE1]" />
            Audit Log
          </DialogTitle>
        </DialogHeader>

        {/* Filters */}
        <div className="px-4 py-2.5 flex items-center gap-2 border-b border-[#E5E5E5] dark:border-[hsl(200,25%,18%)] shrink-0 flex-wrap">
          <div className="relative flex-1 min-w-[160px]">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#6A7184] dark:text-[hsl(200,25%,60%)]" />
            <Input
              placeholder="Search actions..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
              className="h-8 pl-8 text-[12px] border-[#E5E5E5] dark:border-[hsl(200,25%,18%)]"
            />
          </div>
          <Select
            value={actionFilter}
            onValueChange={(v) => { setActionFilter(v as ActionType | 'ALL'); setPage(0); }}
          >
            <SelectTrigger className="h-8 w-[160px] text-[12px] border-[#E5E5E5] dark:border-[hsl(200,25%,18%)]">
              <Filter size={12} className="mr-1 text-[#6A7184] dark:text-[hsl(200,25%,60%)]" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Actions</SelectItem>
              {ALL_ACTIONS.map((a) => (
                <SelectItem key={a} value={a}>{ACTION_META[a].label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Feed */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-[#6A7184] dark:text-[hsl(200,25%,60%)]">
              <Loader2 size={20} className="animate-spin mr-2" />
              Loading...
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center px-4">
              <div className="h-12 w-12 rounded-full bg-[#F4F4F5] dark:bg-[hsl(200,30%,14%)] flex items-center justify-center mb-3">
                <History size={24} className="text-[#6A7184] dark:text-[hsl(200,25%,50%)]" />
              </div>
              <p className="text-[14px] font-medium text-[#374151] dark:text-[hsl(200,25%,88%)]">
                No audit entries
              </p>
              <p className="text-[12px] text-[#6A7184] dark:text-[hsl(200,25%,60%)] mt-1">
                {search || actionFilter !== 'ALL'
                  ? 'Try adjusting your filters.'
                  : 'Actions performed on this base will appear here.'}
              </p>
            </div>
          ) : (
            filtered.map((entry) => <EntryRow key={entry.id} entry={entry} />)
          )}
        </div>

        {/* Pagination */}
        {(page > 0 || hasMore) && (
          <div className="px-4 py-2.5 border-t border-[#E5E5E5] dark:border-[hsl(200,25%,18%)] flex items-center justify-between shrink-0">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-[12px] text-[#6A7184] dark:text-[hsl(200,25%,60%)]"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              Previous
            </Button>
            <span className="text-[11px] text-[#6A7184] dark:text-[hsl(200,25%,60%)]">Page {page + 1}</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-[12px] text-[#6A7184] dark:text-[hsl(200,25%,60%)]"
              disabled={!hasMore}
              onClick={() => setPage((p) => p + 1)}
            >
              Load more
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
