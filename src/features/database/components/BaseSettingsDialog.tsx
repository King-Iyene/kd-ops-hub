import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { useUpdateBase, useDeleteBase } from '../hooks';
import { useDatabaseUI } from '../lib/store';
import { useSnapshots, useCreateSnapshot, useRestoreSnapshot, useDeleteSnapshot, useExportBase } from '../hooks/useBackups';
import type { Base } from '../types';

interface BaseSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  base: Base;
}

const COLOR_OPTIONS = [
  { name: 'Blue', value: '#166EE1' },
  { name: 'Green', value: '#10B981' },
  { name: 'Teal', value: '#14B8A6' },
  { name: 'Purple', value: '#8B5CF6' },
  { name: 'Pink', value: '#EC4899' },
  { name: 'Red', value: '#EF4444' },
  { name: 'Orange', value: '#F97316' },
  { name: 'Yellow', value: '#F59E0B' },
  { name: 'Lime', value: '#84CC16' },
  { name: 'Cyan', value: '#06B6D4' },
  { name: 'Indigo', value: '#6366F1' },
  { name: 'Gray', value: '#64748B' },
];

const EMOJI_OPTIONS = [
  '📊', '📁', '📋', '📅', '📦',
  '🚀', '⭐', '💡', '🎯', '🔧',
  '📝', '📚', '🧩', '🌐', '❤️',
  '🏠', '🎨', '💼', '🔬', '📈',
];

type Tab = 'general' | 'backups' | 'danger';

