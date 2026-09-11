import { useState, useMemo } from 'react';
import { Trash2, RotateCcw, Search, AlertTriangle, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  useTrashRecords,
  useRestoreRecord,
  usePermanentlyDeleteRecord,
  useEmptyTrash,
} from '../hooks/useTrash';
import { useTables } from '../hooks';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function timeAgo(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays === 1) return 'Yesterday';
  return `${diffDays}d ago`;
}

function daysUntil(iso: string) {
  const expires = new Date(iso);
  const now = new Date();
  const diffMs = expires.getTime() - now.getTime();
  const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  if (days <= 0) return 'Expiring soon';
  if (days === 1) return '1 day left';
  return `${days} days left`;
}

function primaryFieldValue(recordData: Record<string, any>): string {
  // Try common primary field names
  for (const key of ['title', 'name', 'Name', 'Title', 'label', 'Label']) {
    if (recordData[key] && typeof recordData[key] === 'string') {
      return recordData[key];
    }
  }
  // Fall back to first non-system string field
  for (const [key, val] of Object.entries(recordData)) {
    if (['id', 'created_at', 'updated_at', 'nc_order'].includes(key)) continue;
    if (typeof val === 'string' && val.length > 0) return val;
  }
  return recordData.id?.slice(0, 8) ?? 'Record';
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

interface TrashDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  baseId: string | null;
}

export function TrashDialog({ open, onOpenChange, baseId }: TrashDialogProps) {
  const [search, setSearch] = useState('');
  const [confirmEmpty, setConfirmEmpty] = useState(false);

  const { data: trashItems = [], isLoading } = useTrashRecords(baseId);
  const { data: tables = [] } = useTables(baseId);

  const restoreRecord = useRestoreRecord();
  const permanentlyDelete = usePermanentlyDeleteRecord();
  const emptyTrash = useEmptyTrash();

  const tableNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of tables) {
      map.set(t.id, t.title ?? t.pg_table_name);
    }
    return map;
  }, [tables]);

  const filtered = useMemo(() => {
    if (!search.trim()) return trashItems;
    const q = search.toLowerCase();
    return trashItems.filter((item) => {
      const pv = primaryFieldValue(item.record_data).toLowerCase();
      const tableName = (tableNameMap.get(item.table_id) ?? '').toLowerCase();
      return pv.includes(q) || tableName.includes(q);
    });
  }, [trashItems, search, tableNameMap]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <Trash2 size={18} />
              Trash
              {trashItems.length > 0 && (
                <span className="text-xs font-normal text-zinc-400 dark:text-zinc-500 ml-1">
                  ({trashItems.length} item{trashItems.length !== 1 ? 's' : ''})
                </span>
              )}
            </DialogTitle>
            {trashItems.length > 0 && (
              <div className="flex items-center gap-2">
                {!confirmEmpty ? (
                  <Button
                    variant="destructive"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setConfirmEmpty(true)}
                  >
                    Empty Trash
                  </Button>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-destructive">Delete all permanently?</span>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="h-6 text-xs px-2"
                      onClick={() => {
                        if (baseId) emptyTrash.mutate({ baseId });
                        setConfirmEmpty(false);
                      }}
                    >
                      Yes
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs px-2"
                      onClick={() => setConfirmEmpty(false)}
                    >
                      No
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </DialogHeader>

        {/* Search */}
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
          <Input
            placeholder="Search trashed records..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-8 text-sm"
          />
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-zinc-400">
              <Loader2 size={20} className="animate-spin mr-2" />
              Loading...
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-zinc-400 dark:text-zinc-500">
              <Trash2 size={32} className="mb-2 opacity-40" />
              <p className="text-sm">
                {trashItems.length === 0 ? 'Trash is empty' : 'No matching records'}
              </p>
              <p className="text-xs mt-1 opacity-70">
                Deleted records are kept for 30 days before permanent deletion.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {filtered.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between py-2.5 px-1 group hover:bg-zinc-50 dark:hover:bg-zinc-800/50 rounded"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate">
                      {primaryFieldValue(item.record_data)}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-zinc-400 dark:text-zinc-500">
                        {tableNameMap.get(item.table_id) ?? 'Unknown table'}
                      </span>
                      <span className="text-xs text-zinc-300 dark:text-zinc-600">·</span>
                      <span className="text-xs text-zinc-400 dark:text-zinc-500">
                        {timeAgo(item.deleted_at)}
                      </span>
                      <span className="text-xs text-zinc-300 dark:text-zinc-600">·</span>
                      <span className="text-xs text-warning flex items-center gap-0.5">
                        <AlertTriangle size={10} />
                        {daysUntil(item.expires_at)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs gap-1 text-primary hover:bg-primary/5 dark:hover:bg-primary/10"
                      onClick={() =>
                        restoreRecord.mutate({
                          trashId: item.id,
                          baseId: item.base_id,
                          tableId: item.table_id,
                        })
                      }
                      disabled={restoreRecord.isPending}
                    >
                      <RotateCcw size={12} />
                      Restore
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs gap-1 text-destructive hover:bg-destructive/5 dark:hover:bg-destructive/10"
                      onClick={() =>
                        permanentlyDelete.mutate({
                          trashId: item.id,
                          baseId: item.base_id,
                        })
                      }
                      disabled={permanentlyDelete.isPending}
                    >
                      <Trash2 size={12} />
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
