import { useEffect, useMemo, useState } from 'react';
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
    setSubmitted(true);
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
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
          <CheckCircle2 className="h-10 w-10 mx-auto mb-3 text-emerald-500" />
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

function FieldInput({ field, value, onChange, token, personId, hasPersonFilter, onNoOptions }: {
  field: PublicField;
  value: unknown;
  onChange: (v: unknown) => void;
  token: string;
  personId?: string;
  hasPersonFilter: boolean;
  onNoOptions: (empty: boolean) => void;
}) {
  switch (field.type) {
    case 'long_text':
      return <Textarea rows={4} value={(value as string) || ''} onChange={(e) => onChange(e.target.value)} />;
    case 'checkbox':
      return <Checkbox checked={!!value} onCheckedChange={(v) => onChange(!!v)} />;
    case 'number':
      return <Input type="number" value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))} />;
    case 'date':
      return <Input type="date" value={(value as string) || ''} onChange={(e) => onChange(e.target.value)} />;
    case 'url':
      return <Input type="url" value={(value as string) || ''} onChange={(e) => onChange(e.target.value)} />;
    case 'email':
      return <Input type="email" value={(value as string) || ''} onChange={(e) => onChange(e.target.value)} />;
    case 'phone':
      return <Input type="tel" value={(value as string) || ''} onChange={(e) => onChange(e.target.value)} />;
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
        <Select value={(value as string) || undefined} onValueChange={onChange}>
          <SelectTrigger><SelectValue placeholder="Select a name..." /></SelectTrigger>
          <SelectContent>
            {(field.options.people || []).map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}
          </SelectContent>
        </Select>
      );
    case 'multi_person': {
      const ids = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div className="space-y-1.5 border border-border rounded-md p-2.5 max-h-48 overflow-y-auto">
          {(field.options.people || []).map((p) => (
            <label key={p.id} className="flex items-center gap-2 cursor-pointer">
              <Checkbox checked={ids.includes(p.id)} onCheckedChange={(v) => onChange(v ? [...ids, p.id] : ids.filter((i) => i !== p.id))} />
              <span className="text-sm">{p.full_name}</span>
            </label>
          ))}
        </div>
      );
    }
    case 'task_link':
      if (!hasPersonFilter) {
        return <NoOptionsNotice onNoOptions={onNoOptions} text="Linked tasks aren't editable from this form." />;
      }
      return <TaskLinkPicker token={token} personId={personId} value={value} onChange={onChange} onNoOptions={onNoOptions} />;
    case 'completed_task_link':
      if (!hasPersonFilter) {
        return <NoOptionsNotice onNoOptions={onNoOptions} text="Completed linked tasks aren't editable from this form." />;
      }
      return <CompletedTaskLinkPicker token={token} personId={personId} value={value} onChange={onChange} onNoOptions={onNoOptions} />;
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

function TaskLinkPicker({ token, personId, value, onChange, onNoOptions }: {
  token: string;
  personId?: string;
  value: unknown;
  onChange: (v: unknown) => void;
  onNoOptions: (empty: boolean) => void;
}) {
  const [options, setOptions] = useState<{ id: string; title: string }[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!personId) { setOptions([]); onNoOptions(false); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await flexApi.getFormTasks(token, personId);
      if (!cancelled) {
        const list = (data as { id: string; title: string }[]) || [];
        setOptions(list);
        setLoading(false);
        onNoOptions(list.length === 0);
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
      {options.map((t) => (
        <label key={t.id} className="flex items-center gap-2 cursor-pointer">
          <Checkbox checked={ids.includes(t.id)} onCheckedChange={(v) => onChange(v ? [...ids, t.id] : ids.filter((i) => i !== t.id))} />
          <span className="text-sm">{t.title}</span>
        </label>
      ))}
    </div>
  );
}

function CompletedTaskLinkPicker({ token, personId, value, onChange, onNoOptions }: {
  token: string;
  personId?: string;
  value: unknown;
  onChange: (v: unknown) => void;
  onNoOptions: (empty: boolean) => void;
}) {
  const [options, setOptions] = useState<{ id: string; title: string }[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!personId) { setOptions([]); onNoOptions(false); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await flexApi.getFormCompletedTasks(token, personId);
      if (!cancelled) {
        const list = (data as { id: string; title: string }[]) || [];
        setOptions(list);
        setLoading(false);
        onNoOptions(list.length === 0);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, personId]);

  if (!personId) return <p className="text-xs text-muted-foreground italic">Select your name in the dropdown above to see your completed tasks from today forward.</p>;
  if (loading) return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
  if (options.length === 0) return <p className="text-xs text-muted-foreground italic">No tasks completed today or later for you — you can still submit; this will count as none.</p>;

  const ids = Array.isArray(value) ? (value as string[]) : [];
  return (
    <div className="space-y-1.5 border border-border rounded-md p-2.5 max-h-48 overflow-y-auto">
      {options.map((t) => (
        <label key={t.id} className="flex items-center gap-2 cursor-pointer">
          <Checkbox checked={ids.includes(t.id)} onCheckedChange={(v) => onChange(v ? [...ids, t.id] : ids.filter((i) => i !== t.id))} />
          <span className="text-sm">{t.title}</span>
        </label>
      ))}
    </div>
  );
}
