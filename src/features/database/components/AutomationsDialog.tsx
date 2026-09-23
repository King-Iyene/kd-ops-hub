import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Zap, Plus, Trash2, GripVertical, Mail, Globe, FileEdit, FilePlus, Bell, ChevronDown, ChevronRight, X, Filter, History, CheckCircle2, XCircle, AlertTriangle, Clock, Play, Save, Users, Webhook, HelpCircle, Copy, Info, Search, Hash, Type, Calendar, ToggleLeft, Link2, Paperclip, Star, AtSign, MapPin, Phone, Image, Code2, List, Braces, CopyPlus, ArrowUp, ArrowDown, ChevronUp, Timer, GitBranch, MessageSquare } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
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
  webhook_inflow: 'Incoming Webhook',
};

const TRIGGER_HELP: Record<Automation['trigger_type'], string> = {
  record_created: 'Fires when a new row is added to this table.',
  record_updated: 'Fires when any field on an existing row changes.',
  record_deleted: 'Fires when a row is removed from this table.',
  field_changed: 'Fires only when a specific field\'s value changes.',
  scheduled: 'Runs on a cron schedule (e.g. every hour, daily).',
  record_matches_conditions: 'Fires when a record transitions from NOT matching to matching your conditions.',
  webhook_inflow: 'Fires when an external service sends a POST to a unique webhook URL. Great for integrating with Zapier, Make, Stripe, etc.',
};

const ACTION_HELP: Record<AutomationAction['type'], string> = {
  send_email: 'Sends a real email via Resend. Use {{record.FieldName}} placeholders for dynamic content.',
  send_webhook: 'Sends an HTTP request to an external URL with the record data. Use for Slack, Discord, Zapier, etc.',
  update_record: 'Updates a field on the triggering record or a specific record.',
  create_record: 'Creates a new row in this table (or another table) with the values you set.',
  send_notification: 'Sends an in-app notification to selected team members.',
  delay: 'Pauses the automation for a set duration before running the next action. Great for follow-up emails or scheduled reminders.',
  conditional: 'Branches the automation based on a condition. If the condition is true, runs the "Then" actions; otherwise runs the "Else" actions.',
  log_message: 'Logs a message to the automation run history for debugging. Use {{record.FieldName}} for dynamic values.',
};

const TRIGGER_BADGES: Record<Automation['trigger_type'], { bg: string; darkBg: string; text: string; darkText: string }> = {
  record_created: { bg: '#D1FAE5', darkBg: 'hsl(152,40%,18%)', text: '#065F46', darkText: '#6EE7B7' },
  record_updated: { bg: '#DBEAFE', darkBg: 'hsl(217,40%,18%)', text: '#1E40AF', darkText: '#93C5FD' },
  record_deleted: { bg: '#FEE2E2', darkBg: 'hsl(0,40%,18%)', text: '#991B1B', darkText: '#FCA5A5' },
  field_changed: { bg: '#EDE9FE', darkBg: 'hsl(263,40%,18%)', text: '#5B21B6', darkText: '#C4B5FD' },
  scheduled: { bg: '#FEF3C7', darkBg: 'hsl(45,40%,18%)', text: '#92400E', darkText: '#FCD34D' },
  record_matches_conditions: { bg: '#FCE7F3', darkBg: 'hsl(330,40%,18%)', text: '#9D174D', darkText: '#F9A8D4' },
  webhook_inflow: { bg: '#E0F2FE', darkBg: 'hsl(200,40%,18%)', text: '#0369A1', darkText: '#7DD3FC' },
};

