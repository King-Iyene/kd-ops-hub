import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { Calendar as CalendarIcon, Check, Flag, Plus, X } from 'lucide-react';
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
  type PersonOption, type TaskPriority, type TaskStatus,
} from '@/queries/useTaskModule';
import { dueLabel } from './taskDates';

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
