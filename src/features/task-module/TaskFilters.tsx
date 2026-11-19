import { ChevronDown, Filter as FilterIcon, Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  STATUS_META, TASK_STATUSES, PRIORITY_META,
  type PersonOption, type TaskListRow, type TaskPriority, type TaskRow,
} from '@/queries/useTaskModule';
import { isActive, type FilterCond, type FilterField } from './taskQuery';

// A ClickUp-style filter: a stack of conditions joined with AND, each one
// "<field> <operator> <values>". Conditions with nothing picked yet are
// ignored, so adding a filter never hides everything by surprise.

const FIELD_LABELS: Record<FilterField, string> = {
  status: 'Status', assignee: 'Assignee', priority: 'Priority', tag: 'Tag', list: 'List',
  title: 'Title', due: 'Due date', completed: 'Completed', created: 'Created', updated: 'Last updated',
};

const DUE_OPTIONS: [string, string][] = [
  ['overdue', 'Overdue'], ['today', 'Today'], ['tomorrow', 'Tomorrow'], ['week', 'This week'],
  ['next7', 'Next 7 days'], ['later', 'Later'], ['none', 'No due date'],
];
const PAST_OPTIONS: [string, string][] = [
  ['today', 'Today'], ['yesterday', 'Yesterday'], ['last7', 'Last 7 days'], ['last30', 'Last 30 days'], ['month', 'This month'],
];

interface Option { value: string; label: string; dot?: string }

export interface FilterContext {
  mode: 'list' | 'mine';
  meId: string | undefined;
  people: PersonOption[];
  lists: TaskListRow[];
  tasks: TaskRow[];
}

function fieldsFor(mode: 'list' | 'mine'): FilterField[] {
  // My Tasks is only ever yours, so it has no Assignee filter; a list page
  // is a single list, so it has no List filter.
  return mode === 'mine'
    ? ['status', 'priority', 'tag', 'list', 'title', 'due', 'completed', 'created', 'updated']
    : ['status', 'assignee', 'priority', 'tag', 'title', 'due', 'completed', 'created', 'updated'];
}

function optionsFor(field: FilterField, ctx: FilterContext): Option[] {
  switch (field) {
    case 'status':
      return TASK_STATUSES.map((s) => ({ value: s, label: STATUS_META[s].label, dot: STATUS_META[s].dot }));
    case 'priority':
      return [...(['urgent', 'high', 'medium', 'low'] as TaskPriority[]).map((p) => ({ value: p, label: PRIORITY_META[p].label })), { value: 'none', label: 'No priority' }];
    case 'assignee':
      return [
        { value: 'me', label: 'Me' },
        { value: 'none', label: 'Unassigned' },
        ...ctx.people.filter((p) => p.id !== ctx.meId).map((p) => ({ value: p.id, label: p.full_name })),
      ];
    case 'tag':
      return [...new Set(ctx.tasks.flatMap((t) => t.tags ?? []))].sort((a, b) => a.localeCompare(b)).map((t) => ({ value: t, label: t }));
    case 'list': {
      const used = new Set(ctx.tasks.map((t) => t.list_id));
      return ctx.lists.filter((l) => used.has(l.id)).map((l) => ({ value: l.id, label: l.name }));
    }
    case 'due':
      return DUE_OPTIONS.map(([value, label]) => ({ value, label }));
    case 'completed':
      return [...PAST_OPTIONS, ['not', 'Not completed']].map(([value, label]) => ({ value, label }));
    case 'created':
    case 'updated':
      return PAST_OPTIONS.map(([value, label]) => ({ value, label }));
    default:
      return [];
  }
}

let seq = 0;
const newCond = (field: FilterField): FilterCond => ({ id: `f${++seq}`, field, negate: false, values: [], text: '' });

