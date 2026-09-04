import { useState, useCallback } from 'react';
import { Trash2, Plus, Send, Webhook } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useWebhooks, useCreateWebhook, useUpdateWebhook, useDeleteWebhook } from '../hooks';
import { supabase } from '@/lib/supabase';
import type { WebhookMeta } from '../types';

const EVENTS: { value: WebhookMeta['event']; label: string }[] = [
  { value: 'record.created', label: 'After Insert' },
  { value: 'record.updated', label: 'After Update' },
  { value: 'record.deleted', label: 'After Delete' },
];

const METHODS: WebhookMeta['method'][] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

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
  const [event, setEvent] = useState<WebhookMeta['event']>('record.created');
  const [method, setMethod] = useState<WebhookMeta['method']>('POST');
  const [url, setUrl] = useState('');
  const [headers, setHeaders] = useState<Record<string, string>>({});
  const [headerKey, setHeaderKey] = useState('');
  const [headerValue, setHeaderValue] = useState('');

  const selected = webhooks.find((w) => w.id === selectedId) ?? null;

  const loadWebhook = useCallback((wh: WebhookMeta) => {
    setSelectedId(wh.id);
    setIsNew(false);
    setName(wh.name);
    setEvent(wh.event);
    setMethod(wh.method);
    setUrl(wh.url);
    setHeaders({ ...wh.headers });
    setHeaderKey('');
    setHeaderValue('');
    setTestResult(null);
  }, []);

  const startNew = useCallback(() => {
    setSelectedId(null);
    setIsNew(true);
    setName('');
    setEvent('record.created');
    setMethod('POST');
    setUrl('');
    setHeaders({});
    setHeaderKey('');
    setHeaderValue('');
    setTestResult(null);
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
    if (!name.trim() || !url.trim() || !tableId || !baseId) return;
    if (isNew) {
      createWebhook.mutate(
        { base_id: baseId, table_id: tableId, name: name.trim(), event, method, url: url.trim(), headers },
        {
          onSuccess: (wh) => {
            loadWebhook(wh);
          },
        },
      );
    } else if (selectedId) {
      updateWebhook.mutate({ id: selectedId, table_id: tableId, name: name.trim(), event, method, url: url.trim(), headers });
    }
  }, [isNew, selectedId, name, event, method, url, headers, tableId, baseId, createWebhook, updateWebhook, loadWebhook]);

  const handleToggle = useCallback(
    (wh: WebhookMeta) => {
      if (!tableId) return;
      updateWebhook.mutate({ id: wh.id, table_id: tableId, enabled: !wh.enabled });
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
          method,
          headers: { 'Content-Type': 'application/json', ...headers },
          payload: { test: true, event, timestamp: new Date().toISOString() },
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
  }, [url, method, headers, event]);

  const showPanel = isNew || selectedId;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[780px] p-0 gap-0 overflow-hidden">
        <div className="flex h-[520px]">
          {/* Left sidebar */}
          <div className="w-[240px] shrink-0 border-r border-[#E5E5E5] dark:border-[hsl(200,25%,18%)] flex flex-col bg-[#FAFAFA] dark:bg-[hsl(200,30%,8%)]">
            <div className="flex items-center justify-between px-3 py-3 border-b border-[#E5E5E5] dark:border-[hsl(200,25%,18%)]">
              <div className="flex items-center gap-1.5">
                <Webhook size={14} className="text-[#166EE1]" />
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
                  <p className="text-[12px] text-[#6A7184] dark:text-[hsl(200,20%,55%)]">No webhooks yet</p>
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
                      className={`text-[12px] font-medium truncate ${
                        wh.enabled ? 'text-[#374151] dark:text-[hsl(200,25%,88%)]' : 'text-[#9CA3AF] dark:text-[hsl(200,25%,50%)]'
                      }`}
                    >
                      {wh.name}
                    </p>
                    <p className="text-[10px] text-[#6A7184] dark:text-[hsl(200,20%,55%)] mt-0.5 truncate">
                      {EVENTS.find((e) => e.value === wh.event)?.label} &middot; {wh.method}
                    </p>
                  </div>
                  <button
                    className="shrink-0 w-7 h-4 rounded-full relative transition-colors"
                    style={{ backgroundColor: wh.enabled ? '#166EE1' : '#D1D5DB' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggle(wh);
                    }}
                    title={wh.enabled ? 'Disable' : 'Enable'}
                  >
                    <span
                      className="absolute top-0.5 w-3 h-3 rounded-full bg-white dark:bg-[hsl(200,25%,88%)] shadow transition-transform"
                      style={{ left: wh.enabled ? '13px' : '2px' }}
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
                  <h3 className="text-[14px] font-semibold text-[#374151] dark:text-[hsl(200,25%,88%)]">
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

                {/* Event */}
                <div>
                  <Label className="text-[11px] font-medium text-[#6A7184] dark:text-[hsl(200,20%,55%)]">Event</Label>
                  <Select value={event} onValueChange={(v) => setEvent(v as WebhookMeta['event'])}>
                    <SelectTrigger className="mt-1 h-8 text-[13px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {EVENTS.map((e) => (
                        <SelectItem key={e.value} value={e.value}>
                          {e.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Method + URL */}
                <div>
                  <Label className="text-[11px] font-medium text-[#6A7184] dark:text-[hsl(200,20%,55%)]">Request</Label>
                  <div className="flex gap-2 mt-1">
                    <Select value={method} onValueChange={(v) => setMethod(v as WebhookMeta['method'])}>
                      <SelectTrigger className="w-[100px] h-8 text-[13px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {METHODS.map((m) => (
                          <SelectItem key={m} value={m}>
                            {m}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      className="flex-1 h-8 text-[13px]"
                      placeholder="https://example.com/webhook"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                    />
                  </div>
                </div>

                {/* Headers */}
                <div>
                  <Label className="text-[11px] font-medium text-[#6A7184] dark:text-[hsl(200,20%,55%)]">Headers</Label>
                  <div className="mt-1 space-y-1.5">
                    {Object.entries(headers).map(([k, v]) => (
                      <div key={k} className="flex items-center gap-2">
                        <span className="flex-1 text-[12px] font-mono px-2 py-1 rounded bg-[#F4F4F5] dark:bg-[hsl(200,25%,14%)] border border-[#E5E5E5] dark:border-[hsl(200,25%,18%)] text-[#374151] dark:text-[hsl(200,25%,88%)] truncate">
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
                        className="flex-1 h-7 text-[12px]"
                        placeholder="Header name"
                        value={headerKey}
                        onChange={(e) => setHeaderKey(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddHeader()}
                      />
                      <Input
                        className="flex-1 h-7 text-[12px]"
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

                {/* Test result */}
                {testResult && (
                  <div
                    className={`px-3 py-2 rounded-md text-[12px] font-medium ${
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
                    className="h-8 px-4 text-[12px] gap-1.5"
                    style={{ backgroundColor: '#166EE1' }}
                    onClick={handleSave}
                    disabled={!name.trim() || !url.trim() || createWebhook.isPending || updateWebhook.isPending}
                  >
                    {isNew ? 'Create' : 'Save'}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 px-3 text-[12px] gap-1.5"
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
