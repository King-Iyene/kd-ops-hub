import { useState, useEffect, useCallback } from 'react';
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
import { Copy, Eye, EyeOff, Plus, Trash2, Webhook, ToggleLeft, ToggleRight } from 'lucide-react';
import { useUpdateBase, useDeleteBase } from '../hooks';
import { useDatabaseUI } from '../lib/store';
import { useDatabaseNavigate } from '../hooks/useNavigate';
import { useSnapshots, useCreateSnapshot, useRestoreSnapshot, useDeleteSnapshot, useExportBase } from '../hooks/useBackups';
import { supabase } from '@/lib/supabase';
import type { Base } from '../types';

interface BaseSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  base: Base;
}

const COLOR_OPTIONS = [
  { name: 'Blue', value: '#2D7FF9' },
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

type Tab = 'general' | 'api' | 'webhooks' | 'backups' | 'danger';

export function BaseSettingsDialog({ open, onOpenChange, base }: BaseSettingsDialogProps) {
  const [tab, setTab] = useState<Tab>('general');
  const [name, setName] = useState(base.name);
  const [color, setColor] = useState(base.color ?? '#2D7FF9');
  const [icon, setIcon] = useState(base.icon ?? '📊');
  const [error, setError] = useState('');
  const [confirmName, setConfirmName] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const updateBase = useUpdateBase();
  const deleteBase = useDeleteBase();
  const { activeBaseId } = useDatabaseUI();
  const { navigateToBase } = useDatabaseNavigate();

  // Reset state when base changes or dialog opens
  useEffect(() => {
    if (open) {
      setName(base.name);
      setColor(base.color ?? '#2D7FF9');
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
      if (activeBaseId === base.id) navigateToBase(null);
      onOpenChange(false);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to delete base');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Base Settings</DialogTitle>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-[#E5E5E5] dark:border-[hsl(200,25%,18%)] mb-4">
          <button
            className={cn(
              'px-3 py-1.5 text-xs font-medium border-b-2 transition-colors -mb-px',
              tab === 'general'
                ? 'border-[#2D7FF9] text-[#2D7FF9]'
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
                ? 'border-[#2D7FF9] text-[#2D7FF9]'
                : 'border-transparent text-[#6A7184] dark:text-[hsl(200,20%,55%)] hover:text-[#374151] dark:hover:text-[hsl(200,25%,88%)]',
            )}
            onClick={() => setTab('backups')}
          >
            Backups
          </button>
          <button
            className={cn(
              'px-3 py-1.5 text-xs font-medium border-b-2 transition-colors -mb-px',
              tab === 'api'
                ? 'border-[#2D7FF9] text-[#2D7FF9]'
                : 'border-transparent text-[#6A7184] dark:text-[hsl(200,20%,55%)] hover:text-[#374151] dark:hover:text-[hsl(200,25%,88%)]',
            )}
            onClick={() => setTab('api')}
          >
            API
          </button>
          <button
            className={cn(
              'px-3 py-1.5 text-xs font-medium border-b-2 transition-colors -mb-px',
              tab === 'webhooks'
                ? 'border-[#2D7FF9] text-[#2D7FF9]'
                : 'border-transparent text-[#6A7184] dark:text-[hsl(200,20%,55%)] hover:text-[#374151] dark:hover:text-[hsl(200,25%,88%)]',
            )}
            onClick={() => setTab('webhooks')}
          >
            Webhooks
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
                      color === c.value && 'ring-2 ring-offset-2 ring-[#2D7FF9] dark:ring-offset-[hsl(200,30%,10%)] scale-110',
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
                      icon === emoji && 'ring-2 ring-[#2D7FF9] bg-[#2D7FF9]/5',
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

        {tab === 'api' && (
          <ApiKeysTab workspaceId={base.workspace_id} baseSchemaName={base.schema_name} />
        )}

        {tab === 'webhooks' && (
          <WebhooksTab baseId={base.id} />
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
              className="bg-[#2D7FF9] hover:bg-[#2952CC]"
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
            className="bg-[#2D7FF9] hover:bg-[#2952CC] shrink-0"
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
                <p className="text-3xs text-muted-foreground">
                  {new Date(snap.created_at).toLocaleString()}
                </p>
              </div>
              <div className="flex gap-1 shrink-0">
                {restoreId === snap.id ? (
                  <>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="text-3xs h-6 px-2"
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
                      className="text-3xs h-6 px-2"
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
                      className="text-3xs h-6 px-2"
                      onClick={() => setRestoreId(snap.id)}
                    >
                      Restore
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-3xs h-6 px-2 text-red-500 hover:text-red-600"
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

// ---------- Webhooks Tab ----------

interface WebhookRow {
  id: string;
  name: string;
  url: string;
  events: string[];
  is_active: boolean;
  secret: string | null;
  last_triggered_at: string | null;
  created_at: string;
}

const EVENT_OPTIONS = [
  { value: 'record.created', label: 'Record created' },
  { value: 'record.updated', label: 'Record updated' },
  { value: 'record.deleted', label: 'Record deleted' },
];

function WebhooksTab({ baseId }: { baseId: string }) {
  const [hooks, setHooks] = useState<WebhookRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [newSecret, setNewSecret] = useState('');
  const [newEvents, setNewEvents] = useState<string[]>(['record.created', 'record.updated', 'record.deleted']);
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const fetchHooks = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .schema('nc_meta')
      .from('webhooks')
      .select('id, name, url, events, is_active, secret, last_triggered_at, created_at')
      .eq('base_id', baseId)
      .order('created_at', { ascending: false });
    setHooks(data ?? []);
    setLoading(false);
  }, [baseId]);

  useEffect(() => { fetchHooks(); }, [fetchHooks]);

  const handleCreate = async () => {
    if (!newName.trim() || !newUrl.trim()) return;
    setCreating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.schema('nc_meta').from('webhooks').insert({
        base_id: baseId,
        name: newName.trim(),
        url: newUrl.trim(),
        events: newEvents,
        secret: newSecret.trim() || null,
        is_active: true,
        created_by: user?.id,
      });
      setNewName('');
      setNewUrl('');
      setNewSecret('');
      setShowForm(false);
      await fetchHooks();
    } finally {
      setCreating(false);
    }
  };

  const toggleActive = async (id: string, current: boolean) => {
    await supabase.schema('nc_meta').from('webhooks').update({ is_active: !current }).eq('id', id);
    await fetchHooks();
  };

  const handleDelete = async (id: string) => {
    await supabase.schema('nc_meta').from('webhooks').delete().eq('id', id);
    await fetchHooks();
  };

  const toggleEvent = (ev: string) => {
    setNewEvents(prev => prev.includes(ev) ? prev.filter(e => e !== ev) : [...prev, ev]);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-[#E5E5E5] dark:border-[hsl(200,25%,18%)] bg-[#F9FAFB] dark:bg-[hsl(200,30%,8%)] p-3 space-y-1">
        <p className="text-xs font-medium text-[#374151] dark:text-[hsl(200,25%,88%)] flex items-center gap-1.5">
          <Webhook size={13} className="text-[#2D7FF9]" /> Webhooks
        </p>
        <p className="text-2xs text-[#9AA2AF]">
          Send HTTP POST requests to external URLs when records are created, updated, or deleted.
          Use with n8n, Zapier, or any webhook receiver.
        </p>
      </div>

      {!showForm ? (
        <Button
          size="sm"
          className="bg-[#2D7FF9] hover:bg-[#2952CC] w-full"
          onClick={() => setShowForm(true)}
        >
          <Plus size={12} className="mr-1" /> Add Webhook
        </Button>
      ) : (
        <div className="rounded-lg border border-[#2D7FF9]/30 bg-[#F0F3FF] dark:bg-[hsl(220,30%,12%)] p-3 space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Name</Label>
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. n8n — new expenses"
              className="h-8 text-xs-plus"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">URL</Label>
            <Input
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              placeholder="https://your-n8n.com/webhook/..."
              className="h-8 text-xs-plus font-mono"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Events</Label>
            <div className="flex flex-wrap gap-1.5">
              {EVENT_OPTIONS.map(ev => (
                <button
                  key={ev.value}
                  className={cn(
                    'px-2 py-1 rounded text-2xs border transition-colors',
                    newEvents.includes(ev.value)
                      ? 'bg-[#2D7FF9] text-white border-[#2D7FF9]'
                      : 'bg-white dark:bg-[hsl(200,30%,10%)] border-[#E5E5E5] dark:border-[hsl(200,25%,18%)] text-[#6A7184]',
                  )}
                  onClick={() => toggleEvent(ev.value)}
                >
                  {ev.label}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Secret (optional, for signature verification)</Label>
            <Input
              value={newSecret}
              onChange={(e) => setNewSecret(e.target.value)}
              placeholder="whsec_..."
              className="h-8 text-xs-plus font-mono"
            />
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              className="bg-[#2D7FF9] hover:bg-[#2952CC]"
              onClick={handleCreate}
              disabled={creating || !newName.trim() || !newUrl.trim() || !newEvents.length}
            >
              {creating ? 'Creating...' : 'Create Webhook'}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        <Label className="text-xs">Active Webhooks</Label>
        {loading && <p className="text-xs text-muted-foreground">Loading...</p>}
        {!loading && hooks.length === 0 && (
          <p className="text-xs text-muted-foreground">No webhooks configured</p>
        )}
        <div className="max-h-56 overflow-y-auto space-y-1.5">
          {hooks.map((hook) => (
            <div
              key={hook.id}
              className={cn(
                'p-2.5 rounded border transition-colors',
                hook.is_active
                  ? 'border-border bg-muted/30'
                  : 'border-border/50 bg-muted/10 opacity-60',
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium truncate">{hook.name}</p>
                  <p className="text-3xs text-muted-foreground font-mono truncate">{hook.url}</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {hook.events.map(ev => (
                      <span key={ev} className="text-3xs px-1.5 py-0.5 rounded-full bg-[#2D7FF9]/10 text-[#2D7FF9]">
                        {ev.replace('record.', '')}
                      </span>
                    ))}
                  </div>
                  {hook.last_triggered_at && (
                    <p className="text-3xs text-muted-foreground mt-1">
                      Last fired: {new Date(hook.last_triggered_at).toLocaleString()}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    className="p-1 rounded hover:bg-muted transition-colors"
                    onClick={() => toggleActive(hook.id, hook.is_active)}
                    title={hook.is_active ? 'Disable' : 'Enable'}
                  >
                    {hook.is_active
                      ? <ToggleRight size={18} className="text-[#2D7FF9]" />
                      : <ToggleLeft size={18} className="text-muted-foreground" />
                    }
                  </button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 text-red-500 hover:text-red-600"
                    onClick={() => handleDelete(hook.id)}
                  >
                    <Trash2 size={12} />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-[#E5E5E5] dark:border-[hsl(200,25%,18%)] bg-[#F9FAFB] dark:bg-[hsl(200,30%,8%)] p-3 space-y-2">
        <p className="text-xs font-medium text-[#374151] dark:text-[hsl(200,25%,88%)]">Webhook Payload</p>
        <pre className="text-3xs font-mono bg-white dark:bg-[hsl(200,30%,10%)] border rounded p-2 overflow-x-auto whitespace-pre text-[#374151] dark:text-[hsl(200,25%,88%)]">{`{
  "event": "record.created",
  "timestamp": "2026-09-05T12:00:00Z",
  "base_id": "uuid",
  "table_id": "uuid",
  "table_name": "Expenses",
  "payload": {
    "records": [
      { "id": "uuid", "fields": { ... } }
    ]
  }
}`}</pre>
        <p className="text-3xs text-[#9AA2AF]">
          If a secret is set, requests include an <code className="bg-white dark:bg-[hsl(200,30%,10%)] px-1 rounded">X-KDOps-Signature</code> header (SHA-256 of body + secret).
        </p>
      </div>
    </div>
  );
}

// ---------- API Keys Tab ----------

interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  last_used_at: string | null;
  created_at: string;
}

async function generateApiKey(): Promise<string> {
  const bytes = new Uint8Array(36);
  crypto.getRandomValues(bytes);
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let token = 'kdops_';
  for (const b of bytes) token += chars[b % chars.length];
  return token;
}

async function hashApiKey(raw: string): Promise<string> {
  const data = new TextEncoder().encode(raw);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function ApiKeysTab({ workspaceId, baseSchemaName }: { workspaceId: string; baseSchemaName: string }) {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [newKeyName, setNewKeyName] = useState('');
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState(false);

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;

  const fetchKeys = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .schema('nc_meta')
      .from('api_keys')
      .select('id, name, key_prefix, scopes, last_used_at, created_at')
      .eq('workspace_id', workspaceId)
      .is('revoked_at', null)
      .order('created_at', { ascending: false });
    setKeys(data ?? []);
    setLoading(false);
  }, [workspaceId]);

  useEffect(() => { fetchKeys(); }, [fetchKeys]);

  const handleCreate = async () => {
    if (!newKeyName.trim()) return;
    setCreating(true);
    try {
      const raw = await generateApiKey();
      const hash = await hashApiKey(raw);
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.schema('nc_meta').from('api_keys').insert({
        workspace_id: workspaceId,
        name: newKeyName.trim(),
        key_hash: hash,
        key_prefix: raw.substring(0, 12),
        scopes: ['records:read', 'records:write', 'schema:read'],
        created_by: user?.id,
      });
      setCreatedKey(raw);
      setNewKeyName('');
      await fetchKeys();
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (keyId: string) => {
    await supabase.schema('nc_meta').from('api_keys').update({ revoked_at: new Date().toISOString() }).eq('id', keyId);
    await fetchKeys();
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const apiBaseUrl = `${supabaseUrl}/functions/v1/rest-api/v1`;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-[#E5E5E5] dark:border-[hsl(200,25%,18%)] bg-[#F9FAFB] dark:bg-[hsl(200,30%,8%)] p-3 space-y-2">
        <p className="text-xs font-medium text-[#374151] dark:text-[hsl(200,25%,88%)]">API Base URL</p>
        <div className="flex items-center gap-2">
          <code className="flex-1 text-2xs bg-white dark:bg-[hsl(200,30%,10%)] border border-[#E5E5E5] dark:border-[hsl(200,25%,18%)] rounded px-2 py-1.5 font-mono text-[#374151] dark:text-[hsl(200,25%,88%)] select-all overflow-x-auto">
            {apiBaseUrl}
          </code>
          <Button variant="ghost" size="icon-sm" className="shrink-0" onClick={() => handleCopy(apiBaseUrl)}>
            <Copy size={12} />
          </Button>
        </div>
        <p className="text-2xs text-[#9AA2AF]">
          Use with header: <code className="bg-white dark:bg-[hsl(200,30%,10%)] px-1 rounded text-3xs">Authorization: Bearer kdops_xxx</code>
        </p>
      </div>

      {createdKey && (
        <div className="rounded-lg border border-green-200 dark:border-green-800/40 bg-green-50 dark:bg-green-900/10 p-3 space-y-2">
          <p className="text-xs font-medium text-green-700 dark:text-green-400">
            API key created — copy it now, you won't see it again
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-2xs font-mono bg-white dark:bg-[hsl(200,30%,10%)] border rounded px-2 py-1.5 overflow-x-auto">
              {showKey ? createdKey : createdKey.substring(0, 12) + '•'.repeat(30)}
            </code>
            <Button variant="ghost" size="icon-sm" className="shrink-0" onClick={() => setShowKey(!showKey)}>
              {showKey ? <EyeOff size={12} /> : <Eye size={12} />}
            </Button>
            <Button variant="ghost" size="icon-sm" className="shrink-0" onClick={() => handleCopy(createdKey)}>
              <Copy size={12} />
            </Button>
          </div>
          {copied && <p className="text-3xs text-green-600">Copied!</p>}
        </div>
      )}

      <div className="space-y-2">
        <Label className="text-xs">Create API Key</Label>
        <div className="flex gap-2">
          <Input
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            placeholder="Key name (e.g. n8n integration)"
            className="flex-1"
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          />
          <Button
            size="sm"
            className="bg-[#2D7FF9] hover:bg-[#2952CC] shrink-0"
            onClick={handleCreate}
            disabled={creating || !newKeyName.trim()}
          >
            <Plus size={12} className="mr-1" />
            {creating ? 'Creating...' : 'Create'}
          </Button>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Active Keys</Label>
        {loading && <p className="text-xs text-muted-foreground">Loading...</p>}
        {!loading && keys.length === 0 && (
          <p className="text-xs text-muted-foreground">No API keys yet</p>
        )}
        <div className="max-h-48 overflow-y-auto space-y-1.5">
          {keys.map((key) => (
            <div
              key={key.id}
              className="flex items-center justify-between p-2 rounded border border-border bg-muted/30"
            >
              <div className="min-w-0">
                <p className="text-xs font-medium truncate">{key.name}</p>
                <p className="text-3xs text-muted-foreground font-mono">
                  {key.key_prefix}•••
                  {key.last_used_at && (
                    <> · Last used {new Date(key.last_used_at).toLocaleDateString()}</>
                  )}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-3xs h-6 px-2 text-red-500 hover:text-red-600 shrink-0"
                onClick={() => handleRevoke(key.id)}
              >
                <Trash2 size={10} className="mr-1" />
                Revoke
              </Button>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-[#E5E5E5] dark:border-[hsl(200,25%,18%)] bg-[#F9FAFB] dark:bg-[hsl(200,30%,8%)] p-3 space-y-2">
        <p className="text-xs font-medium text-[#374151] dark:text-[hsl(200,25%,88%)]">Quick Start</p>
        <pre className="text-3xs font-mono bg-white dark:bg-[hsl(200,30%,10%)] border rounded p-2 overflow-x-auto whitespace-pre text-[#374151] dark:text-[hsl(200,25%,88%)]">{`# List records
curl "${apiBaseUrl}/bases/${baseSchemaName}/tables/TABLE_SLUG/records" \\
  -H "Authorization: Bearer kdops_YOUR_KEY"

# Create record
curl -X POST "${apiBaseUrl}/bases/${baseSchemaName}/tables/TABLE_SLUG/records" \\
  -H "Authorization: Bearer kdops_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"records":[{"fields":{"Name":"Test"}}]}'`}</pre>
      </div>
    </div>
  );
}
