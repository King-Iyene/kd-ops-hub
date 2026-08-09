import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Loader2, AlertCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card';
import type { FormField, TaskForm } from '@/components/tasks/TaskFormBuilder';

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface TaskFormPublicProps {
  formId: string;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function TaskFormPublic({ formId }: TaskFormPublicProps) {
  const [form, setForm] = useState<TaskForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  /* ---------- Fetch form ---------- */

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const { data, error: fetchErr } = await supabase
        .from('task_forms')
        .select('*')
        .eq('id', formId)
        .eq('is_active', true)
        .single();

      if (cancelled) return;

      if (fetchErr || !data) {
        setError('This form is not available or has been deactivated.');
        setLoading(false);
        return;
      }
      setForm(data as TaskForm);
      // Initialise values
      const initial: Record<string, string> = {};
      for (const field of (data as TaskForm).fields) {
        initial[field.id] = '';
      }
      setValues(initial);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [formId]);

  /* ---------- Validation ---------- */

  const validate = useCallback((): boolean => {
    if (!form) return false;
    const errs: Record<string, string> = {};
    for (const field of form.fields) {
      const val = (values[field.id] ?? '').trim();
      if (field.required && !val) {
        errs[field.id] = `${field.label} is required`;
      }
      if (field.type === 'email' && val && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
        errs[field.id] = 'Please enter a valid email address';
      }
      if (field.type === 'number' && val && isNaN(Number(val))) {
        errs[field.id] = 'Please enter a valid number';
      }
    }
    setValidationErrors(errs);
    return Object.keys(errs).length === 0;
  }, [form, values]);

  /* ---------- Submit ---------- */

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form || !validate()) return;

    setSubmitting(true);

    // Map field values to task columns
    let title = '';
    let description = '';
    let due_date: string | null = null;
    let priority: string = form.default_priority;
    const tags: string[] = [];
    const unmapped: string[] = [];

    for (const field of form.fields) {
      const val = (values[field.id] ?? '').trim();
      if (!val) continue;

      switch (field.maps_to) {
        case 'title':
          title = val;
          break;
        case 'description':
          description = val;
          break;
        case 'due_date':
          due_date = val;
          break;
        case 'priority':
          priority = val;
          break;
        case 'tags':
          tags.push(...val.split(',').map((t) => t.trim()).filter(Boolean));
          break;
        default:
          unmapped.push(`**${field.label}:** ${val}`);
          break;
      }
    }

    // Append unmapped fields to description
    if (unmapped.length > 0) {
      const extra = unmapped.join('\n');
      description = description ? `${description}\n\n---\n${extra}` : extra;
    }

    // Fallback title
    if (!title) {
      title = `Form submission: ${form.name}`;
    }

    const taskPayload: Record<string, any> = {
      title,
      description: description || null,
      due_date,
      priority,
      status: form.default_status,
      assignee_id: form.default_assignee_id,
      list_id: form.list_id,
      tags: tags.length > 0 ? tags : null,
    };

    const { error: insertErr } = await supabase.from('tasks').insert(taskPayload);

    if (insertErr) {
      setValidationErrors({ __form: `Submission failed: ${insertErr.message}` });
      setSubmitting(false);
      return;
    }

    // Increment submission count
    await supabase.rpc('increment_counter', {
      row_id: form.id,
      table_name: 'task_forms',
      column_name: 'submission_count',
    }).then(({ error: rpcErr }) => {
      // Fallback: direct update if RPC doesn't exist
      if (rpcErr) {
        supabase
          .from('task_forms')
          .update({ submission_count: (form.submission_count ?? 0) + 1 })
          .eq('id', form.id)
          .then(() => {});
      }
    });

    setSubmitting(false);
    setSubmitted(true);
  };

  /* ---------- Render field ---------- */

  const renderField = (field: FormField) => {
    const fieldError = validationErrors[field.id];

    return (
      <div key={field.id} className="space-y-1.5">
        <Label htmlFor={`field-${field.id}`}>
          {field.label}
          {field.required && <span className="text-destructive ml-1">*</span>}
        </Label>

        {field.type === 'textarea' ? (
          <Textarea
            id={`field-${field.id}`}
            value={values[field.id] ?? ''}
            onChange={(e) => setValues((prev) => ({ ...prev, [field.id]: e.target.value }))}
            placeholder={field.placeholder}
            className={cn(fieldError && 'border-destructive')}
            rows={4}
          />
        ) : field.type === 'select' ? (
          <Select
            value={values[field.id] || undefined}
            onValueChange={(v) => setValues((prev) => ({ ...prev, [field.id]: v }))}
          >
            <SelectTrigger
              id={`field-${field.id}`}
              className={cn(fieldError && 'border-destructive')}
            >
              <SelectValue placeholder={field.placeholder || 'Select...'} />
            </SelectTrigger>
            <SelectContent>
              {(field.options ?? []).map((opt) => (
                <SelectItem key={opt} value={opt}>{opt}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Input
            id={`field-${field.id}`}
            type={field.type}
            value={values[field.id] ?? ''}
            onChange={(e) => setValues((prev) => ({ ...prev, [field.id]: e.target.value }))}
            placeholder={field.placeholder}
            className={cn(fieldError && 'border-destructive')}
          />
        )}

        {fieldError && (
          <p className="text-xs text-destructive">{fieldError}</p>
        )}
      </div>
    );
  };

  /* ---------- Loading / error states ---------- */

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !form) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center space-y-3">
            <AlertCircle className="h-10 w-10 text-muted-foreground mx-auto" />
            <p className="text-muted-foreground">{error || 'Form not found.'}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  /* ---------- Success state ---------- */

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center space-y-3">
            <CheckCircle2 className="h-10 w-10 text-green-500 mx-auto" />
            <p className="text-lg font-semibold">Submitted!</p>
            <p className="text-muted-foreground">
              {form.submit_message || 'Thank you! Your submission has been received.'}
            </p>
            <Button
              variant="outline"
              onClick={() => {
                setSubmitted(false);
                const initial: Record<string, string> = {};
                for (const field of form.fields) initial[field.id] = '';
                setValues(initial);
                setValidationErrors({});
              }}
            >
              Submit another response
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  /* ---------- Form ---------- */

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>{form.name}</CardTitle>
          {form.description && (
            <CardDescription>{form.description}</CardDescription>
          )}
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {form.fields.map(renderField)}

            {validationErrors.__form && (
              <div className="rounded-md bg-destructive/10 border border-destructive/30 p-3 text-sm text-destructive">
                {validationErrors.__form}
              </div>
            )}

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {submitting ? 'Submitting...' : 'Submit'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
