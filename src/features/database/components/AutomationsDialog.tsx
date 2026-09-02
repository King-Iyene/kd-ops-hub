import { useState, useCallback, useMemo } from 'react';
import { Zap, Plus, Trash2, GripVertical, Mail, Globe, FileEdit, FilePlus, Bell, Clock, ChevronDown } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useAutomations, useCreateAutomation, useUpdateAutomation, useDeleteAutomation } from '../hooks';
import { useFields } from '../hooks';
import type { Automation, AutomationAction } from '../types';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const TRIGGER_LABELS: Record<Automation['trigger_type'], string> = {
  record_created: 'Record Created',
  record_updated: 'Record Updated',
  record_deleted: 'Record Deleted',
  field_changed: 'Field Changed',
  scheduled: 'Scheduled',
};

const TRIGGER_BADGES: Record<Automation['trigger_type'], { bg: string; text: string }> = {
  record_created: { bg: '#D1FAE5', text: '#065F46' },
  record_updated: { bg: '#DBEAFE', text: '#1E40AF' },
  record_deleted: { bg: '#FEE2E2', text: '#991B1B' },
  field_changed: { bg: '#EDE9FE', text: '#5B21B6' },
  scheduled: { bg: '#FEF3C7', text: '#92400E' },
};

const ACTION_TYPES: { type: AutomationAction['type']; label: string; icon: typeof Mail }[] = [
  { type: 'send_email', label: 'Send Email', icon: Mail },
  { type: 'send_webhook', label: 'Send Webhook', icon: Globe },
  { type: 'update_record', label: 'Update Record', icon: FileEdit },
  { type: 'create_record', label: 'Create Record', icon: FilePlus },
  { type: 'send_notification', label: 'Send Notification', icon: Bell },
];

const CRON_PRESETS = [
  { label: 'Every hour', value: '0 * * * *' },
  { label: 'Every day at midnight', value: '0 0 * * *' },
  { label: 'Every Monday', value: '0 0 * * 1' },
  { label: 'Every 1st of month', value: '0 0 1 * *' },
];

