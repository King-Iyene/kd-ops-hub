import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CheckCircle2, Loader2, Lock, Star } from 'lucide-react';
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
import type { TableFieldConfig, TableFieldType } from '@/queries/useTaskModule';
import { DEFAULT_CURRENCY } from '@/features/task-module/table/fieldTypes';

// A table's form, opened from its shared link (/tf/<token>). Works signed
// out for "anyone with the link" forms. All checks also run on the server
// (tm_form_submit); the ones here are just to help people fill it in.

interface FormField { id: string; name: string; type: TableFieldType; config: TableFieldConfig }
interface LoadedForm {
  title: string;
  description: string | null;
  success_message: string | null;
  fields: FormField[];
  people: { id: string; name: string }[];
  tasks: { id: string; title: string }[] | null;
}

type Answers = Record<string, unknown>;

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
  const [tasks, setTasks] = useState<{ id: string; title: string }[] | null>(null);
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
      setTasks(f.tasks);
      setState('ready');
    });
    return () => { live = false; };
  }, [token]);

  const personField = form?.fields.find((f) => f.type === 'person');
  const taskFields = form?.fields.filter((f) => f.type === 'task') ?? [];
  const chosenPerson = personField ? (Array.isArray(answers[personField.id]) ? (answers[personField.id] as string[])[0] : (answers[personField.id] as string | undefined)) : undefined;

  // The Task question follows the People question: load that person's open tasks.
  useEffect(() => {
    if (!personField || !taskFields.length) return;
    // Clear task answers that belonged to the previous person.
    setAnswers((a) => {
      const next = { ...a };
      taskFields.forEach((f) => { delete next[f.id]; });
      return next;
    });
    if (!chosenPerson) { setTasks([]); return; }
    let live = true;
    setTasksLoading(true);
    supabase.rpc('tm_form_person_tasks', { p_token: token, p_person: chosenPerson }).then(({ data, error }) => {
      if (!live) return;
      setTasksLoading(false);
      setTasks(error ? [] : ((data as unknown as { id: string; title: string }[]) ?? []));
    });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chosenPerson, token, personField?.id]);

  const set = (id: string, v: unknown) => { setAnswers((a) => ({ ...a, [id]: v })); setMissing((m) => m.filter((x) => x !== id)); setProblem(''); };

  const submit = async () => {
    if (!form) return;
    const need = form.fields.filter((f) => f.config.required && isBlank(answers[f.id])).map((f) => f.id);
    setMissing(need);
    if (need.length) { setProblem('Please answer the questions marked as required.'); return; }
    const payload: Answers = {};
    for (const f of form.fields) {
      const v = answers[f.id];
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
      {form.fields.map((f) => (
        <div key={f.id} className="space-y-1.5" data-question={f.name}>
          <label htmlFor={`q-${f.id}`} className="text-sm font-medium">
            {f.name}{f.config.required && <span className="text-destructive"> *</span>}
          </label>
          <Question
            field={f}
            value={answers[f.id]}
            onChange={(v) => set(f.id, v)}
            people={form.people}
            tasks={f.type === 'task' ? tasks : null}
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
  tasks: { id: string; title: string }[] | null;
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
      return <SearchPick id={id} placeholder="Choose a person" items={people.map((p) => ({ id: p.id, label: p.name }))} value={typeof value === 'string' ? value : ''} onChange={(v) => onChange(v || null)} />;
    case 'task':
      if (needsPerson) return <p className="text-sm text-muted-foreground">Choose {personLabel ? `“${personLabel}”` : 'a person'} first — this lists their open tasks.</p>;
      if (tasksLoading) return <p className="text-sm text-muted-foreground inline-flex items-center gap-1.5"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading tasks…</p>;
      if (!tasks?.length) return <p className="text-sm text-muted-foreground">No open tasks to choose from.</p>;
      return tasks.length > 8
        ? <SearchPick id={id} placeholder="Choose a task" items={tasks.map((t) => ({ id: t.id, label: t.title }))} value={typeof value === 'string' ? value : ''} onChange={(v) => onChange(v || null)} />
        : (
          <Select value={typeof value === 'string' ? value : undefined} onValueChange={(v) => onChange(v)}>
            <SelectTrigger id={id}><SelectValue placeholder="Choose a task" /></SelectTrigger>
            <SelectContent>{tasks.map((t) => <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>)}</SelectContent>
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
