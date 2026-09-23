import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, Loader2, Table2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { flexApi, conditionMatches, type FlexFieldType, type FlexFormField, type FlexChoice } from '@/lib/flexTables';
import { dispatchFormWebhook } from '@/lib/platform-webhooks';

interface LinkableTaskOption { id: string; title: string; due_date: string | null; parent_id: string | null; parent_title: string | null; }

const TASK_DATE_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];
function formatTaskDueDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const suffix = d >= 11 && d <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][d % 10] || 'th';
  return `${d}${suffix} ${TASK_DATE_MONTHS[m - 1]} '${String(y).slice(-2)}`;
}
const taskOptionLabel = (t: LinkableTaskOption) => (t.due_date ? `${t.title} - ${formatTaskDueDate(t.due_date)}` : t.title);

interface PublicField {
  id: string;
  name: string;
  type: FlexFieldType;
  options: { choices?: FlexChoice[]; people?: { id: string; full_name: string }[] };
}

interface PublicFormPayload {
  form: { id: string; name: string; description: string | null; fields: FlexFormField[] };
  table: { id: string; name: string };
  fields: PublicField[];
}

export default function FlexFormPublic() {
  const { token } = useParams<{ token: string }>();
  const [payload, setPayload] = useState<PublicFormPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Task-link fields with zero available tasks (nothing assigned/completed
  // for the selected person) can't be filled in no matter what — required
  // or not, they submit as empty and count as nothing.
  const [linkFieldsEmpty, setLinkFieldsEmpty] = useState<Record<string, boolean>>({});
  const [taskOptionsCache, setTaskOptionsCache] = useState<Record<string, LinkableTaskOption[]>>({});

  useEffect(() => {
    if (!token) return;
    (async () => {
      setLoading(true);
      const { data, error: rpcError } = await flexApi.getPublicForm(token);
      if (rpcError || !data) {
        setNotFound(true);
      } else {
        setPayload(data as PublicFormPayload);
      }
      setLoading(false);
    })();
  }, [token]);

  const fieldsById = useMemo(() => new Map((payload?.fields || []).map((f) => [f.id, f])), [payload]);

  const visibleEntries = useMemo(() => {
    if (!payload) return [];
    return payload.form.fields.filter((entry) => conditionMatches(entry.condition, values));
  }, [payload, values]);

  // If a Linked Tasks field wasn't explicitly configured with a person
  // field to filter by, fall back to the first person field present on
  // the form — covers forms saved before that per-field setting existed.
  const defaultPersonFieldId = useMemo(() => {
    if (!payload) return undefined;
    const entry = payload.form.fields.find((e) => fieldsById.get(e.field_id)?.type === 'person');
    return entry?.field_id;
  }, [payload, fieldsById]);

  const setValue = (fieldId: string, v: unknown) => setValues((prev) => ({ ...prev, [fieldId]: v }));

  const submit = async () => {
    if (!token || !payload) return;
    for (const entry of visibleEntries) {
      // A field the form references but that no longer exists on the table
      // (deleted after being added to the form) never renders, so there's
      // nothing the user could fill in — don't block on it.
      if (!fieldsById.get(entry.field_id)) continue;
      if (entry.required && !linkFieldsEmpty[entry.field_id]) {
        const v = values[entry.field_id];
        const empty = v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
        if (empty) {
          setError(`"${fieldsById.get(entry.field_id)?.name}" is required.`);
          return;
        }
      }
    }
    setError(null);
    setSubmitting(true);
    const data: Record<string, unknown> = {};
    for (const entry of visibleEntries) data[entry.field_id] = values[entry.field_id];
    const { data: ok, error: rpcError } = await flexApi.submitPublicForm(token, data);
    setSubmitting(false);
    if (rpcError || !ok) {
      setError('Could not submit the form. Please try again.');
      return;
    }
    const resolvedFields: Record<string, unknown> = {};
    for (const entry of visibleEntries) {
      const field = fieldsById.get(entry.field_id);
      if (!field) continue;
      const raw = data[entry.field_id];
      switch (field.type) {
        case 'person': {
          const p = field.options.people?.find((x) => x.id === raw);
          resolvedFields[field.name] = p?.full_name ?? raw;
          break;
        }
        case 'multi_person': {
          const ids = Array.isArray(raw) ? (raw as string[]) : [];
          resolvedFields[field.name] = ids.map((id) => field.options.people?.find((x) => x.id === id)?.full_name ?? id);
          break;
        }
        case 'select': {
          const c = field.options.choices?.find((x) => x.id === raw);
          resolvedFields[field.name] = c?.label ?? raw;
          break;
        }
        case 'multi_select': {
          const ids = Array.isArray(raw) ? (raw as string[]) : [];
          resolvedFields[field.name] = ids.map((id) => field.options.choices?.find((x) => x.id === id)?.label ?? id);
          break;
        }
        case 'task_link':
        case 'completed_task_link': {
          const ids = Array.isArray(raw) ? (raw as string[]) : [];
          const cached = taskOptionsCache[entry.field_id] || [];
          resolvedFields[field.name] = ids.map((id) => {
            const t = cached.find((x) => x.id === id);
            return t ? taskOptionLabel(t) : id;
          });
          break;
        }
        default:
          resolvedFields[field.name] = raw;
      }
    }
    dispatchFormWebhook('table.form_submitted', token, {
      form_id: payload.form.id,
      form_name: payload.form.name,
      table_id: payload.table.id,
      table_name: payload.table.name,
      fields: resolvedFields,
    });
    setSubmitted(true);
  };

  if (loading) {
    return (
      <div className="min-h-screen p-4 space-y-4">
        <div className="h-8 w-48 bg-muted animate-pulse rounded-lg" />
        <div className="h-12 bg-muted animate-pulse rounded-xl" />
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-10 bg-muted animate-pulse rounded-lg" />)}
        </div>
        <div className="h-10 w-32 bg-muted animate-pulse rounded-lg" />
      </div>
    );
  }

  if (notFound || !payload) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center">
          <Table2 className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
          <p className="text-lg font-semibold">Form not available</p>
          <p className="text-sm text-muted-foreground">This form link is disabled or doesn't exist.</p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <CheckCircle2 className="h-10 w-10 mx-auto mb-3 text-success" />
          <p className="text-lg font-semibold">Thank you!</p>
          <p className="text-sm text-muted-foreground">Your response has been recorded.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/20 py-10 px-4">
      <div className="max-w-lg mx-auto bg-background border border-border rounded-xl shadow-sm p-6">
        <h1 className="text-xl font-semibold mb-1">{payload.form.name}</h1>
        {payload.form.description && <p className="text-sm text-muted-foreground mb-6">{payload.form.description}</p>}

        <div className="space-y-4">
          {visibleEntries.map((entry) => {
            const field = fieldsById.get(entry.field_id);
            if (!field) return null;
            const personFieldId = entry.filterByPersonField || ((field.type === 'task_link' || field.type === 'completed_task_link') ? defaultPersonFieldId : undefined);
            return (
              <div key={field.id}>
                <label className="text-sm font-medium mb-1.5 block">
                  {field.name}{entry.required && <span className="text-destructive"> *</span>}
                </label>
                <FieldInput
                  field={field}
                  value={values[field.id]}
                  onChange={(v) => setValue(field.id, v)}
                  token={token!}
                  hasPersonFilter={!!personFieldId}
                  personId={personFieldId ? (values[personFieldId] as string | undefined) : undefined}
                  onNoOptions={(empty) => setLinkFieldsEmpty((prev) => (prev[field.id] === empty ? prev : { ...prev, [field.id]: empty }))}
                  onTaskOptionsLoaded={(fid, opts) => setTaskOptionsCache((prev) => ({ ...prev, [fid]: opts }))}
                />
              </div>
            );
          })}
        </div>

        {error && <p className="text-xs text-destructive mt-4">{error}</p>}

        <Button className="w-full mt-6" onClick={submit} disabled={submitting}>
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Submit'}
        </Button>
      </div>
    </div>
  );
}

