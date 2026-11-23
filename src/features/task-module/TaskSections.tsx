import { useRef, useState } from 'react';
import { CheckCircle2, Circle, FileText, ListPlus, Loader2, Paperclip, Plus, Trash2, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuthStore } from '@/store/authStore';
import { errorMessage } from '@/lib/db-errors';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  useSubtasks, useCreateTask, useUpdateTask,
  useListFields, useCreateListField, useDeleteListField, useSetTaskField,
  useChecklists, useChecklistMutations,
  useAttachments, useUploadAttachment, useDeleteAttachment, attachmentUrl, ATTACHMENT_MAX_BYTES,
  STATUS_META,
  type ListField, type ListFieldType, type PersonOption, type TaskRow, type TaskAttachment, type Checklist,
} from '@/queries/useTaskModule';
import { AssigneePicker, PersonAvatar } from './pickers';
import { dueLabel, isOverdue } from './taskDates';
import { useOpenTask } from './useOpenTask';
import { useDeleteConfirm } from './DeleteConfirm';

// `inline` puts the action right beside the label (Fields) instead of at the
// far right (Checklists).
function SectionHeader({ title, action, inline }: { title: string; action?: React.ReactNode; inline?: boolean }) {
  return (
    <div className={cn('flex items-center gap-3 mb-1.5', !inline && 'justify-between')}>
      <h3 className="text-xs font-medium text-muted-foreground">{title}</h3>
      {action}
    </div>
  );
}

const useFail = () => {
  const { toast } = useToast();
  return (title: string) => (err: unknown) => toast({ title, description: errorMessage(err), variant: 'destructive' });
};

// ── Fields (the list's custom fields) ──────────────────────────────────

const FIELD_TYPES: Record<ListFieldType, string> = {
  text: 'Text', long_text: 'Long text', number: 'Number', date: 'Date',
  checkbox: 'Checkbox', single_select: 'Single select', person: 'Person',
};

export function FieldsSection({ task, people }: { task: TaskRow; people: PersonOption[] }) {
  const { profile } = useAuthStore();
  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin';
  const fail = useFail();
  const { data: fields } = useListFields(task.list_id);
  const setField = useSetTaskField();
  const createField = useCreateListField(task.list_id);
  const deleteField = useDeleteListField();
  const { ask: askDelete, dialog: deleteDialog } = useDeleteConfirm();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<ListFieldType>('text');
  const [options, setOptions] = useState('');

  const save = (fieldId: string, value: unknown) =>
    setField.mutate({ taskId: task.id, fieldId, value }, { onError: fail('Could not save field') });

  const submit = () => {
    if (!name.trim()) return;
    createField.mutate(
      { name: name.trim(), type, options: type === 'single_select' ? options.split(',').map((o) => o.trim()).filter(Boolean) : undefined },
      {
        onSuccess: () => { setAdding(false); setName(''); setOptions(''); setType('text'); },
        onError: fail('Could not add field'),
      },
    );
  };

  return (
    <section>
      <SectionHeader
        title="Fields"
        inline
        action={isAdmin && !adding ? (
          <button type="button" onClick={() => setAdding(true)} className="text-2xs font-semibold inline-flex items-center gap-1 text-foreground/90 hover:text-foreground">
            <ListPlus className="h-3.5 w-3.5" /> Add field
          </button>
        ) : undefined}
      />
      {(fields ?? []).length === 0 && !adding && <p className="text-xs text-muted-foreground">This list has no custom fields yet.</p>}
      <div className="space-y-1.5">
        {(fields ?? []).map((f) => (
          <div key={f.id} className="group grid grid-cols-[120px_1fr_auto] items-center gap-2">
            <span className="text-xs text-muted-foreground truncate" title={f.name}>{f.name}</span>
            <FieldEditor field={f} value={task.custom?.[f.id]} people={people} onSave={(v) => save(f.id, v)} />
            {isAdmin ? (
              <button
                type="button"
                aria-label={`Delete field ${f.name}`}
                className="opacity-0 group-hover:opacity-60 hover:!opacity-100 hover:text-destructive"
                onClick={() => askDelete({
                  what: 'field', name: f.name, consequence: 'The field is removed from this list, and the values saved in it on every task are deleted.',
                  onConfirm: () => deleteField.mutate(f.id, { onError: fail('Could not delete field') }),
                })}
              >
                <Trash2 className="h-3 w-3" />
              </button>
            ) : <span />}
          </div>
        ))}
      </div>
      {adding && (
        <div className="flex items-center gap-2 flex-wrap mt-2">
          <Input autoFocus placeholder="Field name" value={name} onChange={(e) => setName(e.target.value)} className="h-8 w-36 text-xs" />
          <Select value={type} onValueChange={(v) => setType(v as ListFieldType)}>
            <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(FIELD_TYPES) as ListFieldType[]).map((t) => <SelectItem key={t} value={t}>{FIELD_TYPES[t]}</SelectItem>)}
            </SelectContent>
          </Select>
          {type === 'single_select' && (
            <Input placeholder="Options, comma separated" value={options} onChange={(e) => setOptions(e.target.value)} className="h-8 w-48 text-xs" />
          )}
          <Button size="sm" className="h-8 text-xs" disabled={!name.trim() || createField.isPending} onClick={submit}>Add</Button>
          <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setAdding(false)}>Cancel</Button>
        </div>
      )}
      {deleteDialog}
    </section>
  );
}

