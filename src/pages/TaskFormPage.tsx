import { useEffect, useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { useNavigate, useParams } from 'react-router-dom';
import { Check, CheckCircle2, Loader2, Lock, Star, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { rememberReturnTo } from '@/lib/returnTo';
import { cn } from '@/lib/utils';
import { usePageTitle } from '@/hooks/usePageTitle';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { FormLogic, TableFieldConfig, TableFieldType } from '@/queries/useTaskModule';
import { DEFAULT_CURRENCY } from '@/features/task-module/table/fieldTypes';
import { computeVisible } from '@/features/task-module/table/formLogic';

// A table's form, opened from its shared link (/tf/<token>). Works signed
// out for "anyone with the link" forms. All checks also run on the server
// (tm_form_submit); the ones here are just to help people fill it in.

interface FormField { id: string; name: string; type: TableFieldType; config: TableFieldConfig }
interface LoadedForm {
  title: string;
  description: string | null;
  success_message: string | null;
  fields: FormField[];
  /** Show/hide rules by question id. */
  logic?: FormLogic;
  people: { id: string; name: string }[];
}
interface TaskOpt { id: string; title: string; due_date?: string | null }

type Answers = Record<string, unknown>;

const taskLabel = (t: TaskOpt) => (t.due_date ? `${t.title} · due ${format(parseISO(t.due_date), 'd MMM')}` : t.title);
const asIds = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : typeof v === 'string' && v ? [v] : []);
const isBlank = (v: unknown) => v == null || v === '' || (Array.isArray(v) && v.length === 0);

function problemText(err: { message?: string; hint?: string } | null): string {
  if (!err) return 'Something went wrong. Please try again.';
  return err.hint || 'Something went wrong. Please try again.';
}

export default function TaskFormPage() {
  const { token = '' } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [form, setForm] = useState<LoadedForm | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'login' | 'closed' | 'missing' | 'error' | 'sent'>('loading');
  const [problem, setProblem] = useState('');
  const [answers, setAnswers] = useState<Answers>({});
  // Tasks offered by each Task question (they follow the People question).
  const [taskLists, setTaskLists] = useState<Record<string, TaskOpt[]>>({});
  const [tasksLoading, setTasksLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [missing, setMissing] = useState<string[]>([]);
  usePageTitle(form?.title ?? 'Form');

  useEffect(() => {
    let live = true;
    supabase.rpc('tm_form_load', { p_token: token }).then(({ data, error }) => {
      if (!live) return;
      if (error) {
        const code = error.message;
        setProblem(problemText(error));
        setState(code.includes('form_login_required') ? 'login' : code.includes('form_closed') ? 'closed' : code.includes('form_not_found') ? 'missing' : 'error');
        return;
      }
      const f = data as unknown as LoadedForm;
      setForm(f);
      setState('ready');
    });
    return () => { live = false; };
  }, [token]);

  // Which questions are shown, top to bottom — the same rules the server applies.
  const orderedIds = useMemo(() => (form?.fields ?? []).map((f) => f.id), [form]);
  const { shown, effective } = useMemo(
    () => computeVisible(orderedIds, form?.logic ?? {}, answers),
    [orderedIds, form?.logic, answers],
  );
  const visibleFields = (form?.fields ?? []).filter((f) => shown.has(f.id));

  const personField = visibleFields.find((f) => f.type === 'person');
  const taskFieldIds = visibleFields.filter((f) => f.type === 'task').map((f) => f.id).join(',');
  const chosenPerson = personField
    ? (Array.isArray(effective[personField.id]) ? (effective[personField.id] as string[])[0] : (effective[personField.id] as string | undefined))
    : undefined;

  // The Task questions follow the People question: when the person changes,
  // earlier task answers are cleared and each question's list is fetched again
  // (each question has its own status / due-date rule).
  useEffect(() => {
    const ids = taskFieldIds ? taskFieldIds.split(',') : [];
    if (!ids.length) return;
    setAnswers((a) => {
      const next = { ...a };
      ids.forEach((id) => { delete next[id]; });
      return next;
    });
    if (personField && !chosenPerson) { setTaskLists({}); return; }
    let live = true;
    setTasksLoading(true);
    Promise.all(ids.map((id) =>
      supabase.rpc('tm_form_field_tasks', { p_token: token, p_field: id, p_person: chosenPerson ?? undefined })
        .then(({ data, error }) => [id, error ? [] : ((data as unknown as TaskOpt[]) ?? [])] as const),
    )).then((pairs) => {
      if (!live) return;
      setTasksLoading(false);
      setTaskLists(Object.fromEntries(pairs));
    });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chosenPerson, token, taskFieldIds, !!personField]);

  const set = (id: string, v: unknown) => { setAnswers((a) => ({ ...a, [id]: v })); setMissing((m) => m.filter((x) => x !== id)); setProblem(''); };

  const submit = async () => {
    if (!form) return;
    const need = visibleFields.filter((f) => f.config.required && isBlank(effective[f.id])).map((f) => f.id);
    setMissing(need);
    if (need.length) { setProblem('Please answer the questions marked as required.'); return; }
    const payload: Answers = {};
    for (const f of visibleFields) {
      const v = effective[f.id];
      if (isBlank(v)) continue;
      payload[f.id] = (f.type === 'number' || f.type === 'currency') && typeof v === 'string' ? Number(v) : typeof v === 'string' ? v.trim() : v;
    }
    setSubmitting(true);
    setProblem('');
    const { error } = await supabase.rpc('tm_form_submit', { p_token: token, p_data: payload as never });
    setSubmitting(false);
    if (error) { setProblem(problemText(error)); return; }
    setState('sent');
  };

  const shell = (children: React.ReactNode) => (
    <div className="min-h-screen bg-muted/30 py-8 px-4">
      <div className="mx-auto max-w-xl rounded-xl border border-border/70 bg-card p-5 sm:p-6 shadow-sm">{children}</div>
      <p className="text-center text-3xs text-muted-foreground mt-4">KD Ops</p>
    </div>
  );

  if (state === 'loading') return shell(<div className="py-16 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>);
  if (state === 'login') {
    return shell(
      <div className="text-center space-y-3 py-6">
        <Lock className="h-6 w-6 mx-auto text-muted-foreground" />
        <p className="text-sm">{problem}</p>
        <Button onClick={() => { rememberReturnTo(`/tf/${token}`); navigate('/login'); }}>Sign in</Button>
      </div>,
    );
  }
  if (state !== 'ready' && state !== 'sent') return shell(<p className="text-sm text-center py-10 text-muted-foreground">{problem}</p>);
  if (!form) return null;
  if (state === 'sent') {
    return shell(
      <div className="text-center space-y-3 py-8">
        <CheckCircle2 className="h-8 w-8 mx-auto text-emerald-500" />
        <p className="text-sm">{form.success_message || 'Thanks — your response has been recorded.'}</p>
        <Button variant="outline" size="sm" onClick={() => { setAnswers({}); setState('ready'); }}>Submit another response</Button>
      </div>,
    );
  }

  return shell(
    <form onSubmit={(e) => { e.preventDefault(); void submit(); }} className="space-y-5" noValidate>
      <div>
        <h1 className="text-xl font-bold tracking-tight">{form.title}</h1>
        {form.description && <p className="text-sm text-muted-foreground mt-1 whitespace-pre-line">{form.description}</p>}
      </div>
      {visibleFields.map((f) => (
        <div key={f.id} className="space-y-1.5" data-question={f.name}>
          <label htmlFor={`q-${f.id}`} className="text-sm font-medium">
            {f.name}{f.config.required && <span className="text-destructive"> *</span>}
          </label>
          <Question
            field={f}
            value={answers[f.id]}
            onChange={(v) => set(f.id, v)}
            people={form.people}
            tasks={f.type === 'task' ? taskLists[f.id] ?? [] : null}
            tasksLoading={tasksLoading}
            needsPerson={f.type === 'task' && !!personField && !chosenPerson}
            personLabel={personField?.name}
          />
          {missing.includes(f.id) && <p className="text-2xs text-destructive">This question is required.</p>}
        </div>
      ))}
      {problem && <p className="text-sm text-destructive" role="alert">{problem}</p>}
      <Button type="submit" disabled={submitting} className="w-full sm:w-auto">
        {submitting && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />} Submit
      </Button>
    </form>,
  );
}

function Question({ field, value, onChange, people, tasks, tasksLoading, needsPerson, personLabel }: {
  field: FormField;
  value: unknown;
  onChange: (v: unknown) => void;
  people: { id: string; name: string }[];
  tasks: TaskOpt[] | null;
  tasksLoading: boolean;
  needsPerson: boolean;
  personLabel?: string;
}) {
  const id = `q-${field.id}`;
  const str = typeof value === 'string' ? value : value == null ? '' : String(value);
  const max = field.config.max_length;
  switch (field.type) {
    case 'long_text':
      return <Textarea id={id} rows={4} maxLength={max} value={str} onChange={(e) => onChange(e.target.value)} />;
    case 'number':
    case 'currency':
      return (
        <div className="relative">
          {field.type === 'currency' && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{field.config.currency ?? DEFAULT_CURRENCY}</span>}
          <Input id={id} type="number" inputMode="decimal" step="any" value={str} onChange={(e) => onChange(e.target.value)} className={cn(field.type === 'currency' && 'pl-8')} />
        </div>
      );
    case 'date':
      return <Input id={id} type="date" value={str} onChange={(e) => onChange(e.target.value || null)} className="w-auto" />;
    case 'checkbox':
      return (
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <Checkbox id={id} checked={value === true} onCheckedChange={(c) => onChange(c ? true : null)} /> Yes
        </label>
      );
    case 'single_select':
      return (
        <div className="flex flex-wrap gap-2" role="radiogroup">
          {(field.config.options ?? []).map((o) => (
            <button key={o} type="button" role="radio" aria-checked={value === o} onClick={() => onChange(value === o ? null : o)}
              className={cn('rounded-full border px-3 py-1 text-sm', value === o ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-muted')}>
              {o}
            </button>
          ))}
        </div>
      );
    case 'multi_select': {
      const picked = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div className="space-y-1">
          {(field.config.options ?? []).map((o) => (
            <label key={o} className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox checked={picked.includes(o)} onCheckedChange={(c) => onChange(c ? [...picked, o] : picked.filter((x) => x !== o))} /> {o}
            </label>
          ))}
        </div>
      );
    }
    case 'rating': {
      const n = typeof value === 'number' ? value : 0;
      const top = field.config.rating_max ?? 5;
      return (
        <div className="flex gap-1">
          {Array.from({ length: top }, (_, i) => i + 1).map((i) => (
            <button key={i} type="button" aria-label={`${i} of ${top}`} onClick={() => onChange(i === n ? null : i)}>
              <Star className={cn('h-6 w-6', i <= n ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/40')} />
            </button>
          ))}
        </div>
      );
    }
    case 'person':
      if (field.config.multiple) {
        return <MultiPick id={id} placeholder="Choose people" items={people.map((p) => ({ id: p.id, label: p.name }))} value={asIds(value)} onChange={(v) => onChange(v.length ? v : null)} />;
      }
      return <SearchPick id={id} placeholder="Choose a person" items={people.map((p) => ({ id: p.id, label: p.name }))} value={typeof value === 'string' ? value : ''} onChange={(v) => onChange(v || null)} />;
    case 'task':
      if (needsPerson) return <p className="text-sm text-muted-foreground">Choose {personLabel ? `“${personLabel}”` : 'a person'} first — this lists their tasks.</p>;
      if (tasksLoading) return <p className="text-sm text-muted-foreground inline-flex items-center gap-1.5"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading tasks…</p>;
      if (!tasks?.length) return <p className="text-sm text-muted-foreground">No tasks to choose from right now.</p>;
      if (field.config.multiple) {
        return <MultiPick id={id} placeholder="Choose tasks" items={tasks.map((t) => ({ id: t.id, label: taskLabel(t) }))} value={asIds(value)} onChange={(v) => onChange(v.length ? v : null)} />;
      }
      return tasks.length > 8
        ? <SearchPick id={id} placeholder="Choose a task" items={tasks.map((t) => ({ id: t.id, label: taskLabel(t) }))} value={typeof value === 'string' ? value : ''} onChange={(v) => onChange(v || null)} />
        : (
          <Select value={typeof value === 'string' ? value : undefined} onValueChange={(v) => onChange(v)}>
            <SelectTrigger id={id}><SelectValue placeholder="Choose a task" /></SelectTrigger>
            <SelectContent>{tasks.map((t) => <SelectItem key={t.id} value={t.id}>{taskLabel(t)}</SelectItem>)}</SelectContent>
          </Select>
        );
    case 'email':
      return <Input id={id} type="email" maxLength={max} value={str} onChange={(e) => onChange(e.target.value)} />;
    case 'phone':
      return <Input id={id} type="tel" maxLength={max} value={str} onChange={(e) => onChange(e.target.value)} />;
    case 'link':
      return <Input id={id} type="url" maxLength={max} placeholder="https://" value={str} onChange={(e) => onChange(e.target.value)} />;
    default:
      return <Input id={id} maxLength={max} value={str} onChange={(e) => onChange(e.target.value)} />;
  }
}

function SearchPick({ id, items, value, onChange, placeholder }: {
  id: string; items: { id: string; label: string }[]; value: string; onChange: (v: string) => void; placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const label = useMemo(() => items.find((i) => i.id === value)?.label, [items, value]);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button id={id} type="button" className="w-full h-10 rounded-md border border-input bg-background px-3 text-left text-sm flex items-center">
          <span className={cn('truncate', !label && 'text-muted-foreground')}>{label ?? placeholder}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="p-0 w-[var(--radix-popover-trigger-width)]">
        <Command>
          <CommandInput placeholder="Type to search…" />
          <CommandList>
            <CommandEmpty>Nothing found.</CommandEmpty>
            <CommandGroup>
              {items.map((i) => (
                <CommandItem key={i.id} value={`${i.label} ${i.id}`} onSelect={() => { onChange(i.id); setOpen(false); }}>{i.label}</CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// Several people or tasks in one answer: a tick list when short, otherwise a
// searchable list with the picks shown as chips.
function MultiPick({ id, items, value, onChange, placeholder }: {
  id: string; items: { id: string; label: string }[]; value: string[]; onChange: (v: string[]) => void; placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const toggle = (itemId: string) => onChange(value.includes(itemId) ? value.filter((x) => x !== itemId) : [...value, itemId]);
  if (items.length <= 8) {
    return (
      <div id={id} className="space-y-1" role="group">
        {items.map((i) => (
          <label key={i.id} className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox checked={value.includes(i.id)} onCheckedChange={() => toggle(i.id)} /> {i.label}
          </label>
        ))}
      </div>
    );
  }
  const picked = value.map((v) => items.find((i) => i.id === v)).filter((i): i is { id: string; label: string } => !!i);
  return (
    <div className="space-y-1.5">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button id={id} type="button" className="w-full h-10 rounded-md border border-input bg-background px-3 text-left text-sm flex items-center">
            <span className={cn('truncate', !picked.length && 'text-muted-foreground')}>{picked.length ? `${picked.length} chosen — add or remove` : placeholder}</span>
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="p-0 w-[var(--radix-popover-trigger-width)]">
          <Command>
            <CommandInput placeholder="Type to search…" />
            <CommandList>
              <CommandEmpty>Nothing found.</CommandEmpty>
              <CommandGroup>
                {items.map((i) => (
                  <CommandItem key={i.id} value={`${i.label} ${i.id}`} onSelect={() => toggle(i.id)}>
                    <Check className={cn('h-4 w-4 mr-2 shrink-0', value.includes(i.id) ? 'opacity-100' : 'opacity-0')} />
                    <span className="truncate">{i.label}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {picked.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {picked.map((i) => (
            <span key={i.id} className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs max-w-full">
              <span className="truncate">{i.label}</span>
              <button type="button" aria-label={`Remove ${i.label}`} onClick={() => toggle(i.id)} className="text-muted-foreground hover:text-foreground"><X className="h-3 w-3" /></button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
