import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Home, Plus, Trash2, Loader2 } from 'lucide-react';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useToast } from '@/hooks/use-toast';
import { useAuthStore } from '@/store/authStore';
import { errorMessage } from '@/lib/db-errors';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EmptyState } from '@/components/ui-kit/EmptyState';
import { TableSkeleton } from '@/components/ui-kit/TableSkeleton';
import {
  useTaskTables,
  useTableFields,
  useTableRecords,
  useCreateTableField,
  useDeleteTableField,
  useCreateTableRecord,
  useDeleteTableRecord,
  useSetRecordCell,
  useAssignablePeople,
  useAllTasksForPicker,
  useTaskLists,
  type TableField,
  type TableFieldType,
} from '@/queries/useTaskModule';

const FIELD_TYPE_LABELS: Record<TableFieldType, string> = {
  text: 'Text',
  long_text: 'Long text',
  number: 'Number',
  date: 'Date',
  checkbox: 'Checkbox',
  single_select: 'Single select',
  person: 'Person',
  task: 'Task',
};

const NONE = '__none__';

const TaskTablePage = () => {
  const { tableId } = useParams<{ tableId: string }>();
  const { toast } = useToast();
  const { profile } = useAuthStore();
  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin';

  const { data: tables } = useTaskTables();
  const table = (tables ?? []).find((t) => t.id === tableId);
  usePageTitle(table ? `Task · ${table.name}` : 'Task');

  const { data: fields, isLoading: fieldsLoading } = useTableFields(tableId ?? '');
  const { data: records, isLoading: recordsLoading } = useTableRecords(tableId ?? '');
  const { data: people } = useAssignablePeople();
  const { data: allTasks } = useAllTasksForPicker();
  const { data: lists } = useTaskLists();

  const createField = useCreateTableField(tableId ?? '');
  const deleteField = useDeleteTableField(tableId ?? '');
  const createRecord = useCreateTableRecord(tableId ?? '');
  const deleteRecord = useDeleteTableRecord(tableId ?? '');
  const setCell = useSetRecordCell(tableId ?? '');

  const [addingField, setAddingField] = useState(false);
  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldType, setNewFieldType] = useState<TableFieldType>('text');
  const [newFieldOptions, setNewFieldOptions] = useState('');

  const listNameById = new Map((lists ?? []).map((l) => [l.id, l.name]));
  const taskOptions = (allTasks ?? []).map((t) => ({
    id: t.id,
    label: `${t.title}${listNameById.get(t.list_id) ? ` (${listNameById.get(t.list_id)})` : ''}`,
  }));

  const submitNewField = () => {
    const name = newFieldName.trim();
    if (!name) return;
    const options = newFieldType === 'single_select'
      ? newFieldOptions.split(',').map((o) => o.trim()).filter(Boolean)
      : undefined;
    createField.mutate(
      { name, type: newFieldType, options },
      {
        onSuccess: () => { setAddingField(false); setNewFieldName(''); setNewFieldOptions(''); setNewFieldType('text'); },
        onError: (err) => toast({ title: 'Could not add field', description: errorMessage(err), variant: 'destructive' }),
      },
    );
  };

  const addRow = () => {
    if (!profile?.id) return;
    createRecord.mutate(profile.id, {
      onError: (err) => toast({ title: 'Could not add row', description: errorMessage(err), variant: 'destructive' }),
    });
  };

  const commitCell = (recordId: string, fieldId: string, value: unknown) => {
    setCell.mutate({ recordId, fieldId, value }, {
      onError: (err) => toast({ title: 'Could not save', description: errorMessage(err), variant: 'destructive' }),
    });
  };

  const loading = fieldsLoading || recordsLoading;
  const rows = records ?? [];
  const cols = fields ?? [];

  return (
    <div className="space-y-4">
      <div>
        <Link to="/task" className="md:hidden inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground kd-transition mb-1">
          <Home className="h-3.5 w-3.5" /> Home
        </Link>
        <h1 className="kd-display text-2xl font-bold tracking-tight kd-text-gradient">{table?.name ?? 'Table'}</h1>
      </div>

      {loading ? (
        <TableSkeleton rows={5} />
      ) : cols.length === 0 && !isAdmin ? (
        <EmptyState illustration="ghost" title="No columns yet" description="An admin hasn’t set up any columns for this table yet." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border/70">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-border/70 bg-muted/30">
                {cols.map((field) => (
                  <th key={field.id} className="px-3 py-2 text-left font-semibold text-2xs uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      <span>{field.name}</span>
                      <span className="text-muted-foreground/50 font-normal normal-case">({FIELD_TYPE_LABELS[field.type]})</span>
                      {isAdmin && (
                        <button
                          type="button"
                          className="text-muted-foreground/40 hover:text-destructive ml-auto"
                          onClick={() => {
                            if (window.confirm(`Delete column "${field.name}"? This removes it from every row.`)) {
                              deleteField.mutate(field.id, {
                                onError: (err) => toast({ title: 'Could not delete field', description: errorMessage(err), variant: 'destructive' }),
                              });
                            }
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </th>
                ))}
                <th className="px-2 py-2 w-10">
                  {isAdmin && !addingField && (
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setAddingField(true)} title="Add field">
                      <Plus className="h-4 w-4" />
                    </Button>
                  )}
                </th>
              </tr>
              {addingField && (
                <tr className="border-b border-border/70 bg-muted/10">
                  <td colSpan={cols.length + 1} className="px-3 py-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Input
                        autoFocus
                        placeholder="Field name…"
                        value={newFieldName}
                        onChange={(e) => setNewFieldName(e.target.value)}
                        className="h-8 w-40 text-sm"
                      />
                      <Select value={newFieldType} onValueChange={(v) => setNewFieldType(v as TableFieldType)}>
                        <SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {(Object.keys(FIELD_TYPE_LABELS) as TableFieldType[]).map((t) => (
                            <SelectItem key={t} value={t}>{FIELD_TYPE_LABELS[t]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {newFieldType === 'single_select' && (
                        <Input
                          placeholder="Options, comma separated…"
                          value={newFieldOptions}
                          onChange={(e) => setNewFieldOptions(e.target.value)}
                          className="h-8 w-56 text-sm"
                        />
                      )}
                      <Button size="sm" className="h-8" disabled={createField.isPending || !newFieldName.trim()} onClick={submitNewField}>
                        {createField.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Add'}
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8" onClick={() => setAddingField(false)}>Cancel</Button>
                    </div>
                  </td>
                </tr>
              )}
            </thead>
            <tbody>
              {rows.map((record) => (
                <tr key={record.id} className="border-b border-border/50 hover:bg-muted/20 group">
                  {cols.map((field) => (
                    <td key={field.id} className="px-2 py-1 align-top">
                      <Cell
                        field={field}
                        value={record.data[field.id]}
                        onCommit={(v) => commitCell(record.id, field.id, v)}
                        people={people ?? []}
                        taskOptions={taskOptions}
                      />
                    </td>
                  ))}
                  <td className="px-2 py-1 align-middle">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 text-muted-foreground/40 hover:text-destructive opacity-0 group-hover:opacity-100 kd-transition"
                      onClick={() => deleteRecord.mutate(record.id, {
                        onError: (err) => toast({ title: 'Could not delete row', description: errorMessage(err), variant: 'destructive' }),
                      })}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-2 py-2 border-t border-border/70">
            <Button size="sm" variant="ghost" className="h-8 text-xs" disabled={createRecord.isPending || cols.length === 0} onClick={addRow}>
              {createRecord.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Plus className="h-3.5 w-3.5 mr-1.5" />} Add row
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

function Cell({
  field, value, onCommit, people, taskOptions,
}: {
  field: TableField;
  value: unknown;
  onCommit: (value: unknown) => void;
  people: { id: string; full_name: string }[];
  taskOptions: { id: string; label: string }[];
}) {
  const [draft, setDraft] = useState(value == null ? '' : String(value));

  switch (field.type) {
    case 'checkbox':
      return (
        <Checkbox checked={!!value} onCheckedChange={(checked) => onCommit(!!checked)} />
      );
    case 'single_select':
      return (
        <Select value={(value as string) ?? NONE} onValueChange={(v) => onCommit(v === NONE ? null : v)}>
          <SelectTrigger className="h-8 text-xs min-w-[120px]"><SelectValue placeholder="—" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>—</SelectItem>
            {(field.config.options ?? []).map((opt) => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
          </SelectContent>
        </Select>
      );
    case 'person':
      return (
        <Select value={(value as string) ?? NONE} onValueChange={(v) => onCommit(v === NONE ? null : v)}>
          <SelectTrigger className="h-8 text-xs min-w-[140px]"><SelectValue placeholder="Unassigned" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>Unassigned</SelectItem>
            {people.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}
          </SelectContent>
        </Select>
      );
    case 'task':
      return (
        <Select value={(value as string) ?? NONE} onValueChange={(v) => onCommit(v === NONE ? null : v)}>
          <SelectTrigger className="h-8 text-xs min-w-[160px]"><SelectValue placeholder="None" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>None</SelectItem>
            {taskOptions.map((t) => <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>)}
          </SelectContent>
        </Select>
      );
    case 'date':
      return (
        <Input
          type="date"
          className="h-8 text-xs min-w-[130px]"
          value={(value as string) ?? ''}
          onChange={(e) => onCommit(e.target.value || null)}
        />
      );
    case 'number':
      return (
        <Input
          type="number"
          className={cn('h-8 text-xs min-w-[90px]')}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => onCommit(draft === '' ? null : Number(draft))}
        />
      );
    case 'long_text':
      return (
        <Textarea
          className="text-xs min-w-[180px] min-h-[36px]"
          rows={1}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => onCommit(draft || null)}
        />
      );
    case 'text':
    default:
      return (
        <Input
          className="h-8 text-xs min-w-[140px]"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => onCommit(draft || null)}
        />
      );
  }
}

export default TaskTablePage;
