import { useState } from 'react';
import { ArrowDown, ArrowUp, Copy, ExternalLink, Globe, Loader2, Lock, Pencil, Plus, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuthStore } from '@/store/authStore';
import { errorMessage } from '@/lib/db-errors';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import {
  useDeleteForm, useSaveForm, useTableForms,
  type FormDraft, type TableField, type TaskForm,
} from '@/queries/useTaskModule';
import { FIELD_TYPES } from './fieldTypes';
import { FieldLabel } from './cells';
import { formLink } from './tableActions';

// Forms built from a table. Everyone can see and copy the links; admins
// create and edit them.
export function FormsDialog({
  open, onOpenChange, tableId, tableName, fields, isAdmin,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  tableId: string;
  tableName: string;
  fields: TableField[];
  isAdmin: boolean;
}) {
  const { toast } = useToast();
  const { data: forms, isLoading } = useTableForms(tableId);
  const del = useDeleteForm(tableId);
  const [editing, setEditing] = useState<TaskForm | 'new' | null>(null);

  const copy = async (token: string) => {
    try { await navigator.clipboard.writeText(formLink(token)); toast({ title: 'Form link copied' }); } catch { toast({ title: 'Could not copy the link', variant: 'destructive' }); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="md:max-w-xl p-4 gap-3 max-h-[90vh] overflow-y-auto">
        {editing ? (
          <FormEditor
            tableId={tableId}
            tableName={tableName}
            fields={fields}
            form={editing === 'new' ? undefined : editing}
            onDone={() => setEditing(null)}
          />
        ) : (
          <>
            <DialogTitle className="text-sm font-semibold">Forms for {tableName}</DialogTitle>
            <p className="text-2xs text-muted-foreground">Each answer to a form adds a row to this table. Send the link to whoever should fill it in.</p>
            {isLoading ? (
              <div className="py-8 flex justify-center"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
            ) : (forms ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground py-6 text-center">{isAdmin ? 'No forms yet.' : 'No forms yet. An admin can create one.'}</p>
            ) : (
              <div className="divide-y divide-border/60 rounded-md border border-border/70">
                {(forms ?? []).map((f) => (
                  <div key={f.id} className="flex items-center gap-2 px-3 py-2" data-form={f.title}>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{f.title}</p>
                      <p className="text-2xs text-muted-foreground flex items-center gap-1.5">
                        {f.access === 'public' ? <><Globe className="h-3 w-3" /> Anyone with the link</> : <><Lock className="h-3 w-3" /> Signed-in members</>}
                        <span>·</span>
                        <span className={f.is_open ? 'text-emerald-600 dark:text-emerald-400' : ''}>{f.is_open ? 'Accepting responses' : 'Closed'}</span>
                        <span>· {f.field_ids.length} question{f.field_ids.length === 1 ? '' : 's'}</span>
                      </p>
                    </div>
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-2xs gap-1" onClick={() => copy(f.token)}><Copy className="h-3 w-3" /> Copy link</Button>
                    <a href={`/tf/${f.token}`} target="_blank" rel="noreferrer" className="h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted" aria-label="Open form"><ExternalLink className="h-3.5 w-3.5" /></a>
                    {isAdmin && (
                      <>
                        <button type="button" className="h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted" aria-label={`Edit ${f.title}`} onClick={() => setEditing(f)}><Pencil className="h-3.5 w-3.5" /></button>
                        <button
                          type="button"
                          className="h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-muted"
                          aria-label={`Delete ${f.title}`}
                          onClick={() => {
                            if (window.confirm(`Delete the form "${f.title}"? Its link stops working. Rows it already added stay in the table.`)) {
                              del.mutate(f.id, { onError: (e) => toast({ title: 'Could not delete the form', description: errorMessage(e), variant: 'destructive' }) });
                            }
                          }}
                        ><Trash2 className="h-3.5 w-3.5" /></button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
            {isAdmin && (
              <div className="flex justify-end">
                <Button size="sm" className="gap-1" onClick={() => setEditing('new')} disabled={!fields.some((f) => FIELD_TYPES[f.type].formable)}>
                  <Plus className="h-3.5 w-3.5" /> New form
                </Button>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function FormEditor({ tableId, tableName, fields, form, onDone }: {
  tableId: string; tableName: string; fields: TableField[]; form?: TaskForm; onDone: () => void;
}) {
  const { toast } = useToast();
  const { profile } = useAuthStore();
  const save = useSaveForm(tableId);
  const formable = fields.filter((f) => FIELD_TYPES[f.type].formable);
  const [draft, setDraft] = useState<FormDraft>(() => form
    ? { title: form.title, description: form.description, field_ids: form.field_ids.filter((id) => formable.some((f) => f.id === id)), access: form.access, is_open: form.is_open, success_message: form.success_message }
    : { title: tableName, description: null, field_ids: formable.map((f) => f.id), access: 'members', is_open: true, success_message: null });
  const set = (patch: Partial<FormDraft>) => setDraft((d) => ({ ...d, ...patch }));

  const asked = draft.field_ids.map((id) => formable.find((f) => f.id === id)).filter((f): f is TableField => !!f);
  const notAsked = formable.filter((f) => !draft.field_ids.includes(f.id));
  const move = (id: string, by: -1 | 1) => {
    const ids = [...draft.field_ids];
    const i = ids.indexOf(id);
    const j = i + by;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    set({ field_ids: ids });
  };
  const hasTask = asked.some((f) => f.type === 'task');
  const hasPerson = asked.some((f) => f.type === 'person');

  const submit = () => {
    if (!profile?.id || !draft.title.trim() || !draft.field_ids.length) return;
    save.mutate(
      { id: form?.id, createdBy: profile.id, draft: { ...draft, title: draft.title.trim(), description: draft.description?.trim() || null, success_message: draft.success_message?.trim() || null } },
      {
        onSuccess: () => { toast({ title: form ? 'Form saved' : 'Form created — copy its link to share it' }); onDone(); },
        onError: (e) => toast({ title: 'Could not save the form', description: errorMessage(e), variant: 'destructive' }),
      },
    );
  };

  const label = 'text-xs font-semibold';
  return (
    <div className="space-y-3">
      <DialogTitle className="text-sm font-semibold">{form ? 'Edit form' : 'New form'}</DialogTitle>
      <div className="space-y-1">
        <label htmlFor="form-title" className={label}>Title</label>
        <Input id="form-title" value={draft.title} maxLength={200} onChange={(e) => set({ title: e.target.value })} />
      </div>
      <div className="space-y-1">
        <label htmlFor="form-desc" className={label}>Description</label>
        <Textarea id="form-desc" rows={2} maxLength={2000} placeholder="Optional — shown under the title" value={draft.description ?? ''} onChange={(e) => set({ description: e.target.value })} />
      </div>

      <div className="space-y-1">
        <span className={label}>Questions</span>
        <p className="text-2xs text-muted-foreground">In the order people see them. Required fields must be answered.</p>
        <div className="rounded-md border border-border/70 divide-y divide-border/50">
          {asked.map((f, i) => (
            <div key={f.id} className="flex items-center gap-2 px-2 py-1.5 text-xs">
              <Checkbox checked onCheckedChange={() => set({ field_ids: draft.field_ids.filter((x) => x !== f.id) })} aria-label={`Don't ask ${f.name}`} />
              <FieldLabel field={f} className="flex-1" />
              <button type="button" disabled={i === 0} onClick={() => move(f.id, -1)} aria-label="Move up" className="text-muted-foreground hover:text-foreground disabled:opacity-30"><ArrowUp className="h-3.5 w-3.5" /></button>
              <button type="button" disabled={i === asked.length - 1} onClick={() => move(f.id, 1)} aria-label="Move down" className="text-muted-foreground hover:text-foreground disabled:opacity-30"><ArrowDown className="h-3.5 w-3.5" /></button>
            </div>
          ))}
          {notAsked.map((f) => (
            <div key={f.id} className="flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground">
              <Checkbox checked={false} onCheckedChange={() => set({ field_ids: [...draft.field_ids, f.id] })} aria-label={`Ask ${f.name}`} />
              <FieldLabel field={f} className="flex-1" />
            </div>
          ))}
        </div>
        {hasTask && hasPerson && <p className="text-2xs text-primary">Picking someone in the People question limits the Task question to that person’s open tasks.</p>}
        {hasTask && !hasPerson && <p className="text-2xs text-amber-600 dark:text-amber-400">Without a People question, the Task question lists every open task.</p>}
      </div>

      <div className="space-y-1.5">
        <span className={label}>Who can answer</span>
        {(['members', 'public'] as const).map((a) => (
          <label key={a} className={cn('flex items-start gap-2 rounded-md border px-2.5 py-2 cursor-pointer', draft.access === a ? 'border-primary/60 bg-primary/5' : 'border-border/70')}>
            <input type="radio" name="access" className="mt-0.5" checked={draft.access === a} onChange={() => set({ access: a })} />
            <span>
              <span className="text-xs font-medium">{a === 'members' ? 'Signed-in members only' : 'Anyone with the link'}</span>
              <span className="block text-2xs text-muted-foreground">
                {a === 'members'
                  ? 'People must sign in to KD Ops first. Their name is recorded as Created by.'
                  : 'No sign-in. Anyone holding the link can see the names in People questions and, once they pick a person, that person’s open task titles.'}
              </span>
            </span>
          </label>
        ))}
      </div>

      <label className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold">Accepting responses</span>
        <Switch checked={draft.is_open} onCheckedChange={(c) => set({ is_open: c })} />
      </label>
      <div className="space-y-1">
        <label htmlFor="form-thanks" className={label}>Message after submitting</label>
        <Input id="form-thanks" maxLength={500} placeholder="Thanks — your response has been recorded." value={draft.success_message ?? ''} onChange={(e) => set({ success_message: e.target.value })} />
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <Button size="sm" variant="ghost" onClick={onDone}>Back</Button>
        <Button size="sm" disabled={!draft.title.trim() || !draft.field_ids.length || save.isPending} onClick={submit}>
          {save.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />} {form ? 'Save form' : 'Create form'}
        </Button>
      </div>
    </div>
  );
}