export function FilterButton({
  conds, onChange, ctx, className,
}: {
  conds: FilterCond[];
  onChange: (next: FilterCond[]) => void;
  ctx: FilterContext;
  className?: string;
}) {
  const active = conds.filter(isActive).length;
  const update = (id: string, patch: Partial<FilterCond>) => onChange(conds.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="sm" variant={active ? 'default' : 'outline'} className={className}>
          <FilterIcon className="h-3.5 w-3.5" /> Filter
          {active > 0 && <span className="ml-0.5 rounded-full bg-background/25 px-1.5 text-3xs font-bold tabular-nums">{active}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[340px] p-2 space-y-2 max-h-[75vh] overflow-y-auto">
        {conds.length === 0 && (
          <p className="text-xs text-muted-foreground px-1 py-2">No filters yet. Add one to narrow the tasks shown.</p>
        )}
        {conds.map((c, i) => (
          <CondCard
            key={c.id}
            cond={c}
            first={i === 0}
            options={optionsFor(c.field, ctx)}
            onChange={(patch) => update(c.id, patch)}
            onRemove={() => onChange(conds.filter((x) => x.id !== c.id))}
          />
        ))}
        <div className="flex items-center justify-between px-1 pt-0.5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="inline-flex items-center gap-1.5 text-xs font-medium hover:text-primary">
                <Plus className="h-3.5 w-3.5" /> Add filter
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto">
              {fieldsFor(ctx.mode).map((f) => (
                <DropdownMenuItem key={f} onClick={() => onChange([...conds, newCond(f)])}>{FIELD_LABELS[f]}</DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          {conds.length > 0 && (
            <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => onChange([])}>Clear all</button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function CondCard({
  cond, first, options, onChange, onRemove,
}: {
  cond: FilterCond;
  first: boolean;
  options: Option[];
  onChange: (patch: Partial<FilterCond>) => void;
  onRemove: () => void;
}) {
  const isText = cond.field === 'title';
  const ops: [boolean, string][] = isText
    ? [[false, 'contains'], [true, 'does not contain']]
    : [[false, 'is any of'], [true, 'is none of']];
  const opLabel = ops.find(([n]) => n === cond.negate)?.[1];

  return (
    <div className="rounded-md border border-border/80 bg-muted/20" data-filter-field={cond.field}>
      <div className="flex items-center gap-2 px-2 py-1.5">
        <span className="text-3xs font-bold uppercase tracking-wide text-muted-foreground w-10">{first ? 'Where' : 'And'}</span>
        <span className="text-xs font-semibold">{FIELD_LABELS[cond.field]}</span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="inline-flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground">
              {opLabel} <ChevronDown className="h-3 w-3" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {ops.map(([negate, label]) => (
              <DropdownMenuItem key={label} onClick={() => onChange({ negate })}>{label}</DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <button type="button" onClick={onRemove} aria-label={`Remove ${FIELD_LABELS[cond.field]} filter`} className="ml-auto text-muted-foreground hover:text-foreground">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="px-2 pb-2">
        {isText ? (
          <Input autoFocus value={cond.text} onChange={(e) => onChange({ text: e.target.value })} placeholder="Type a word…" className="h-7 text-xs" />
        ) : options.length === 0 ? (
          <p className="text-2xs text-muted-foreground px-1">Nothing to choose from yet.</p>
        ) : (
          <div className="space-y-0.5 max-h-44 overflow-y-auto">
            {options.map((o) => {
              const checked = cond.values.includes(o.value);
              return (
                <label key={o.value} className="flex items-center gap-2 rounded px-1 py-0.5 text-xs hover:bg-muted/50 cursor-pointer">
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(on) => onChange({ values: on ? [...cond.values, o.value] : cond.values.filter((v) => v !== o.value) })}
                  />
                  {o.dot && <span className={cn('h-2 w-2 rounded-full shrink-0', o.dot)} />}
                  <span className={cn('truncate', cond.field === 'status' && 'uppercase text-2xs font-semibold tracking-wide')}>{o.label}</span>
                </label>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
