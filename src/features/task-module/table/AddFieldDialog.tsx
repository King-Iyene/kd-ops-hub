import { useState } from 'react';
import { Loader2, Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { STATUS_META, TASK_STATUSES, type TableField, type TableFieldConfig, type TableFieldType } from '@/queries/useTaskModule';
import {
  DEFAULT_CURRENCY, DEFAULT_OVERDUE_GRACE_DAYS, DEFAULT_TASK_STATUSES, FIELD_TYPES, FIELD_TYPE_ORDER, OPTION_TYPES, TEXTY, defaultConfig,
} from './fieldTypes';

export interface FieldDraft { name: string; type: TableFieldType; config: TableFieldConfig }

// "Add a field" (or edit one): it becomes a column in the table and a
// question on any form built from it.
export function AddFieldDialog({
  open, onOpenChange, field, saving, onSave,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Editing an existing field: its type can't change. */
  field?: TableField;
  saving: boolean;
  onSave: (draft: FieldDraft) => void;
}) {
  const [name, setName] = useState(field?.name ?? '');
  const [type, setType] = useState<TableFieldType>(field?.type ?? 'text');
  const [config, setConfig] = useState<TableFieldConfig>(field?.config ?? defaultConfig('text'));
  const [newOption, setNewOption] = useState('');
  const meta = FIELD_TYPES[type];
  const set = (patch: Partial<TableFieldConfig>) => setConfig((c) => ({ ...c, ...patch }));

  const pickType = (t: TableFieldType) => {
    setType(t);
    // Keep "required" and any options already typed when switching between similar types.
    setConfig((c) => ({ ...defaultConfig(t), required: FIELD_TYPES[t].computed ? undefined : c.required, ...(OPTION_TYPES.includes(t) && c.options ? { options: c.options } : {}) }));
  };

  const addOption = () => {
    const o = newOption.trim();
    if (!o || (config.options ?? []).some((x) => x.toLowerCase() === o.toLowerCase())) return;
    set({ options: [...(config.options ?? []), o] });
    setNewOption('');
  };

  const needsOptions = OPTION_TYPES.includes(type) && (config.options ?? []).length === 0;
  const taskStatuses = config.task_statuses ?? DEFAULT_TASK_STATUSES;
  const needsStatuses = type === 'task' && taskStatuses.length === 0;
  const canSave = name.trim().length > 0 && !needsOptions && !needsStatuses && !saving;
  const submit = () => {
    if (!canSave) return;
    const clean: TableFieldConfig = { ...config };
    // "Off" is the same as absent for every setting except the two that default to on.
    (Object.keys(clean) as (keyof TableFieldConfig)[]).forEach((k) => {
      if (clean[k] === undefined || (clean[k] === false && k !== 'task_undated' && k !== 'task_this_week')) delete clean[k];
    });
    onSave({ name: name.trim(), type, config: clean });
  };

  const label = 'text-xs font-semibold';
  const hint = 'text-2xs text-muted-foreground';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent hideClose className="md:max-w-md p-4 gap-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <DialogTitle className="text-sm font-semibold">{field ? 'Edit field' : 'Add a field'}</DialogTitle>
            <p className={hint}>It becomes a column here and a question on any form built from this table.</p>
          </div>
          <button type="button" onClick={() => onOpenChange(false)} className="text-muted-foreground hover:text-foreground" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-1">
          <label htmlFor="field-name" className={label}>Name</label>
          <Input
            id="field-name"
            autoFocus
            placeholder="Owner, Due date, Budget…"
            value={name}
            maxLength={100}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !OPTION_TYPES.includes(type)) { e.preventDefault(); submit(); } }}
          />
          <p className={hint}>What the column header says, and what people answering a form read.</p>
        </div>

        <div className="space-y-1">
          <span className={label}>Type</span>
          <Select value={type} onValueChange={(v) => pickType(v as TableFieldType)} disabled={!!field}>
            <SelectTrigger className="h-9" aria-label="Field type"><SelectValue /></SelectTrigger>
            <SelectContent className="max-h-72">
              {FIELD_TYPE_ORDER.map((t) => {
                const Icon = FIELD_TYPES[t].icon;
                return (
                  <SelectItem key={t} value={t}>
                    <span className="inline-flex items-center gap-2"><Icon className="h-3.5 w-3.5 text-muted-foreground" /> {FIELD_TYPES[t].label}</span>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          <p className={hint}>{field ? `${meta.help} The type can't be changed once the field exists.` : meta.help}</p>
        </div>

        {TEXTY.includes(type) && (
          <div className="space-y-1">
            <label htmlFor="field-max" className={label}>Maximum length</label>
            <Input
              id="field-max"
              type="number"
              min={1}
              max={10000}
              placeholder="No limit"
              value={config.max_length ?? ''}
              onChange={(e) => set({ max_length: e.target.value ? Math.max(1, Math.min(10000, Math.round(Number(e.target.value)))) : undefined })}
            />
            <p className={hint}>Leave it empty for no limit.</p>
          </div>
        )}

        {(type === 'number' || type === 'currency') && (
          <div className="flex gap-3">
            {type === 'currency' && (
              <div className="space-y-1 flex-1">
                <label htmlFor="field-cur" className={label}>Currency symbol</label>
                <Input id="field-cur" maxLength={4} value={config.currency ?? DEFAULT_CURRENCY} onChange={(e) => set({ currency: e.target.value || DEFAULT_CURRENCY })} />
              </div>
            )}
            <div className="space-y-1 flex-1">
              <label htmlFor="field-dec" className={label}>Decimal places</label>
              <Input id="field-dec" type="number" min={0} max={6} value={config.decimals ?? 0} onChange={(e) => set({ decimals: Math.max(0, Math.min(6, Math.round(Number(e.target.value) || 0))) })} />
            </div>
          </div>
        )}

        {type === 'rating' && (
          <div className="space-y-1">
            <label htmlFor="field-rmax" className={label}>Maximum stars</label>
            <Input id="field-rmax" type="number" min={3} max={10} value={config.rating_max ?? 5} onChange={(e) => set({ rating_max: Math.max(3, Math.min(10, Math.round(Number(e.target.value) || 5))) })} />
          </div>
        )}

        {OPTION_TYPES.includes(type) && (
          <div className="space-y-1.5">
            <span className={label}>Options</span>
            <div className="flex flex-wrap gap-1.5">
              {(config.options ?? []).map((o) => (
                <span key={o} className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-2xs font-medium">
                  {o}
                  <button type="button" aria-label={`Remove ${o}`} onClick={() => set({ options: (config.options ?? []).filter((x) => x !== o) })} className="opacity-60 hover:opacity-100">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="Add an option and press Enter"
                value={newOption}
                maxLength={60}
                onChange={(e) => setNewOption(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addOption(); } }}
                className="h-8 text-xs"
              />
              <Button type="button" size="sm" variant="outline" className="h-8" onClick={addOption}><Plus className="h-3.5 w-3.5" /></Button>
            </div>
            {field && <p className={hint}>Removing an option leaves rows that already use it as they are.</p>}
            {needsOptions && <p className="text-2xs text-amber-600 dark:text-amber-400">Add at least one option.</p>}
          </div>
        )}

        {type === 'task' && (
          <div className="space-y-2 rounded-md border border-border/70 p-2.5" data-task-settings>
            <div>
              <span className={label}>Tasks a form offers</span>
              <p className={hint}>Only these, so a person isn’t shown work that hasn’t started or is long past.</p>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {TASK_STATUSES.map((s) => (
                <label key={s} className="inline-flex items-center gap-1.5 text-xs cursor-pointer">
                  <Checkbox
                    checked={taskStatuses.includes(s)}
                    onCheckedChange={(c) => set({ task_statuses: c ? [...taskStatuses, s] : taskStatuses.filter((x) => x !== s) })}
                  />
                  <span className={cn('h-2 w-2 rounded-full', STATUS_META[s].dot)} /> {STATUS_META[s].label}
                </label>
              ))}
            </div>
            {needsStatuses && <p className="text-2xs text-amber-600 dark:text-amber-400">Pick at least one status.</p>}
            <div className="flex items-center gap-2 text-xs">
              <span>Leave out tasks overdue by more than</span>
              <Input
                type="number"
                min={0}
                max={365}
                aria-label="Days overdue"
                className="h-7 w-16 text-xs"
                value={config.overdue_grace_days ?? DEFAULT_OVERDUE_GRACE_DAYS}
                onChange={(e) => set({ overdue_grace_days: Math.max(0, Math.min(365, Math.round(Number(e.target.value) || 0))) })}
              />
              <span>days</span>
            </div>
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <Checkbox checked={config.task_this_week !== false} onCheckedChange={(c) => set({ task_this_week: !!c })} />
              Also offer anything due earlier this week (Mon–Fri)
            </label>
            <p className={hint}>Tasks due today or later are always offered.</p>
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <Checkbox checked={config.task_undated !== false} onCheckedChange={(c) => set({ task_undated: !!c })} />
              Also offer tasks with no due date
            </label>
          </div>
        )}

        {(type === 'person' || type === 'task') && (
          <label className="flex items-start gap-2 cursor-pointer">
            <Checkbox checked={!!config.multiple} onCheckedChange={(c) => set({ multiple: !!c })} className="mt-0.5" />
            <span>
              <span className="text-xs font-medium">Allow more than one</span>
              <span className={cn('block', hint)}>{type === 'person' ? 'Pick several people in one cell.' : 'Link several tasks in one cell.'}</span>
            </span>
          </label>
        )}

        {!meta.computed && (
          <label className="flex items-start gap-2 cursor-pointer">
            <Checkbox checked={!!config.required} onCheckedChange={(c) => set({ required: !!c })} className="mt-0.5" />
            <span>
              <span className="text-xs font-medium">Required</span>
              <span className={cn('block', hint)}>A form will not submit without it. Rows that already exist are left alone.</span>
            </span>
          </label>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button size="sm" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button size="sm" disabled={!canSave} onClick={submit}>
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />} {field ? 'Save' : 'Add field'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
