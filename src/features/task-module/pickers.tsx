import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { Calendar as CalendarIcon, Check, Flag, Plus, Repeat, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { initialsOf } from '@/lib/name';
import { AvatarBubble } from '@/components/AvatarBubble';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  STATUS_META, TASK_STATUSES, PRIORITY_META, PRIORITY_FLAG,
  type PersonOption, type Recurrence, type RecurrenceUnit, type TaskPriority, type TaskStatus,
} from '@/queries/useTaskModule';
import { Input } from '@/components/ui/input';
import { dueLabel } from './taskDates';
import { MAX_EVERY, customRule, presetOf, recurrenceLabel, ruleFor, withUntil, type RepeatPreset } from './recurrence';

export function StatusPill({ status, className }: { status: TaskStatus; className?: string }) {
  const meta = STATUS_META[status];
  return (
    <span className={cn('inline-flex items-center rounded px-1.5 py-0.5 text-3xs font-bold uppercase tracking-wide', meta.badge, className)}>
      {meta.label}
    </span>
  );
}

export function StatusPicker({ value, onChange }: { value: TaskStatus; onChange: (s: TaskStatus) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="rounded hover:opacity-80" aria-label="Change status">
          <StatusPill status={value} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {TASK_STATUSES.map((s) => (
          <DropdownMenuItem key={s} onClick={() => s !== value && onChange(s)}>
            <span className={cn('h-2 w-2 rounded-full mr-2', STATUS_META[s].dot)} />
            {STATUS_META[s].label}
            {s === value && <Check className="h-3.5 w-3.5 ml-auto" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function PersonAvatar({ person, size = 22 }: { person?: Pick<PersonOption, 'full_name' | 'photo_url'> | null; size?: number }) {
  return (
    <span title={person?.full_name}>
      <AvatarBubble photoUrl={person?.photo_url ?? null} initials={initialsOf(undefined, undefined, person?.full_name || '?')} size={size} />
    </span>
  );
}

export function AssigneePicker({
  value, people, onChange, compact,
}: {
  value: string | null;
  people: PersonOption[];
  onChange: (id: string | null) => void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const person = value ? people.find((p) => p.id === value) : undefined;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="inline-flex items-center gap-1.5 rounded px-1 py-0.5 hover:bg-muted/60 text-xs" aria-label="Change assignee">
          {person ? (
            <>
              <PersonAvatar person={person} size={20} />
              {!compact && <span className="truncate max-w-[140px]">{person.full_name}</span>}
            </>
          ) : (
            <span className="h-5 w-5 rounded-full border border-dashed border-muted-foreground/50 flex items-center justify-center text-muted-foreground">
              <Plus className="h-3 w-3" />
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-64" align="start">
        <Command>
          <CommandInput placeholder="Search people…" />
          <CommandList>
            <CommandEmpty>No one found.</CommandEmpty>
            <CommandGroup>
              {value && (
                <CommandItem onSelect={() => { onChange(null); setOpen(false); }}>
                  <X className="h-3.5 w-3.5 mr-2" /> Unassign
                </CommandItem>
              )}
              {people.map((p) => (
                <CommandItem key={p.id} value={`${p.full_name} ${p.email}`} onSelect={() => { onChange(p.id); setOpen(false); }}>
                  <PersonAvatar person={p} size={18} />
                  <span className="ml-2 truncate">{p.full_name}</span>
                  {p.id === value && <Check className="h-3.5 w-3.5 ml-auto" />}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function DuePicker({
  value, onChange, placeholder = 'Due date', overdue,
}: {
  value: string | null;
  onChange: (d: string | null) => void;
  placeholder?: string;
  overdue?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn('inline-flex items-center gap-1.5 rounded px-1 py-0.5 hover:bg-muted/60 text-xs', overdue ? 'text-destructive' : value ? '' : 'text-muted-foreground')}
        >
          <CalendarIcon className="h-3.5 w-3.5" />
          {value ? dueLabel(value) : placeholder}
        </button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-auto" align="start">
        <Calendar
          mode="single"
          selected={value ? parseISO(value) : undefined}
          onSelect={(d) => { onChange(d ? format(d, 'yyyy-MM-dd') : null); setOpen(false); }}
          initialFocus
        />
        {value && (
          <button
            type="button"
            className="w-full border-t border-border py-2 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => { onChange(null); setOpen(false); }}
          >
            Clear due date
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}

export function PriorityPicker({
  value, onChange, showLabel,
}: {
  value: TaskPriority | null;
  onChange: (p: TaskPriority | null) => void;
  showLabel?: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="inline-flex items-center gap-1.5 rounded px-1 py-0.5 hover:bg-muted/60 text-xs" aria-label="Change priority">
          <Flag className={cn('h-3.5 w-3.5', value ? PRIORITY_FLAG[value] : 'text-muted-foreground')} />
          {showLabel && <span className={value ? '' : 'text-muted-foreground'}>{value ? PRIORITY_META[value].label : 'Priority'}</span>}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {(['urgent', 'high', 'medium', 'low'] as TaskPriority[]).map((p) => (
          <DropdownMenuItem key={p} onClick={() => p !== value && onChange(p)}>
            <Flag className={cn('h-3.5 w-3.5 mr-2', PRIORITY_FLAG[p])} /> {PRIORITY_META[p].label}
            {p === value && <Check className="h-3.5 w-3.5 ml-auto" />}
          </DropdownMenuItem>
        ))}
        {value && (
          <DropdownMenuItem onClick={() => onChange(null)}>
            <X className="h-3.5 w-3.5 mr-2" /> Clear
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const REPEAT_CHOICES: { key: RepeatPreset; label: string }[] = [
  { key: 'none', label: 'Does not repeat' },
  { key: 'daily', label: 'Daily' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
  { key: 'custom', label: 'Custom…' },
];

// Daily, weekly, monthly or custom. When a repeating task is completed the
// next one is created straight away (the database does it), due one step
// after this task's due date — or one step from today when it has none.
export function RecurrencePicker({
  value, onChange, emptyLabel = 'Does not repeat',
}: {
  value: Recurrence | null;
  onChange: (r: Recurrence | null) => void;
  emptyLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState(false);
  const [unit, setUnit] = useState<RecurrenceUnit>(value?.unit ?? 'week');
  const [every, setEvery] = useState(String(value?.every ?? 2));
  const preset = presetOf(value);
  const until = value?.until ?? '';
  const fmt = (iso: string) => format(parseISO(iso), 'd MMM yyyy');
  const showCustom = custom || preset === 'custom';
  const everyNum = Number(every);
  const rule = customRule(unit, everyNum, until || null);

  const reset = (o: boolean) => {
    setOpen(o);
    if (o) {
      setCustom(false);
      setUnit(value?.unit ?? 'week');
      setEvery(String(value?.every ?? 2));
    }
  };
  const choose = (key: RepeatPreset) => {
    if (key === 'custom') { setCustom(true); return; }
    setOpen(false);
    if (key === 'none') { if (value) onChange(null); return; }
    if (key !== preset) onChange(withUntil(ruleFor(key), value?.until));
  };

  return (
    <Popover open={open} onOpenChange={reset}>
      <PopoverTrigger asChild>
        <button type="button" className={cn('inline-flex items-center gap-1.5 rounded px-1 py-0.5 hover:bg-muted/60 text-xs', !value && 'text-muted-foreground')} aria-label="Repeat">
          <Repeat className="h-3.5 w-3.5" /> {value ? recurrenceLabel(value, fmt) : emptyLabel}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-1.5 space-y-1" data-repeat-picker>
        {REPEAT_CHOICES.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => choose(c.key)}
            className="w-full flex items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-muted text-left"
          >
            <Check className={cn('h-3.5 w-3.5', (c.key === 'custom' ? showCustom : c.key === preset && !custom) ? 'opacity-100' : 'opacity-0')} />
            {c.label}
          </button>
        ))}

        {showCustom && (
          <div className="mx-1 rounded-md border border-border/70 p-2 space-y-2" data-repeat-custom>
            <div className="flex items-center gap-2 text-xs">
              <span>Every</span>
              <Input
                type="number"
                min={1}
                max={MAX_EVERY}
                aria-label="Repeat every"
                className="h-7 w-16 text-xs"
                value={every}
                onChange={(e) => setEvery(e.target.value)}
              />
              <select
                aria-label="Repeat unit"
                value={unit}
                onChange={(e) => setUnit(e.target.value as RecurrenceUnit)}
                className="h-7 rounded-md border border-input bg-background px-2 text-xs"
              >
                <option value="day">{everyNum === 1 ? 'day' : 'days'}</option>
                <option value="week">{everyNum === 1 ? 'week' : 'weeks'}</option>
                <option value="month">{everyNum === 1 ? 'month' : 'months'}</option>
              </select>
            </div>
            <button
              type="button"
              disabled={!rule}
              onClick={() => { if (rule) { onChange(rule); setOpen(false); } }}
              className="w-full rounded-md bg-primary text-primary-foreground text-xs py-1.5 disabled:opacity-50"
            >
              Set repeat
            </button>
            {!rule && <p className="text-2xs text-amber-600 dark:text-amber-400">Enter a whole number from 1 to {MAX_EVERY}.</p>}
          </div>
        )}

        {value && (
          <div className="mx-1 pt-1 border-t border-border/60 space-y-1">
            <label className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">Stop after</span>
              <input
                type="date"
                aria-label="Stop repeating after"
                value={until}
                min={format(new Date(), 'yyyy-MM-dd')}
                onChange={(e) => onChange(withUntil(value, e.target.value || null))}
                className="h-7 flex-1 rounded-md border border-input bg-background px-2 text-xs"
              />
            </label>
            <p className="text-2xs text-muted-foreground">
              Complete the task and the next one is created at once, due {preset === 'daily' ? 'the next day' : preset === 'weekly' ? 'a week later' : preset === 'monthly' ? 'a month later' : 'one step later'} (counted from its due date, or from today if it has none).
            </p>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
