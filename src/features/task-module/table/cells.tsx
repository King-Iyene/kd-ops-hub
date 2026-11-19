import { useMemo, useRef, useState } from 'react';
import { format, parseISO } from 'date-fns';
import {
  Check, ExternalLink, Loader2, Paperclip, Plus, Star, Trash2, X,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useAuthStore } from '@/store/authStore';
import { errorMessage } from '@/lib/db-errors';
import { Checkbox } from '@/components/ui/checkbox';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command';
import {
  ATTACHMENT_BUCKET, ATTACHMENT_MAX_BYTES, attachmentUrl,
  type PersonOption, type TableField, type TableRecordRow, type TaskOption,
} from '@/queries/useTaskModule';
import { PersonAvatar } from '../pickers';
import {
  DEFAULT_CURRENCY, FIELD_TYPES, asList, cellValue, formatNumber, optionChip, type AttachmentValue,
} from './fieldTypes';

export interface CellCtx {
  tableId: string;
  people: PersonOption[];
  peopleById: Map<string, PersonOption>;
  openTasks: TaskOption[];
  taskTitle: (id: string) => string;
  listName: (id: string) => string;
  onOpenTask: (id: string) => void;
  /** People field used to narrow Task link pickers in the same row, if any. */
  personFieldId?: string;
}

const box = 'w-full min-h-[30px] px-2 py-1 text-xs flex items-center gap-1 text-left rounded-sm hover:bg-muted/40 focus:outline-none focus-visible:ring-1 focus-visible:ring-primary/50';
const empty = <span className="text-muted-foreground/40">—</span>;

export function TableCell({
  field, record, ctx, onCommit,
}: {
  field: TableField;
  record: TableRecordRow;
  ctx: CellCtx;
  onCommit: (value: unknown) => void;
}) {
  const value = cellValue(field, record);
  const commit = (v: unknown) => {
    // Only write when something actually changed.
    if (JSON.stringify(v ?? null) !== JSON.stringify(value ?? null)) onCommit(v);
  };

  switch (field.type) {
    case 'text':
    case 'link':
    case 'email':
    case 'phone':
    case 'number':
    case 'currency':
      return <InlineInput field={field} value={value} onCommit={commit} />;
    case 'long_text':
      return <LongTextCell value={value} max={field.config.max_length} onCommit={commit} />;
    case 'date':
      return <DateCell value={value} onCommit={commit} />;
    case 'checkbox':
      return (
        <div className={cn(box, 'justify-center hover:bg-transparent')}>
          <Checkbox checked={!!value} onCheckedChange={(c) => commit(c ? true : null)} aria-label={field.name} />
        </div>
      );
    case 'single_select':
    case 'multi_select':
      return <SelectCell field={field} value={value} onCommit={commit} />;
    case 'person':
      return <PersonCell field={field} value={value} ctx={ctx} onCommit={commit} />;
    case 'task':
      return <TaskCell field={field} value={value} record={record} ctx={ctx} onCommit={commit} />;
    case 'attachment':
      return <AttachmentCell value={value} record={record} ctx={ctx} onCommit={commit} />;
    case 'rating':
      return <RatingCell value={value} max={field.config.rating_max ?? 5} onCommit={commit} />;
    case 'created_by': {
      const p = typeof value === 'string' ? ctx.peopleById.get(value) : undefined;
      return <div className={cn(box, 'hover:bg-transparent')}>{p ? <><PersonAvatar person={p} size={18} /><span className="truncate">{p.full_name}</span></> : value ? 'Former member' : <span className="text-muted-foreground">Form response</span>}</div>;
    }
    case 'created_at':
    case 'last_modified':
      return <div className={cn(box, 'hover:bg-transparent text-muted-foreground tabular-nums')}>{typeof value === 'string' ? format(parseISO(value), 'd MMM yyyy, HH:mm') : empty}</div>;
    case 'auto_number':
      return <div className={cn(box, 'hover:bg-transparent text-muted-foreground tabular-nums')}>{value != null ? String(value) : empty}</div>;
    default:
      return null;
  }
}

