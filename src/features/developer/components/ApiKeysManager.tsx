import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  Key,
  Plus,
  Trash2,
  Copy,
  Check,
  Shield,
  AlertTriangle,
  Clock,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const PLATFORM_WORKSPACE_ID = '00000000-0000-0000-0000-000000000000';

/* ------------------------------------------------------------------ */
/*  Scope definitions                                                  */
/* ------------------------------------------------------------------ */

interface ScopeGroup {
  label: string;
  color: string;
  badgeClass: string;
  scopes: { value: string; label: string }[];
}

const SCOPE_GROUPS: ScopeGroup[] = [
  {
    label: 'All Access',
    color: 'text-purple-600 dark:text-purple-400',
    badgeClass: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300',
    scopes: [
      { value: '*:read', label: 'Read all' },
      { value: '*:write', label: 'Write all' },
      { value: '*:delete', label: 'Delete all' },
    ],
  },
  {
    label: 'Employees',
    color: 'text-blue-600 dark:text-blue-400',
    badgeClass: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
    scopes: [
      { value: 'employees:read', label: 'Read' },
      { value: 'employees:write', label: 'Write' },
    ],
  },
  {
    label: 'Contractors',
    color: 'text-sky-600 dark:text-sky-400',
    badgeClass: 'bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300',
    scopes: [
      { value: 'contractors:read', label: 'Read' },
      { value: 'contractors:write', label: 'Write' },
    ],
  },
  {
    label: 'Tasks',
    color: 'text-indigo-600 dark:text-indigo-400',
    badgeClass: 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300',
    scopes: [
      { value: 'tasks:read', label: 'Read' },
      { value: 'tasks:write', label: 'Write' },
    ],
  },
  {
    label: 'Leave',
    color: 'text-teal-600 dark:text-teal-400',
    badgeClass: 'bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300',
    scopes: [
      { value: 'leave:read', label: 'Read' },
      { value: 'leave:write', label: 'Write' },
    ],
  },
  {
    label: 'Expenses',
    color: 'text-success',
    badgeClass: 'bg-emerald-100 dark:bg-emerald-900/30 text-success',
    scopes: [
      { value: 'expenses:read', label: 'Read' },
      { value: 'expenses:write', label: 'Write' },
    ],
  },
  {
    label: 'Payroll',
    color: 'text-success',
    badgeClass: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
    scopes: [{ value: 'payroll:read', label: 'Read only' }],
  },
  {
    label: 'Fleet',
    color: 'text-orange-600 dark:text-orange-400',
    badgeClass: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300',
    scopes: [
      { value: 'fleet:read', label: 'Read' },
      { value: 'fleet:write', label: 'Write' },
    ],
  },
  {
    label: 'Invoices',
    color: 'text-warning',
    badgeClass: 'bg-amber-100 dark:bg-amber-900/30 text-warning',
    scopes: [
      { value: 'invoices:read', label: 'Read' },
      { value: 'invoices:write', label: 'Write' },
    ],
  },
  {
    label: 'Clients',
    color: 'text-rose-600 dark:text-rose-400',
    badgeClass: 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300',
    scopes: [
      { value: 'clients:read', label: 'Read' },
      { value: 'clients:write', label: 'Write' },
    ],
  },
  {
    label: 'Recruitment',
    color: 'text-pink-600 dark:text-pink-400',
    badgeClass: 'bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300',
    scopes: [
      { value: 'recruitment:read', label: 'Read' },
      { value: 'recruitment:write', label: 'Write' },
    ],
  },
  {
    label: 'Database',
    color: 'text-zinc-600 dark:text-zinc-400',
    badgeClass: 'bg-zinc-200 dark:bg-zinc-700/50 text-zinc-700 dark:text-zinc-300',
    scopes: [
      { value: 'data:read', label: 'Read' },
      { value: 'data:write', label: 'Write' },
      { value: 'data:delete', label: 'Delete' },
    ],
  },
];

const SCOPE_TO_BADGE: Record<string, string> = {};
for (const g of SCOPE_GROUPS) {
  for (const s of g.scopes) {
    SCOPE_TO_BADGE[s.value] = g.badgeClass;
  }
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatDate(iso: string | null) {
  if (!iso) return '--';
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

async function generateKey() {
  const raw =
    'kdops_' +
    Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  const hash = Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw))),
  )
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return { raw, hash, prefix: raw.slice(0, 10) };
}

function expiresAtFromOption(opt: string | null): string | null {
  if (!opt || opt === 'never') return null;
  const ms: Record<string, number> = {
    '30d': 30 * 86_400_000,
    '90d': 90 * 86_400_000,
    '1y': 365 * 86_400_000,
  };
  return ms[opt] ? new Date(Date.now() + ms[opt]).toISOString() : null;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
}

