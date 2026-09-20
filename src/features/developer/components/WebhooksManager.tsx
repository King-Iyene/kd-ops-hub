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
  History,
  XCircle,
  CheckCircle2,
  Send,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { EVENT_GROUPS, ALL_EVENTS, EVENT_HINTS, eventColor, eventModule } from '../webhookEvents';

// Nil UUID sentinel for platform-wide webhooks (same for base_id and table_id)
const PLATFORM_SENTINEL = '00000000-0000-0000-0000-000000000000';

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

interface DeliveryRow {
  id: string;
  event: string;
  success: boolean;
  response_status: number | null;
  response_body: string | null;
  error_message: string | null;
  duration_ms: number | null;
  attempt_number: number;
  given_up: boolean;
  next_retry_at: string | null;
  is_replay: boolean;
  created_at: string;
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
  const [historyWebhook, setHistoryWebhook] = useState<WebhookRow | null>(null);

  // --- Queries ---------------------------------------------------------------

  const { data: webhooks, isLoading } = useQuery({
    queryKey: ['platform-webhooks'],
    queryFn: async () => {
      const { data, error } = await supabase
        .schema('nc_meta')
        .from('webhooks')
        .select('*')
        .eq('base_id', PLATFORM_SENTINEL)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as WebhookRow[];
    },
  });

  const { data: deliveries, isLoading: deliveriesLoading } = useQuery({
    queryKey: ['webhook-deliveries', historyWebhook?.id],
    enabled: !!historyWebhook,
    queryFn: async () => {
      const { data, error } = await supabase
        .schema('nc_meta')
        .from('webhook_deliveries')
        .select('id, event, success, response_status, response_body, error_message, duration_ms, attempt_number, given_up, next_retry_at, is_replay, created_at')
        .eq('webhook_id', historyWebhook!.id)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as DeliveryRow[];
    },
  });

  // --- Mutations --------------------------------------------------------------

  const [replayingId, setReplayingId] = useState<string | null>(null);

  const replayMutation = useMutation({
    mutationFn: async (deliveryId: string) => {
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke('webhook-replay', {
        body: { delivery_id: deliveryId },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (error) throw error;
      return data as { success: boolean; response_status: number | null; error_message: string | null };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['webhook-deliveries', historyWebhook?.id] });
      toast({
        title: data.success ? 'Replay delivered' : 'Replay failed',
        description: data.success
          ? `Receiver responded ${data.response_status}`
          : (data.error_message ?? `Receiver responded ${data.response_status}`),
        variant: data.success ? 'default' : 'destructive',
      });
    },
    onError: (err: any) => {
      toast({ title: 'Replay failed', description: err.message, variant: 'destructive' });
    },
    onSettled: () => setReplayingId(null),
  });

  const createMutation = useMutation({
    mutationFn: async (input: FormState) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const headersObj: Record<string, string> = {};
      input.headers.forEach((h) => { if (h.key.trim()) headersObj[h.key.trim()] = h.value; });
      const payload: any = {
        base_id: PLATFORM_SENTINEL,
        table_id: PLATFORM_SENTINEL,
        name: input.name,
        url: input.url,
        events: input.events,
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
      const { error } = await supabase.schema('nc_meta').from('webhooks').update({ is_active: active }).eq('id', id);
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
                'min-w-0 border-border/50 bg-card/50 transition-colors',
                !wh.is_active && 'opacity-60'
              )}
            >
              <CardContent className="p-5">
                <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
                  <div className="min-w-0 w-full sm:flex-1 space-y-3">
                    {/* Title row */}
                    <div className="flex items-center gap-3">
                      <h3 className="font-semibold text-base truncate" title={wh.name}>{wh.name}</h3>
                      <Badge variant={wh.is_active ? 'default' : 'secondary'} className="text-2xs">
                        {wh.is_active ? 'Active' : !wh.is_active && (wh.failure_count ?? 0) >= 10 ? 'Auto-disabled' : 'Inactive'}
                      </Badge>
                      {!wh.is_active && (wh.failure_count ?? 0) >= 10 ? (
                        <Badge variant="destructive" className="text-2xs gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          Disabled after 10 failed deliveries
                        </Badge>
                      ) : (wh.failure_count ?? 0) >= 7 ? (
                        <Badge variant="destructive" className="text-2xs gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          {wh.failure_count}/10 failures — will auto-disable soon
                        </Badge>
                      ) : (wh.failure_count ?? 0) > 0 ? (
                        <Badge variant="destructive" className="text-2xs gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          {wh.failure_count} failures
                        </Badge>
                      ) : null}
                    </div>

                    {/* URL */}
                    <div className="flex items-center gap-2 min-w-0 text-sm text-muted-foreground font-mono">
                      <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                      <span className="flex-1 min-w-0 truncate" title={wh.url}>{wh.url}</span>
                    </div>

                    {/* Events */}
                    <EventBadges events={wh.events || []} />

                    {/* Mismatch warnings */}
                    {wh.events?.includes('task.form_submitted') && !wh.events?.includes('table.form_submitted') && (
                      <p className="text-xs text-amber-500 flex items-center gap-1.5">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                        This webhook listens for <span className="font-mono font-medium">task.form_submitted</span> (task intake forms at /forms/:id) — if you meant Tables module forms (/t/f/:token), add <span className="font-mono font-medium">table.form_submitted</span> instead.
                      </p>
                    )}
                    {wh.events?.includes('table.form_submitted') && !wh.events?.includes('task.form_submitted') && !wh.last_triggered_at && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5 shrink-0" />
                        Listening for Tables module form submissions (/t/f/:token). Never triggered yet.
                      </p>
                    )}