const ACTION_TYPES: { type: AutomationAction['type']; label: string; icon: typeof Mail }[] = [
  { type: 'send_email', label: 'Send Email', icon: Mail },
  { type: 'send_webhook', label: 'Send Webhook', icon: Globe },
  { type: 'update_record', label: 'Update Record', icon: FileEdit },
  { type: 'create_record', label: 'Create Record', icon: FilePlus },
  { type: 'send_notification', label: 'Send Notification', icon: Bell },
  { type: 'delay', label: 'Delay', icon: Timer },
  { type: 'conditional', label: 'Conditional', icon: GitBranch },
  { type: 'log_message', label: 'Log Message', icon: MessageSquare },
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

let _profilesCache: { data: { id: string; full_name: string }[]; ts: number } | null = null;

function useCompanyProfiles() {
  const [profiles, setProfiles] = useState<{ id: string; full_name: string }[]>(_profilesCache?.data ?? []);
  useEffect(() => {
    if (_profilesCache && Date.now() - _profilesCache.ts < 300_000) {
      setProfiles(_profilesCache.data);
      return;
    }
    supabase
      .from('profiles')
      .select('id, full_name')
      .neq('is_anonymised', true)
      .order('full_name')
      .then(({ data }) => {
        const result = data ?? [];
        _profilesCache = { data: result, ts: Date.now() };
        setProfiles(result);
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
          <HelpTip text={ACTION_HELP.send_email} />
          <InputWithPlaceholders label="To" value={c.to ?? ''} onChange={(v) => set('to', v)} placeholder="email@example.com or {{record.Email}}" fields={fields} />
          {c._showCc && (
            <InputWithPlaceholders label="CC" value={c.cc ?? ''} onChange={(v) => set('cc', v)} placeholder="cc@example.com" fields={fields} />
          )}
          {c._showBcc && (
            <InputWithPlaceholders label="BCC" value={c.bcc ?? ''} onChange={(v) => set('bcc', v)} placeholder="bcc@example.com" fields={fields} />
          )}
          {c._showReplyTo && (
            <InputWithPlaceholders label="Reply-To" value={c.reply_to ?? ''} onChange={(v) => set('reply_to', v)} placeholder="reply@example.com" fields={fields} />
          )}
          {(!c._showCc || !c._showBcc || !c._showReplyTo) && (
            <div className="flex items-center gap-2 flex-wrap">
              {!c._showCc && (
                <button className="text-2xs text-[#2D7FF9] hover:text-[#1a5fd4] transition-colors" onClick={() => set('_showCc', true)}>+ CC</button>
              )}
              {!c._showBcc && (
                <button className="text-2xs text-[#2D7FF9] hover:text-[#1a5fd4] transition-colors" onClick={() => set('_showBcc', true)}>+ BCC</button>
              )}
              {!c._showReplyTo && (
                <button className="text-2xs text-[#2D7FF9] hover:text-[#1a5fd4] transition-colors" onClick={() => set('_showReplyTo', true)}>+ Reply-To</button>
              )}
            </div>
          )}
          <InputWithPlaceholders label="Subject" value={c.subject ?? ''} onChange={(v) => set('subject', v)} placeholder="Subject line with {{record.Name}}" fields={fields} />
          <InputWithPlaceholders label="Body" value={c.body ?? ''} onChange={(v) => set('body', v)} placeholder="Hi {{record.Name}}, your status is now {{record.Status}}..." fields={fields} multiline />
        </div>
      );

    case 'send_webhook':
      return (
        <div className="space-y-2">
          <HelpTip text={ACTION_HELP.send_webhook} />
          <InputWithPlaceholders label="URL" value={c.url ?? ''} onChange={(v) => set('url', v)} placeholder="https://example.com/webhook" fields={fields} />
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
          <InputWithPlaceholders label="Headers (JSON)" value={c.headers ?? ''} onChange={(v) => set('headers', v)} placeholder='{"Authorization":"Bearer {{record.api_key}}"}' fields={fields} />
          <div>
            <label className="text-2xs font-medium text-[#6A7184] dark:text-[hsl(220,20%,55%)] block mb-1">Body</label>
            <div className="flex items-center gap-1.5 mb-1">
              <label className="flex items-center gap-1.5 text-2xs text-[#6A7184] dark:text-[hsl(220,20%,55%)] cursor-pointer">
                <input
                  type="radio"
                  name={`webhook-body-${action.id}`}
                  className="accent-[#2D7FF9]"
                  checked={c.body_type !== 'custom'}
                  onChange={() => set('body_type', 'auto')}
                />
                Send full record
              </label>
              <label className="flex items-center gap-1.5 text-2xs text-[#6A7184] dark:text-[hsl(220,20%,55%)] cursor-pointer">
                <input
                  type="radio"
                  name={`webhook-body-${action.id}`}
                  className="accent-[#2D7FF9]"
                  checked={c.body_type === 'custom'}
                  onChange={() => set('body_type', 'custom')}
                />
                Custom JSON
              </label>
            </div>
            {c.body_type === 'custom' && (
              <InputWithPlaceholders label="" value={c.custom_body ?? ''} onChange={(v) => set('custom_body', v)} placeholder={'{"name": "{{record.Name}}", "status": "{{record.Status}}"}'} fields={fields} multiline />
            )}
          </div>
        </div>
      );

    case 'update_record': {
      const updates: { field_id: string; value: string }[] = c.field_updates ?? (c.field_id ? [{ field_id: c.field_id, value: c.value ?? '' }] : []);
      const addUpdate = () => onChange({ ...c, field_updates: [...updates, { field_id: '', value: '' }] });
      const updateField = (i: number, key: string, val: string) => {
        const next = [...updates];
        next[i] = { ...next[i], [key]: val };
        onChange({ ...c, field_updates: next });
      };
      const removeUpdate = (i: number) => onChange({ ...c, field_updates: updates.filter((_, j) => j !== i) });
      return (
        <div className="space-y-2">
          <HelpTip text={ACTION_HELP.update_record} />
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
          <label className="text-2xs font-medium text-[#6A7184] dark:text-[hsl(220,20%,55%)] block">Fields to update</label>
          {updates.length === 0 && (
            <p className="text-2xs text-[#9CA3AF] dark:text-[hsl(220,20%,40%)] italic">No fields configured — click below to add.</p>
          )}
          {updates.map((u, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <select
                className="flex-1 min-w-0 px-2 py-1.5 rounded-md border border-[#E5E5E5] dark:border-[hsl(220,25%,18%)] text-xs text-[#374151] dark:text-[hsl(220,25%,88%)] bg-white dark:bg-[hsl(220,25%,13%)] outline-none focus:ring-1 focus:ring-[#2D7FF9]"
                value={u.field_id}
                onChange={(e) => updateField(i, 'field_id', e.target.value)}
              >
                <option value="">Select field...</option>
                {fields.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
              <span className="text-2xs text-[#9CA3AF] dark:text-[hsl(220,20%,40%)]">=</span>
              <div className="flex-1 min-w-0">
                <InputWithPlaceholders label="" value={u.value} onChange={(v) => updateField(i, 'value', v)} placeholder="Value or {{record.Field}}" fields={fields} />
              </div>
              <button
                className="shrink-0 p-1 rounded hover:bg-[#FEE2E2] dark:hover:bg-[hsl(0,40%,18%)] text-[#9CA3AF] hover:text-[#991B1B] dark:hover:text-[#FCA5A5] transition-colors"
                onClick={() => removeUpdate(i)}
              >
                <X size={12} />
              </button>
            </div>
          ))}
          <button
            className="flex items-center gap-1 text-2xs text-[#2D7FF9] hover:text-[#1a5fd4] transition-colors"
            onClick={addUpdate}
          >
            <Plus size={11} /> Add field
          </button>
        </div>
      );
    }

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
          <HelpTip text={ACTION_HELP.create_record} />
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
              <div className="flex-1 min-w-0">
                <InputWithPlaceholders label="" value={pair.value} onChange={(v) => updatePair(i, 'value', v)} placeholder="Value or {{record.Field}}" fields={fields} />
              </div>
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
          <HelpTip text={ACTION_HELP.send_notification} />
          <InputWithPlaceholders label="Title" value={c.title ?? ''} onChange={(v) => set('title', v)} placeholder="Notification title" fields={fields} />
          <InputWithPlaceholders label="Message" value={c.message ?? ''} onChange={(v) => set('message', v)} placeholder="Notification message with {{record.Name}}..." fields={fields} multiline />
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

    case 'delay': {
      const DELAY_PRESETS = [
        { label: '1 minute', seconds: 60 },
        { label: '5 minutes', seconds: 300 },
        { label: '15 minutes', seconds: 900 },
        { label: '1 hour', seconds: 3600 },
        { label: '1 day', seconds: 86400 },
      ];
      return (
        <div className="space-y-2">
          <HelpTip text={ACTION_HELP.delay} />
          <div>
            <label className="text-2xs font-medium text-[#6A7184] dark:text-[hsl(220,20%,55%)] block mb-1">Duration</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                className="w-20 px-2.5 py-1.5 rounded-md border border-[#E5E5E5] dark:border-[hsl(220,25%,18%)] text-xs-plus text-[#374151] dark:text-[hsl(220,25%,88%)] bg-white dark:bg-[hsl(220,25%,13%)] outline-none focus:ring-1 focus:ring-[#2D7FF9]"
                value={c.amount ?? 5}
                onChange={(e) => set('amount', Math.max(1, parseInt(e.target.value) || 1))}
              />
              <select
                className="px-2.5 py-1.5 rounded-md border border-[#E5E5E5] dark:border-[hsl(220,25%,18%)] text-xs-plus text-[#374151] dark:text-[hsl(220,25%,88%)] bg-white dark:bg-[hsl(220,25%,13%)] outline-none focus:ring-1 focus:ring-[#2D7FF9]"
                value={c.unit ?? 'minutes'}
                onChange={(e) => set('unit', e.target.value)}
              >
                <option value="seconds">seconds</option>
                <option value="minutes">minutes</option>
                <option value="hours">hours</option>
                <option value="days">days</option>
              </select>
            </div>
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {DELAY_PRESETS.map((p) => (
              <button
                key={p.seconds}
                className="px-2 py-0.5 rounded-full text-3xs font-medium border border-[#E5E5E5] dark:border-[hsl(220,25%,18%)] text-[#6A7184] dark:text-[hsl(220,20%,55%)] transition-colors hover:bg-[#EBF0FF] dark:hover:bg-[hsl(220,25%,15%)]"
                onClick={() => {
                  if (p.seconds < 60) onChange({ ...c, amount: p.seconds, unit: 'seconds' });
                  else if (p.seconds < 3600) onChange({ ...c, amount: p.seconds / 60, unit: 'minutes' });
                  else if (p.seconds < 86400) onChange({ ...c, amount: p.seconds / 3600, unit: 'hours' });
                  else onChange({ ...c, amount: p.seconds / 86400, unit: 'days' });
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      );
    }

    case 'log_message': {
      return (
        <div className="space-y-2">
          <HelpTip text={ACTION_HELP.log_message} />
          <div>
            <label className="text-2xs font-medium text-[#6A7184] dark:text-[hsl(220,20%,55%)] block mb-1">Message</label>
            <textarea
              className="w-full px-2.5 py-1.5 rounded-md border border-[#E5E5E5] dark:border-[hsl(220,25%,18%)] text-xs-plus text-[#374151] dark:text-[hsl(220,25%,88%)] bg-white dark:bg-[hsl(220,25%,13%)] outline-none focus:ring-1 focus:ring-[#2D7FF9] resize-none"
              rows={3}
              placeholder="Record {{record.Name}} was updated. Status: {{record.Status}}"
              value={c.message ?? ''}
              onChange={(e) => set('message', e.target.value)}
            />
          </div>
          <div>
            <label className="text-2xs font-medium text-[#6A7184] dark:text-[hsl(220,20%,55%)] block mb-1">Log level</label>
            <select
              className="px-2.5 py-1.5 rounded-md border border-[#E5E5E5] dark:border-[hsl(220,25%,18%)] text-xs-plus text-[#374151] dark:text-[hsl(220,25%,88%)] bg-white dark:bg-[hsl(220,25%,13%)] outline-none focus:ring-1 focus:ring-[#2D7FF9]"
              value={c.level ?? 'info'}
              onChange={(e) => set('level', e.target.value)}
            >
              <option value="info">Info</option>
              <option value="warning">Warning</option>
              <option value="error">Error</option>
            </select>
          </div>
        </div>
      );
    }

    case 'conditional': {
      const conditions: AutomationCondition[] = c.conditions ?? [];
      const thenActions: string[] = c.then_actions ?? [];
      const elseActions: string[] = c.else_actions ?? [];
      return (
        <div className="space-y-3">
          <HelpTip text={ACTION_HELP.conditional} />
          <div>
            <label className="text-2xs font-medium text-[#6A7184] dark:text-[hsl(220,20%,55%)] block mb-1">If condition</label>
            {conditions.map((cond, ci) => (
              <div key={ci} className="flex items-center gap-2 mb-1.5">
                <select
                  className="flex-1 px-2.5 py-1.5 rounded-md border border-[#E5E5E5] dark:border-[hsl(220,25%,18%)] text-xs-plus bg-white dark:bg-[hsl(220,25%,13%)] text-[#374151] dark:text-[hsl(220,25%,88%)] outline-none focus:ring-1 focus:ring-[#2D7FF9]"
                  value={cond.field_id}
                  onChange={(e) => {
                    const next = [...conditions];
                    next[ci] = { ...next[ci], field_id: e.target.value };
                    onChange({ ...c, conditions: next });
                  }}
                >
                  <option value="">Select field</option>
                  {fields?.map((f: any) => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
                <select
                  className="w-32 px-2.5 py-1.5 rounded-md border border-[#E5E5E5] dark:border-[hsl(220,25%,18%)] text-xs-plus bg-white dark:bg-[hsl(220,25%,13%)] text-[#374151] dark:text-[hsl(220,25%,88%)] outline-none focus:ring-1 focus:ring-[#2D7FF9]"
                  value={cond.operator}
                  onChange={(e) => {
                    const next = [...conditions];
                    next[ci] = { ...next[ci], operator: e.target.value as AutomationConditionOp };
                    onChange({ ...c, conditions: next });
                  }}
                >
                  {CONDITION_OPERATORS.map((op) => <option key={op.value} value={op.value}>{op.label}</option>)}
                </select>
                {CONDITION_OPERATORS.find((op) => op.value === cond.operator)?.needsValue !== false && (
                  <input
                    className="flex-1 px-2.5 py-1.5 rounded-md border border-[#E5E5E5] dark:border-[hsl(220,25%,18%)] text-xs-plus bg-white dark:bg-[hsl(220,25%,13%)] text-[#374151] dark:text-[hsl(220,25%,88%)] outline-none focus:ring-1 focus:ring-[#2D7FF9]"
                    placeholder="Value"
                    value={String(cond.value ?? '')}
                    onChange={(e) => {
                      const next = [...conditions];
                      next[ci] = { ...next[ci], value: e.target.value };
                      onChange({ ...c, conditions: next });
                    }}
                  />
                )}
                <button
                  className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-red-400"
                  onClick={() => onChange({ ...c, conditions: conditions.filter((_, i) => i !== ci) })}
                >
                  <X size={14} />
                </button>
              </div>
            ))}
            <button
              className="text-2xs text-[#2D7FF9] hover:underline"
              onClick={() => onChange({ ...c, conditions: [...conditions, { field_id: '', operator: 'equals' as AutomationConditionOp, value: '' }] })}
            >
              + Add condition
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-emerald-200 dark:border-emerald-800/50 bg-emerald-50/50 dark:bg-emerald-900/10 p-2">
              <div className="text-2xs font-semibold text-emerald-700 dark:text-emerald-400 mb-1 flex items-center gap-1">
                <CheckCircle2 size={12} /> Then (if true)
              </div>
              <p className="text-3xs text-[#6A7184] dark:text-[hsl(220,20%,55%)]">
                {thenActions.length === 0 ? 'Actions after this one will run.' : `${thenActions.length} action(s) configured.`}
              </p>
            </div>
            <div className="rounded-lg border border-red-200 dark:border-red-800/50 bg-red-50/50 dark:bg-red-900/10 p-2">
              <div className="text-2xs font-semibold text-red-700 dark:text-red-400 mb-1 flex items-center gap-1">
                <XCircle size={12} /> Else (if false)
              </div>
              <p className="text-3xs text-[#6A7184] dark:text-[hsl(220,20%,55%)]">
                {elseActions.length === 0 ? 'Remaining actions will be skipped.' : `${elseActions.length} action(s) configured.`}
              </p>
            </div>
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

const FIELD_ICON_MAP: Record<string, typeof Type> = {
  text: Type, long_text: Type, rich_text: Type,
  number: Hash, decimal: Hash, currency: Hash, percent: Hash, autonumber: Hash,
  date: Calendar, datetime: Calendar, created_at: Calendar, updated_at: Calendar,
  checkbox: ToggleLeft, boolean: ToggleLeft,
  select: List, multi_select: List,
  link: Link2, url: Link2,
  attachment: Paperclip, file: Paperclip,
  email: AtSign, phone: Phone,
  rating: Star,
  geo: MapPin, location: MapPin,
  image: Image,
  json: Braces, formula: Code2,
};

function getFieldIcon(name: string) {
  const lower = name.toLowerCase();
  for (const [key, Icon] of Object.entries(FIELD_ICON_MAP)) {
    if (lower.includes(key)) return Icon;
  }
  return Type;
}

interface VariableItem {
  label: string;
  value: string;
  description?: string;
  icon: typeof Type;
  category: 'system' | 'field';
}

function VariablePicker({ fields, onInsert }: {
  fields: { id: string; name: string }[];
  onInsert: (placeholder: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [focusIdx, setFocusIdx] = useState(0);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node) && !btnRef.current?.contains(e.target as Node)) {
        setOpen(false); setSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => {
    if (open && btnRef.current) {
      const btnRect = btnRef.current.getBoundingClientRect();
      const dialog = btnRef.current.closest('[role="dialog"]');
      const dialogRect = dialog?.getBoundingClientRect() ?? { top: 0, left: 0 };
      const dropdownW = 280;
      let left = btnRect.right - dropdownW - dialogRect.left;
      if (left < 4) left = btnRect.left - dialogRect.left;
      let top = btnRect.bottom + 4 - dialogRect.top;
      const dropdownH = 340;
      if (btnRect.bottom + dropdownH > window.innerHeight - 8) top = btnRect.top - dropdownH - 4 - dialogRect.top;
      setPos({ top, left });
      setSearch('');
      setFocusIdx(0);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          searchRef.current?.focus({ preventScroll: true });
        });
      });
    }
  }, [open]);

  const systemVars: VariableItem[] = useMemo(() => [
    { label: 'Record ID', value: '{{record.id}}', description: 'Unique row identifier', icon: Hash, category: 'system' },
    { label: 'Current Date', value: '{{now}}', description: 'ISO timestamp when automation runs', icon: Calendar, category: 'system' },
    { label: 'Date Only', value: '{{now.date}}', description: 'Today\'s date (YYYY-MM-DD)', icon: Calendar, category: 'system' },
    { label: 'Time Only', value: '{{now.time}}', description: 'Current time (HH:MM:SS)', icon: Clock, category: 'system' },
    { label: 'Table Name', value: '{{table.name}}', description: 'Name of this table', icon: Type, category: 'system' },
    { label: 'Base Name', value: '{{base.name}}', description: 'Name of this base', icon: List, category: 'system' },
    { label: 'Automation Name', value: '{{automation.name}}', description: 'Name of this automation', icon: Zap, category: 'system' },
    { label: 'Trigger Type', value: '{{trigger.type}}', description: 'What triggered this run', icon: Play, category: 'system' },
  ], []);

  const fieldVars: VariableItem[] = useMemo(() =>
    fields.map((f) => ({
      label: f.name,
      value: `{{record.${f.name}}}`,
      icon: getFieldIcon(f.name),
      category: 'field' as const,
    })),
    [fields]
  );

  const allVars = useMemo(() => [...systemVars, ...fieldVars], [systemVars, fieldVars]);

  const filtered = useMemo(() => {
    if (!search.trim()) return allVars;
    const q = search.toLowerCase();
    return allVars.filter((v) => v.label.toLowerCase().includes(q) || v.value.toLowerCase().includes(q));
  }, [allVars, search]);

  const systemFiltered = filtered.filter((v) => v.category === 'system');
  const fieldFiltered = filtered.filter((v) => v.category === 'field');

  useEffect(() => { setFocusIdx(0); }, [search]);

  const handleSelect = useCallback((item: VariableItem) => {
    onInsert(item.value);
    setOpen(false);
    setSearch('');
  }, [onInsert]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusIdx((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && filtered[focusIdx]) {
      e.preventDefault();
      handleSelect(filtered[focusIdx]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      setSearch('');
    }
  }, [filtered, focusIdx, handleSelect]);

  useEffect(() => {
    if (!listRef.current) return;
    const active = listRef.current.querySelector('[data-active="true"]');
    if (active) (active as HTMLElement).scrollIntoView({ block: 'nearest' });
  }, [focusIdx]);

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        ref={btnRef}
        type="button"
        className="group flex items-center gap-1.5 text-2xs font-medium transition-all duration-150 px-2 py-1 rounded-md bg-[#2D7FF9]/8 hover:bg-[#2D7FF9]/15 text-[#2D7FF9] dark:bg-[#2D7FF9]/12 dark:hover:bg-[#2D7FF9]/20 border border-[#2D7FF9]/15 hover:border-[#2D7FF9]/30"
        onClick={() => setOpen(!open)}
        title="Insert dynamic variable"
      >
        <Braces size={11} className="opacity-70 group-hover:opacity-100 transition-opacity" />
        <span>Variable</span>
        <ChevronDown size={10} className={`opacity-50 transition-transform duration-150 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && createPortal(
        <div
          ref={dropdownRef}
          className="absolute z-[9999] rounded-xl border border-[#E5E5E5] dark:border-[hsl(220,25%,20%)] shadow-xl bg-white dark:bg-[hsl(220,25%,11%)] w-[280px] overflow-hidden"
          style={{ top: pos.top, left: pos.left, animation: 'fadeInScale 120ms ease-out' }}
          onFocusCapture={(e) => e.stopPropagation()}
        >
          <style>{`@keyframes fadeInScale { from { opacity: 0; transform: translateY(-4px) scale(0.97); } to { opacity: 1; transform: none; } }`}</style>
          <div className="px-2.5 pt-2.5 pb-1.5">
            <div className="relative">
              <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-[#9CA3AF] dark:text-[hsl(220,20%,40%)]" />
              <input
                ref={searchRef}
                className="w-full pl-7 pr-2.5 py-1.5 rounded-lg bg-[#F4F4F5] dark:bg-[hsl(220,25%,14%)] border border-transparent focus:border-[#2D7FF9]/30 text-xs text-[#374151] dark:text-[hsl(220,25%,88%)] outline-none placeholder:text-[#9CA3AF] dark:placeholder:text-[hsl(220,20%,40%)] transition-colors"
                placeholder="Search variables..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={handleKeyDown}
              />
            </div>
          </div>
          <div ref={listRef} className="max-h-[240px] overflow-y-auto px-1.5 pb-1.5">
            {filtered.length === 0 && (
              <p className="text-xs text-[#9CA3AF] dark:text-[hsl(220,20%,40%)] text-center py-4">No matching variables</p>
            )}
            {systemFiltered.length > 0 && (
              <>
                <p className="px-2 pt-2 pb-1 text-3xs font-semibold text-[#9CA3AF] dark:text-[hsl(220,20%,40%)] uppercase tracking-wider">System</p>
                {systemFiltered.map((item) => {
                  const idx = filtered.indexOf(item);
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.value}
                      data-active={idx === focusIdx}
                      className={`w-full text-left px-2 py-1.5 rounded-lg flex items-center gap-2.5 transition-colors ${
                        idx === focusIdx
                          ? 'bg-[#2D7FF9]/10 dark:bg-[#2D7FF9]/15'
                          : 'hover:bg-[#F4F4F5] dark:hover:bg-[hsl(220,25%,14%)]'
                      }`}
                      onClick={() => handleSelect(item)}
                      onMouseEnter={() => setFocusIdx(idx)}
                    >
                      <div className="w-6 h-6 rounded-md flex items-center justify-center shrink-0 bg-[#EBF0FF] dark:bg-[#2D7FF9]/15">
                        <Icon size={12} className="text-[#2D7FF9]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-xs font-medium text-[#374151] dark:text-[hsl(220,25%,88%)] block truncate">{item.label}</span>
                        {item.description && <span className="text-3xs text-[#9CA3AF] dark:text-[hsl(220,20%,40%)] block truncate">{item.description}</span>}
                      </div>
                    </button>
                  );
                })}
              </>
            )}
            {fieldFiltered.length > 0 && (
              <>
                <p className={`px-2 pb-1 text-3xs font-semibold text-[#9CA3AF] dark:text-[hsl(220,20%,40%)] uppercase tracking-wider ${systemFiltered.length > 0 ? 'pt-2 mt-1 border-t border-[#E5E5E5] dark:border-[hsl(220,25%,18%)]' : 'pt-2'}`}>
                  Fields <span className="text-3xs font-normal normal-case opacity-60">({fieldFiltered.length})</span>
                </p>
                {fieldFiltered.map((item) => {
                  const idx = filtered.indexOf(item);
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.value}
                      data-active={idx === focusIdx}
                      className={`w-full text-left px-2 py-1.5 rounded-lg flex items-center gap-2.5 transition-colors ${
                        idx === focusIdx
                          ? 'bg-[#2D7FF9]/10 dark:bg-[#2D7FF9]/15'
                          : 'hover:bg-[#F4F4F5] dark:hover:bg-[hsl(220,25%,14%)]'
                      }`}
                      onClick={() => handleSelect(item)}
                      onMouseEnter={() => setFocusIdx(idx)}
                    >
                      <div className="w-6 h-6 rounded-md flex items-center justify-center shrink-0 bg-[#F4F4F5] dark:bg-[hsl(220,25%,15%)]">
                        <Icon size={12} className="text-[#6A7184] dark:text-[hsl(220,20%,55%)]" />
                      </div>
                      <span className="text-xs text-[#374151] dark:text-[hsl(220,25%,88%)] truncate">{item.label}</span>
                    </button>
                  );
                })}
              </>
            )}
          </div>
          <div className="px-3 py-1.5 border-t border-[#E5E5E5] dark:border-[hsl(220,25%,18%)] flex items-center gap-3 text-3xs text-[#9CA3AF] dark:text-[hsl(220,20%,40%)]">
            <span className="flex items-center gap-1"><kbd className="px-1 py-0.5 rounded bg-[#F4F4F5] dark:bg-[hsl(220,25%,15%)] font-mono text-3xs">↑↓</kbd> navigate</span>
            <span className="flex items-center gap-1"><kbd className="px-1 py-0.5 rounded bg-[#F4F4F5] dark:bg-[hsl(220,25%,15%)] font-mono text-3xs">↵</kbd> insert</span>
            <span className="flex items-center gap-1"><kbd className="px-1 py-0.5 rounded bg-[#F4F4F5] dark:bg-[hsl(220,25%,15%)] font-mono text-3xs">esc</kbd> close</span>
          </div>
        </div>,
        btnRef.current?.closest('[role="dialog"]') ?? document.body
      )}
    </div>
  );
}

function VariableChip({ text }: { text: string }) {
  const inner = text.slice(2, -2);
  const isSystem = !inner.startsWith('record.');
  const displayName = isSystem ? inner : inner.replace('record.', '');
  return (
    <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-3xs font-medium ${
      isSystem
        ? 'bg-[#EBF0FF] text-[#2D7FF9] dark:bg-[#2D7FF9]/15 dark:text-[#60A5FA]'
        : 'bg-[#F0FDF4] text-[#15803D] dark:bg-[#16A34A]/15 dark:text-[#4ADE80]'
    }`}>
      <Braces size={8} className="opacity-60" />
      {displayName}
    </span>
  );
}

function UsedVariables({ value }: { value: string }) {
  const vars = useMemo(() => {
    const matches = value.match(/\{\{[^}]+\}\}/g);
    return matches ? [...new Set(matches)] : [];
  }, [value]);
  if (vars.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-1.5">
      {vars.map((v) => <VariableChip key={v} text={v} />)}
    </div>
  );
}

function InputWithPlaceholders({ label, value, onChange, placeholder, fields, multiline }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string;
  fields: { id: string; name: string }[]; multiline?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const handleInsert = useCallback((ph: string) => {
    const el = inputRef.current;
    if (el) {
      const start = el.selectionStart ?? value.length;
      const end = el.selectionEnd ?? value.length;
      const next = value.slice(0, start) + ph + value.slice(end);
      onChange(next);
      requestAnimationFrame(() => { el.selectionStart = el.selectionEnd = start + ph.length; el.focus(); });
    } else {
      onChange(value + ph);
    }
  }, [value, onChange]);

  const cls = "w-full px-2.5 py-1.5 rounded-md border border-[#E5E5E5] dark:border-[hsl(220,25%,18%)] text-xs-plus text-[#374151] dark:text-[hsl(220,25%,88%)] bg-white dark:bg-[hsl(220,25%,13%)] outline-none focus:ring-1 focus:ring-[#2D7FF9] placeholder:text-[#9CA3AF] dark:placeholder:text-[hsl(220,20%,40%)]";

  return (
    <div>
      <div className={`flex items-center ${label ? 'justify-between' : 'justify-end'} mb-1`}>
        {label && <label className="text-2xs font-medium text-[#6A7184] dark:text-[hsl(220,20%,55%)]">{label}</label>}
        <VariablePicker fields={fields} onInsert={handleInsert} />
      </div>
      {multiline ? (
        <textarea
          ref={inputRef as any}
          className={cls + ' min-h-[60px] resize-y'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
        />
      ) : (
        <input
          ref={inputRef as any}
          className={cls}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
        />
      )}
      <UsedVariables value={value} />
    </div>
  );
}

function HelpTip({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-1.5 px-2.5 py-2 rounded-md text-2xs text-[#6A7184] dark:text-[hsl(220,20%,55%)] bg-[#F9FAFB] dark:bg-[hsl(220,25%,12%)] leading-relaxed">
      <Info size={11} className="shrink-0 mt-0.5 text-[#2D7FF9]" />
      <span>{text}</span>
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

  const handleDuplicate = useCallback(async () => {
    if (!selected || !tableId || !baseId) return;
    const result = await createAutomation.mutateAsync({
      base_id: baseId,
      table_id: tableId,
      trigger_type: selected.trigger_type,
    });
    await updateAutomation.mutateAsync({
      id: result.id,
      table_id: tableId,
      name: `${selected.name} (copy)`,
      trigger_type: selected.trigger_type,
      trigger_config: selected.trigger_config,
      actions: selected.actions.map((a) => ({ ...a, id: actionId() })),
      enabled: false,
    });
    setSelectedId(result.id);
    setDraft(null);
  }, [selected, tableId, baseId, createAutomation, updateAutomation]);

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

  const moveAction = useCallback((actId: string, direction: 'up' | 'down') => {
    setDraft((prev) => {
      if (!prev) return prev;
      const idx = prev.actions.findIndex((a) => a.id === actId);
      if (idx < 0) return prev;
      const target = direction === 'up' ? idx - 1 : idx + 1;
      if (target < 0 || target >= prev.actions.length) return prev;
      const next = [...prev.actions];
      [next[idx], next[target]] = [next[target], next[idx]];
      return { ...prev, actions: next };
    });
  }, []);

  const [collapsedActions, setCollapsedActions] = useState<Set<string>>(new Set());
  const [sidebarSearch, setSidebarSearch] = useState('');

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
      <DialogContent className="sm:max-w-6xl p-0 gap-0" style={{ height: 'min(820px, 90vh)' }} onPointerDownOutside={(e) => { if (dirty) e.preventDefault(); }} onEscapeKeyDown={(e) => { if (dirty) e.preventDefault(); }}>
        <DialogTitle className="sr-only">Automations</DialogTitle>
        <DialogDescription className="sr-only">Manage automations for this table</DialogDescription>
        <div className="flex h-full overflow-hidden rounded-xl">
          {/* ---- Left sidebar ---- */}
          <div className="w-[260px] border-r border-[#E5E5E5] dark:border-[hsl(220,25%,18%)] flex flex-col shrink-0 bg-white dark:bg-[hsl(220,30%,8%)]">
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

            {automations.length > 3 && (
              <div className="px-2 py-1.5 border-b border-[#E5E5E5] dark:border-[hsl(220,25%,18%)]">
                <div className="relative">
                  <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-[#9CA3AF] dark:text-[hsl(220,20%,40%)]" />
                  <input
                    className="w-full pl-7 pr-2 py-1 rounded-md bg-[#F4F4F5] dark:bg-[hsl(220,25%,14%)] border-none text-2xs text-[#374151] dark:text-[hsl(220,25%,88%)] outline-none placeholder:text-[#9CA3AF] dark:placeholder:text-[hsl(220,20%,40%)]"
                    placeholder="Search automations..."
                    value={sidebarSearch}
                    onChange={(e) => setSidebarSearch(e.target.value)}
                  />
                </div>
              </div>
            )}

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

              {automations.filter((a) => !sidebarSearch.trim() || a.name.toLowerCase().includes(sidebarSearch.toLowerCase()) || TRIGGER_LABELS[a.trigger_type].toLowerCase().includes(sidebarSearch.toLowerCase())).map((a) => {
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
                  <HelpTip text={TRIGGER_HELP[draft.trigger_type]} />
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

                {draft.trigger_type === 'webhook_inflow' && (
                  <div className="space-y-2">
                    <label className="text-2xs font-medium text-[#6A7184] dark:text-[hsl(220,20%,55%)] block mb-1">
                      <Webhook size={11} className="inline mr-1" /> Webhook URL
                    </label>
                    {draft.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          readOnly
                          className="flex-1 px-2.5 py-1.5 rounded-md border border-[#E5E5E5] dark:border-[hsl(220,25%,18%)] text-xs font-mono text-[#374151] dark:text-[hsl(220,25%,88%)] bg-[#F9FAFB] dark:bg-[hsl(220,25%,12%)] outline-none select-all"
                          value={`${(window as any).__SUPABASE_URL ?? import.meta.env.VITE_SUPABASE_URL}/functions/v1/webhook-inflow?automation_id=${draft.id}`}
                          onClick={(e) => (e.target as HTMLInputElement).select()}
                        />
                        <button
                          className="shrink-0 px-2.5 py-1.5 rounded-md text-2xs font-medium bg-[#2D7FF9] text-white hover:bg-[#1a5fd4] transition-colors"
                          onClick={() => {
                            const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/webhook-inflow?automation_id=${draft.id}`;
                            navigator.clipboard.writeText(url);
                          }}
                        >
                          <Copy size={11} />
                        </button>
                      </div>
                    ) : (
                      <p className="text-2xs text-[#9CA3AF] dark:text-[hsl(220,20%,40%)] italic">Save the automation first to generate a webhook URL.</p>
                    )}
                    <p className="text-2xs text-[#6A7184] dark:text-[hsl(220,20%,55%)]">
                      Send a POST request to this URL with a JSON body. The body will be available as the record data in your actions.
                    </p>
                    {(draft.trigger_config as any).secret && (
                      <div>
                        <label className="text-2xs font-medium text-[#6A7184] dark:text-[hsl(220,20%,55%)] block mb-1">Secret (optional)</label>
                        <input
                          className="w-full px-2.5 py-1.5 rounded-md border border-[#E5E5E5] dark:border-[hsl(220,25%,18%)] text-xs font-mono text-[#374151] dark:text-[hsl(220,25%,88%)] bg-white dark:bg-[hsl(220,25%,13%)] outline-none focus:ring-1 focus:ring-[#2D7FF9]"
                          value={(draft.trigger_config as any).secret ?? ''}
                          onChange={(e) => updateDraft({ trigger_config: { ...draft.trigger_config, secret: e.target.value } })}
                          placeholder="Shared secret for HMAC verification"
                        />
                      </div>
                    )}
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
                      const isCollapsed = collapsedActions.has(action.id);
                      return (
                        <div key={action.id} className="rounded-lg border border-[#E5E5E5] dark:border-[hsl(220,25%,18%)] bg-white dark:bg-[hsl(220,25%,13%)] overflow-hidden">
                          <div
                            className="flex items-center gap-2 px-3 py-2.5 cursor-pointer select-none"
                            style={{ borderBottom: isCollapsed ? 'none' : `1px solid ${isDark ? 'hsl(220,25%,18%)' : '#E5E5E5'}` }}
                            onClick={() => setCollapsedActions((prev) => {
                              const next = new Set(prev);
                              if (next.has(action.id)) next.delete(action.id); else next.add(action.id);
                              return next;
                            })}
                          >
                            <ChevronUp size={12} className={`text-[#9CA3AF] dark:text-[hsl(220,20%,40%)] shrink-0 transition-transform ${isCollapsed ? 'rotate-180' : ''}`} />
                            <div className="w-6 h-6 rounded-md flex items-center justify-center shrink-0" style={{ backgroundColor: isDark ? 'hsl(217,40%,18%)' : '#EBF5FF' }}>
                              <Icon size={12} className="text-[#2D7FF9]" />
                            </div>
                            <span className="text-xs font-medium text-[#374151] dark:text-[hsl(220,25%,88%)] flex-1 truncate">
                              {idx + 1}. {meta?.label ?? action.type}
                            </span>
                            <div className="flex items-center gap-0.5 ml-auto" onClick={(e) => e.stopPropagation()}>
                              {idx > 0 && (
                                <button className="p-1 rounded hover:bg-[#F4F4F5] dark:hover:bg-[hsl(220,25%,15%)] text-[#9CA3AF] dark:text-[hsl(220,20%,40%)] transition-colors" onClick={() => moveAction(action.id, 'up')} title="Move up">
                                  <ArrowUp size={11} />
                                </button>
                              )}
                              {idx < draft.actions.length - 1 && (
                                <button className="p-1 rounded hover:bg-[#F4F4F5] dark:hover:bg-[hsl(220,25%,15%)] text-[#9CA3AF] dark:text-[hsl(220,20%,40%)] transition-colors" onClick={() => moveAction(action.id, 'down')} title="Move down">
                                  <ArrowDown size={11} />
                                </button>
                              )}
                              <button
                                className="p-1 rounded hover:bg-[#FEE2E2] dark:hover:bg-[hsl(0,40%,18%)] text-[#6A7184] dark:text-[hsl(220,20%,55%)] hover:text-[#991B1B] dark:hover:text-[#FCA5A5] transition-colors"
                                onClick={() => removeAction(action.id)}
                                title="Remove action"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </div>
                          {!isCollapsed && (
                            <div className="p-3">
                              <ActionConfigForm
                                action={action}
                                onChange={(config) => updateActionConfig(action.id, config)}
                                fields={fieldOptions}
                                profiles={profiles}
                              />
                            </div>
                          )}
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
                    className="h-8 px-3 text-xs gap-1.5"
                    style={{ color: '#6A7184', borderColor: isDark ? 'hsl(220,25%,25%)' : '#E5E5E5' }}
                    onClick={handleDuplicate}
                    title="Duplicate this automation"
                  >
                    <CopyPlus size={12} /> Duplicate
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
