import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { Zap, Plus, Trash2, GripVertical, Mail, Globe, FileEdit, FilePlus, Bell, ChevronDown, ChevronRight, X, Filter, History, CheckCircle2, XCircle, AlertTriangle, Clock, Play, Save, Users } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { useAutomations, useCreateAutomation, useUpdateAutomation, useDeleteAutomation, useAutomationRuns } from '../hooks';
import { useFields } from '../hooks';
import type { Automation, AutomationAction, AutomationCondition, AutomationConditionOp, AutomationRun } from '../types';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const TRIGGER_LABELS: Record<Automation['trigger_type'], string> = {
  record_created: 'Record Created',
  record_updated: 'Record Updated',
  record_deleted: 'Record Deleted',
  field_changed: 'Field Changed',
  scheduled: 'Scheduled',
  record_matches_conditions: 'When Record Matches Conditions',
};

const TRIGGER_BADGES: Record<Automation['trigger_type'], { bg: string; darkBg: string; text: string; darkText: string }> = {
  record_created: { bg: '#D1FAE5', darkBg: 'hsl(152,40%,18%)', text: '#065F46', darkText: '#6EE7B7' },
  record_updated: { bg: '#DBEAFE', darkBg: 'hsl(217,40%,18%)', text: '#1E40AF', darkText: '#93C5FD' },
  record_deleted: { bg: '#FEE2E2', darkBg: 'hsl(0,40%,18%)', text: '#991B1B', darkText: '#FCA5A5' },
  field_changed: { bg: '#EDE9FE', darkBg: 'hsl(263,40%,18%)', text: '#5B21B6', darkText: '#C4B5FD' },
  scheduled: { bg: '#FEF3C7', darkBg: 'hsl(45,40%,18%)', text: '#92400E', darkText: '#FCD34D' },
  record_matches_conditions: { bg: '#FCE7F3', darkBg: 'hsl(330,40%,18%)', text: '#9D174D', darkText: '#F9A8D4' },
};

const ACTION_TYPES: { type: AutomationAction['type']; label: string; icon: typeof Mail }[] = [
  { type: 'send_email', label: 'Send Email', icon: Mail },
  { type: 'send_webhook', label: 'Send Webhook', icon: Globe },
  { type: 'update_record', label: 'Update Record', icon: FileEdit },
  { type: 'create_record', label: 'Create Record', icon: FilePlus },
  { type: 'send_notification', label: 'Send Notification', icon: Bell },
];