const NONE = '__none__';

function FieldEditor({ field, value, people, onSave }: { field: ListField; value: unknown; people: PersonOption[]; onSave: (v: unknown) => void }) {
  const [draft, setDraft] = useState(value == null ? '' : String(value));
  const base = 'h-7 text-xs';
  switch (field.type) {
    case 'checkbox':
      return <Checkbox checked={!!value} onCheckedChange={(c) => onSave(!!c)} />;
    case 'single_select':
      return (
        <Select value={(value as string) ?? NONE} onValueChange={(v) => onSave(v === NONE ? null : v)}>
          <SelectTrigger className={base}><SelectValue placeholder="—" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>—</SelectItem>
            {(field.config.options ?? []).map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
          </SelectContent>
        </Select>
      );
    case 'person':
      return <AssigneePicker value={(value as string) ?? null} people={people} onChange={(id) => onSave(id)} />;
    case 'date':
      return <Input type="date" className={base} value={(value as string) ?? ''} onChange={(e) => onSave(e.target.value || null)} />;
    case 'number':
      return (
        <Input
          type="number"
          className={base}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => { const next = draft === '' ? null : Number(draft); if (next !== (value ?? null)) onSave(next); }}
        />
      );
    case 'long_text':
      return (
        <Textarea
          className="text-xs min-h-[32px]"
          rows={1}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => { if ((draft || null) !== (value ?? null)) onSave(draft || null); }}
        />
      );
    default:
      return (
        <Input
          className={base}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => { if ((draft || null) !== (value ?? null)) onSave(draft || null); }}
        />
      );
  }
}

// ── Subtasks ───────────────────────────────────────────────────────────

