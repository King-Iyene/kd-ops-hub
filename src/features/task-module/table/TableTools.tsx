import { useMemo, useState } from 'react';
import Papa from 'papaparse';
import { ChevronDown, Columns3, Filter as FilterIcon, Loader2, Plus, Upload, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuthStore } from '@/store/authStore';
import { errorMessage } from '@/lib/db-errors';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  useInsertTableRecords, useTaskFolders, useTaskLists, useSetRecordCell,
  type PersonOption, type TableField, type TableRecordRow, type TaskOption,
} from '@/queries/useTaskModule';
import { queryKeys } from '@/queries/keys';
import { useQueryClient } from '@tanstack/react-query';
import { FIELD_TYPES, asList, displayText, optionChip, parseImported, type NameLookups } from './fieldTypes';
import { OP_LABELS, isRowFilterActive, opsFor, type RowFilter } from './tableQuery';
import { FieldLabel } from './cells';

const toolBtn = 'h-8 text-xs gap-1.5';

// ── Filter ──────────────────────────────────────────────────────────────

let seq = 0;

export function TableFilterButton({
  fields, filters, onChange, people, openTasks, taskTitle,
}: {
  fields: TableField[];
  filters: RowFilter[];
  onChange: (f: RowFilter[]) => void;
  people: PersonOption[];
  openTasks: TaskOption[];
  taskTitle: (id: string) => string;
}) {
  const active = filters.filter(isRowFilterActive).length;
  const update = (id: string, patch: Partial<RowFilter>) => onChange(filters.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  const optionsFor = (field: TableField): { value: string; label: string; chip?: string }[] => {
    if (field.type === 'single_select' || field.type === 'multi_select') return (field.config.options ?? []).map((o) => ({ value: o, label: o, chip: optionChip(field, o) }));
    if (field.type === 'person' || field.type === 'created_by') return people.map((p) => ({ value: p.id, label: p.full_name }));
    if (field.type === 'task') return openTasks.slice(0, 200).map((t) => ({ value: t.id, label: taskTitle(t.id) }));
    return [];
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="sm" variant={active ? 'default' : 'outline'} className={toolBtn}>
          <FilterIcon className="h-3.5 w-3.5" /> Filter
          {active > 0 && <span className="ml-0.5 rounded-full bg-background/25 px-1.5 text-3xs font-bold tabular-nums">{active}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[360px] p-2 space-y-2 max-h-[75vh] overflow-y-auto">
        {filters.length === 0 && <p className="text-xs text-muted-foreground px-1 py-2">No filters yet. Add one to narrow the rows shown.</p>}
        {filters.map((f, i) => {
          const field = fields.find((x) => x.id === f.fieldId);
          if (!field) return null;
          const opts = optionsFor(field);
          return (
            <div key={f.id} className="rounded-md border border-border/80 bg-muted/20" data-row-filter={field.name}>
              <div className="flex items-center gap-2 px-2 py-1.5">
                <span className="text-3xs font-bold uppercase tracking-wide text-muted-foreground w-10">{i === 0 ? 'Where' : 'And'}</span>
                <FieldLabel field={field} className="text-xs font-semibold max-w-[120px]" />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button type="button" className="inline-flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground">
                      {OP_LABELS[f.op]} <ChevronDown className="h-3 w-3" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    {opsFor(field.type).map((op) => <DropdownMenuItem key={op} onClick={() => update(f.id, { op })}>{OP_LABELS[op]}</DropdownMenuItem>)}
                  </DropdownMenuContent>
                </DropdownMenu>
                <button type="button" onClick={() => onChange(filters.filter((x) => x.id !== f.id))} aria-label="Remove filter" className="ml-auto text-muted-foreground hover:text-foreground">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              {(f.op === 'contains' || f.op === 'not_contains') && (
                <div className="px-2 pb-2"><Input autoFocus value={f.text} onChange={(e) => update(f.id, { text: e.target.value })} placeholder="Type something…" className="h-7 text-xs" /></div>
              )}
              {(f.op === 'any' || f.op === 'none') && (
                <div className="px-2 pb-2 space-y-0.5 max-h-44 overflow-y-auto">
                  {opts.length === 0 && <p className="text-2xs text-muted-foreground px-1">Nothing to choose from yet.</p>}
                  {opts.map((o) => (
                    <label key={o.value} className="flex items-center gap-2 rounded px-1 py-0.5 text-xs hover:bg-muted/50 cursor-pointer">
                      <Checkbox checked={f.values.includes(o.value)} onCheckedChange={(on) => update(f.id, { values: on ? [...f.values, o.value] : f.values.filter((v) => v !== o.value) })} />
                      <span className={cn('truncate', o.chip && cn('rounded px-1.5 py-0.5 text-2xs font-medium', o.chip))}>{o.label}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        <div className="flex items-center justify-between px-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="inline-flex items-center gap-1.5 text-xs font-medium hover:text-primary" disabled={!fields.length}>
                <Plus className="h-3.5 w-3.5" /> Add filter
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto">
              {fields.map((field) => (
                <DropdownMenuItem key={field.id} onClick={() => onChange([...filters, { id: `rf${++seq}`, fieldId: field.id, op: opsFor(field.type)[0], text: '', values: [] }])}>
                  <FieldLabel field={field} />
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          {filters.length > 0 && <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => onChange([])}>Clear all</button>}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ── Columns (show / hide) ───────────────────────────────────────────────

export function ColumnsButton({ fields, hidden, onChange }: { fields: TableField[]; hidden: string[]; onChange: (h: string[]) => void }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="sm" variant={hidden.length ? 'secondary' : 'outline'} className={toolBtn}>
          <Columns3 className="h-3.5 w-3.5" /> Columns{hidden.length ? ` · ${hidden.length} hidden` : ''}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-2 max-h-[70vh] overflow-y-auto">
        <p className="text-3xs font-bold uppercase tracking-wide text-muted-foreground px-1 pb-1">Shown in this view</p>
        {fields.map((f) => (
          <label key={f.id} className="flex items-center gap-2 rounded px-1 py-1 text-xs hover:bg-muted/50 cursor-pointer">
            <Checkbox checked={!hidden.includes(f.id)} onCheckedChange={(on) => onChange(on ? hidden.filter((x) => x !== f.id) : [...hidden, f.id])} />
            <FieldLabel field={f} />
          </label>
        ))}
        {hidden.length > 0 && <button type="button" onClick={() => onChange([])} className="w-full text-left px-1 pt-1 text-2xs text-muted-foreground hover:text-foreground">Show all</button>}
      </PopoverContent>
    </Popover>
  );
}

// ── Export ──────────────────────────────────────────────────────────────

// ── Import ──────────────────────────────────────────────────────────────

const SKIP = '__skip__';
const MAX_IMPORT = 2000;

export function ImportDialog({
  open, onOpenChange, tableId, fields, people, openTasks,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  tableId: string;
  fields: TableField[];
  people: PersonOption[];
  openTasks: TaskOption[];
}) {
  const { toast } = useToast();
  const { profile } = useAuthStore();
  const insert = useInsertTableRecords(tableId);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [fileName, setFileName] = useState('');
  const [busy, setBusy] = useState(false);
  const importable = fields.filter((f) => !FIELD_TYPES[f.type].computed && f.type !== 'attachment');

  const read = (file: File) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: 'greedy',
      complete: (res) => {
        const hs = (res.meta.fields ?? []).filter(Boolean);
        setHeaders(hs);
        setRows(res.data.slice(0, MAX_IMPORT));
        setFileName(file.name);
        // Match columns to fields by name.
        setMapping(Object.fromEntries(hs.map((h) => [h, importable.find((f) => f.name.trim().toLowerCase() === h.trim().toLowerCase())?.id ?? SKIP])));
      },
      error: (err) => toast({ title: 'Could not read the file', description: err.message, variant: 'destructive' }),
    });
  };

  const lookups = useMemo(() => {
    const byName = new Map<string, string>();
    for (const p of people) { byName.set(p.full_name.toLowerCase(), p.id); if (p.email) byName.set(p.email.toLowerCase(), p.id); }
    const byTitle = new Map(openTasks.map((t) => [t.title.toLowerCase(), t.id]));
    return { personByName: (s: string) => byName.get(s.toLowerCase()), taskByTitle: (s: string) => byTitle.get(s.toLowerCase()) };
  }, [people, openTasks]);

  const mapped = Object.entries(mapping).filter(([, v]) => v !== SKIP);

  const run = async () => {
    if (!profile?.id || !mapped.length) return;
    const built = rows.map((r) => {
      const data: Record<string, unknown> = {};
      for (const [header, fieldId] of mapped) {
        const field = fields.find((f) => f.id === fieldId);
        if (!field) continue;
        const v = parseImported(field, r[header] ?? '', lookups);
        if (v !== undefined) data[fieldId] = v;
      }
      return data;
    }).filter((d) => Object.keys(d).length > 0);
    if (!built.length) { toast({ title: 'Nothing to import', description: 'No cell matched a column.' }); return; }
    setBusy(true);
    try {
      for (let i = 0; i < built.length; i += 500) {
        await insert.mutateAsync({ createdBy: profile.id, rows: built.slice(i, i + 500) });
      }
      toast({ title: `Imported ${built.length} row${built.length === 1 ? '' : 's'}` });
      onOpenChange(false);
    } catch (err) {
      toast({ title: 'Import stopped', description: errorMessage(err), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="md:max-w-lg p-4 gap-3">
        <DialogTitle className="text-sm font-semibold">Import rows from a CSV file</DialogTitle>
        <p className="text-2xs text-muted-foreground">
          The first line must be column names. Columns are matched to fields by name; pick another field or Skip for the rest.
          People are matched by name or email, tasks by title (open tasks only), options by their exact text. Up to {MAX_IMPORT.toLocaleString()} rows.
        </p>
        <label className="flex items-center justify-center gap-2 rounded-md border border-dashed border-border py-4 text-xs text-muted-foreground hover:text-foreground cursor-pointer">
          <Upload className="h-4 w-4" /> {fileName || 'Choose a .csv file'}
          <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && read(e.target.files[0])} />
        </label>
        {headers.length > 0 && (
          <div className="space-y-1.5 max-h-72 overflow-y-auto">
            <p className="text-xs"><span className="font-semibold">{rows.length}</span> rows found.</p>
            {headers.map((h) => (
              <div key={h} className="flex items-center gap-2">
                <span className="text-xs truncate w-40" title={h}>{h}</span>
                <span className="text-muted-foreground text-xs">→</span>
                <Select value={mapping[h] ?? SKIP} onValueChange={(v) => setMapping((m) => ({ ...m, [h]: v }))}>
                  <SelectTrigger className="h-7 text-xs flex-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SKIP}>Skip this column</SelectItem>
                    {importable.map((f) => <SelectItem key={f.id} value={f.id}><FieldLabel field={f} /></SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button size="sm" disabled={!mapped.length || busy} onClick={run}>
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />} Import {rows.length ? `${rows.length} rows` : ''}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Create tasks from rows ──────────────────────────────────────────────

const NONE = '__none__';
const MAX_CREATE = 200;

export function CreateTasksDialog({
  open, onOpenChange, tableId, fields, rows, names,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  tableId: string;
  fields: TableField[];
  /** The rows to turn into tasks (selected rows, or every row shown). */
  rows: TableRecordRow[];
  names: NameLookups;
}) {
  const { toast } = useToast();
  const { profile } = useAuthStore();
  const qc = useQueryClient();
  const setCell = useSetRecordCell(tableId);
  const { data: lists } = useTaskLists();
  const { data: folders } = useTaskFolders();
  const titleFields = fields.filter((f) => !['checkbox', 'attachment', 'rating'].includes(f.type));
  const personFields = fields.filter((f) => f.type === 'person');
  const dateFields = fields.filter((f) => f.type === 'date');
  const taskFields = fields.filter((f) => f.type === 'task');
  const [listId, setListId] = useState('');
  const [titleFrom, setTitleFrom] = useState(titleFields[0]?.id ?? '');
  const [assigneeFrom, setAssigneeFrom] = useState(personFields[0]?.id ?? NONE);
  const [dueFrom, setDueFrom] = useState(dateFields[0]?.id ?? NONE);
  const [linkInto, setLinkInto] = useState(taskFields[0]?.id ?? NONE);
  const [busy, setBusy] = useState(false);
  const todo = rows.slice(0, MAX_CREATE);

  const run = async () => {
    const titleField = fields.find((f) => f.id === titleFrom);
    if (!profile?.id || !listId || !titleField) return;
    setBusy(true);
    let made = 0;
    try {
      for (const r of todo) {
        const title = displayText(titleField, r, names).trim();
        if (!title) continue;
        const assignee = assigneeFrom !== NONE ? asList(r.data[assigneeFrom])[0] ?? null : null;
        const due = dueFrom !== NONE && typeof r.data[dueFrom] === 'string' ? (r.data[dueFrom] as string) : null;
        const { data, error } = await supabase.from('tm_tasks')
          .insert({ list_id: listId, title: title.slice(0, 500), created_by: profile.id, assignee_id: assignee, due_date: due })
          .select('id').single();
        if (error) throw new Error(error.message);
        made += 1;
        if (linkInto !== NONE && data?.id) {
          const field = fields.find((f) => f.id === linkInto);
          const existing = asList(r.data[linkInto]);
          await setCell.mutateAsync({ recordId: r.id, fieldId: linkInto, value: field?.config.multiple ? [...existing, data.id] : data.id });
        }
      }
      toast({ title: `Created ${made} task${made === 1 ? '' : 's'}` });
      onOpenChange(false);
    } catch (err) {
      toast({ title: `Stopped after ${made} task${made === 1 ? '' : 's'}`, description: errorMessage(err), variant: 'destructive' });
    } finally {
      setBusy(false);
      qc.invalidateQueries({ queryKey: queryKeys.taskModule.all });
    }
  };

  const pick = (label: string, value: string, onChange: (v: string) => void, options: TableField[], optional: boolean) => (
    <div className="space-y-1">
      <span className="text-xs font-semibold">{label}</span>
      <Select value={value || undefined} onValueChange={onChange}>
        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Choose…" /></SelectTrigger>
        <SelectContent>
          {optional && <SelectItem value={NONE}>Don’t use</SelectItem>}
          {options.map((f) => <SelectItem key={f.id} value={f.id}><FieldLabel field={f} /></SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="md:max-w-md p-4 gap-3">
        <DialogTitle className="text-sm font-semibold">Create tasks from {todo.length} row{todo.length === 1 ? '' : 's'}</DialogTitle>
        <p className="text-2xs text-muted-foreground">
          One task per row. {rows.length > MAX_CREATE ? `Only the first ${MAX_CREATE} rows are used. ` : ''}Tick rows first to use just those; otherwise every row shown is used.
        </p>
        <div className="space-y-1">
          <span className="text-xs font-semibold">Add the tasks to</span>
          <Select value={listId || undefined} onValueChange={setListId}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Choose a list" /></SelectTrigger>
            <SelectContent>
              {(lists ?? []).map((l) => (
                <SelectItem key={l.id} value={l.id}>{(folders ?? []).find((f) => f.id === l.folder_id)?.name ?? ''} · {l.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {pick('Task name comes from', titleFrom, setTitleFrom, titleFields, false)}
        {personFields.length > 0 && pick('Assignee comes from', assigneeFrom, setAssigneeFrom, personFields, true)}
        {dateFields.length > 0 && pick('Due date comes from', dueFrom, setDueFrom, dateFields, true)}
        {taskFields.length > 0 && pick('Link the new task back into', linkInto, setLinkInto, taskFields, true)}
        <div className="flex justify-end gap-2 pt-1">
          <Button size="sm" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button size="sm" disabled={!listId || !titleFrom || !todo.length || busy} onClick={run}>
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />} Create {todo.length} task{todo.length === 1 ? '' : 's'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