function SearchablePersonPicker({ people, value, onChange }: {
  people: { id: string; full_name: string }[];
  value: string | undefined;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const unique = useMemo(() => {
    const seen = new Set<string>();
    return people.filter((p) => {
      const key = p.full_name.replace(/\s+/g, ' ').trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [people]);

  const filtered = search
    ? unique.filter((p) => p.full_name.toLowerCase().includes(search.toLowerCase()))
    : unique;

  const selected = unique.find((p) => p.id === value);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
      >
        <span className={selected ? '' : 'text-muted-foreground'}>{selected ? selected.full_name : 'Select a name...'}</span>
        <svg width="12" height="12" viewBox="0 0 12 12" className="opacity-50"><path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" fill="none" /></svg>
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md">
          <div className="p-2">
            <input
              type="text"
              placeholder="Search names..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
              autoFocus
            />
          </div>
          <div className="max-h-48 overflow-y-auto px-1 pb-1">
            {filtered.length === 0 && <div className="px-3 py-2 text-sm text-muted-foreground">No results</div>}
            {filtered.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => { onChange(p.id); setOpen(false); setSearch(''); }}
                className={`w-full text-left px-3 py-1.5 text-sm rounded-sm hover:bg-accent hover:text-accent-foreground ${p.id === value ? 'bg-accent/50 font-medium' : ''}`}
              >
                {p.full_name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SearchableMultiPerson({ people, ids, onChange }: {
  people: { id: string; full_name: string }[];
  ids: string[];
  onChange: (ids: string[]) => void;
}) {
  const [search, setSearch] = useState('');
  const unique = useMemo(() => {
    const seen = new Set<string>();
    return people.filter((p) => {
      const key = p.full_name.replace(/\s+/g, ' ').trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [people]);
  const filtered = search
    ? unique.filter((p) => p.full_name.toLowerCase().includes(search.toLowerCase()))
    : unique;
  return (
    <div className="border border-border rounded-md p-2.5">
      <input
        type="text"
        placeholder="Search names..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring mb-2"
      />
      <div className="space-y-1.5 max-h-48 overflow-y-auto">
        {filtered.length === 0 && <div className="text-sm text-muted-foreground px-1">No results</div>}
        {filtered.map((p) => (
          <label key={p.id} className="flex items-center gap-2 cursor-pointer">
            <Checkbox checked={ids.includes(p.id)} onCheckedChange={(v) => onChange(v ? [...ids, p.id] : ids.filter((i) => i !== p.id))} />
            <span className="text-sm">{p.full_name}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function FieldInput({ field, value, onChange, token, personId, hasPersonFilter, onNoOptions, onTaskOptionsLoaded }: {
  field: PublicField;
  value: unknown;
  onChange: (v: unknown) => void;
  token: string;
  personId?: string;
  hasPersonFilter: boolean;
  onNoOptions: (empty: boolean) => void;
  onTaskOptionsLoaded?: (fieldId: string, options: LinkableTaskOption[]) => void;
}) {
  switch (field.type) {
    case 'long_text':
      return <Textarea rows={4} value={(value as string) || ''} onChange={(e) => onChange(e.target.value)} />;
    case 'checkbox':
      return <Checkbox checked={!!value} onCheckedChange={(v) => onChange(!!v)} />;
    case 'number':
      return <Input type="number" value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))} />;
    case 'percent': {
      return (
        <div className="relative">
          <Input
            type="number"
            step="any"
            className="pr-6"
            value={(value as string) ?? ''}
            onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
        </div>
      );
    }
    case 'date':
      return <Input type="date" value={(value as string) || ''} onChange={(e) => onChange(e.target.value)} />;
    case 'url':
      return <Input type="url" value={(value as string) || ''} onChange={(e) => onChange(e.target.value)} />;
    case 'email':
      return <Input type="email" autoComplete="email" value={(value as string) || ''} onChange={(e) => onChange(e.target.value)} />;
    case 'phone':
      return <Input type="tel" autoComplete="tel" value={(value as string) || ''} onChange={(e) => onChange(e.target.value)} />;
    case 'select':
      return (
        <Select value={(value as string) || undefined} onValueChange={onChange}>
          <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
          <SelectContent>
            {(field.options.choices || []).map((c) => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
          </SelectContent>
        </Select>
      );
    case 'multi_select': {
      const ids = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div className="space-y-1.5 border border-border rounded-md p-2.5">
          {(field.options.choices || []).map((c) => (
            <label key={c.id} className="flex items-center gap-2 cursor-pointer">
              <Checkbox checked={ids.includes(c.id)} onCheckedChange={(v) => onChange(v ? [...ids, c.id] : ids.filter((i) => i !== c.id))} />
              <span className="text-sm">{c.label}</span>
            </label>
          ))}
        </div>
      );
    }
    case 'person':
      return (
        <SearchablePersonPicker
          people={field.options.people || []}
          value={(value as string) || undefined}
          onChange={onChange}
        />
      );
    case 'multi_person': {
      const ids = Array.isArray(value) ? (value as string[]) : [];
      return <SearchableMultiPerson people={field.options.people || []} ids={ids} onChange={onChange} />;
    }
    case 'task_link':
      if (!hasPersonFilter) {
        return <NoOptionsNotice onNoOptions={onNoOptions} text="Linked tasks aren't editable from this form." />;
      }
      return <TaskLinkPicker token={token} personId={personId} value={value} onChange={onChange} onNoOptions={onNoOptions} onOptionsLoaded={onTaskOptionsLoaded ? (opts) => onTaskOptionsLoaded(field.id, opts) : undefined} />;
    case 'completed_task_link':
      if (!hasPersonFilter) {
        return <NoOptionsNotice onNoOptions={onNoOptions} text="Completed linked tasks aren't editable from this form." />;
      }
      return <CompletedTaskLinkPicker token={token} personId={personId} value={value} onChange={onChange} onNoOptions={onNoOptions} onOptionsLoaded={onTaskOptionsLoaded ? (opts) => onTaskOptionsLoaded(field.id, opts) : undefined} />;
    default:
      return <Input value={(value as string) || ''} onChange={(e) => onChange(e.target.value)} />;
  }
}

/** Reports fields that can never be filled in (not editable from this
 *  form, or nothing to pick from) as "no options" so a Required check
 *  doesn't block submission on something the user has no way to satisfy —
 *  it just submits as empty. */
function NoOptionsNotice({ onNoOptions, text }: { onNoOptions: (empty: boolean) => void; text: string }) {
  useEffect(() => { onNoOptions(true); }, [onNoOptions]);
  return <p className="text-xs text-muted-foreground italic">{text}</p>;
}

/** Renders a flat task list with subtasks indented directly below their
 *  parent — or, when the parent itself didn't make it into this filtered
 *  list (e.g. it's not yet completed, or not due), grouped under a plain
 *  label naming that parent instead of looking like an unrelated task. */
function LinkedTaskCheckboxList({ options, ids, onToggle }: {
  options: LinkableTaskOption[];
  ids: string[];
  onToggle: (id: string) => void;
}) {
  const rendered = new Set<string>();
  const rows: ReactNode[] = [];

  for (const t of options) {
    if (t.parent_id || rendered.has(t.id)) continue;
    rendered.add(t.id);
    rows.push(
      <label key={t.id} className="flex items-center gap-2 cursor-pointer">
        <Checkbox checked={ids.includes(t.id)} onCheckedChange={() => onToggle(t.id)} />
        <span className="text-sm">{taskOptionLabel(t)}</span>
      </label>,
    );
    for (const c of options) {
      if (c.parent_id === t.id && !rendered.has(c.id)) {
        rendered.add(c.id);
        rows.push(
          <label key={c.id} className="flex items-center gap-2 cursor-pointer ml-5">
            <Checkbox checked={ids.includes(c.id)} onCheckedChange={() => onToggle(c.id)} />
            <span className="text-sm">{taskOptionLabel(c)}</span>
          </label>,
        );
      }
    }
  }

  const groups = new Map<string, LinkableTaskOption[]>();
  for (const t of options) {
    if (!t.parent_id || rendered.has(t.id)) continue;
    if (!groups.has(t.parent_id)) groups.set(t.parent_id, []);
    groups.get(t.parent_id)!.push(t);
  }
  for (const [parentId, children] of groups) {
    rows.push(
      <p key={`h-${parentId}`} className="text-[11px] font-medium text-muted-foreground/70 pt-1 truncate">
        Under: {children[0].parent_title || 'Other subtasks'}
      </p>,
    );
    for (const c of children) {
      rendered.add(c.id);
      rows.push(
        <label key={c.id} className="flex items-center gap-2 cursor-pointer ml-5">
          <Checkbox checked={ids.includes(c.id)} onCheckedChange={() => onToggle(c.id)} />
          <span className="text-sm">{taskOptionLabel(c)}</span>
        </label>,
      );
    }
  }

  return <>{rows}</>;
}

function TaskLinkPicker({ token, personId, value, onChange, onNoOptions, onOptionsLoaded }: {
  token: string;
  personId?: string;
  value: unknown;
  onChange: (v: unknown) => void;
  onNoOptions: (empty: boolean) => void;
  onOptionsLoaded?: (options: LinkableTaskOption[]) => void;
}) {
  const [options, setOptions] = useState<LinkableTaskOption[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!personId) { setOptions([]); onNoOptions(false); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await flexApi.getFormTasks(token, personId);
      if (!cancelled) {
        const list = (data as LinkableTaskOption[]) || [];
        setOptions(list);
        setLoading(false);
        onNoOptions(list.length === 0);
        onOptionsLoaded?.(list);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, personId]);

  if (!personId) return <p className="text-xs text-muted-foreground italic">Select your name in the dropdown above to see your tasks due today or later.</p>;
  if (loading) return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
  if (options.length === 0) return <p className="text-xs text-muted-foreground italic">No tasks due today or later for you — you can still submit; this will count as none.</p>;

  const ids = Array.isArray(value) ? (value as string[]) : [];
  return (
    <div className="space-y-1.5 border border-border rounded-md p-2.5 max-h-48 overflow-y-auto">
      <LinkedTaskCheckboxList
        options={options}
        ids={ids}
        onToggle={(id) => onChange(ids.includes(id) ? ids.filter((i) => i !== id) : [...ids, id])}
      />
    </div>
  );
}

function CompletedTaskLinkPicker({ token, personId, value, onChange, onNoOptions, onOptionsLoaded }: {
  token: string;
  personId?: string;
  value: unknown;
  onChange: (v: unknown) => void;
  onNoOptions: (empty: boolean) => void;
  onOptionsLoaded?: (options: LinkableTaskOption[]) => void;
}) {
  const [options, setOptions] = useState<LinkableTaskOption[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!personId) { setOptions([]); onNoOptions(false); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await flexApi.getFormCompletedTasks(token, personId);
      if (!cancelled) {
        const list = (data as LinkableTaskOption[]) || [];
        setOptions(list);
        setLoading(false);
        onNoOptions(list.length === 0);
        onOptionsLoaded?.(list);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, personId]);

  if (!personId) return <p className="text-xs text-muted-foreground italic">Select your name in the dropdown above to see your tasks completed today or yesterday.</p>;
  if (loading) return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
  if (options.length === 0) return <p className="text-xs text-muted-foreground italic">No tasks completed today or yesterday for you — you can still submit; this will count as none.</p>;

  const ids = Array.isArray(value) ? (value as string[]) : [];
  return (
    <div className="space-y-1.5 border border-border rounded-md p-2.5 max-h-48 overflow-y-auto">
      <LinkedTaskCheckboxList
        options={options}
        ids={ids}
        onToggle={(id) => onChange(ids.includes(id) ? ids.filter((i) => i !== id) : [...ids, id])}
      />
    </div>
  );
}
