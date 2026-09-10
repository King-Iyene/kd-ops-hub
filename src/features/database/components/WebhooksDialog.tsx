import { useState, useCallback } from 'react';
import { Trash2, Plus, Send, Webhook } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useWebhooks, useCreateWebhook, useUpdateWebhook, useDeleteWebhook } from '../hooks';
import { supabase } from '@/lib/supabase';
import type { WebhookMeta, WebhookEvent } from '../types';

const EVENTS: { value: WebhookEvent; label: string }[] = [
  { value: 'record.created', label: 'After Insert' },
  { value: 'record.updated', label: 'After Update' },
  { value: 'record.deleted', label: 'After Delete' },
];

interface WebhooksDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tableId: string | null;
  baseId: string | null;
}

export function WebhooksDialog({ open, onOpenChange, tableId, baseId }: WebhooksDialogProps) {
  const { data: webhooks = [] } = useWebhooks(tableId);
  const createWebhook = useCreateWebhook();
  const updateWebhook = useUpdateWebhook();
  const deleteWebhook = useDeleteWebhook();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; status?: number } | null>(null);

  // Form state for the selected webhook (or new)
  const [isNew, setIsNew] = useState(false);
  const [name, setName] = useState('');
  const [events, setEvents] = useState<WebhookEvent[]>(['record.created']);
  const [url, setUrl] = useState('');
  const [headers, setHeaders] = useState<Record<string, string>>({});
  const [headerKey, setHeaderKey] = useState('');
  const [headerValue, setHeaderValue] = useState('');
  const [secret, setSecret] = useState('');

  const selected = webhooks.find((w) => w.id === selectedId) ?? null;

  const loadWebhook = useCallback((wh: WebhookMeta) => {
    setSelectedId(wh.id);
    setIsNew(false);
    setName(wh.name);
    setEvents([...wh.events]);
    setUrl(wh.url);
    setHeaders({ ...wh.headers });
    setSecret(wh.secret ?? '');
    setHeaderKey('');
    setHeaderValue('');
    setTestResult(null);
  }, []);

  const startNew = useCallback(() => {
    setSelectedId(null);
    setIsNew(true);
    setName('');
    setEvents(['record.created']);
    setUrl('');
    setHeaders({});
    setSecret('');
    setHeaderKey('');
    setHeaderValue('');
    setTestResult(null);
  }, []);

  const handleToggleEvent = useCallback((ev: WebhookEvent) => {
    setEvents((prev) => {
      if (prev.includes(ev)) {
        // Don't allow deselecting all events
        if (prev.length <= 1) return prev;
        return prev.filter((e) => e !== ev);
      }
      return [...prev, ev];
    });
  }, []);

  const handleAddHeader = useCallback(() => {
    if (headerKey.trim()) {
      setHeaders((prev) => ({ ...prev, [headerKey.trim()]: headerValue }));
      setHeaderKey('');
      setHeaderValue('');
    }
  }, [headerKey, headerValue]);

  const handleRemoveHeader = useCallback((key: string) => {
    setHeaders((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const handleSave = useCallback(() => {
    if (!name.trim() || !url.trim() || !tableId || !baseId || events.length === 0) return;
    if (isNew) {
      createWebhook.mutate(
        { base_id: baseId, table_id: tableId, name: name.trim(), events, url: url.trim(), headers, secret: secret || undefined },
        {
          onSuccess: (wh) => {
            loadWebhook(wh);
          },
        },
      );
    } else if (selectedId) {
      updateWebhook.mutate({
        id: selectedId,
        table_id: tableId,
        name: name.trim(),
        events,
        url: url.trim(),
        headers,
        secret: secret || undefined,
      });
    }
  }, [isNew, selectedId, name, events, url, headers, secret, tableId, baseId, createWebhook, updateWebhook, loadWebhook]);

  const handleToggle = useCallback(
    (wh: WebhookMeta) => {
      if (!tableId) return;
      updateWebhook.mutate({ id: wh.id, table_id: tableId, is_active: !wh.is_active });
    },
    [tableId, updateWebhook],
  );

  const handleDelete = useCallback(
    (id: string) => {
      if (!tableId) return;
      deleteWebhook.mutate({ id, table_id: tableId });
      if (selectedId === id) {
        setSelectedId(null);
        setIsNew(false);
      }
    },
    [tableId, selectedId, deleteWebhook],
  );

  const handleTest = useCallback(async () => {
    if (!url.trim()) return;
    setTesting(true);
    setTestResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('webhook-proxy', {
        body: {
          url: url.trim(),
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...headers },
          payload: { test: true, events, timestamp: new Date().toISOString() },
        },
      });
      if (error) {
        setTestResult({ ok: false });
      } else {
        setTestResult({ ok: data?.ok ?? false, status: data?.status });
      }
    } catch {
      setTestResult({ ok: false });
    } finally {
      setTesting(false);
    }
  }, [url, headers, events]);

  const showPanel = isNew || selectedId;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[780px] p-0 gap-0 overflow-hidden">
        <div className="flex h-[520px]">
          {/* Left sidebar */}
          <div className="w-[240px] shrink-0 border-r border-[#E5E5E5] dark:border-[hsl(200,25%,18%)] flex flex-col bg-[#FAFAFA] dark:bg-[hsl(200,30%,8%)]">
            <div className="flex items-center justify-between px-3 py-3 border-b border-[#E5E5E5] dark:border-[hsl(200,25%,18%)]">
              <div className="flex items-center gap-1.5">
                <Webhook size={14} className="text-[#2D7FF9]" />
                <span className="text-[13px] font-semibold text-[#374151] dark:text-[hsl(200,25%,88%)]">Webhooks</span>
              </div>
              <button
                className="p-1 rounded hover:bg-[#E5E5E5] dark:hover:bg-[hsl(200,25%,18%)] text-[#6A7184] dark:text-[hsl(200,20%,55%)] transition-colors"
                onClick={startNew}
                title="Add webhook"
              >
                <Plus size={15} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {webhooks.length === 0 && !isNew && (
                <div className="px-3 py-8 text-center">
                  <Webhook size={28} className="mx-auto mb-2 text-[#D1D5DB] dark:text-[hsl(200,25%,30%)]" />
                  <p className="text-xs text-[#6A7184] dark:text-[hsl(200,20%,55%)]">No webhooks yet</p>
                  <p className="text-[11px] text-[#6A7184] dark:text-[hsl(200,20%,55%)] mt-1">Click + to create one</p>
                </div>
              )}
              {webhooks.map((wh) => (
                <div
                  key={wh.id}
                  className={`flex items-center gap-2 px-3 py-2.5 cursor-pointer border-b border-[#E5E5E5] dark:border-[hsl(200,25%,18%)] transition-colors ${
                    selectedId === wh.id
                      ? 'bg-[#EBF0FF] dark:bg-[hsl(220,40%,18%)]'
                      : 'hover:bg-[#F4F4F5] dark:hover:bg-[hsl(200,25%,14%)]'
                  }`}
                  onClick={() => loadWebhook(wh)}
                >
                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-xs font-medium truncate ${
                        wh.is_active ? 'text-[#374151] dark:text-[hsl(200,25%,88%)]' : 'text-[#9CA3AF] dark:text-[hsl(200,25%,50%)]'
                      }`}
                    >
                      {wh.name}
                    </p>
                    <p className="text-[10px] text-[#6A7184] dark:text-[hsl(200,20%,55%)] mt-0.5 truncate">
                      {wh.events.map((e) => EVENTS.find((ev) => ev.value === e)?.label).filter(Boolean).join(', ')}
                    </p>
                  </div>
                  <button
                    className="shrink-0 w-7 h-4 rounded-full relative transition-colors"
                    style={{ backgroundColor: wh.is_active ? '#2D7FF9' : '#D1D5DB' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggle(wh);
                    }}
                    title={wh.is_active ? 'Disable' : 'Enable'}
                  >
                    <span
                      className="absolute top-0.5 w-3 h-3 rounded-full bg-white dark:bg-[hsl(200,25%,88%)] shadow transition-transform"
                      style={{ left: wh.is_active ? '13px' : '2px' }}
                    />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Right panel */}
          <div className="flex-1 flex flex-col overflow-hidden bg-white dark:bg-[hsl(200,30%,10%)]">
            {!showPanel ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <Webhook size={36} className="mx-auto mb-3 text-[#D1D5DB] dark:text-[hsl(200,25%,30%)]" />
                  <p className="text-[13px] text-[#6A7184] dark:text-[hsl(200,20%,55%)]">Select a webhook or create a new one</p>
                </div>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-[#374151] dark:text-[hsl(200,25%,88%)]">
                    {isNew ? 'New Webhook' : 'Edit Webhook'}
                  </h3>
                  {!isNew && selectedId && (
                    <button
                      className="p-1.5 rounded hover:bg-[#FEE2E2] dark:hover:bg-[hsl(0,40%,18%)] text-[#6A7184] dark:text-[hsl(200,20%,55%)] hover:text-[#991B1B] dark:hover:text-[#FCA5A5] transition-colors"
                      onClick={() => handleDelete(selectedId)}
                      title="Delete webhook"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>

                {/* Name */}
                <div>
                  <Label className="text-[11px] font-medium text-[#6A7184] dark:text-[hsl(200,20%,55%)]">Name</Label>
                  <Input
                    className="mt-1 h-8 text-[13px]"
                    placeholder="e.g. Notify Slack on new record"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>

                {/* Events (multi-select checkboxes) */}
                <div>
                  <Label className="text-[11px] font-medium text-[#6A7184] dark:text-[hsl(200,20%,55%)]">Events</Label>
                  <div className="mt-1.5 space-y-1.5">
                    {EVENTS.map((ev) => (
                      <label
                        key={ev.value}
                        className="flex items-center gap-2 cursor-pointer text-[13px] text-[#374151] dark:text-[hsl(200,25%,88%)]"
                      >
                        <input
                          type="checkbox"
                          checked={events.includes(ev.value)}
                          onChange={() => handleToggleEvent(ev.value)}
                          className="rounded border-[#D1D5DB] dark:border-[hsl(200,25%,30%)] text-[#2D7FF9] focus:ring-[#2D7FF9] h-3.5 w-3.5"
                        />
                        {ev.label}
                      </label>
                    ))}
                  </div>
                </div>

                {/* URL */}
                <div>
                  <Label className="text-[11px] font-medium text-[#6A7184] dark:text-[hsl(200,20%,55%)]">URL</Label>
                  <Input
                    className="mt-1 h-8 text-[13px]"
                    placeholder="https://example.com/webhook"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                  />
                </div>

                {/* Secret */}
                <div>
                  <Label className="text-[11px] font-medium text-[#6A7184] dark:text-[hsl(200,20%,55%)]">Signing Secret (optional)</Label>
                  <Input
                    className="mt-1 h-8 text-[13px] font-mono"
                    placeholder="whsec_..."
                    type="password"
                    value={secret}
                    onChange={(e) => setSecret(e.target.value)}
                  />
                  <p className="text-[10px] text-[#9CA3AF] dark:text-[hsl(200,20%,45%)] mt-1">
                    Used to sign payloads via X-KDOps-Signature header
                  </p>
                </div>

                {/* Headers */}
                <div>
                  <Label className="text-[11px] font-medium text-[#6A7184] dark:text-[hsl(200,20%,55%)]">Headers</Label>
                  <div className="mt-1 space-y-1.5">
                    {Object.entries(headers).map(([k, v]) => (
                      <div key={k} className="flex items-center gap-2">
                        <span className="flex-1 text-xs font-mono px-2 py-1 rounded bg-[#F4F4F5] dark:bg-[hsl(200,25%,14%)] border border-[#E5E5E5] dark:border-[hsl(200,25%,18%)] text-[#374151] dark:text-[hsl(200,25%,88%)] truncate">
                          {k}: {v}
                        </span>
                        <button
                          className="shrink-0 text-[#6A7184] dark:text-[hsl(200,20%,55%)] hover:text-[#991B1B] dark:hover:text-[#FCA5A5] transition-colors"
                          onClick={() => handleRemoveHeader(k)}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))}
                    <div className="flex gap-2">
                      <Input
                        className="flex-1 h-7 text-xs"
                        placeholder="Header name"
                        value={headerKey}
                        onChange={(e) => setHeaderKey(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddHeader()}
                      />
                      <Input
                        className="flex-1 h-7 text-xs"
                        placeholder="Value"
                        value={headerValue}
                        onChange={(e) => setHeaderValue(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddHeader()}
                      />
                      <Button variant="outline" size="sm" className="h-7 px-2 text-[11px]" onClick={handleAddHeader}>
                        Add
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Last triggered info */}
                {!isNew && selected?.last_triggered_at && (
                  <p className="text-[10px] text-[#9CA3AF] dark:text-[hsl(200,20%,45%)]">
                    Last triggered: {new Date(selected.last_triggered_at).toLocaleString()}
                    {selected.failure_count > 0 && (
                      <span className="ml-2 text-[#DC2626] dark:text-[#FCA5A5]">
                        ({selected.failure_count} failure{selected.failure_count !== 1 ? 's' : ''})
                      </span>
                    )}
                  </p>
                )}

                {/* Test result */}
                {testResult && (
                  <div
                    className={`px-3 py-2 rounded-md text-xs font-medium ${
                      testResult.ok
                        ? 'bg-[#D1FAE5] text-[#065F46] dark:bg-[hsl(150,30%,15%)] dark:text-[hsl(150,50%,70%)]'
                        : 'bg-[#FEE2E2] text-[#991B1B] dark:bg-[hsl(0,30%,15%)] dark:text-[hsl(0,50%,70%)]'
                    }`}
                  >
                    {testResult.ok ? `Success (${testResult.status})` : `Failed${testResult.status ? ` (${testResult.status})` : ''}`}
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex items-center gap-2 pt-2">
                  <Button
                    size="sm"
                    className="h-8 px-4 text-xs gap-1.5"
                    style={{ backgroundColor: '#2D7FF9' }}
                    onClick={handleSave}
                    disabled={!name.trim() || !url.trim() || events.length === 0 || createWebhook.isPending || updateWebhook.isPending}
                  >
                    {isNew ? 'Create' : 'Save'}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 px-3 text-xs gap-1.5"
                    onClick={handleTest}
                    disabled={!url.trim() || testing}
                  >
                    <Send size={12} />
                    {testing ? 'Testing...' : 'Test webhook'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
