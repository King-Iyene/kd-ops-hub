import { useState, useCallback } from 'react';
import { Trash2, Plus, Power } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { WebhookConfig } from '../types';

// NOTE: Webhooks are stored in local component state only — no backend persistence yet.

const EVENT_BADGES: Record<WebhookConfig['event'], { label: string; bg: string; text: string }> = {
  'record.created': { label: 'Created', bg: '#D1FAE5', text: '#065F46' },
  'record.updated': { label: 'Updated', bg: '#DBEAFE', text: '#1E40AF' },
  'record.deleted': { label: 'Deleted', bg: '#FEE2E2', text: '#991B1B' },
};

const EVENTS: WebhookConfig['event'][] = ['record.created', 'record.updated', 'record.deleted'];
const METHODS: WebhookConfig['method'][] = ['POST', 'PUT', 'PATCH'];

interface WebhooksDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tableId: string | null;
}

function generateId() {
  return `wh_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function WebhooksDialog({ open, onOpenChange, tableId }: WebhooksDialogProps) {
  const [webhooks, setWebhooks] = useState<WebhookConfig[]>([]);
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [event, setEvent] = useState<WebhookConfig['event']>('record.created');
  const [url, setUrl] = useState('');
  const [method, setMethod] = useState<WebhookConfig['method']>('POST');
  const [headerKey, setHeaderKey] = useState('');
  const [headerValue, setHeaderValue] = useState('');
  const [headers, setHeaders] = useState<Record<string, string>>({});

  const resetForm = useCallback(() => {
    setName('');
    setEvent('record.created');
    setUrl('');
    setMethod('POST');
    setHeaderKey('');
    setHeaderValue('');
    setHeaders({});
    setShowForm(false);
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

  const handleAdd = useCallback(() => {
    if (!name.trim() || !url.trim() || !tableId) return;
    const wh: WebhookConfig = {
      id: generateId(),
      table_id: tableId,
      name: name.trim(),
      event,
      url: url.trim(),
      method,
      headers,
      enabled: true,
      created_at: new Date().toISOString(),
    };
    setWebhooks((prev) => [...prev, wh]);
    resetForm();
  }, [name, url, event, method, headers, tableId, resetForm]);

  const handleToggle = useCallback((id: string) => {
    setWebhooks((prev) => prev.map((w) => (w.id === id ? { ...w, enabled: !w.enabled } : w)));
  }, []);

  const handleDelete = useCallback((id: string) => {
    setWebhooks((prev) => prev.filter((w) => w.id !== id));
  }, []);

  const tableWebhooks = webhooks.filter((w) => w.table_id === tableId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="text-[15px] font-semibold flex items-center gap-2">
            <Power size={16} className="text-[#3366FF]" />
            Webhooks &amp; Automation
          </DialogTitle>
        </DialogHeader>

        {/* Events section */}
        <div className="pt-2">
          <p className="text-[12px] font-medium text-[#4A5268] mb-2">Events</p>
          <div className="flex gap-2 flex-wrap">
            {EVENTS.map((e) => {
              const badge = EVENT_BADGES[e];
              return (
                <span
                  key={e}
                  className="px-2.5 py-1 rounded-full text-[11px] font-medium"
                  style={{ backgroundColor: badge.bg, color: badge.text }}
                >
                  {badge.label}
                </span>
              );
            })}
          </div>
        </div>

        {/* Webhook list */}
        <div className="space-y-2 pt-3">
          <div className="flex items-center justify-between">
            <p className="text-[12px] font-medium text-[#4A5268]">
              Webhooks{tableWebhooks.length > 0 ? ` (${tableWebhooks.length})` : ''}
            </p>
            <Button
              size="sm"
              className="h-7 px-2.5 text-[11px] gap-1"
              style={{ backgroundColor: '#3366FF' }}
              onClick={() => setShowForm(true)}
            >
              <Plus size={12} /> Add webhook
            </Button>
          </div>

          {tableWebhooks.length === 0 && !showForm && (
            <div className="py-6 text-center">
              <p className="text-[13px] text-[#6A7184]">No webhooks configured</p>
              <p className="text-[11px] text-[#6A7184] mt-1">
                Add a webhook to receive notifications when records change.
              </p>
            </div>
          )}

          {tableWebhooks.map((wh) => {
            const badge = EVENT_BADGES[wh.event];
            return (
              <div
                key={wh.id}
                className="flex items-center gap-3 p-3 rounded-lg border"
                style={{ borderColor: '#E7E7E9', opacity: wh.enabled ? 1 : 0.55 }}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium truncate" style={{ color: '#374151' }}>
                    {wh.name}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <span
                      className="px-1.5 py-0.5 rounded text-[10px] font-medium"
                      style={{ backgroundColor: badge.bg, color: badge.text }}
                    >
                      {badge.label}
                    </span>
                    <span className="text-[11px] truncate" style={{ color: '#6A7184' }}>
                      {wh.method} {wh.url}
                    </span>
                  </div>
                </div>
                <button
                  className="shrink-0 w-8 h-5 rounded-full relative transition-colors"
                  style={{ backgroundColor: wh.enabled ? '#3366FF' : '#D1D5DB' }}
                  onClick={() => handleToggle(wh.id)}
                  title={wh.enabled ? 'Disable' : 'Enable'}
                >
                  <span
                    className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform"
                    style={{ left: wh.enabled ? '14px' : '2px' }}
                  />
                </button>
                <button
                  className="shrink-0 p-1 rounded hover:bg-[#FEE2E2] text-[#6A7184] hover:text-[#991B1B] transition-colors"
                  onClick={() => handleDelete(wh.id)}
                  title="Delete"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })}
        </div>

        {/* Add form */}
        {showForm && (
          <div className="space-y-3 pt-3 border-t" style={{ borderColor: '#E7E7E9' }}>
            <p className="text-[12px] font-medium text-[#4A5268]">New webhook</p>

            <div>
              <label className="text-[11px] font-medium text-[#6A7184] block mb-1">Name</label>
              <input
                className="w-full px-2.5 py-1.5 rounded-md border text-[13px] outline-none focus:ring-1 focus:ring-[#3366FF]"
                style={{ borderColor: '#E7E7E9', color: '#374151' }}
                placeholder="e.g. Notify Slack"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-[11px] font-medium text-[#6A7184] block mb-1">Event</label>
                <select
                  className="w-full px-2.5 py-1.5 rounded-md border text-[13px] outline-none focus:ring-1 focus:ring-[#3366FF] bg-white"
                  style={{ borderColor: '#E7E7E9', color: '#374151' }}
                  value={event}
                  onChange={(e) => setEvent(e.target.value as WebhookConfig['event'])}
                >
                  {EVENTS.map((ev) => (
                    <option key={ev} value={ev}>
                      {EVENT_BADGES[ev].label} ({ev})
                    </option>
                  ))}
                </select>
              </div>
              <div className="w-28">
                <label className="text-[11px] font-medium text-[#6A7184] block mb-1">Method</label>
                <select
                  className="w-full px-2.5 py-1.5 rounded-md border text-[13px] outline-none focus:ring-1 focus:ring-[#3366FF] bg-white"
                  style={{ borderColor: '#E7E7E9', color: '#374151' }}
                  value={method}
                  onChange={(e) => setMethod(e.target.value as WebhookConfig['method'])}
                >
                  {METHODS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="text-[11px] font-medium text-[#6A7184] block mb-1">URL</label>
              <input
                className="w-full px-2.5 py-1.5 rounded-md border text-[13px] outline-none focus:ring-1 focus:ring-[#3366FF]"
                style={{ borderColor: '#E7E7E9', color: '#374151' }}
                placeholder="https://example.com/webhook"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </div>

            <div>
              <label className="text-[11px] font-medium text-[#6A7184] block mb-1">Headers</label>
              {Object.entries(headers).map(([k, v]) => (
                <div key={k} className="flex items-center gap-2 mb-1.5">
                  <span className="text-[12px] font-mono px-2 py-0.5 rounded bg-[#F4F4F5] border" style={{ borderColor: '#E7E7E9', color: '#374151' }}>
                    {k}: {v}
                  </span>
                  <button
                    className="text-[#6A7184] hover:text-[#991B1B]"
                    onClick={() => handleRemoveHeader(k)}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
              <div className="flex gap-2">
                <input
                  className="flex-1 px-2 py-1 rounded-md border text-[12px] outline-none focus:ring-1 focus:ring-[#3366FF]"
                  style={{ borderColor: '#E7E7E9', color: '#374151' }}
                  placeholder="Key"
                  value={headerKey}
                  onChange={(e) => setHeaderKey(e.target.value)}
                />
                <input
                  className="flex-1 px-2 py-1 rounded-md border text-[12px] outline-none focus:ring-1 focus:ring-[#3366FF]"
                  style={{ borderColor: '#E7E7E9', color: '#374151' }}
                  placeholder="Value"
                  value={headerValue}
                  onChange={(e) => setHeaderValue(e.target.value)}
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-[11px]"
                  onClick={handleAddHeader}
                >
                  Add
                </Button>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-3 text-[12px]"
                onClick={resetForm}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="h-8 px-4 text-[12px]"
                style={{ backgroundColor: '#3366FF' }}
                onClick={handleAdd}
                disabled={!name.trim() || !url.trim()}
              >
                Save webhook
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