export function BaseSettingsDialog({ open, onOpenChange, base }: BaseSettingsDialogProps) {
  const [tab, setTab] = useState<Tab>('general');
  const [name, setName] = useState(base.name);
  const [color, setColor] = useState(base.color ?? '#166EE1');
  const [icon, setIcon] = useState(base.icon ?? '📊');
  const [error, setError] = useState('');
  const [confirmName, setConfirmName] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const updateBase = useUpdateBase();
  const deleteBase = useDeleteBase();
  const { activeBaseId, setActiveBase } = useDatabaseUI();

  // Reset state when base changes or dialog opens
  useEffect(() => {
    if (open) {
      setName(base.name);
      setColor(base.color ?? '#166EE1');
      setIcon(base.icon ?? '📊');
      setError('');
      setConfirmName('');
      setShowDeleteConfirm(false);
      setTab('general');
    }
  }, [open, base]);

  const handleSave = async () => {
    if (!name.trim()) {
      setError('Base name is required');
      return;
    }
    setError('');
    try {
      await updateBase.mutateAsync({
        id: base.id,
        name: name.trim(),
        color,
        icon,
      });
      onOpenChange(false);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to update base');
    }
  };

  const handleDelete = async () => {
    try {
      await deleteBase.mutateAsync(base.id);
      if (activeBaseId === base.id) setActiveBase(null);
      onOpenChange(false);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to delete base');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Base Settings</DialogTitle>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-[#E5E5E5] dark:border-[hsl(200,25%,18%)] mb-4">
          <button
            className={cn(
              'px-3 py-1.5 text-xs font-medium border-b-2 transition-colors -mb-px',
              tab === 'general'
                ? 'border-[#166EE1] text-[#166EE1]'
                : 'border-transparent text-[#6A7184] dark:text-[hsl(200,20%,55%)] hover:text-[#374151] dark:hover:text-[hsl(200,25%,88%)]',
            )}
            onClick={() => setTab('general')}
          >
            General
          </button>
          <button
            className={cn(
              'px-3 py-1.5 text-xs font-medium border-b-2 transition-colors -mb-px',
              tab === 'backups'
                ? 'border-[#166EE1] text-[#166EE1]'
                : 'border-transparent text-[#6A7184] dark:text-[hsl(200,20%,55%)] hover:text-[#374151] dark:hover:text-[hsl(200,25%,88%)]',
            )}
            onClick={() => setTab('backups')}
          >
            Backups
          </button>
          <button
            className={cn(
              'px-3 py-1.5 text-xs font-medium border-b-2 transition-colors -mb-px',
              tab === 'danger'
                ? 'border-red-500 text-red-500'
                : 'border-transparent text-[#6A7184] dark:text-[hsl(200,20%,55%)] hover:text-[#374151] dark:hover:text-[hsl(200,25%,88%)]',
            )}
            onClick={() => setTab('danger')}
          >
            Danger Zone
          </button>
        </div>

        {tab === 'general' && (
          <div className="space-y-4">
            {/* Name */}
            <div className="space-y-1.5">
              <Label htmlFor="settings-base-name" className="text-xs">
                Base Name
              </Label>
              <Input
                id="settings-base-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Base name"
                onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              />
            </div>

            {/* Color */}
            <div className="space-y-1.5">
              <Label className="text-xs">Color</Label>
              <div className="flex flex-wrap gap-1.5">
                {COLOR_OPTIONS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    title={c.name}
                    className={cn(
                      'w-7 h-7 rounded-full transition-transform',
                      color === c.value && 'ring-2 ring-offset-2 ring-[#166EE1] dark:ring-offset-[hsl(200,30%,10%)] scale-110',
                    )}
                    style={{ backgroundColor: c.value }}
                    onClick={() => setColor(c.value)}
                  />
                ))}
              </div>
            </div>

            {/* Icon */}
            <div className="space-y-1.5">
              <Label className="text-xs">Icon</Label>
              <div className="flex flex-wrap gap-1.5">
                {EMOJI_OPTIONS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    className={cn(
                      'w-8 h-8 rounded flex items-center justify-center text-base hover:bg-gray-100 dark:hover:bg-[hsl(200,25%,15%)] transition-colors',
                      icon === emoji && 'ring-2 ring-[#166EE1] bg-[#166EE1]/5',
                    )}
                    onClick={() => setIcon(emoji)}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>

            {error && <p className="text-xs text-red-500">{error}</p>}
          </div>
        )}

        {tab === 'backups' && (
          <BackupsTab baseId={base.id} />
        )}

        {tab === 'danger' && (
          <div className="space-y-4">
            <div className="rounded-md border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/5 p-4">
              <h4 className="text-sm font-medium text-red-700 dark:text-red-400 mb-1">
                Delete this base
              </h4>
              <p className="text-xs text-red-600/80 dark:text-red-400/70 mb-3">
                This action cannot be undone. All tables, fields, and data in this base will be
                permanently deleted.
              </p>

              {!showDeleteConfirm ? (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setShowDeleteConfirm(true)}
                >
                  Delete Base
                </Button>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="confirm-delete" className="text-xs text-red-600 dark:text-red-400">
                    Type <span className="font-semibold">{base.name}</span> to confirm
                  </Label>
                  <Input
                    id="confirm-delete"
                    value={confirmName}
                    onChange={(e) => setConfirmName(e.target.value)}
                    placeholder={base.name}
                    className="border-red-300 dark:border-red-500/40"
                  />
                  <div className="flex gap-2">
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={confirmName !== base.name || deleteBase.isPending}
                      onClick={handleDelete}
                    >
                      {deleteBase.isPending ? 'Deleting...' : 'Permanently Delete'}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setShowDeleteConfirm(false);
                        setConfirmName('');
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
            {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
          </div>
        )}

        {tab === 'general' && (
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              className="bg-[#166EE1] hover:bg-[#2952CC]"
              onClick={handleSave}
              disabled={updateBase.isPending}
            >
              {updateBase.isPending ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

function BackupsTab({ baseId }: { baseId: string }) {
  const [snapshotName, setSnapshotName] = useState('');
  const [restoreId, setRestoreId] = useState<string | null>(null);
  const snapshots = useSnapshots(baseId);
  const createSnapshot = useCreateSnapshot();
  const restoreSnapshot = useRestoreSnapshot();
  const deleteSnapshot = useDeleteSnapshot();
  const exportBase = useExportBase();

  const handleCreate = async () => {
    const name = snapshotName.trim() || `Backup ${new Date().toLocaleString()}`;
    await createSnapshot.mutateAsync({ baseId, name });
    setSnapshotName('');
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="text-xs">Create Snapshot</Label>
        <div className="flex gap-2">
          <Input
            value={snapshotName}
            onChange={(e) => setSnapshotName(e.target.value)}
            placeholder="Snapshot name (optional)"
            className="flex-1"
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          />
          <Button
            size="sm"
            className="bg-[#166EE1] hover:bg-[#2952CC] shrink-0"
            onClick={handleCreate}
            disabled={createSnapshot.isPending}
          >
            {createSnapshot.isPending ? 'Creating...' : 'Create'}
          </Button>
        </div>
      </div>

      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => exportBase.mutate(baseId)}
          disabled={exportBase.isPending}
        >
          {exportBase.isPending ? 'Exporting...' : 'Export as JSON'}
        </Button>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Snapshots</Label>
        {snapshots.isLoading && (
          <p className="text-xs text-muted-foreground">Loading...</p>
        )}
        {snapshots.data?.length === 0 && (
          <p className="text-xs text-muted-foreground">No snapshots yet</p>
        )}
        <div className="max-h-48 overflow-y-auto space-y-1.5">
          {snapshots.data?.map((snap) => (
            <div
              key={snap.id}
              className="flex items-center justify-between p-2 rounded border border-border bg-muted/30"
            >
              <div className="min-w-0">
                <p className="text-xs font-medium truncate">{snap.name}</p>
                <p className="text-[10px] text-muted-foreground">
                  {new Date(snap.created_at).toLocaleString()}
                </p>
              </div>
              <div className="flex gap-1 shrink-0">
                {restoreId === snap.id ? (
                  <>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="text-[10px] h-6 px-2"
                      onClick={async () => {
                        await restoreSnapshot.mutateAsync(snap.id);
                        setRestoreId(null);
                      }}
                      disabled={restoreSnapshot.isPending}
                    >
                      {restoreSnapshot.isPending ? 'Restoring...' : 'Confirm'}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-[10px] h-6 px-2"
                      onClick={() => setRestoreId(null)}
                    >
                      Cancel
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-[10px] h-6 px-2"
                      onClick={() => setRestoreId(snap.id)}
                    >
                      Restore
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-[10px] h-6 px-2 text-red-500 hover:text-red-600"
                      onClick={() => deleteSnapshot.mutate({ snapshotId: snap.id, baseId })}
                    >
                      Delete
                    </Button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