const CONDITION_OPERATORS: { value: AutomationConditionOp; label: string; needsValue: boolean }[] = [
  { value: 'equals', label: 'is', needsValue: true },
  { value: 'not_equals', label: 'is not', needsValue: true },
  { value: 'contains', label: 'contains', needsValue: true },
  { value: 'not_contains', label: 'does not contain', needsValue: true },
  { value: 'is_empty', label: 'is empty', needsValue: false },
  { value: 'is_not_empty', label: 'is not empty', needsValue: false },
  { value: 'greater_than', label: 'greater than', needsValue: true },
  { value: 'less_than', label: 'less than', needsValue: true },
  { value: 'greater_or_equal', label: 'greater or equal', needsValue: true },
  { value: 'less_or_equal', label: 'less or equal', needsValue: true },
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

function conditionId() {
  return `cond_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function useCompanyProfiles() {
  const [profiles, setProfiles] = useState<{ id: string; full_name: string }[]>([]);
  useEffect(() => {
    supabase
      .from('profiles')
      .select('id, full_name')
      .neq('is_anonymised', true)
      .order('full_name')
      .then(({ data }) => {
        if (data) setProfiles(data);
      });
  }, []);
  return profiles;
}

function useIsDark() {
  const [isDark, setIsDark] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
  );
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setIsDark(e.matches);
    mq.addEventListener('change', handler);
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains('dark'));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    setIsDark(document.documentElement.classList.contains('dark') || mq.matches);
    return () => { mq.removeEventListener('change', handler); observer.disconnect(); };
  }, []);
  return isDark;
}

function isDraftDirty(draft: Automation | null, saved: Automation | null): boolean {
  if (!draft || !saved) return false;
  if (draft.name !== saved.name) return true;
  if (draft.trigger_type !== saved.trigger_type) return true;
  if (JSON.stringify(draft.trigger_config) !== JSON.stringify(saved.trigger_config)) return true;
  if (JSON.stringify(draft.actions) !== JSON.stringify(saved.actions)) return true;
  return false;
}

/* ------------------------------------------------------------------ */
/*  Condition builder                                                  */
/* ------------------------------------------------------------------ */

function ConditionRow({
  condition,
  fields,
  onChange,
  onRemove,
  index,
}: {
  condition: AutomationCondition & { _id?: string };
  fields: { id: string; name: string }[];
  onChange: (updated: AutomationCondition) => void;
  onRemove: () => void;
  index: number;
}) {
  const opMeta = CONDITION_OPERATORS.find(o => o.value === condition.operator);
  const needsValue = opMeta?.needsValue ?? true;

  return (
    <div className="flex items-center gap-2 group">
      <span className="text-2xs text-[#6A7184] dark:text-[hsl(220,20%,55%)] w-10 shrink-0 text-right">
        {index === 0 ? 'When' : 'AND'}
      </span>
      <select
        className="flex-1 min-w-0 px-2 py-1.5 rounded-md border border-[#E5E5E5] dark:border-[hsl(220,25%,18%)] text-xs text-[#374151] dark:text-[hsl(220,25%,88%)] bg-white dark:bg-[hsl(220,25%,13%)] outline-none focus:ring-1 focus:ring-[#2D7FF9]"
        value={condition.field_id}
        onChange={(e) => onChange({ ...condition, field_id: e.target.value })}
      >
        <option value="">Select field...</option>
        {fields.map((f) => (
          <option key={f.id} value={f.id}>{f.name}</option>
        ))}
      </select>
      <select
        className="w-[130px] shrink-0 px-2 py-1.5 rounded-md border border-[#E5E5E5] dark:border-[hsl(220,25%,18%)] text-xs text-[#374151] dark:text-[hsl(220,25%,88%)] bg-white dark:bg-[hsl(220,25%,13%)] outline-none focus:ring-1 focus:ring-[#2D7FF9]"
        value={condition.operator}
        onChange={(e) => onChange({ ...condition, operator: e.target.value as AutomationConditionOp })}
      >
        {CONDITION_OPERATORS.map((op) => (
          <option key={op.value} value={op.value}>{op.label}</option>
        ))}
      </select>
      {needsValue && (
        <input
          className="flex-1 min-w-0 px-2 py-1.5 rounded-md border border-[#E5E5E5] dark:border-[hsl(220,25%,18%)] text-xs text-[#374151] dark:text-[hsl(220,25%,88%)] bg-white dark:bg-[hsl(220,25%,13%)] outline-none focus:ring-1 focus:ring-[#2D7FF9] placeholder:text-[#9CA3AF] dark:placeholder:text-[hsl(220,20%,40%)]"
          value={String(condition.value ?? '')}
          onChange={(e) => onChange({ ...condition, value: e.target.value })}
          placeholder="Value..."
        />
      )}
      <button
        className="shrink-0 p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-[#FEE2E2] dark:hover:bg-[hsl(0,40%,18%)] text-[#6A7184] dark:text-[hsl(220,20%,55%)] hover:text-[#991B1B] dark:hover:text-[#FCA5A5] transition-all"
        onClick={onRemove}
        title="Remove condition"
      >
        <X size={12} />
      </button>
    </div>
  );
}

function ConditionBuilder({
  conditions,
  fields,
  onChange,
}: {
  conditions: (AutomationCondition & { _id?: string })[];
  fields: { id: string; name: string }[];
  onChange: (conditions: AutomationCondition[]) => void;
}) {
  const addCondition = () => {
    onChange([...conditions, { field_id: '', operator: 'equals' as AutomationConditionOp, value: '', _id: conditionId() } as any]);
  };

  const updateCondition = (index: number, updated: AutomationCondition) => {
    const next = [...conditions];
    next[index] = { ...updated, _id: conditions[index]._id };
    onChange(next);
  };

  const removeCondition = (index: number) => {
    onChange(conditions.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 mb-1">
        <Filter size={12} className="text-[#2D7FF9]" />
        <label className="text-2xs font-medium text-[#6A7184] dark:text-[hsl(220,20%,55%)]">Conditions</label>
      </div>

      {conditions.length === 0 && (
        <p className="text-2xs text-[#9CA3AF] dark:text-[hsl(220,20%,40%)] italic">
          No conditions — automation will fire on every record change.
        </p>
      )}

      <div className="space-y-2">
        {conditions.map((cond, i) => (
          <ConditionRow
            key={cond._id ?? i}
            condition={cond}
            fields={fields}
            onChange={(updated) => updateCondition(i, updated)}
            onRemove={() => removeCondition(i)}
            index={i}
          />
        ))}
      </div>

      <button
        className="flex items-center gap-1 text-2xs text-[#2D7FF9] hover:text-[#1a5fd4] transition-colors mt-1"
        onClick={addCondition}
      >
        <Plus size={11} /> Add condition
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Action config forms                                                */
/* ------------------------------------------------------------------ */

function ActionConfigForm({
  action,
  onChange,
  fields,
  profiles,
}: {
  action: AutomationAction;
  onChange: (config: Record<string, any>) => void;
  fields: { id: string; name: string }[];
  profiles: { id: string; full_name: string }[];
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
            <label className="text-2xs font-medium text-[#6A7184] dark:text-[hsl(220,20%,55%)] block mb-1">Body</label>
            <textarea
              className="w-full px-2.5 py-1.5 rounded-md border border-[#E5E5E5] dark:border-[hsl(220,25%,18%)] text-xs-plus text-[#374151] dark:text-[hsl(220,25%,88%)] bg-white dark:bg-[hsl(220,25%,13%)] outline-none focus:ring-1 focus:ring-[#2D7FF9] min-h-[60px] resize-y placeholder:text-[#9CA3AF] dark:placeholder:text-[hsl(220,20%,40%)]"
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
            <label className="text-2xs font-medium text-[#6A7184] dark:text-[hsl(220,20%,55%)] block mb-1">Method</label>
            <select
              className="w-full px-2.5 py-1.5 rounded-md border border-[#E5E5E5] dark:border-[hsl(220,25%,18%)] text-xs-plus text-[#374151] dark:text-[hsl(220,25%,88%)] outline-none focus:ring-1 focus:ring-[#2D7FF9] bg-white dark:bg-[hsl(220,25%,13%)]"
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
            <label className="text-2xs font-medium text-[#6A7184] dark:text-[hsl(220,20%,55%)] block mb-1">Record to update</label>
            <select
              className="w-full px-2.5 py-1.5 rounded-md border border-[#E5E5E5] dark:border-[hsl(220,25%,18%)] text-xs-plus text-[#374151] dark:text-[hsl(220,25%,88%)] outline-none focus:ring-1 focus:ring-[#2D7FF9] bg-white dark:bg-[hsl(220,25%,13%)]"
              value={c.record_id ?? '{{record.id}}'}
              onChange={(e) => set('record_id', e.target.value)}
            >
              <option value="{{record.id}}">Triggering record (current row)</option>
              <option value="_custom">Specific record ID...</option>
            </select>
            {c.record_id === '_custom' && (
              <input
                className="w-full mt-1.5 px-2.5 py-1.5 rounded-md border border-[#E5E5E5] dark:border-[hsl(220,25%,18%)] text-xs-plus text-[#374151] dark:text-[hsl(220,25%,88%)] bg-white dark:bg-[hsl(220,25%,13%)] outline-none focus:ring-1 focus:ring-[#2D7FF9] placeholder:text-[#9CA3AF] dark:placeholder:text-[hsl(220,20%,40%)]"
                value={c.custom_record_id ?? ''}
                onChange={(e) => set('custom_record_id', e.target.value)}
                placeholder="Paste record UUID"
              />
            )}
          </div>
          <div>
            <label className="text-2xs font-medium text-[#6A7184] dark:text-[hsl(220,20%,55%)] block mb-1">Field to update</label>
            <select
              className="w-full px-2.5 py-1.5 rounded-md border border-[#E5E5E5] dark:border-[hsl(220,25%,18%)] text-xs-plus text-[#374151] dark:text-[hsl(220,25%,88%)] outline-none focus:ring-1 focus:ring-[#2D7FF9] bg-white dark:bg-[hsl(220,25%,13%)]"
              value={c.field_id ?? ''}
              onChange={(e) => set('field_id', e.target.value)}
            >
              <option value="">Select field...</option>
              {fields.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-2xs font-medium text-[#6A7184] dark:text-[hsl(220,20%,55%)] block mb-1">Value</label>
            <select
              className="w-full px-2.5 py-1.5 rounded-md border border-[#E5E5E5] dark:border-[hsl(220,25%,18%)] text-xs-plus text-[#374151] dark:text-[hsl(220,25%,88%)] outline-none focus:ring-1 focus:ring-[#2D7FF9] bg-white dark:bg-[hsl(220,25%,13%)]"
              value={c.value_source ?? 'static'}
              onChange={(e) => set('value_source', e.target.value)}
            >
              <option value="static">Static value</option>
              <option value="field">Copy from another field</option>
              <option value="record_id">Triggering record ID</option>
            </select>
            {c.value_source === 'static' || !c.value_source ? (
              <input
                className="w-full mt-1.5 px-2.5 py-1.5 rounded-md border border-[#E5E5E5] dark:border-[hsl(220,25%,18%)] text-xs-plus text-[#374151] dark:text-[hsl(220,25%,88%)] bg-white dark:bg-[hsl(220,25%,13%)] outline-none focus:ring-1 focus:ring-[#2D7FF9] placeholder:text-[#9CA3AF] dark:placeholder:text-[hsl(220,20%,40%)]"
                value={c.value ?? ''}
                onChange={(e) => set('value', e.target.value)}
                placeholder="Enter value"
              />
            ) : c.value_source === 'field' ? (
              <select
                className="w-full mt-1.5 px-2.5 py-1.5 rounded-md border border-[#E5E5E5] dark:border-[hsl(220,25%,18%)] text-xs-plus text-[#374151] dark:text-[hsl(220,25%,88%)] outline-none focus:ring-1 focus:ring-[#2D7FF9] bg-white dark:bg-[hsl(220,25%,13%)]"
                value={c.source_field_id ?? ''}
                onChange={(e) => set('source_field_id', e.target.value)}
              >
                <option value="">Select source field...</option>
                {fields.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            ) : null}
          </div>
        </div>
      );

    case 'create_record': {
      const pairs: { field_id: string; value: string }[] = c.field_pairs ?? [];
      const addPair = () => onChange({ ...c, field_pairs: [...pairs, { field_id: '', value: '' }] });
      const updatePair = (i: number, key: string, val: string) => {
        const next = [...pairs];
        next[i] = { ...next[i], [key]: val };
        onChange({ ...c, field_pairs: next });
      };
      const removePair = (i: number) => onChange({ ...c, field_pairs: pairs.filter((_, j) => j !== i) });
      return (
        <div className="space-y-2">
          <label className="text-2xs font-medium text-[#6A7184] dark:text-[hsl(220,20%,55%)] block">Fields to set</label>
          {pairs.length === 0 && (
            <p className="text-2xs text-[#9CA3AF] dark:text-[hsl(220,20%,40%)] italic">No fields configured — click below to add.</p>
          )}
          {pairs.map((pair, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <select
                className="flex-1 min-w-0 px-2 py-1.5 rounded-md border border-[#E5E5E5] dark:border-[hsl(220,25%,18%)] text-xs text-[#374151] dark:text-[hsl(220,25%,88%)] bg-white dark:bg-[hsl(220,25%,13%)] outline-none focus:ring-1 focus:ring-[#2D7FF9]"
                value={pair.field_id}
                onChange={(e) => updatePair(i, 'field_id', e.target.value)}
              >
                <option value="">Select field...</option>
                {fields.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
              <span className="text-2xs text-[#9CA3AF] dark:text-[hsl(220,20%,40%)]">=</span>
              <input
                className="flex-1 min-w-0 px-2 py-1.5 rounded-md border border-[#E5E5E5] dark:border-[hsl(220,25%,18%)] text-xs text-[#374151] dark:text-[hsl(220,25%,88%)] bg-white dark:bg-[hsl(220,25%,13%)] outline-none focus:ring-1 focus:ring-[#2D7FF9] placeholder:text-[#9CA3AF] dark:placeholder:text-[hsl(220,20%,40%)]"
                value={pair.value}
                onChange={(e) => updatePair(i, 'value', e.target.value)}
                placeholder="Value"
              />
              <button
                className="shrink-0 p-1 rounded hover:bg-[#FEE2E2] dark:hover:bg-[hsl(0,40%,18%)] text-[#9CA3AF] hover:text-[#991B1B] dark:hover:text-[#FCA5A5] transition-colors"
                onClick={() => removePair(i)}
              >
                <X size={12} />
              </button>
            </div>
          ))}
          <button
            className="flex items-center gap-1 text-2xs text-[#2D7FF9] hover:text-[#1a5fd4] transition-colors"
            onClick={addPair}
          >
            <Plus size={11} /> Add field
          </button>
        </div>
      );
    }

    case 'send_notification': {
      const recipientIds: string[] = Array.isArray(c.recipients) ? c.recipients : [];
      const toggleRecipient = (uid: string) => {
        const next = recipientIds.includes(uid)
          ? recipientIds.filter((r: string) => r !== uid)
          : [...recipientIds, uid];
        set('recipients', next);
      };
      return (
        <div className="space-y-2">
          <InputRow label="Title" value={c.title ?? ''} onChange={(v) => set('title', v)} placeholder="Notification title" />
          <div>
            <label className="text-2xs font-medium text-[#6A7184] dark:text-[hsl(220,20%,55%)] block mb-1">Message</label>
            <textarea
              className="w-full px-2.5 py-1.5 rounded-md border border-[#E5E5E5] dark:border-[hsl(220,25%,18%)] text-xs-plus text-[#374151] dark:text-[hsl(220,25%,88%)] bg-white dark:bg-[hsl(220,25%,13%)] outline-none focus:ring-1 focus:ring-[#2D7FF9] min-h-[60px] resize-y placeholder:text-[#9CA3AF] dark:placeholder:text-[hsl(220,20%,40%)]"
              value={c.message ?? ''}
              onChange={(e) => set('message', e.target.value)}
              placeholder="Notification message..."
            />
          </div>
          <div>
            <label className="text-2xs font-medium text-[#6A7184] dark:text-[hsl(220,20%,55%)] flex items-center gap-1.5 mb-1.5">
              <Users size={11} /> Recipients
            </label>
            {profiles.length === 0 ? (
              <p className="text-2xs text-[#9CA3AF] dark:text-[hsl(220,20%,40%)] italic">Loading team members...</p>
            ) : (
              <div className="max-h-[120px] overflow-y-auto rounded-md border border-[#E5E5E5] dark:border-[hsl(220,25%,18%)] bg-white dark:bg-[hsl(220,25%,13%)]">
                {profiles.map((p) => (
                  <label
                    key={p.id}
                    className="flex items-center gap-2 px-2.5 py-1.5 cursor-pointer hover:bg-[#F4F4F5] dark:hover:bg-[hsl(220,25%,15%)] transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={recipientIds.includes(p.id)}
                      onChange={() => toggleRecipient(p.id)}
                      className="rounded border-[#D1D5DB] dark:border-[hsl(220,25%,25%)] text-[#2D7FF9] focus:ring-[#2D7FF9] h-3.5 w-3.5"
                    />
                    <span className="text-xs text-[#374151] dark:text-[hsl(220,25%,88%)] truncate">{p.full_name}</span>
                  </label>
                ))}
              </div>
            )}
            {recipientIds.length > 0 && (
              <p className="text-2xs text-[#6A7184] dark:text-[hsl(220,20%,55%)] mt-1">{recipientIds.length} recipient{recipientIds.length !== 1 ? 's' : ''} selected</p>
            )}
          </div>
        </div>
      );
    }

    default:
      return null;
  }
}

const RUN_STATUS_CONFIG: Record<string, { icon: typeof CheckCircle2; color: string; label: string }> = {
  success: { icon: CheckCircle2, color: '#10B981', label: 'Success' },
  error: { icon: XCircle, color: '#EF4444', label: 'Error' },
  partial: { icon: AlertTriangle, color: '#F59E0B', label: 'Partial' },
  running: { icon: Clock, color: '#3B82F6', label: 'Running' },
  skipped: { icon: X, color: '#6B7280', label: 'Skipped' },
};

function RunHistoryRow({ run }: { run: AutomationRun }) {
  const [expanded, setExpanded] = useState(false);
  const cfg = RUN_STATUS_CONFIG[run.status] ?? RUN_STATUS_CONFIG.error;
  const StatusIcon = cfg.icon;
  const time = new Date(run.started_at);
  const timeStr = time.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const hasDetails = (run.action_results && run.action_results.length > 0) || run.error_message;

  return (
    <div>
      <button
        className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-[#F9FAFB] dark:bg-[hsl(220,25%,12%)] text-xs w-full text-left"
        onClick={() => hasDetails && setExpanded(!expanded)}
      >
        {hasDetails && (
          <ChevronRight size={10} className={`shrink-0 text-[#9CA3AF] dark:text-[hsl(220,20%,40%)] transition-transform ${expanded ? 'rotate-90' : ''}`} />
        )}
        <StatusIcon size={13} style={{ color: cfg.color }} className="shrink-0" />
        <span className="text-[#374151] dark:text-[hsl(220,25%,88%)] truncate flex-1">
          {run.trigger_event}
          {run.record_id && <span className="text-[#9CA3AF] dark:text-[hsl(220,20%,40%)] ml-1">({run.record_id.slice(0, 8)}...)</span>}
        </span>
        {run.duration_ms != null && (
          <span className="text-[#9CA3AF] dark:text-[hsl(220,20%,40%)] text-2xs shrink-0">{run.duration_ms}ms</span>
        )}
        <span className="text-[#9CA3AF] dark:text-[hsl(220,20%,40%)] text-2xs shrink-0">{timeStr}</span>
      </button>
      {expanded && (
        <div className="ml-6 mt-1 space-y-1 text-2xs">
          {run.error_message && (
            <p className="text-[#EF4444] px-2 py-1 rounded bg-[#FEF2F2] dark:bg-[hsl(0,30%,12%)]">{run.error_message}</p>
          )}
          {run.action_results?.map((r: any, i: number) => (
            <div key={i} className="px-2 py-1 rounded bg-[#F3F4F6] dark:bg-[hsl(220,25%,14%)] text-[#6A7184] dark:text-[hsl(220,20%,55%)]">
              <span className="font-medium text-[#374151] dark:text-[hsl(220,25%,80%)]">{r.action_type ?? `Action ${i + 1}`}</span>
              {r.status && <span className="ml-1.5">{r.status === 'success' ? '✓' : r.status === 'error' ? '✗' : r.status}</span>}
              {r.duration_ms != null && <span className="ml-1.5 text-[#9CA3AF] dark:text-[hsl(220,20%,40%)]">{r.duration_ms}ms</span>}
              {r.error && <p className="text-[#EF4444] mt-0.5">{r.error}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RunHistoryPanel({ automationId }: { automationId: string }) {
  const { data: runs = [], isLoading } = useAutomationRuns(automationId, 20);

  if (isLoading) {
    return <p className="text-xs text-[#6A7184] dark:text-[hsl(220,20%,55%)] py-2">Loading history...</p>;
  }

  if (runs.length === 0) {
    return (
      <div className="py-4 text-center rounded-lg border border-dashed border-[#E5E5E5] dark:border-[hsl(220,25%,18%)]">
        <History size={18} className="mx-auto mb-1 text-[#D1D5DB] dark:text-[hsl(220,25%,25%)]" />
        <p className="text-xs text-[#6A7184] dark:text-[hsl(220,20%,55%)]">No runs yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-1.5 max-h-[240px] overflow-y-auto">
      {runs.map((run) => <RunHistoryRow key={run.id} run={run} />)}
    </div>
  );
}

function InputRow({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="text-2xs font-medium text-[#6A7184] dark:text-[hsl(220,20%,55%)] block mb-1">{label}</label>
      <input
        className="w-full px-2.5 py-1.5 rounded-md border border-[#E5E5E5] dark:border-[hsl(220,25%,18%)] text-xs-plus text-[#374151] dark:text-[hsl(220,25%,88%)] bg-white dark:bg-[hsl(220,25%,13%)] outline-none focus:ring-1 focus:ring-[#2D7FF9] placeholder:text-[#9CA3AF] dark:placeholder:text-[hsl(220,20%,40%)]"
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

  const isDark = useIsDark();
  const profiles = useCompanyProfiles();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showActionPicker, setShowActionPicker] = useState(false);
  const [testRunning, setTestRunning] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const actionPickerRef = useRef<HTMLDivElement>(null);

  const [draft, setDraft] = useState<Automation | null>(null);

  const selected = useMemo(() => automations.find((a) => a.id === selectedId) ?? null, [automations, selectedId]);
  const dirty = isDraftDirty(draft, selected);

  const selectedVersion = selected?.updated_at ?? selected?.id;
  useEffect(() => {
    if (selected && draft && selected.id === draft.id && selectedVersion !== (draft as any)._syncKey) {
      setDraft({ ...selected, actions: [...selected.actions], _syncKey: selectedVersion } as any);
    }
  }, [selectedVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  const confirmIfDirty = useCallback((): boolean => {
    if (!dirty) return true;
    return window.confirm('You have unsaved changes. Discard them?');
  }, [dirty]);

  // Close action picker on outside click
  useEffect(() => {
    if (!showActionPicker) return;
    const handler = (e: MouseEvent) => {
      if (actionPickerRef.current && !actionPickerRef.current.contains(e.target as Node)) {
        setShowActionPicker(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showActionPicker]);

  const selectAutomation = useCallback((a: Automation | null) => {
    if (!confirmIfDirty()) return;
    setSelectedId(a?.id ?? null);
    setDraft(a ? { ...a, actions: [...a.actions] } : null);
    setShowActionPicker(false);
    setTestResult(null);
  }, [confirmIfDirty]);

  const handleCreate = useCallback(async () => {
    if (!tableId || !baseId) return;
    const result = await createAutomation.mutateAsync({
      base_id: baseId,
      table_id: tableId,
      trigger_type: 'record_matches_conditions',
    });
    selectAutomation(result);
  }, [tableId, baseId, createAutomation, selectAutomation]);

  const validateDraft = useCallback((d: Automation): string[] => {
    const errors: string[] = [];
    if (!d.name.trim()) errors.push('Automation name is required');
    if (d.trigger_type === 'field_changed' && !d.trigger_config?.field_id) {
      errors.push('Field Changed trigger requires a watched field');
    }
    if (d.trigger_type === 'scheduled' && !d.trigger_config?.cron) {
      errors.push('Scheduled trigger requires a cron expression');
    }
    for (const act of d.actions) {
      const label = ACTION_TYPES.find(t => t.type === act.type)?.label ?? act.type;
      if (act.type === 'send_webhook' && !act.config.url) {
        errors.push(`${label}: URL is required`);
      }
      if (act.type === 'send_email' && !act.config.to) {
        errors.push(`${label}: recipient email is required`);
      }
      if (act.type === 'update_record' && !act.config.field_id) {
        errors.push(`${label}: select a field to update`);
      }
    }
    return errors;
  }, []);

  const handleSave = useCallback(async () => {
    if (!draft || !tableId || saving) return;
    const errors = validateDraft(draft);
    if (errors.length > 0) {
      setValidationErrors(errors);
      return;
    }
    setValidationErrors([]);
    setSaving(true);
    try {
      await updateAutomation.mutateAsync({
        id: draft.id,
        table_id: tableId,
        name: draft.name,
        enabled: draft.enabled,
        trigger_type: draft.trigger_type,
        trigger_config: draft.trigger_config,
        actions: draft.actions,
      });
    } finally {
      setSaving(false);
    }
  }, [draft, tableId, updateAutomation, saving, validateDraft]);

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
    if (validationErrors.length > 0) setValidationErrors([]);
  }, [validationErrors.length]);

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

  const handleTestRun = useCallback(async () => {
    if (!draft || !tableId || !baseId) return;
    setTestRunning(true);
    setTestResult(null);
    try {
      // Fetch the table's schema name and pg_table_name to get a real sample record
      const { data: tblMeta } = await supabase
        .schema('nc_meta' as any)
        .from('tables')
        .select('pg_table_name, base_id')
        .eq('id', tableId)
        .single();
      let sampleRecord: Record<string, any> = { id: `test-${Date.now()}` };
      if (tblMeta) {
        const { data: baseMeta } = await supabase
          .schema('nc_meta' as any)
          .from('bases')
          .select('schema_name')
          .eq('id', tblMeta.base_id)
          .single();
        if (baseMeta) {
          const { data: rows } = await supabase
            .schema(baseMeta.schema_name as any)
            .from(tblMeta.pg_table_name)
            .select('*')
            .limit(1)
            .maybeSingle();
          if (rows) sampleRecord = rows;
        }
      }

      const { data, error } = await supabase.functions.invoke('automation-runner', {
        body: {
          event: draft.trigger_type === 'record_created' ? 'record.created' : 'record.updated',
          baseId,
          tableId,
          record: sampleRecord,
          oldRecord: {},
          _testAutomationId: draft.id,
        },
      });
      if (error) throw error;
      const resultSummary = data?.results?.map((r: any) => `${r.name}: ${r.status}`).join(', ') ?? JSON.stringify(data).slice(0, 200);
      setTestResult({ ok: true, message: `Test completed — ${resultSummary}` });
    } catch (err: any) {
      setTestResult({ ok: false, message: err.message ?? 'Test failed' });
    } finally {
      setTestRunning(false);
    }
  }, [draft, tableId, baseId]);

  const handleOpenChange = useCallback((nextOpen: boolean) => {
    if (!nextOpen && dirty) {
      if (!window.confirm('You have unsaved changes. Discard them?')) return;
    }
    onOpenChange(nextOpen);
  }, [dirty, onOpenChange]);

  const fieldOptions = useMemo(() => fields.map((f: any) => ({ id: f.id, name: f.name })), [fields]);

  const conditions = useMemo(() => {
    const raw = (draft?.trigger_config?.conditions as AutomationCondition[]) ?? [];
    return raw.map((c, i) => ({ ...c, _id: (c as any)._id ?? `cond_init_${i}` }));
  }, [draft?.trigger_config?.conditions]);

  const handleConditionsChange = useCallback((newConditions: AutomationCondition[]) => {
    setDraft((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        trigger_config: { ...prev.trigger_config, conditions: newConditions },
      };
    });
  }, []);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-3xl p-0 gap-0 overflow-hidden" style={{ height: 'min(680px, 85vh)' }} onPointerDownOutside={(e) => { if (dirty) e.preventDefault(); }} onEscapeKeyDown={(e) => { if (dirty) e.preventDefault(); }}>
        <DialogTitle className="sr-only">Automations</DialogTitle>
        <div className="flex h-full">
          {/* ---- Left sidebar ---- */}
          <div className="w-[220px] border-r border-[#E5E5E5] dark:border-[hsl(220,25%,18%)] flex flex-col shrink-0 bg-white dark:bg-[hsl(220,30%,8%)]">
            <div className="px-3 py-3 border-b border-[#E5E5E5] dark:border-[hsl(220,25%,18%)] flex items-center justify-between">
              <span className="text-xs-plus font-semibold flex items-center gap-1.5 text-[#374151] dark:text-[hsl(220,25%,88%)]">
                <Zap size={14} className="text-[#2D7FF9]" /> Automations
              </span>
              <Button
                size="sm"
                className="h-6 w-6 p-0"
                style={{ backgroundColor: '#2D7FF9' }}
                onClick={handleCreate}
                title="New automation"
              >
                <Plus size={12} />
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto py-1">
              {isLoading && (
                <p className="text-xs text-[#6A7184] dark:text-[hsl(220,20%,55%)] px-3 py-4 text-center">Loading...</p>
              )}

              {!isLoading && automations.length === 0 && (
                <div className="px-3 py-8 text-center">
                  <Zap size={28} className="mx-auto mb-2 text-[#D1D5DB] dark:text-[hsl(220,25%,25%)]" />
                  <p className="text-xs text-[#6A7184] dark:text-[hsl(220,20%,55%)]">No automations yet</p>
                  <p className="text-2xs text-[#6A7184] dark:text-[hsl(220,20%,55%)] mt-1">Create one to automate workflows.</p>
                </div>
              )}

              {automations.map((a) => {
                const badge = TRIGGER_BADGES[a.trigger_type];
                const isSelected = a.id === selectedId;
                return (
                  <div
                    key={a.id}
                    role="button"
                    tabIndex={0}
                    className="w-full text-left px-3 py-2 transition-colors cursor-pointer"
                    style={{
                      backgroundColor: isSelected
                        ? (isDark ? 'hsl(220,25%,15%)' : '#EBF0FF')
                        : 'transparent',
                      opacity: a.enabled ? 1 : 0.6,
                    }}
                    onClick={() => selectAutomation(a)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectAutomation(a); } }}
                  >
                    <p className="text-xs font-medium truncate text-[#374151] dark:text-[hsl(220,25%,88%)]">
                      {a.name}
                    </p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span
                        className="px-1.5 py-0.5 rounded text-3xs font-medium"
                        style={{ backgroundColor: isDark ? badge.darkBg : badge.bg, color: isDark ? badge.darkText : badge.text }}
                      >
                        {TRIGGER_LABELS[a.trigger_type]}
                      </span>
                      {a.run_count != null && a.run_count > 0 && (
                        <span className="text-3xs text-[#9CA3AF] dark:text-[hsl(220,20%,40%)]">{a.run_count} runs</span>
                      )}
                      <button
                        className="shrink-0 w-6 h-3.5 rounded-full relative transition-colors ml-auto"
                        style={{ backgroundColor: a.enabled ? '#2D7FF9' : (isDark ? 'hsl(220,25%,25%)' : '#D1D5DB') }}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggle(a);
                        }}
                        title={a.enabled ? 'Disable' : 'Enable'}
                      >
                        <span
                          className="absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white dark:bg-[hsl(220,25%,88%)] shadow transition-transform"
                          style={{ left: a.enabled ? '12px' : '2px' }}
                        />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ---- Right panel ---- */}
          <div className="flex-1 flex flex-col min-w-0 overflow-y-auto overflow-x-hidden bg-white dark:bg-[hsl(220,30%,10%)]">
            {!draft ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center px-8">
                  <div className="w-12 h-12 rounded-xl mx-auto mb-3 flex items-center justify-center" style={{ backgroundColor: isDark ? 'hsl(220,25%,15%)' : '#EBF5FF' }}>
                    <Zap size={22} className="text-[#2D7FF9]" />
                  </div>
                  <p className="text-sm font-medium text-[#374151] dark:text-[hsl(220,25%,88%)] mb-1">No automation selected</p>
                  <p className="text-xs text-[#6A7184] dark:text-[hsl(220,20%,55%)]">Select an automation from the list or create a new one to get started.</p>
                </div>
              </div>
            ) : (
              <div className="p-4 space-y-5">
                {/* Header with name + close */}
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <label className="text-2xs font-medium text-[#6A7184] dark:text-[hsl(220,20%,55%)] block mb-1">Name</label>
                    <input
                      className="w-full px-2.5 py-1.5 rounded-md border border-[#E5E5E5] dark:border-[hsl(220,25%,18%)] text-xs-plus text-[#374151] dark:text-[hsl(220,25%,88%)] bg-white dark:bg-[hsl(220,25%,13%)] outline-none focus:ring-1 focus:ring-[#2D7FF9]"
                      value={draft.name}
                      onChange={(e) => updateDraft({ name: e.target.value })}
                    />
                  </div>
                  <button
                    className="mt-5 p-1.5 rounded-md hover:bg-[#F4F4F5] dark:hover:bg-[hsl(220,25%,15%)] text-[#6A7184] dark:text-[hsl(220,20%,55%)] transition-colors"
                    onClick={() => handleOpenChange(false)}
                    title="Close"
                  >
                    <X size={16} />
                  </button>
                </div>

                {/* Validation errors */}
                {validationErrors.length > 0 && (
                  <div className="px-3 py-2 rounded-md text-xs space-y-0.5" style={{ backgroundColor: isDark ? 'hsl(0,30%,12%)' : '#FEF2F2', color: isDark ? '#FCA5A5' : '#991B1B' }}>
                    {validationErrors.map((err, i) => (
                      <p key={i} className="flex items-center gap-1.5"><XCircle size={11} className="shrink-0" /> {err}</p>
                    ))}
                  </div>
                )}

                {/* Unsaved changes banner */}
                {dirty && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-md text-xs" style={{ backgroundColor: isDark ? 'hsl(45,30%,12%)' : '#FFFBEB', color: isDark ? '#FCD34D' : '#92400E' }}>
                    <AlertTriangle size={13} />
                    <span>You have unsaved changes</span>
                    <button
                      className="ml-auto px-2.5 py-0.5 rounded text-2xs font-medium transition-colors"
                      style={{ backgroundColor: '#2D7FF9', color: '#fff' }}
                      onClick={handleSave}
                    >
                      Save now
                    </button>
                  </div>
                )}

                {/* Trigger */}
                <div>
                  <label className="text-2xs font-medium text-[#6A7184] dark:text-[hsl(220,20%,55%)] block mb-1">Trigger</label>
                  <select
                    className="w-full px-2.5 py-1.5 rounded-md border border-[#E5E5E5] dark:border-[hsl(220,25%,18%)] text-xs-plus text-[#374151] dark:text-[hsl(220,25%,88%)] outline-none focus:ring-1 focus:ring-[#2D7FF9] bg-white dark:bg-[hsl(220,25%,13%)]"
                    value={draft.trigger_type}
                    onChange={(e) => updateDraft({ trigger_type: e.target.value as Automation['trigger_type'], trigger_config: {} })}
                  >
                    {(Object.keys(TRIGGER_LABELS) as Automation['trigger_type'][]).map((t) => (
                      <option key={t} value={t}>{TRIGGER_LABELS[t]}</option>
                    ))}
                  </select>
                </div>

                {/* Trigger-specific config */}
                {draft.trigger_type === 'record_matches_conditions' && (
                  <ConditionBuilder
                    conditions={conditions}
                    fields={fieldOptions}
                    onChange={handleConditionsChange}
                  />
                )}

                {draft.trigger_type === 'field_changed' && (
                  <div>
                    <label className="text-2xs font-medium text-[#6A7184] dark:text-[hsl(220,20%,55%)] block mb-1">Watch field</label>
                    <select
                      className="w-full px-2.5 py-1.5 rounded-md border border-[#E5E5E5] dark:border-[hsl(220,25%,18%)] text-xs-plus text-[#374151] dark:text-[hsl(220,25%,88%)] outline-none focus:ring-1 focus:ring-[#2D7FF9] bg-white dark:bg-[hsl(220,25%,13%)]"
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
                    <label className="text-2xs font-medium text-[#6A7184] dark:text-[hsl(220,20%,55%)] block mb-1">Cron expression</label>
                    <input
                      className="w-full px-2.5 py-1.5 rounded-md border border-[#E5E5E5] dark:border-[hsl(220,25%,18%)] text-xs-plus text-[#374151] dark:text-[hsl(220,25%,88%)] bg-white dark:bg-[hsl(220,25%,13%)] font-mono outline-none focus:ring-1 focus:ring-[#2D7FF9] placeholder:text-[#9CA3AF] dark:placeholder:text-[hsl(220,20%,40%)]"
                      value={(draft.trigger_config as any).cron ?? ''}
                      onChange={(e) => updateDraft({ trigger_config: { ...draft.trigger_config, cron: e.target.value } })}
                      placeholder="0 * * * *"
                    />
                    <div className="flex gap-1.5 flex-wrap">
                      {CRON_PRESETS.map((p) => (
                        <button
                          key={p.value}
                          className="px-2 py-0.5 rounded-full text-3xs font-medium border border-[#E5E5E5] dark:border-[hsl(220,25%,18%)] text-[#6A7184] dark:text-[hsl(220,20%,55%)] transition-colors hover:bg-[#EBF0FF] dark:hover:bg-[hsl(220,25%,15%)]"
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
                    <label className="text-2xs font-medium text-[#6A7184] dark:text-[hsl(220,20%,55%)]">Actions ({draft.actions.length})</label>
                    <div className="relative" ref={actionPickerRef}>
                      <Button
                        size="sm"
                        className="h-6 px-2 text-2xs gap-1"
                        style={{ backgroundColor: '#2D7FF9' }}
                        onClick={() => setShowActionPicker(!showActionPicker)}
                      >
                        <Plus size={11} /> Add action <ChevronDown size={10} />
                      </Button>
                      {showActionPicker && (
                        <div className="absolute right-0 top-7 z-50 bg-white dark:bg-[hsl(220,25%,13%)] rounded-lg border border-[#E5E5E5] dark:border-[hsl(220,25%,18%)] shadow-lg py-1 w-48">
                          {ACTION_TYPES.map(({ type, label, icon: Icon }) => (
                            <button
                              key={type}
                              className="w-full text-left px-3 py-1.5 text-xs text-[#374151] dark:text-[hsl(220,25%,88%)] hover:bg-[#F4F4F5] dark:hover:bg-[hsl(220,25%,15%)] flex items-center gap-2"
                              onClick={() => addAction(type)}
                            >
                              <Icon size={13} className="text-[#6A7184] dark:text-[hsl(220,20%,55%)]" /> {label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {draft.actions.length === 0 && (
                    <div className="py-4 text-center rounded-lg border border-dashed border-[#E5E5E5] dark:border-[hsl(220,25%,18%)]">
                      <p className="text-xs text-[#6A7184] dark:text-[hsl(220,20%,55%)]">No actions configured</p>
                    </div>
                  )}

                  <div className="space-y-3">
                    {draft.actions.map((action, idx) => {
                      const meta = ACTION_TYPES.find((t) => t.type === action.type);
                      const Icon = meta?.icon ?? Bell;
                      return (
                        <div key={action.id} className="rounded-lg border border-[#E5E5E5] dark:border-[hsl(220,25%,18%)] bg-white dark:bg-[hsl(220,25%,13%)] overflow-hidden">
                          <div className="flex items-center gap-2 px-3 py-2.5" style={{ borderBottom: `1px solid ${isDark ? 'hsl(220,25%,18%)' : '#E5E5E5'}` }}>
                            <GripVertical size={12} className="text-[#D1D5DB] dark:text-[hsl(220,25%,25%)] shrink-0 cursor-grab" />
                            <div className="w-6 h-6 rounded-md flex items-center justify-center shrink-0" style={{ backgroundColor: isDark ? 'hsl(217,40%,18%)' : '#EBF5FF' }}>
                              <Icon size={12} className="text-[#2D7FF9]" />
                            </div>
                            <span className="text-xs font-medium text-[#374151] dark:text-[hsl(220,25%,88%)]">
                              {idx + 1}. {meta?.label ?? action.type}
                            </span>
                            <button
                              className="ml-auto p-1 rounded hover:bg-[#FEE2E2] dark:hover:bg-[hsl(0,40%,18%)] text-[#6A7184] dark:text-[hsl(220,20%,55%)] hover:text-[#991B1B] dark:hover:text-[#FCA5A5] transition-colors"
                              onClick={() => removeAction(action.id)}
                              title="Remove action"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                          <div className="p-3">
                            <ActionConfigForm
                              action={action}
                              onChange={(config) => updateActionConfig(action.id, config)}
                              fields={fieldOptions}
                              profiles={profiles}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Save / Delete / Test buttons */}
                <div className="flex items-center gap-2 pt-3 border-t border-[#E5E5E5] dark:border-[hsl(220,25%,18%)]">
                  <Button
                    size="sm"
                    className="h-8 px-4 text-xs gap-1.5"
                    style={{ backgroundColor: dirty ? '#2D7FF9' : (isDark ? 'hsl(220,25%,20%)' : '#E5E7EB'), color: dirty ? '#fff' : (isDark ? 'hsl(220,20%,55%)' : '#6B7280') }}
                    onClick={handleSave}
                    disabled={saving}
                  >
                    <Save size={12} /> {saving ? 'Saving...' : 'Save'}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 px-3 text-xs gap-1.5"
                    style={{ color: '#2D7FF9', borderColor: isDark ? 'hsl(220,25%,25%)' : '#DBEAFE' }}
                    onClick={handleTestRun}
                    disabled={testRunning}
                  >
                    <Play size={11} /> {testRunning ? 'Running...' : 'Test Run'}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 px-3 text-xs gap-1.5 text-[#991B1B] dark:text-[#FCA5A5] border-[#FEE2E2] dark:border-[hsl(0,40%,18%)] hover:bg-[#FEE2E2] dark:hover:bg-[hsl(0,40%,18%)]"
                    onClick={handleDelete}
                  >
                    <Trash2 size={12} /> Delete
                  </Button>

                  {draft.run_count != null && draft.run_count > 0 && (
                    <span className="ml-auto text-2xs text-[#6A7184] dark:text-[hsl(220,20%,55%)]">
                      {draft.run_count} runs
                      {draft.last_run_at && (
                        <> · Last: {new Date(draft.last_run_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</>
                      )}
                    </span>
                  )}
                </div>

                {/* Test run result */}
                {testResult && (
                  <div className={`px-3 py-2 rounded-md text-xs ${testResult.ok ? 'bg-[#D1FAE5] dark:bg-[hsl(152,30%,12%)] text-[#065F46] dark:text-[#6EE7B7]' : 'bg-[#FEE2E2] dark:bg-[hsl(0,30%,12%)] text-[#991B1B] dark:text-[#FCA5A5]'}`}>
                    {testResult.message}
                  </div>
                )}

                {/* Run History */}
                <div className="pt-2">
                  <div className="flex items-center gap-1.5 mb-2">
                    <History size={12} className="text-[#6A7184] dark:text-[hsl(220,20%,55%)]" />
                    <label className="text-2xs font-medium text-[#6A7184] dark:text-[hsl(220,20%,55%)]">Run History</label>
                  </div>
                  <RunHistoryPanel automationId={draft.id} />
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