function actionId() {
  return `act_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/* ------------------------------------------------------------------ */
/*  Action config forms                                                */
/* ------------------------------------------------------------------ */

function ActionConfigForm({
  action,
  onChange,
  fields,
}: {
  action: AutomationAction;
  onChange: (config: Record<string, any>) => void;
  fields: { id: string; name: string }[];
}) {
  const c = action.config;
  const set = (key: string, val: any) => onChange({ ...c, [key]: val });

  switch (action.type) {
    case 'send_email':
      return (
        <div className="space-y-2">
          <InputRow label="To" value={c.to ?? ''} onChange={(v) => set('to', v)} placeholder="email@example.com" />
          <InputRow label="Subject" value={c.subject ?? ''} onChange={(v) => set('subject', v)} placeholder="Subject line" />
          <div>
            <label className="text-[11px] font-medium text-[#6A7184] block mb-1">Body</label>
            <textarea
              className="w-full px-2.5 py-1.5 rounded-md border text-[13px] outline-none focus:ring-1 focus:ring-[#3366FF] min-h-[60px] resize-y"
              style={{ borderColor: '#E7E7E9', color: '#374151' }}
              value={c.body ?? ''}
              onChange={(e) => set('body', e.target.value)}
              placeholder="Email body..."
            />
          </div>
        </div>
      );

    case 'send_webhook':
      return (
        <div className="space-y-2">
          <InputRow label="URL" value={c.url ?? ''} onChange={(v) => set('url', v)} placeholder="https://example.com/webhook" />
          <div>
            <label className="text-[11px] font-medium text-[#6A7184] block mb-1">Method</label>
            <select
              className="w-full px-2.5 py-1.5 rounded-md border text-[13px] outline-none focus:ring-1 focus:ring-[#3366FF] bg-white"
              style={{ borderColor: '#E7E7E9', color: '#374151' }}
              value={c.method ?? 'POST'}
              onChange={(e) => set('method', e.target.value)}
            >
              {['POST', 'PUT', 'PATCH', 'GET', 'DELETE'].map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </div>
          <InputRow label="Headers (JSON)" value={c.headers ?? ''} onChange={(v) => set('headers', v)} placeholder='{"Authorization":"Bearer ..."}' />
        </div>
      );

    case 'update_record':
      return (
        <div className="space-y-2">
          <div>
            <label className="text-[11px] font-medium text-[#6A7184] block mb-1">Field</label>
            <select
              className="w-full px-2.5 py-1.5 rounded-md border text-[13px] outline-none focus:ring-1 focus:ring-[#3366FF] bg-white"
              style={{ borderColor: '#E7E7E9', color: '#374151' }}
              value={c.field_id ?? ''}
              onChange={(e) => set('field_id', e.target.value)}
            >
              <option value="">Select field...</option>
              {fields.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </div>
          <InputRow label="Value" value={c.value ?? ''} onChange={(v) => set('value', v)} placeholder="New value" />
        </div>
      );

    case 'create_record':
      return (
        <div className="space-y-2">
          <p className="text-[11px] text-[#6A7184]">Define field/value pairs (JSON object)</p>
          <div>
            <textarea
              className="w-full px-2.5 py-1.5 rounded-md border text-[13px] outline-none focus:ring-1 focus:ring-[#3366FF] min-h-[60px] resize-y font-mono"
              style={{ borderColor: '#E7E7E9', color: '#374151' }}
              value={c.fields_json ?? '{}'}
              onChange={(e) => set('fields_json', e.target.value)}
              placeholder='{"field_name": "value"}'
            />
          </div>
        </div>
      );

    case 'send_notification':
      return (
        <div className="space-y-2">
          <div>
            <label className="text-[11px] font-medium text-[#6A7184] block mb-1">Message</label>
            <textarea
              className="w-full px-2.5 py-1.5 rounded-md border text-[13px] outline-none focus:ring-1 focus:ring-[#3366FF] min-h-[60px] resize-y"
              style={{ borderColor: '#E7E7E9', color: '#374151' }}
              value={c.message ?? ''}
              onChange={(e) => set('message', e.target.value)}
              placeholder="Notification message..."
            />
          </div>
        </div>
      );

    default:
      return null;
  }
}

function InputRow({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="text-[11px] font-medium text-[#6A7184] block mb-1">{label}</label>
      <input
        className="w-full px-2.5 py-1.5 rounded-md border text-[13px] outline-none focus:ring-1 focus:ring-[#3366FF]"
        style={{ borderColor: '#E7E7E9', color: '#374151' }}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main dialog                                                        */
/* ------------------------------------------------------------------ */

interface AutomationsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tableId: string | null;
  baseId: string | null;
}

export function AutomationsDialog({ open, onOpenChange, tableId, baseId }: AutomationsDialogProps) {
  const { data: automations = [], isLoading } = useAutomations(tableId);
  const { data: fields = [] } = useFields(tableId);
  const createAutomation = useCreateAutomation();
  const updateAutomation = useUpdateAutomation();
  const deleteAutomation = useDeleteAutomation();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showActionPicker, setShowActionPicker] = useState(false);

  // Local draft state for the selected automation
  const [draft, setDraft] = useState<Automation | null>(null);

  const selected = useMemo(() => automations.find((a) => a.id === selectedId) ?? null, [automations, selectedId]);

  // When selection changes, reset draft
  const selectAutomation = useCallback((a: Automation | null) => {
    setSelectedId(a?.id ?? null);
    setDraft(a ? { ...a, actions: [...a.actions] } : null);
    setShowActionPicker(false);
  }, []);

  const handleCreate = useCallback(async () => {
    if (!tableId || !baseId) return;
    const result = await createAutomation.mutateAsync({
      base_id: baseId,
      table_id: tableId,
      trigger_type: 'record_created',
    });
    selectAutomation(result);
  }, [tableId, baseId, createAutomation, selectAutomation]);

  const handleSave = useCallback(async () => {
    if (!draft || !tableId) return;
    await updateAutomation.mutateAsync({
      id: draft.id,
      table_id: tableId,
      name: draft.name,
      enabled: draft.enabled,
      trigger_type: draft.trigger_type,
      trigger_config: draft.trigger_config,
      actions: draft.actions,
    });
  }, [draft, tableId, updateAutomation]);

  const handleDelete = useCallback(async () => {
    if (!selected || !tableId) return;
    await deleteAutomation.mutateAsync({ id: selected.id, table_id: tableId });
    setSelectedId(null);
    setDraft(null);
  }, [selected, tableId, deleteAutomation]);

  const handleToggle = useCallback(async (a: Automation) => {
    if (!tableId) return;
    await updateAutomation.mutateAsync({ id: a.id, table_id: tableId, enabled: !a.enabled });
  }, [tableId, updateAutomation]);

  const updateDraft = useCallback((patch: Partial<Automation>) => {
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  const addAction = useCallback((type: AutomationAction['type']) => {
    const newAction: AutomationAction = { id: actionId(), type, config: {} };
    setDraft((prev) => (prev ? { ...prev, actions: [...prev.actions, newAction] } : prev));
    setShowActionPicker(false);
  }, []);

  const updateActionConfig = useCallback((actId: string, config: Record<string, any>) => {
    setDraft((prev) => {
      if (!prev) return prev;
      return { ...prev, actions: prev.actions.map((a) => (a.id === actId ? { ...a, config } : a)) };
    });
  }, []);

  const removeAction = useCallback((actId: string) => {
    setDraft((prev) => {
      if (!prev) return prev;
      return { ...prev, actions: prev.actions.filter((a) => a.id !== actId) };
    });
  }, []);

  const fieldOptions = useMemo(() => fields.map((f: any) => ({ id: f.id, name: f.name })), [fields]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl p-0 gap-0 overflow-hidden" style={{ height: 'min(680px, 85vh)' }}>
        <div className="flex h-full">
          {/* ---- Left sidebar ---- */}
          <div className="w-[220px] border-r flex flex-col shrink-0" style={{ borderColor: '#E7E7E9' }}>
            <div className="px-3 py-3 border-b flex items-center justify-between" style={{ borderColor: '#E7E7E9' }}>
              <span className="text-[13px] font-semibold flex items-center gap-1.5" style={{ color: '#374151' }}>
                <Zap size={14} className="text-[#3366FF]" /> Automations
              </span>
              <Button
                size="sm"
                className="h-6 w-6 p-0"
                style={{ backgroundColor: '#3366FF' }}
                onClick={handleCreate}
                title="New automation"
              >
                <Plus size={12} />
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto py-1">
              {isLoading && (
                <p className="text-[12px] text-[#6A7184] px-3 py-4 text-center">Loading...</p>
              )}

              {!isLoading && automations.length === 0 && (
                <div className="px-3 py-8 text-center">
                  <Zap size={28} className="mx-auto mb-2 text-[#D1D5DB]" />
                  <p className="text-[12px] text-[#6A7184]">No automations yet</p>
                  <p className="text-[11px] text-[#6A7184] mt-1">Create one to automate workflows.</p>
                </div>
              )}

              {automations.map((a) => {
                const badge = TRIGGER_BADGES[a.trigger_type];
                const isSelected = a.id === selectedId;
                return (
                  <button
                    key={a.id}
                    className="w-full text-left px-3 py-2 transition-colors"
                    style={{
                      backgroundColor: isSelected ? '#EBF0FF' : 'transparent',
                      opacity: a.enabled ? 1 : 0.6,
                    }}
                    onClick={() => selectAutomation(a)}
                  >
                    <p className="text-[12px] font-medium truncate" style={{ color: '#374151' }}>
                      {a.name}
                    </p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span
                        className="px-1.5 py-0.5 rounded text-[9px] font-medium"
                        style={{ backgroundColor: badge.bg, color: badge.text }}
                      >
                        {TRIGGER_LABELS[a.trigger_type]}
                      </span>
                      <button
                        className="shrink-0 w-6 h-3.5 rounded-full relative transition-colors ml-auto"
                        style={{ backgroundColor: a.enabled ? '#3366FF' : '#D1D5DB' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggle(a);
                        }}
                        title={a.enabled ? 'Disable' : 'Enable'}
                      >
                        <span
                          className="absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white shadow transition-transform"
                          style={{ left: a.enabled ? '12px' : '2px' }}
                        />
                      </button>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ---- Right panel ---- */}
          <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
            {!draft ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <Zap size={32} className="mx-auto mb-3 text-[#D1D5DB]" />
                  <p className="text-[13px] text-[#6A7184]">Select an automation or create a new one</p>
                </div>
              </div>
            ) : (
              <div className="p-4 space-y-5">
                {/* Name */}
                <div>
                  <label className="text-[11px] font-medium text-[#6A7184] block mb-1">Name</label>
                  <input
                    className="w-full px-2.5 py-1.5 rounded-md border text-[13px] outline-none focus:ring-1 focus:ring-[#3366FF]"
                    style={{ borderColor: '#E7E7E9', color: '#374151' }}
                    value={draft.name}
                    onChange={(e) => updateDraft({ name: e.target.value })}
                  />
                </div>

                {/* Trigger */}
                <div>
                  <label className="text-[11px] font-medium text-[#6A7184] block mb-1">Trigger</label>
                  <select
                    className="w-full px-2.5 py-1.5 rounded-md border text-[13px] outline-none focus:ring-1 focus:ring-[#3366FF] bg-white"
                    style={{ borderColor: '#E7E7E9', color: '#374151' }}
                    value={draft.trigger_type}
                    onChange={(e) => updateDraft({ trigger_type: e.target.value as Automation['trigger_type'], trigger_config: {} })}
                  >
                    {(Object.keys(TRIGGER_LABELS) as Automation['trigger_type'][]).map((t) => (
                      <option key={t} value={t}>{TRIGGER_LABELS[t]}</option>
                    ))}
                  </select>
                </div>

                {/* Trigger-specific config */}
                {draft.trigger_type === 'field_changed' && (
                  <div>
                    <label className="text-[11px] font-medium text-[#6A7184] block mb-1">Watch field</label>
                    <select
                      className="w-full px-2.5 py-1.5 rounded-md border text-[13px] outline-none focus:ring-1 focus:ring-[#3366FF] bg-white"
                      style={{ borderColor: '#E7E7E9', color: '#374151' }}
                      value={(draft.trigger_config as any).field_id ?? ''}
                      onChange={(e) => updateDraft({ trigger_config: { ...draft.trigger_config, field_id: e.target.value } })}
                    >
                      <option value="">Select field...</option>
                      {fieldOptions.map((f) => (
                        <option key={f.id} value={f.id}>{f.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                {draft.trigger_type === 'scheduled' && (
                  <div className="space-y-2">
                    <label className="text-[11px] font-medium text-[#6A7184] block mb-1">Cron expression</label>
                    <input
                      className="w-full px-2.5 py-1.5 rounded-md border text-[13px] font-mono outline-none focus:ring-1 focus:ring-[#3366FF]"
                      style={{ borderColor: '#E7E7E9', color: '#374151' }}
                      value={(draft.trigger_config as any).cron ?? ''}
                      onChange={(e) => updateDraft({ trigger_config: { ...draft.trigger_config, cron: e.target.value } })}
                      placeholder="0 * * * *"
                    />
                    <div className="flex gap-1.5 flex-wrap">
                      {CRON_PRESETS.map((p) => (
                        <button
                          key={p.value}
                          className="px-2 py-0.5 rounded-full text-[10px] font-medium border transition-colors hover:bg-[#EBF0FF]"
                          style={{ borderColor: '#E7E7E9', color: '#6A7184' }}
                          onClick={() => updateDraft({ trigger_config: { ...draft.trigger_config, cron: p.value } })}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-[11px] font-medium text-[#6A7184]">Actions ({draft.actions.length})</label>
                    <div className="relative">
                      <Button
                        size="sm"
                        className="h-6 px-2 text-[11px] gap-1"
                        style={{ backgroundColor: '#3366FF' }}
                        onClick={() => setShowActionPicker(!showActionPicker)}
                      >
                        <Plus size={11} /> Add action <ChevronDown size={10} />
                      </Button>
                      {showActionPicker && (
                        <div className="absolute right-0 top-7 z-50 bg-white rounded-lg border shadow-lg py-1 w-48" style={{ borderColor: '#E7E7E9' }}>
                          {ACTION_TYPES.map(({ type, label, icon: Icon }) => (
                            <button
                              key={type}
                              className="w-full text-left px-3 py-1.5 text-[12px] hover:bg-[#F4F4F5] flex items-center gap-2"
                              style={{ color: '#374151' }}
                              onClick={() => addAction(type)}
                            >
                              <Icon size={13} className="text-[#6A7184]" /> {label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {draft.actions.length === 0 && (
                    <div className="py-4 text-center rounded-lg border border-dashed" style={{ borderColor: '#E7E7E9' }}>
                      <p className="text-[12px] text-[#6A7184]">No actions configured</p>
                    </div>
                  )}

                  <div className="space-y-3">
                    {draft.actions.map((action, idx) => {
                      const meta = ACTION_TYPES.find((t) => t.type === action.type);
                      const Icon = meta?.icon ?? Bell;
                      return (
                        <div key={action.id} className="rounded-lg border p-3" style={{ borderColor: '#E7E7E9' }}>
                          <div className="flex items-center gap-2 mb-2">
                            <GripVertical size={12} className="text-[#D1D5DB] shrink-0" />
                            <Icon size={13} className="text-[#3366FF] shrink-0" />
                            <span className="text-[12px] font-medium" style={{ color: '#374151' }}>
                              {idx + 1}. {meta?.label ?? action.type}
                            </span>
                            <button
                              className="ml-auto p-1 rounded hover:bg-[#FEE2E2] text-[#6A7184] hover:text-[#991B1B] transition-colors"
                              onClick={() => removeAction(action.id)}
                              title="Remove action"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                          <ActionConfigForm
                            action={action}
                            onChange={(config) => updateActionConfig(action.id, config)}
                            fields={fieldOptions}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Save / Delete buttons */}
                <div className="flex items-center gap-2 pt-2 border-t" style={{ borderColor: '#E7E7E9' }}>
                  <Button
                    size="sm"
                    className="h-8 px-4 text-[12px]"
                    style={{ backgroundColor: '#3366FF' }}
                    onClick={handleSave}
                  >
                    Save
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 px-3 text-[12px] text-[#991B1B] border-[#FEE2E2] hover:bg-[#FEE2E2]"
                    onClick={handleDelete}
                  >
                    <Trash2 size={12} className="mr-1" /> Delete
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