function InlineInput({ field, value, onCommit }: { field: TableField; value: unknown; onCommit: (v: unknown) => void }) {
  const numeric = field.type === 'number' || field.type === 'currency';
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const start = () => { setDraft(value == null ? '' : String(value)); setEditing(true); };
  const done = () => {
    setEditing(false);
    const t = draft.trim();
    if (numeric) {
      const n = Number(t);
      onCommit(t === '' || !Number.isFinite(n) ? null : n);
    } else onCommit(t === '' ? null : t);
  };

  if (editing) {
    return (
      <input
        autoFocus
        type={numeric ? 'number' : field.type === 'email' ? 'email' : 'text'}
        step="any"
        maxLength={field.config.max_length}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={done}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditing(false); }}
        className="w-full h-[30px] px-2 text-xs bg-background border border-primary/60 rounded-sm outline-none"
      />
    );
  }
  const s = value == null || value === '' ? '' : String(value);
  let shown: React.ReactNode = s || empty;
  if (s && field.type === 'number') shown = <span className="tabular-nums">{formatNumber(Number(s), field.config.decimals ?? 0)}</span>;
  if (s && field.type === 'currency') shown = <span className="tabular-nums">{field.config.currency ?? DEFAULT_CURRENCY}{formatNumber(Number(s), field.config.decimals ?? 2)}</span>;
  const href = s && (field.type === 'link' ? (/^https?:\/\//i.test(s) ? s : `https://${s}`) : field.type === 'email' ? `mailto:${s}` : field.type === 'phone' ? `tel:${s}` : null);
  return (
    <div className={cn(box, numeric && 'justify-end')} role="button" tabIndex={0} onClick={start} onKeyDown={(e) => { if (e.key === 'Enter') start(); }}>
      <span className={cn('min-w-0', field.type === 'number' || field.type === 'currency' ? 'truncate' : 'line-clamp-6 break-words whitespace-pre-line')}>{shown}</span>
      {href && (
        <a href={href} target={field.type === 'link' ? '_blank' : undefined} rel="noreferrer noopener" onClick={(e) => e.stopPropagation()} className="ml-auto text-muted-foreground hover:text-primary" aria-label="Open">
          <ExternalLink className="h-3 w-3" />
        </a>
      )}
    </div>
  );
}

function LongTextCell({ value, max, onCommit }: { value: unknown; max?: number; onCommit: (v: unknown) => void }) {
  const [draft, setDraft] = useState('');
  const s = typeof value === 'string' ? value : '';
  return (
    <Popover onOpenChange={(o) => { if (o) setDraft(s); else onCommit(draft.trim() ? draft : null); }}>
      <PopoverTrigger asChild>
        <button type="button" className={box}><span className="min-w-0 line-clamp-6 break-words whitespace-pre-line">{s || empty}</span></button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-2">
        <Textarea autoFocus rows={6} maxLength={max} value={draft} onChange={(e) => setDraft(e.target.value)} className="text-xs" />
        <p className="text-3xs text-muted-foreground mt-1">Saved when you click away.</p>
      </PopoverContent>
    </Popover>
  );
}

function DateCell({ value, onCommit }: { value: unknown; onCommit: (v: unknown) => void }) {
  const [open, setOpen] = useState(false);
  const s = typeof value === 'string' ? value : '';
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className={box}>{s ? format(parseISO(s), 'd MMM yyyy') : empty}</button>
      </PopoverTrigger>
      <PopoverContent align="start" className="p-0 w-auto">
        <Calendar mode="single" selected={s ? parseISO(s) : undefined} onSelect={(d) => { onCommit(d ? format(d, 'yyyy-MM-dd') : null); setOpen(false); }} initialFocus />
        {s && (
          <button type="button" className="w-full border-t border-border py-2 text-xs text-muted-foreground hover:text-foreground" onClick={() => { onCommit(null); setOpen(false); }}>
            Clear date
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}

function SelectCell({ field, value, onCommit }: { field: TableField; value: unknown; onCommit: (v: unknown) => void }) {
  const multi = field.type === 'multi_select';
  const picked = asList(value);
  const toggle = (o: string) => {
    if (!multi) { onCommit(picked[0] === o ? null : o); return; }
    const next = picked.includes(o) ? picked.filter((x) => x !== o) : [...picked, o];
    onCommit(next.length ? next : null);
  };
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className={cn(box, 'flex-wrap')}>
          {picked.length ? picked.map((o) => <span key={o} className={cn('rounded px-1.5 py-0.5 text-2xs font-medium', optionChip(field, o))}>{o}</span>) : empty}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-1">
        {(field.config.options ?? []).length === 0 && <p className="text-xs text-muted-foreground p-2">No options yet. An admin can add them by editing the field.</p>}
        {(field.config.options ?? []).map((o) => (
          <button key={o} type="button" onClick={() => toggle(o)} className="w-full flex items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-muted">
            <span className={cn('rounded px-1.5 py-0.5 text-2xs font-medium', optionChip(field, o))}>{o}</span>
            {picked.includes(o) && <Check className="h-3.5 w-3.5 ml-auto" />}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

function PersonCell({ field, value, ctx, onCommit }: { field: TableField; value: unknown; ctx: CellCtx; onCommit: (v: unknown) => void }) {
  const [open, setOpen] = useState(false);
  const ids = asList(value);
  const pick = (id: string) => {
    if (!field.config.multiple) { onCommit(ids[0] === id ? null : id); setOpen(false); return; }
    const next = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
    onCommit(next.length ? next : null);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className={cn(box, 'flex-wrap')}>
          {ids.length ? ids.map((id) => {
            const p = ctx.peopleById.get(id);
            return <span key={id} className="inline-flex items-center gap-1 min-w-0"><PersonAvatar person={p ?? { full_name: '?', photo_url: null }} size={18} /><span className="truncate">{p?.full_name ?? 'Former member'}</span></span>;
          }) : empty}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="p-0 w-64">
        <Command>
          <CommandInput placeholder="Search people…" />
          <CommandList>
            <CommandEmpty>No one found.</CommandEmpty>
            <CommandGroup>
              {ids.length > 0 && !field.config.multiple && (
                <CommandItem onSelect={() => { onCommit(null); setOpen(false); }}><X className="h-3.5 w-3.5 mr-2" /> Clear</CommandItem>
              )}
              {ctx.people.map((p) => (
                <CommandItem key={p.id} value={`${p.full_name} ${p.email}`} onSelect={() => pick(p.id)}>
                  <PersonAvatar person={p} size={18} /><span className="ml-2 truncate">{p.full_name}</span>
                  {ids.includes(p.id) && <Check className="h-3.5 w-3.5 ml-auto" />}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function TaskCell({ field, value, record, ctx, onCommit }: { field: TableField; value: unknown; record: TableRecordRow; ctx: CellCtx; onCommit: (v: unknown) => void }) {
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const ids = asList(value);
  // Like the form: once the row names a person, offer that person's tasks.
  const rowPeople = ctx.personFieldId ? asList(record.data[ctx.personFieldId]) : [];
  const narrowed = rowPeople.length > 0 && !showAll;
  const options = useMemo(
    () => (narrowed ? ctx.openTasks.filter((t) => t.assignee_id && rowPeople.includes(t.assignee_id)) : ctx.openTasks),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ctx.openTasks, narrowed, rowPeople.join(',')],
  );
  const pick = (id: string) => {
    if (!field.config.multiple) { onCommit(ids[0] === id ? null : id); setOpen(false); return; }
    const next = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
    onCommit(next.length ? next : null);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className={cn(box, 'pr-1 overflow-hidden')}>
        {ids.map((id) => (
          <button key={id} type="button" onClick={() => ctx.onOpenTask(id)} className="inline-flex min-w-0 shrink items-center rounded bg-primary/10 text-primary px-1.5 py-0.5 text-2xs font-medium hover:underline" title={ctx.taskTitle(id)}>
            <span className="truncate">{ctx.taskTitle(id)}</span>
          </button>
        ))}
        <PopoverTrigger asChild>
          <button type="button" className={cn('shrink-0 text-muted-foreground hover:text-foreground', ids.length ? 'ml-auto' : 'w-full text-left')} aria-label={`Link a task in ${field.name}`}>
            {ids.length ? <Plus className="h-3.5 w-3.5" /> : empty}
          </button>
        </PopoverTrigger>
      </div>
      <PopoverContent align="start" className="p-0 w-80">
        <Command>
          <CommandInput placeholder="Search open tasks…" />
          {rowPeople.length > 0 && (
            <button type="button" onClick={() => setShowAll((v) => !v)} className="w-full text-left px-3 py-1.5 text-2xs text-muted-foreground hover:text-foreground border-b border-border">
              {narrowed ? `Showing ${rowPeople.map((id) => ctx.peopleById.get(id)?.full_name ?? 'this person').join(', ')}'s tasks · show all open tasks` : 'Showing all open tasks · only this row’s person'}
            </button>
          )}
          <CommandList>
            <CommandEmpty>No open tasks found.</CommandEmpty>
            <CommandGroup>
              {ids.length > 0 && !field.config.multiple && (
                <CommandItem onSelect={() => { onCommit(null); setOpen(false); }}><X className="h-3.5 w-3.5 mr-2" /> Clear</CommandItem>
              )}
              {options.slice(0, 300).map((t) => (
                <CommandItem key={t.id} value={`${t.title} ${t.id}`} onSelect={() => pick(t.id)}>
                  <span className="truncate">{t.title}</span>
                  <span className="ml-2 text-3xs text-muted-foreground shrink-0">{ctx.listName(t.list_id)}</span>
                  {ids.includes(t.id) && <Check className="h-3.5 w-3.5 ml-auto shrink-0" />}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function RatingCell({ value, max, onCommit }: { value: unknown; max: number; onCommit: (v: unknown) => void }) {
  const n = typeof value === 'number' ? value : 0;
  return (
    <div className={cn(box, 'gap-0.5 hover:bg-transparent')}>
      {Array.from({ length: max }, (_, i) => i + 1).map((i) => (
        <button key={i} type="button" aria-label={`${i} of ${max}`} onClick={() => onCommit(i === n ? null : i)} className="p-0.5">
          <Star className={cn('h-3.5 w-3.5', i <= n ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/40')} />
        </button>
      ))}
    </div>
  );
}

function AttachmentCell({ value, record, ctx, onCommit }: { value: unknown; record: TableRecordRow; ctx: CellCtx; onCommit: (v: unknown) => void }) {
  const { toast } = useToast();
  const { profile } = useAuthStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const files = Array.isArray(value) ? (value as AttachmentValue[]) : [];

  const upload = async (list: FileList | null) => {
    if (!list?.length || !profile?.id) return;
    const added: AttachmentValue[] = [];
    setBusy(true);
    try {
      for (const file of Array.from(list)) {
        if (file.size > ATTACHMENT_MAX_BYTES) { toast({ title: `${file.name} is over 25 MB`, variant: 'destructive' }); continue; }
        const safe = file.name.replace(/[^\w.-]+/g, '_');
        const path = `${profile.id}/table/${ctx.tableId}/${record.id}/${crypto.randomUUID()}-${safe}`;
        const { error } = await supabase.storage.from(ATTACHMENT_BUCKET).upload(path, file, { contentType: file.type || undefined });
        if (error) { toast({ title: `Could not upload ${file.name}`, description: error.message, variant: 'destructive' }); continue; }
        added.push({ path, name: file.name, size: file.size, type: file.type || undefined });
      }
      if (added.length) onCommit([...files, ...added]);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const openFile = async (a: AttachmentValue) => {
    try { window.open(await attachmentUrl(a.path), '_blank', 'noopener'); } catch (e) { toast({ title: 'Could not open the file', description: errorMessage(e), variant: 'destructive' }); }
  };
  const remove = async (a: AttachmentValue) => {
    const next = files.filter((f) => f.path !== a.path);
    onCommit(next.length ? next : null);
    await supabase.storage.from(ATTACHMENT_BUCKET).remove([a.path]);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className={box}>
          {files.length ? <><Paperclip className="h-3 w-3 text-muted-foreground" /> {files.length === 1 ? files[0].name : `${files.length} files`}</> : empty}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-2 space-y-1">
        {files.map((a) => (
          <div key={a.path} className="flex items-center gap-2 text-xs">
            <button type="button" onClick={() => openFile(a)} className="truncate text-left hover:underline flex-1">{a.name}</button>
            <span className="text-3xs text-muted-foreground shrink-0">{(a.size / 1024 / 1024).toFixed(1)} MB</span>
            <button type="button" aria-label={`Remove ${a.name}`} onClick={() => remove(a)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3 w-3" /></button>
          </div>
        ))}
        <input ref={inputRef} type="file" multiple className="hidden" onChange={(e) => upload(e.target.files)} />
        <button type="button" disabled={busy} onClick={() => inputRef.current?.click()} className="w-full flex items-center justify-center gap-1.5 rounded border border-dashed border-border py-2 text-xs text-muted-foreground hover:text-foreground">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Add files (up to 25 MB each)
        </button>
      </PopoverContent>
    </Popover>
  );
}

/** Small icon + name used in column headers and pickers. */
export function FieldLabel({ field, className }: { field: TableField; className?: string }) {
  const Icon = FIELD_TYPES[field.type].icon;
  return (
    <span className={cn('inline-flex items-center gap-1.5 min-w-0', className)}>
      <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span className="truncate">{field.name}</span>
      {field.config.required && <span className="text-destructive" aria-label="required">*</span>}
    </span>
  );
}