                    {/* Meta */}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
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
                  <div className="flex items-center gap-2 shrink-0 flex-wrap w-full sm:w-auto justify-end">
                    <Switch
                      checked={wh.is_active}
                      onCheckedChange={(checked) =>
                        toggleMutation.mutate({ id: wh.id, active: checked })
                      }
                    />
                    <Button variant="ghost" size="icon" onClick={() => setHistoryWebhook(wh)} title="Delivery history">
                      <History className="h-4 w-4" />
                    </Button>
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
                              {EVENT_HINTS[event] && (
                                <span className="text-2xs text-muted-foreground">— {EVENT_HINTS[event]}</span>
                              )}
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
                        {copiedSecret ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
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
                    ? 'border-success/30 bg-success/10 text-success'
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

      {/* ---------- Delivery History Dialog ---------- */}
      <Dialog open={!!historyWebhook} onOpenChange={(open) => { if (!open) setHistoryWebhook(null); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5" /> Delivery History
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground" title={historyWebhook?.url}>
              Last {deliveries?.length ?? 0} deliveries to <span className="font-mono break-all">{historyWebhook?.url}</span>
            </p>

            {deliveriesLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-16 bg-muted rounded-lg animate-pulse" />
                ))}
              </div>
            ) : !deliveries?.length ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="rounded-full bg-muted/50 p-3 mb-3">
                  <Clock className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium">No deliveries yet</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Attempts will show up here as soon as a subscribed event fires.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {deliveries.map((d) => (
                  <div
                    key={d.id}
                    className={cn(
                      'rounded-lg border p-3 text-sm',
                      d.success ? 'border-success/30 bg-success/5' : 'border-destructive/30 bg-destructive/5'
                    )}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0 flex-wrap">
                        {d.success ? (
                          <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
                        ) : (
                          <XCircle className="h-4 w-4 text-destructive shrink-0" />
                        )}
                        <code className="text-xs font-mono truncate min-w-0 max-w-[10rem] sm:max-w-none">{d.event}</code>
                        {d.response_status != null && (
                          <Badge variant="outline" className="text-2xs shrink-0">{d.response_status}</Badge>
                        )}
                        {d.is_replay ? (
                          <Badge variant="outline" className="text-2xs shrink-0 gap-1"><Send className="h-2.5 w-2.5" /> replay</Badge>
                        ) : d.attempt_number > 1 ? (
                          <Badge variant="outline" className="text-2xs shrink-0">attempt {d.attempt_number}</Badge>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {new Date(d.created_at).toLocaleString()}
                          {d.duration_ms != null && ` · ${d.duration_ms}ms`}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          title="Replay this delivery"
                          disabled={replayingId === d.id}
                          onClick={() => { setReplayingId(d.id); replayMutation.mutate(d.id); }}
                        >
                          {replayingId === d.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Send className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      </div>
                    </div>
                    {(d.error_message || d.response_body) && (
                      <p className="mt-2 text-xs font-mono text-muted-foreground whitespace-pre-wrap break-all line-clamp-3">
                        {d.error_message || d.response_body}
                      </p>
                    )}
                    {!d.success && d.next_retry_at && (
                      <p className="mt-2 text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                        <RefreshCw className="h-3 w-3" /> Retrying at {new Date(d.next_retry_at).toLocaleTimeString()}
                      </p>
                    )}
                    {!d.success && d.given_up && (
                      <p className="mt-2 text-xs text-destructive flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" /> Gave up after {d.attempt_number} attempts
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setHistoryWebhook(null)}>
              Close
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