export default function ApiKeysManager() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [createOpen, setCreateOpen] = useState(false);
  const [successOpen, setSuccessOpen] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<ApiKey | null>(null);
  const [createdRawKey, setCreatedRawKey] = useState('');
  const [copied, setCopied] = useState(false);

  // Create form state
  const [keyName, setKeyName] = useState('');
  const [selectedScopes, setSelectedScopes] = useState<Set<string>>(new Set());
  const [expiration, setExpiration] = useState('never');
  const [creating, setCreating] = useState(false);
  const [revoking, setRevoking] = useState(false);

  /* ---- Data fetching ---- */

  const {
    data: keys = [],
    isLoading,
    refetch,
  } = useQuery<ApiKey[]>({
    queryKey: ['platform-api-keys'],
    queryFn: async () => {
      const { data, error } = await supabase
        .schema('nc_meta')
        .from('api_keys')
        .select('id, name, key_prefix, scopes, created_at, last_used_at, expires_at')
        .eq('workspace_id', PLATFORM_WORKSPACE_ID)
        .is('revoked_at', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as ApiKey[];
    },
  });

  /* ---- Actions ---- */

  async function handleCreate() {
    if (!keyName.trim()) return;
    if (selectedScopes.size === 0) {
      toast({ title: 'Select at least one scope', variant: 'destructive' });
      return;
    }
    setCreating(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { raw, hash, prefix } = await generateKey();

      const { error } = await supabase
        .schema('nc_meta')
        .from('api_keys')
        .insert({
          workspace_id: PLATFORM_WORKSPACE_ID,
          name: keyName.trim(),
          key_hash: hash,
          key_prefix: prefix,
          scopes: Array.from(selectedScopes),
          created_by: user.id,
          expires_at: expiresAtFromOption(expiration),
        });
      if (error) throw error;

      setCreatedRawKey(raw);
      setCreateOpen(false);
      setSuccessOpen(true);
      resetForm();
      refetch();
      toast({ title: 'API key created' });
    } catch (err: any) {
      toast({ title: 'Failed to create key', description: err.message, variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke() {
    if (!revokeTarget) return;
    setRevoking(true);
    try {
      const { error } = await supabase
        .schema('nc_meta')
        .from('api_keys')
        .update({ revoked_at: new Date().toISOString() })
        .eq('id', revokeTarget.id);
      if (error) throw error;
      setRevokeTarget(null);
      refetch();
      toast({ title: 'API key revoked' });
    } catch (err: any) {
      toast({ title: 'Failed to revoke key', description: err.message, variant: 'destructive' });
    } finally {
      setRevoking(false);
    }
  }

  function resetForm() {
    setKeyName('');
    setSelectedScopes(new Set());
    setExpiration('never');
  }

  function toggleScope(value: string) {
    setSelectedScopes((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }

  async function copyToClipboard(text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  /* ---- Render ---- */

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
            <Key size={20} />
            API Keys
          </h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            Manage platform-wide API keys for authenticating requests across all modules.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-2">
          <Plus size={16} />
          Create Key
        </Button>
      </div>

      {/* Keys table */}
      <Card className="border-zinc-200 dark:border-zinc-800">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-zinc-400">
              <Loader2 size={20} className="animate-spin mr-2" />
              Loading keys...
            </div>
          ) : keys.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-zinc-400 dark:text-zinc-500">
              <div className="p-4 rounded-full bg-zinc-100 dark:bg-zinc-800 mb-4">
                <Key size={32} className="text-zinc-300 dark:text-zinc-600" />
              </div>
              <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-1">
                No API keys yet
              </p>
              <p className="text-xs text-zinc-400 dark:text-zinc-500 mb-4">
                Create your first API key to start making authenticated requests.
              </p>
              <Button variant="outline" size="sm" onClick={() => setCreateOpen(true)} className="gap-2">
                <Plus size={14} />
                Create your first API key
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-zinc-200 dark:border-zinc-800">
                  <TableHead className="text-zinc-500 dark:text-zinc-400">Name</TableHead>
                  <TableHead className="text-zinc-500 dark:text-zinc-400">Key Prefix</TableHead>
                  <TableHead className="text-zinc-500 dark:text-zinc-400">Scopes</TableHead>
                  <TableHead className="text-zinc-500 dark:text-zinc-400">Created</TableHead>
                  <TableHead className="text-zinc-500 dark:text-zinc-400">Last Used</TableHead>
                  <TableHead className="text-zinc-500 dark:text-zinc-400 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {keys.map((key) => (
                  <TableRow
                    key={key.id}
                    className="border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900/50"
                  >
                    <TableCell className="font-medium text-zinc-900 dark:text-zinc-100">
                      <div className="flex items-center gap-2">
                        <Shield size={14} className="text-zinc-400" />
                        {key.name}
                      </div>
                    </TableCell>
                    <TableCell>
                      <code className="text-xs font-mono bg-zinc-100 dark:bg-zinc-800 px-2 py-1 rounded text-zinc-600 dark:text-zinc-300">
                        {key.key_prefix}...
                      </code>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1 max-w-xs">
                        {(key.scopes ?? []).slice(0, 4).map((scope) => (
                          <Badge
                            key={scope}
                            variant="secondary"
                            className={cn(
                              'text-3xs font-mono px-1.5 py-0',
                              SCOPE_TO_BADGE[scope] ?? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300',
                            )}
                          >
                            {scope}
                          </Badge>
                        ))}
                        {(key.scopes ?? []).length > 4 && (
                          <Badge variant="secondary" className="text-3xs px-1.5 py-0">
                            +{key.scopes.length - 4}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-zinc-500 dark:text-zinc-400">
                      {formatDate(key.created_at)}
                    </TableCell>
                    <TableCell className="text-sm text-zinc-500 dark:text-zinc-400">
                      <div className="flex items-center gap-1">
                        <Clock size={12} />
                        {formatDate(key.last_used_at)}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                        onClick={() => setRevokeTarget(key)}
                      >
                        <Trash2 size={14} />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create key dialog */}
      <Dialog open={createOpen} onOpenChange={(open) => { setCreateOpen(open); if (!open) resetForm(); }}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key size={18} />
              Create API Key
            </DialogTitle>
            <DialogDescription>
              Generate a new API key with specific module-level permissions.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="key-name">Name</Label>
              <Input
                id="key-name"
                placeholder="e.g. CI/CD Pipeline, Mobile App"
                value={keyName}
                onChange={(e) => setKeyName(e.target.value)}
              />
            </div>

            {/* Scopes */}
            <div className="space-y-3">
              <Label>Scopes</Label>
              <div className="grid grid-cols-1 gap-3 max-h-64 overflow-y-auto pr-1">
                {SCOPE_GROUPS.map((group) => (
                  <div key={group.label} className="space-y-1.5">
                    <p className={cn('text-xs font-semibold uppercase tracking-wider', group.color)}>
                      {group.label}
                    </p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 pl-1">
                      {group.scopes.map((scope) => (
                        <label
                          key={scope.value}
                          className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300 cursor-pointer"
                        >
                          <Checkbox
                            checked={selectedScopes.has(scope.value)}
                            onCheckedChange={() => toggleScope(scope.value)}
                          />
                          <span className="font-mono text-xs">{scope.value}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Expiration */}
            <div className="space-y-2">
              <Label>Expiration</Label>
              <Select value={expiration} onValueChange={setExpiration}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="never">Never</SelectItem>
                  <SelectItem value="30d">30 days</SelectItem>
                  <SelectItem value="90d">90 days</SelectItem>
                  <SelectItem value="1y">1 year</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={creating || !keyName.trim()}>
              {creating && <Loader2 size={14} className="animate-spin mr-2" />}
              Create Key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Key created success dialog */}
      <Dialog open={successOpen} onOpenChange={setSuccessOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-success">
              <Check size={18} />
              API Key Created
            </DialogTitle>
            <DialogDescription>
              Copy your key now. It will not be shown again.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
              <div className="flex items-start gap-2 mb-3">
                <AlertTriangle size={16} className="text-warning mt-0.5 shrink-0" />
                <p className="text-xs text-warning">
                  This is the only time you will see this key. Store it securely.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-sm font-mono bg-white dark:bg-zinc-900 border border-amber-200 dark:border-amber-800 rounded px-3 py-2.5 text-zinc-900 dark:text-zinc-100 break-all select-all">
                  {createdRawKey}
                </code>
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onClick={() => copyToClipboard(createdRawKey)}
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                </Button>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button onClick={() => setSuccessOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revoke confirmation dialog */}
      <Dialog open={!!revokeTarget} onOpenChange={(open) => { if (!open) setRevokeTarget(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle size={18} />
              Revoke API Key
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to revoke <strong>{revokeTarget?.name}</strong>? Any applications
              using this key will immediately lose access.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevokeTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleRevoke} disabled={revoking}>
              {revoking && <Loader2 size={14} className="animate-spin mr-2" />}
              Revoke Key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
