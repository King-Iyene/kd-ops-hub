import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import {
  Webhook,
  Plus,
  Trash2,
  Pencil,
  Play,
  Copy,
  Check,
  Eye,
  EyeOff,
  Shield,
  AlertTriangle,
  Clock,
  Loader2,
  RefreshCw,
  Zap,
  ChevronDown,
  ExternalLink,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// Nil UUID used as sentinel for platform-wide webhooks (base_id column is UUID type)
const PLATFORM_BASE_ID = '00000000-0000-0000-0000-000000000000';

// ---------------------------------------------------------------------------
// Event catalog grouped by module
// ---------------------------------------------------------------------------

const EVENT_GROUPS: { module: string; color: string; events: string[] }[] = [
  { module: 'Employees', color: 'bg-blue-500/15 text-blue-400 border-blue-500/30', events: ['employee.created', 'employee.updated', 'employee.deleted', 'employee.suspended', 'employee.reactivated'] },
  { module: 'Contractors', color: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30', events: ['contractor.created', 'contractor.updated', 'contractor.deleted', 'contractor.contract_expired'] },
  { module: 'Tasks', color: 'bg-violet-500/15 text-violet-400 border-violet-500/30', events: ['task.created', 'task.updated', 'task.completed', 'task.deleted', 'task.assigned', 'task.overdue', 'task.form_submitted', 'task.comment_added'] },
  { module: 'Leave', color: 'bg-amber-500/15 text-amber-400 border-amber-500/30', events: ['leave.requested', 'leave.approved', 'leave.rejected', 'leave.cancelled'] },
  { module: 'Expenses', color: 'bg-orange-500/15 text-orange-400 border-orange-500/30', events: ['expense.submitted', 'expense.approved', 'expense.rejected', 'expense.reimbursed'] },
  { module: 'Payroll', color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30', events: ['payroll.run_completed', 'payroll.slip_generated', 'payroll.run_started', 'payroll.payment_sent'] },
  { module: 'Fleet', color: 'bg-rose-500/15 text-rose-400 border-rose-500/30', events: ['fuel_request.created', 'fuel_request.approved', 'fuel_request.rejected', 'trip.logged', 'trip.completed', 'vehicle.added', 'vehicle.maintenance_due'] },
  { module: 'Invoices', color: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30', events: ['invoice.created', 'invoice.sent', 'invoice.paid', 'invoice.overdue', 'invoice.cancelled'] },
  { module: 'Clients', color: 'bg-teal-500/15 text-teal-400 border-teal-500/30', events: ['client.created', 'client.updated', 'client.deleted', 'client.contract_renewed'] },
  { module: 'Recruitment', color: 'bg-pink-500/15 text-pink-400 border-pink-500/30', events: ['applicant.created', 'applicant.stage_changed', 'applicant.hired', 'applicant.rejected', 'opening.created', 'opening.closed'] },
  { module: 'Payments', color: 'bg-green-500/15 text-green-400 border-green-500/30', events: ['payment.completed', 'payment.failed', 'payment.pending', 'batch.created', 'batch.approved', 'batch.processed'] },
  { module: 'Database', color: 'bg-slate-500/15 text-slate-400 border-slate-500/30', events: ['record.created', 'record.updated', 'record.deleted', 'record.bulk_created'] },
];

const ALL_EVENTS = EVENT_GROUPS.flatMap((g) => g.events);

function eventColor(event: string) {
  for (const g of EVENT_GROUPS) {
    if (g.events.includes(event)) return g.color;
  }
  return 'bg-muted text-muted-foreground';
}

function eventModule(event: string) {
  for (const g of EVENT_GROUPS) {
    if (g.events.includes(event)) return g.module;
  }
  return 'Other';
}

function generateSecret() {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WebhookRow {
  id: string;
  base_id: string;
  table_id: string | null;
  name: string;
  url: string;
  events: string[];
  secret: string | null;
  headers: Record<string, string>;
  is_active: boolean;
  failure_count?: number;
  last_triggered_at?: string | null;
  created_at: string;
  created_by: string | null;
}

interface FormState {
  name: string;
  url: string;
  events: string[];
  secret: string;
  headers: { key: string; value: string }[];
  is_active: boolean;
}

const EMPTY_FORM: FormState = {
  name: '',
  url: '',
  events: [],
  secret: '',
  headers: [],
  is_active: true,
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function WebhooksManager() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [showSecret, setShowSecret] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [testDialogOpen, setTestDialogOpen] = useState(false);
  const [testUrl, setTestUrl] = useState('');
  const [testSecret, setTestSecret] = useState<string | undefined>();
  const [testResult, setTestResult] = useState<any>(null);
  const [testing, setTesting] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // --- Queries ---------------------------------------------------------------

  const { data: webhooks, isLoading } = useQuery({
    queryKey: ['platform-webhooks'],
    queryFn: async () => {
      const { data, error } = await supabase
        .schema('nc_meta')
        .from('webhooks')
        .select('*')
        .eq('base_id', PLATFORM_BASE_ID)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as WebhookRow[];
    },
  });

  // --- Mutations --------------------------------------------------------------

  const createMutation = useMutation({
    mutationFn: async (input: FormState) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const headersObj: Record<string, string> = {};
      input.headers.forEach((h) => { if (h.key.trim()) headersObj[h.key.trim()] = h.value; });
      const payload: any = {
        base_id: PLATFORM_BASE_ID,
        table_id: PLATFORM_BASE_ID,
        name: input.name,
        url: input.url,
        events: input.events,
        event: input.events?.[0] || 'record.created',
        method: 'POST',
        enabled: input.is_active,
        secret: input.secret || null,
        headers: headersObj,
        is_active: input.is_active,
        created_by: user.id,
      };
      if (editingId) {
        const { error } = await supabase.schema('nc_meta').from('webhooks').update(payload).eq('id', editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.schema('nc_meta').from('webhooks').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platform-webhooks'] });
      setDialogOpen(false);
      resetForm();
      toast({ title: editingId ? 'Webhook updated' : 'Webhook created' });
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.schema('nc_meta').from('webhooks').update({ is_active: active, enabled: active }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['platform-webhooks'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.schema('nc_meta').from('webhooks').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platform-webhooks'] });
      setDeleteConfirmId(null);
      toast({ title: 'Webhook deleted' });
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  // --- Helpers ----------------------------------------------------------------

  function resetForm() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowSecret(false);
    setCopiedSecret(false);
  }

  function openCreate() {
    resetForm();
    setDialogOpen(true);
  }

  function openEdit(wh: WebhookRow) {
    setEditingId(wh.id);
    setForm({
      name: wh.name,
      url: wh.url,
      events: wh.events || [],
      secret: wh.secret || '',
      headers: Object.entries(wh.headers || {}).map(([key, value]) => ({ key, value })),
      is_active: wh.is_active,
    });
    setShowSecret(false);
    setCopiedSecret(false);
    setDialogOpen(true);
  }

  function openTest(wh: WebhookRow) {
    setTestUrl(wh.url);
    setTestSecret(wh.secret || undefined);
    setTestResult(null);
    setTestDialogOpen(true);
  }

  async function runTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const payload = {
        event: 'test.ping',
        timestamp: new Date().toISOString(),
        data: { message: 'This is a test webhook from KDOps Developer Hub' },
      };
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('https://mseeurrvdcfxdmvqjjki.supabase.co/functions/v1/webhook-proxy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ url: testUrl, payload }),
      });
      const json = await res.json();
      setTestResult({ ok: res.ok, status: res.status, body: json });
    } catch (err: any) {
      setTestResult({ ok: false, error: err.message });
    } finally {
      setTesting(false);
    }
  }

  function toggleEvent(event: string) {
    setForm((f) => ({
      ...f,
      events: f.events.includes(event) ? f.events.filter((e) => e !== event) : [...f.events, event],
    }));
  }

  function toggleGroup(module: string) {
    const group = EVENT_GROUPS.find((g) => g.module === module)!;
    const allSelected = group.events.every((e) => form.events.includes(e));
    setForm((f) => ({
      ...f,
      events: allSelected
        ? f.events.filter((e) => !group.events.includes(e))
        : [...new Set([...f.events, ...group.events])],
    }));
  }

  function toggleExpandGroup(module: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(module)) next.delete(module); else next.add(module);
      return next;
    });
  }

  function addHeader() {
    setForm((f) => ({ ...f, headers: [...f.headers, { key: '', value: '' }] }));
  }

  function removeHeader(idx: number) {
    setForm((f) => ({ ...f, headers: f.headers.filter((_, i) => i !== idx) }));
  }

  function updateHeader(idx: number, field: 'key' | 'value', val: string) {
    setForm((f) => ({
      ...f,
      headers: f.headers.map((h, i) => (i === idx ? { ...h, [field]: val } : h)),
    }));
  }

  async function copySecret() {
    await navigator.clipboard.writeText(form.secret);
    setCopiedSecret(true);
    setTimeout(() => setCopiedSecret(false), 2000);
  }

  const isFormValid = form.name.trim() && form.url.trim().startsWith('https://') && form.events.length > 0;

  // --- Grouped badges for a webhook card -------------------------------------

  function EventBadges({ events }: { events: string[] }) {
    const grouped = useMemo(() => {
      const map = new Map<string, string[]>();
      events.forEach((e) => {
        const mod = eventModule(e);
        if (!map.has(mod)) map.set(mod, []);
        map.get(mod)!.push(e);
      });
      return map;
    }, [events]);

    return (
      <div className="flex flex-wrap gap-1.5">
        {Array.from(grouped.entries()).map(([mod, evts]) =>
          evts.map((e) => (
            <Badge key={e} variant="outline" className={cn('text-2xs font-mono border', eventColor(e))}>
              {e}
            </Badge>
          ))
        )}
      </div>
    );
  }

  // --- Render -----------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Webhook className="h-6 w-6 text-primary" />
            Webhooks
          </h2>
          <p className="text-muted-foreground mt-1">
            Receive real-time event notifications delivered to your endpoints with HMAC-signed payloads.
          </p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" /> Add Webhook
        </Button>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="grid gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="border-border/50 bg-card/50 animate-pulse">
              <CardContent className="p-6">
                <div className="h-5 bg-muted rounded w-48 mb-3" />
                <div className="h-4 bg-muted rounded w-96 mb-4" />
                <div className="flex gap-2">
                  {[1, 2, 3].map((j) => (
                    <div key={j} className="h-5 bg-muted rounded w-24" />
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : !webhooks?.length ? (
        <Card className="border-dashed border-2 border-border/50 bg-card/30">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="rounded-full bg-muted/50 p-4 mb-4">
              <Zap className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">No webhooks configured</h3>
            <p className="text-muted-foreground max-w-md mb-6">
              Set up your first webhook to receive real-time event notifications from across the KDOps platform.
            </p>
            <Button onClick={openCreate} className="gap-2">
              <Plus className="h-4 w-4" /> Add Webhook
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {webhooks.map((wh) => (
            <Card
              key={wh.id}
              className={cn(
                'border-border/50 bg-card/50 transition-colors',
                !wh.is_active && 'opacity-60'
              )}
            >
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1 space-y-3">
                    {/* Title row */}
                    <div className="flex items-center gap-3">
                      <h3 className="font-semibold text-base truncate" title={wh.name}>{wh.name}</h3>
                      <Badge variant={wh.is_active ? 'default' : 'secondary'} className="text-2xs">
                        {wh.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                      {(wh.failure_count ?? 0) > 0 && (
                        <Badge variant="destructive" className="text-2xs gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          {wh.failure_count} failures
                        </Badge>
                      )}
                    </div>

                    {/* URL */}
                    <div className="flex items-center gap-2 text-sm text-muted-foreground font-mono">
                      <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate" title={wh.url}>{wh.url}</span>
                    </div>

                    {/* Events */}
                    <EventBadges events={wh.events || []} />

                    {/* Meta */}
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      {wh.secret && (
                        <span className="flex items-center gap-1">
                          <Shield className="h-3 w-3" /> HMAC signed
                        </span>
                      )}
                      {wh.last_triggered_at && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" /> Last triggered{' '}
                          {new Date(wh.last_triggered_at).toLocaleString()}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    <Switch
                      checked={wh.is_active}
                      onCheckedChange={(checked) =>
                        toggleMutation.mutate({ id: wh.id, active: checked })
                      }
                    />
                    <Button variant="ghost" size="icon" onClick={() => openTest(wh)} title="Test">
                      <Play className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => openEdit(wh)} title="Edit">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setDeleteConfirmId(wh.id)}
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ---------- Create / Edit Dialog ---------- */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) { resetForm(); } setDialogOpen(open); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Webhook' : 'Create Webhook'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="wh-name">Name *</Label>
              <Input
                id="wh-name"
                placeholder="e.g. Slack notifications"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>

            {/* URL */}
            <div className="space-y-2">
              <Label htmlFor="wh-url">Endpoint URL *</Label>
              <Input
                id="wh-url"
                placeholder="https://example.com/webhooks"
                value={form.url}
                onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
              />
              {form.url && !form.url.startsWith('https://') && (
                <p className="text-xs text-destructive">URL must start with https://</p>
              )}
            </div>

            {/* Events */}
            <div className="space-y-2">
              <Label>Events *</Label>
              <p className="text-xs text-muted-foreground mb-2">
                Select the events that will trigger this webhook ({form.events.length} selected)
              </p>
              <div className="border border-border rounded-lg divide-y divide-border max-h-64 overflow-y-auto">
                {EVENT_GROUPS.map((group) => {
                  const allSelected = group.events.every((e) => form.events.includes(e));
                  const someSelected = group.events.some((e) => form.events.includes(e));
                  const expanded = expandedGroups.has(group.module);

                  return (
                    <div key={group.module}>
                      <div
                        className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-muted/50 transition-colors"
                        onClick={() => toggleExpandGroup(group.module)}
                      >
                        <Checkbox
                          checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                          onCheckedChange={() => toggleGroup(group.module)}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <span className="text-sm font-medium flex-1">{group.module}</span>
                        <span className="text-xs text-muted-foreground">
                          {group.events.filter((e) => form.events.includes(e)).length}/{group.events.length}
                        </span>
                        <ChevronDown
                          className={cn('h-4 w-4 text-muted-foreground transition-transform', expanded && 'rotate-180')}
                        />
                      </div>
                      {expanded && (
                        <div className="pl-10 pr-3 pb-2 space-y-1.5">
                          {group.events.map((event) => (
                            <label
                              key={event}
                              className="flex items-center gap-2 cursor-pointer text-sm py-0.5"
                            >
                              <Checkbox
                                checked={form.events.includes(event)}
                                onCheckedChange={() => toggleEvent(event)}
                              />
                              <code className="text-xs">{event}</code>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Secret */}
            <div className="space-y-2">
              <Label htmlFor="wh-secret">Signing Secret</Label>
              <p className="text-xs text-muted-foreground">
                Used to generate an HMAC SHA-256 signature in the <code className="text-xs">X-KDOps-Signature</code> header.
              </p>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    id="wh-secret"
                    type={showSecret ? 'text' : 'password'}
                    placeholder="Optional signing secret"
                    value={form.secret}
                    onChange={(e) => setForm((f) => ({ ...f, secret: e.target.value }))}
                    className="pr-20 font-mono text-sm"
                  />
                  <div className="absolute right-1 top-1/2 -translate-y-1/2 flex gap-0.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setShowSecret((s) => !s)}
                    >
                      {showSecret ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </Button>
                    {form.secret && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={copySecret}
                      >
                        {copiedSecret ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                      </Button>
                    )}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5 shrink-0"
                  onClick={() => setForm((f) => ({ ...f, secret: generateSecret() }))}
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Generate
                </Button>
              </div>
            </div>

            {/* Custom Headers */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Custom Headers</Label>
                <Button type="button" variant="ghost" size="sm" className="gap-1 text-xs" onClick={addHeader}>
                  <Plus className="h-3 w-3" /> Add Header
                </Button>
              </div>
              {form.headers.length > 0 && (
                <div className="space-y-2">
                  {form.headers.map((h, idx) => (
                    <div key={idx} className="flex gap-2 items-center">
                      <Input
                        placeholder="Header name"
                        value={h.key}
                        onChange={(e) => updateHeader(idx, 'key', e.target.value)}
                        className="flex-1"
                      />
                      <Input
                        placeholder="Value"
                        value={h.value}
                        onChange={(e) => updateHeader(idx, 'value', e.target.value)}
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Remove header"
                        className="shrink-0 text-destructive hover:text-destructive"
                        onClick={() => removeHeader(idx)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Active toggle */}
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <p className="text-sm font-medium">Active</p>
                <p className="text-xs text-muted-foreground">Enable or disable this webhook</p>
              </div>
              <Switch
                checked={form.is_active}
                onCheckedChange={(checked) => setForm((f) => ({ ...f, is_active: checked }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!isFormValid || createMutation.isPending}
              onClick={() => createMutation.mutate(form)}
              className="gap-2"
            >
              {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {editingId ? 'Update Webhook' : 'Create Webhook'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------- Test Dialog ---------- */}
      <Dialog open={testDialogOpen} onOpenChange={setTestDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Play className="h-5 w-5" /> Test Webhook
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs text-muted-foreground">Endpoint</Label>
              <p className="font-mono text-sm truncate" title={testUrl}>{testUrl}</p>
            </div>

            <p className="text-sm text-muted-foreground">
              Sends a <code className="text-xs">test.ping</code> event to the endpoint and displays the response.
            </p>

            {testResult && (
              <div
                className={cn(
                  'rounded-lg border p-3 text-sm font-mono whitespace-pre-wrap max-h-48 overflow-y-auto',
                  testResult.ok
                    ? 'border-green-500/30 bg-green-500/10 text-green-400'
                    : 'border-destructive/30 bg-destructive/10 text-destructive'
                )}
              >
                {testResult.error
                  ? `Error: ${testResult.error}`
                  : `Status: ${testResult.status}\n${JSON.stringify(testResult.body, null, 2)}`}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setTestDialogOpen(false)}>
              Close
            </Button>
            <Button onClick={runTest} disabled={testing} className="gap-2">
              {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              {testing ? 'Sending...' : 'Send Test'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------- Delete Confirmation Dialog ---------- */}
      <Dialog open={!!deleteConfirmId} onOpenChange={(open) => { if (!open) setDeleteConfirmId(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" /> Delete Webhook
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            This action cannot be undone. The webhook will stop receiving events immediately.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => deleteConfirmId && deleteMutation.mutate(deleteConfirmId)}
              className="gap-2"
            >
              {deleteMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