export function SubtasksSection({ task, people }: { task: TaskRow; people: PersonOption[] }) {
  const { profile } = useAuthStore();
  const fail = useFail();
  const { open } = useOpenTask();
  const { data: subtasks } = useSubtasks(task.id);
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const peopleById = new Map(people.map((p) => [p.id, p]));
  const doneCount = (subtasks ?? []).filter((s) => s.status === 'done').length;

  const submit = () => {
    if (!title.trim() || !profile?.id) return;
    createTask.mutate(
      { listId: task.list_id, parentId: task.id, title: title.trim(), createdBy: profile.id },
      { onSuccess: () => setTitle(''), onError: fail('Could not add subtask') },
    );
  };

  return (
    <section>
      <SectionHeader title={`Subtasks${subtasks?.length ? ` ${doneCount}/${subtasks.length}` : ''}`} />
      <div className="space-y-0.5">
        {(subtasks ?? []).map((s) => {
          const done = s.status === 'done';
          return (
            <div key={s.id} className="flex items-center gap-2 rounded px-1 py-1 hover:bg-muted/40">
              <button
                type="button"
                aria-label={done ? 'Mark not done' : 'Mark done'}
                onClick={() => updateTask.mutate({ task: s, patch: { status: done ? 'to_do' : 'done' } }, { onError: fail('Could not update subtask') })}
                className={done ? 'text-emerald-500' : 'text-muted-foreground'}
              >
                {done ? <CheckCircle2 className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
              </button>
              <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', STATUS_META[s.status].dot)} />
              <button type="button" onClick={() => open(s.id)} className={cn('flex-1 min-w-0 text-left text-sm truncate', done && 'line-through text-muted-foreground')}>
                {s.title}
              </button>
              {s.due_date && (
                <span className={cn('text-2xs shrink-0', isOverdue(s) ? 'text-destructive' : 'text-muted-foreground')}>{dueLabel(s.due_date)}</span>
              )}
              {s.assignee_id && <PersonAvatar person={peopleById.get(s.assignee_id)} size={18} />}
            </div>
          );
        })}
      </div>
      {adding ? (
        <div className="flex items-center gap-2 mt-1">
          <Input
            autoFocus
            placeholder="Subtask name"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') { e.stopPropagation(); setAdding(false); } }}
            className="h-8 text-sm"
          />
          <Button size="sm" className="h-8 text-xs" disabled={!title.trim() || createTask.isPending} onClick={submit}>Add</Button>
        </div>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="mt-1 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
          <Plus className="h-3.5 w-3.5" /> Add a subtask
        </button>
      )}
    </section>
  );
}

// ── Checklists ─────────────────────────────────────────────────────────

export function ChecklistsSection({ task }: { task: TaskRow }) {
  const fail = useFail();
  const { data: checklists } = useChecklists(task.id);
  const m = useChecklistMutations();
  return (
    <section>
      <SectionHeader
        title="Checklists"
        action={(
          <button
            type="button"
            onClick={() => m.addChecklist.mutate({ taskId: task.id, name: 'Checklist' }, { onError: fail('Could not add checklist') })}
            className="text-2xs font-medium inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
          >
            <Plus className="h-3.5 w-3.5" /> Add
          </button>
        )}
      />
      <div className="space-y-3">
        {((checklists ?? []) as Checklist[]).map((cl) => <ChecklistBlock key={cl.id} checklist={cl} />)}
      </div>
    </section>
  );
}

function ChecklistBlock({ checklist }: { checklist: Checklist }) {
  const fail = useFail();
  const m = useChecklistMutations();
  const [body, setBody] = useState('');
  const items = [...checklist.items].sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at));
  const done = items.filter((i) => i.done).length;
  const { ask, dialog } = useDeleteConfirm();
  const add = () => {
    if (!body.trim()) return;
    m.addItem.mutate(
      { checklistId: checklist.id, body: body.trim(), position: items.length },
      { onSuccess: () => setBody(''), onError: fail('Could not add item') },
    );
  };
  return (
    <div className="rounded-md border border-border/70 p-2">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs font-semibold flex-1">{checklist.name}</span>
        <span className="text-2xs text-muted-foreground tabular-nums">{done}/{items.length}</span>
        <button
          type="button"
          aria-label="Delete checklist"
          className="text-muted-foreground/60 hover:text-destructive"
          onClick={() => ask({
            what: 'checklist', name: checklist.name,
            consequence: items.length ? `The checklist and its ${items.length} item${items.length === 1 ? '' : 's'} are deleted from this task.` : 'The checklist is deleted from this task.',
            onConfirm: () => m.deleteChecklist.mutate(checklist.id, { onError: fail('Could not delete checklist') }),
          })}
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
      {items.map((it) => (
        <div key={it.id} className="group flex items-center gap-2 py-0.5">
          <Checkbox
            checked={it.done}
            onCheckedChange={(c) => m.toggleItem.mutate({ id: it.id, done: !!c }, { onError: fail('Could not update item') })}
          />
          <span className={cn('flex-1 text-sm', it.done && 'line-through text-muted-foreground')}>{it.body}</span>
          <button
            type="button"
            aria-label="Delete item"
            className="opacity-0 group-hover:opacity-60 hover:!opacity-100 hover:text-destructive"
            onClick={() => ask({
              what: 'item', name: it.body, consequence: 'It is removed from the checklist.',
              onConfirm: () => m.deleteItem.mutate(it.id, { onError: fail('Could not delete item') }),
            })}
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
      <Input
        placeholder="Add an item…"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
        className="h-7 text-xs mt-1"
      />
      {dialog}
    </div>
  );
}

// ── Attachments ────────────────────────────────────────────────────────

function fileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function AttachmentsSection({ task }: { task: TaskRow }) {
  const { toast } = useToast();
  const fail = useFail();
  const { profile } = useAuthStore();
  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin';
  const { data: files } = useAttachments(task.id);
  const upload = useUploadAttachment(task.id);
  const remove = useDeleteAttachment();
  const { ask: askRemove, dialog: removeDialog } = useDeleteConfirm();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(0);

  const send = async (list: FileList | null) => {
    if (!list || !profile?.id) return;
    for (const file of Array.from(list)) {
      if (file.size > ATTACHMENT_MAX_BYTES) {
        toast({ title: `${file.name} is too large`, description: 'Files can be up to 25 MB.', variant: 'destructive' });
        continue;
      }
      setBusy((b) => b + 1);
      try {
        await upload.mutateAsync({ file, userId: profile.id });
      } catch (err) {
        fail(`Could not upload ${file.name}`)(err);
      } finally {
        setBusy((b) => b - 1);
      }
    }
  };

  const openFile = async (a: TaskAttachment) => {
    try {
      window.open(await attachmentUrl(a.storage_path), '_blank', 'noopener');
    } catch (err) {
      fail('Could not open file')(err);
    }
  };

  return (
    <section>
      <SectionHeader title="Attachments" />
      {(files ?? []).length > 0 && (
        <div className="space-y-1 mb-2">
          {(files ?? []).map((a) => (
            <div key={a.id} className="group flex items-center gap-2 rounded-md border border-border/70 px-2 py-1.5">
              <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
              <button type="button" onClick={() => openFile(a)} className="flex-1 min-w-0 text-left text-sm truncate hover:text-primary">
                {a.file_name}
              </button>
              <span className="text-2xs text-muted-foreground shrink-0">{fileSize(a.size_bytes)}</span>
              {(a.uploaded_by === profile?.id || isAdmin) && (
                <button
                  type="button"
                  aria-label={`Delete ${a.file_name}`}
                  className="opacity-0 group-hover:opacity-60 hover:!opacity-100 hover:text-destructive"
                  onClick={() => askRemove({
                    what: 'file', name: a.file_name, consequence: 'The file is deleted from this task for everyone, and cannot be downloaded again.',
                    onConfirm: () => remove.mutate(a, { onError: fail('Could not delete file') }),
                  })}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click(); }}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); void send(e.dataTransfer.files); }}
        className={cn(
          'rounded-lg border border-dashed px-4 py-5 text-center cursor-pointer kd-transition',
          dragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50',
        )}
      >
        <p className="text-xs font-medium inline-flex items-center gap-1.5">
          {busy > 0 ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
          {busy > 0 ? 'Uploading…' : 'Drop files here, or choose'}
        </p>
        <p className="text-2xs text-muted-foreground mt-0.5">Up to 25 MB per file</p>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => { void send(e.target.files); e.target.value = ''; }}
        />
      </div>
      {removeDialog}
    </section>
  );
}
