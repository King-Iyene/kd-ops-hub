import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  DndContext, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core';
import {
  ArrowDownAZ, ArrowUpAZ, ChevronDown, Download, EyeOff, FileText, GripVertical, LayoutGrid, ListPlus, Loader2,
  Pencil, Plus, Search, Table2, Trash2, Upload,
} from 'lucide-react';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useToast } from '@/hooks/use-toast';
import { useAuthStore } from '@/store/authStore';
import { errorMessage } from '@/lib/db-errors';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  useAssignablePeople, useCreateTableField, useCreateTableRecord, useDeleteTableField, useDeleteTableRecords,
  useOpenTasksForPicker, useSetRecordCell, useTableFields, useTableRecords, useTaskLists, useTaskTables, useTaskTitles,
  useUpdateTableField,
  type TableField, type TableRecordRow,
} from '@/queries/useTaskModule';
import { useOpenTask } from '@/features/task-module/useOpenTask';
import { AddFieldDialog, type FieldDraft } from '@/features/task-module/table/AddFieldDialog';
import { FieldLabel, TableCell, type CellCtx } from '@/features/task-module/table/cells';
import { FIELD_TYPES, asList, displayText, optionChip, type NameLookups } from '@/features/task-module/table/fieldTypes';
import { rowMatches, rowSearch, sortRows, type RowFilter, type RowSort } from '@/features/task-module/table/tableQuery';
import { ColumnsButton, CreateTasksDialog, ImportDialog, TableFilterButton } from '@/features/task-module/table/TableTools';
import { exportCsv } from '@/features/task-module/table/tableActions';
import { FormsDialog } from '@/features/task-module/table/FormsDialog';

interface TablePrefs { view: 'grid' | 'board'; hidden: string[]; boardField: string | null }

function loadPrefs(tableId: string): TablePrefs {
  try {
    const raw = localStorage.getItem(`kdops.task.table.${tableId}`);
    return { view: 'grid', hidden: [], boardField: null, ...(raw ? JSON.parse(raw) : {}) };
  } catch {
    return { view: 'grid', hidden: [], boardField: null };
  }
}

const COL_W = 'min-w-[180px] w-[180px]';

const TaskTablePage = () => {
  const { tableId = '' } = useParams<{ tableId: string }>();
  return <TableScreen key={tableId} tableId={tableId} />;
};

function TableScreen({ tableId }: { tableId: string }) {
  const { toast } = useToast();
  const { profile } = useAuthStore();
  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin';
  const { open: openTask } = useOpenTask();

  const { data: tables } = useTaskTables();
  const table = (tables ?? []).find((t) => t.id === tableId);
  usePageTitle(table ? `${table.name} · Task` : 'Task');

  const { data: fieldsData, isLoading: fieldsLoading } = useTableFields(tableId);
  const { data: recordsData, isLoading: recordsLoading } = useTableRecords(tableId);
  const { data: peopleData } = useAssignablePeople();
  const { data: openTasksData } = useOpenTasksForPicker();
  const { data: lists } = useTaskLists();
  const fields = useMemo(() => fieldsData ?? [], [fieldsData]);
  const records = useMemo(() => recordsData ?? [], [recordsData]);
  const people = useMemo(() => peopleData ?? [], [peopleData]);
  const openTasks = useMemo(() => openTasksData ?? [], [openTasksData]);

  // Titles for linked tasks that aren't open any more.
  const linkedIds = useMemo(() => {
    const s = new Set<string>();
    for (const f of fields) if (f.type === 'task') for (const r of records) asList(r.data[f.id]).forEach((id) => s.add(id));
    return [...s].filter((id) => !openTasks.some((t) => t.id === id));
  }, [fields, records, openTasks]);
  const { data: closedTitles } = useTaskTitles(linkedIds);

  const createField = useCreateTableField(tableId);
  const updateField = useUpdateTableField(tableId);
  const deleteField = useDeleteTableField(tableId);
  const createRecord = useCreateTableRecord(tableId);
  const deleteRecords = useDeleteTableRecords(tableId);
  const setCell = useSetRecordCell(tableId);

  const [prefs, setPrefsState] = useState<TablePrefs>(() => loadPrefs(tableId));
  const setPrefs = (patch: Partial<TablePrefs>) => setPrefsState((p) => {
    const next = { ...p, ...patch };
    try { localStorage.setItem(`kdops.task.table.${tableId}`, JSON.stringify(next)); } catch { /* not remembered */ }
    return next;
  });
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<RowFilter[]>([]);
  const [sort, setSort] = useState<RowSort | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [fieldDialog, setFieldDialog] = useState<TableField | 'new' | null>(null);
  const [dialog, setDialog] = useState<'import' | 'forms' | 'tasks' | null>(null);

  const peopleById = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const listNameById = useMemo(() => new Map((lists ?? []).map((l) => [l.id, l.name])), [lists]);
  const titleById = useMemo(() => {
    const m = new Map(openTasks.map((t) => [t.id, t.title]));
    (closedTitles ?? []).forEach((t) => m.set(t.id, t.title));
    return m;
  }, [openTasks, closedTitles]);
  const names: NameLookups = useMemo(() => ({
    personName: (id) => peopleById.get(id)?.full_name ?? 'Former member',
    taskTitle: (id) => titleById.get(id) ?? 'Deleted task',
  }), [peopleById, titleById]);

  const shownFields = fields.filter((f) => !prefs.hidden.includes(f.id));
  const rows = useMemo(
    () => sortRows(records.filter((r) => rowSearch(r, fields, search, names) && rowMatches(r, fields, filters, names)), fields, sort, names),
    [records, fields, search, filters, sort, names],
  );
  const selectedRows = rows.filter((r) => selected.has(r.id));

  const ctx: CellCtx = {
    tableId,
    people,
    peopleById,
    openTasks,
    taskTitle: names.taskTitle,
    listName: (id) => listNameById.get(id) ?? '',
    onOpenTask: openTask,
    personFieldId: fields.find((f) => f.type === 'person')?.id,
  };

  const commit = (recordId: string, fieldId: string, value: unknown) =>
    setCell.mutate({ recordId, fieldId, value }, { onError: (e) => toast({ title: 'Could not save', description: errorMessage(e), variant: 'destructive' }) });

  const newRow = () => {
    if (!profile?.id) return;
    createRecord.mutate({ createdBy: profile.id }, { onError: (e) => toast({ title: 'Could not add a row', description: errorMessage(e), variant: 'destructive' }) });
  };

  const saveField = (draft: FieldDraft) => {
    const done = { onSuccess: () => setFieldDialog(null), onError: (e: unknown) => toast({ title: 'Could not save the field', description: errorMessage(e), variant: 'destructive' }) };
    if (fieldDialog && fieldDialog !== 'new') updateField.mutate({ id: fieldDialog.id, name: draft.name, config: draft.config }, done);
    else createField.mutate({ ...draft, position: Math.max(0, ...fields.map((f) => f.position)) + 1 }, done);
  };

  const removeField = (f: TableField) => {
    if (!window.confirm(`Delete the field "${f.name}"? Its values are removed from every row, and it disappears from forms.`)) return;
    deleteField.mutate(f.id, { onError: (e) => toast({ title: 'Could not delete the field', description: errorMessage(e), variant: 'destructive' }) });
  };

  const removeSelected = () => {
    const ids = [...selected];
    if (!ids.length || !window.confirm(`Delete ${ids.length} row${ids.length === 1 ? '' : 's'}? This can't be undone.`)) return;
    deleteRecords.mutate(ids, {
      onSuccess: () => setSelected(new Set()),
      onError: (e) => toast({ title: 'Could not delete', description: errorMessage(e), variant: 'destructive' }),
    });
  };

  const loading = fieldsLoading || recordsLoading;
  const toolBtn = 'h-8 text-xs gap-1.5';
  const allChecked = rows.length > 0 && rows.every((r) => selected.has(r.id));

  return (
    <div className="space-y-3">
      <div className="flex items-baseline gap-2">
        <h1 className="text-lg font-bold tracking-tight">{table?.name ?? 'Table'}</h1>
        <span className="text-xs text-muted-foreground tabular-nums">{records.length} row{records.length === 1 ? '' : 's'}</span>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        <div className="inline-flex rounded-md border border-border p-0.5" role="group" aria-label="View">
          {(['grid', 'board'] as const).map((v) => (
            <button key={v} type="button" aria-pressed={prefs.view === v} onClick={() => setPrefs({ view: v })}
              className={cn('h-7 px-2 rounded inline-flex items-center gap-1 text-xs', prefs.view === v ? 'bg-secondary text-secondary-foreground font-medium' : 'text-muted-foreground hover:text-foreground')}>
              {v === 'grid' ? <Table2 className="h-3.5 w-3.5" /> : <LayoutGrid className="h-3.5 w-3.5" />} {v === 'grid' ? 'Grid' : 'Board'}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search rows" className="h-8 w-40 sm:w-48 pl-8 text-xs" />
        </div>
        <TableFilterButton fields={fields} filters={filters} onChange={setFilters} people={people} openTasks={openTasks} taskTitle={names.taskTitle} />
        <ColumnsButton fields={fields} hidden={prefs.hidden} onChange={(hidden) => setPrefs({ hidden })} />

        <div className="ml-auto flex items-center gap-1 flex-wrap">
          <Button size="sm" variant="ghost" className={toolBtn} onClick={() => exportCsv(table?.name ?? 'table', shownFields, rows, names)} disabled={!fields.length}>
            <Download className="h-3.5 w-3.5" /> Export
          </Button>
          <Button size="sm" variant="ghost" className={toolBtn} onClick={() => setDialog('import')} disabled={!fields.length}>
            <Upload className="h-3.5 w-3.5" /> Import
          </Button>
          <Button size="sm" variant="ghost" className={toolBtn} onClick={() => setDialog('forms')}>
            <FileText className="h-3.5 w-3.5" /> Forms
          </Button>
          <Button size="sm" variant="ghost" className={toolBtn} onClick={() => setDialog('tasks')} disabled={!rows.length}>
            <ListPlus className="h-3.5 w-3.5" /> Create tasks
          </Button>
          <Button size="sm" className={toolBtn} onClick={newRow} disabled={createRecord.isPending}>
            {createRecord.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} New row
          </Button>
        </div>
      </div>

      {selected.size > 0 && (
        <div className="flex items-center gap-2 rounded-md border border-primary/40 bg-primary/5 px-3 py-1.5 text-xs">
          <span className="font-medium">{selected.size} selected</span>
          <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={() => setDialog('tasks')}><ListPlus className="h-3.5 w-3.5" /> Create tasks</Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 text-destructive hover:text-destructive" onClick={removeSelected}><Trash2 className="h-3.5 w-3.5" /> Delete</Button>
          <button type="button" className="ml-auto text-muted-foreground hover:text-foreground" onClick={() => setSelected(new Set())}>Clear</button>
        </div>
      )}

      {loading ? (
        <div className="py-16 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : prefs.view === 'board' ? (
        <TableBoard
          fields={fields}
          shownFields={shownFields}
          rows={rows}
          groupFieldId={prefs.boardField}
          onGroupField={(boardField) => setPrefs({ boardField })}
          onMove={(recordId, fieldId, value) => commit(recordId, fieldId, value)}
          names={names}
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border/70">
          <table className="text-sm border-collapse w-max min-w-full">
            <thead>
              <tr className="border-b border-border/70 bg-muted/30">
                <th className="w-10 px-2 py-2 text-left sticky left-0 bg-muted/60 z-10">
                  <Checkbox checked={allChecked} onCheckedChange={(c) => setSelected(c ? new Set(rows.map((r) => r.id)) : new Set())} aria-label="Select all rows" />
                </th>
                {shownFields.map((f) => (
                  <th key={f.id} className={cn(COL_W, 'px-2 py-1.5 text-left text-xs font-semibold border-l border-border/50')} data-col={f.name}>
                    <div className="flex items-center gap-1">
                      <GripVertical className="h-3 w-3 text-muted-foreground/40 shrink-0" />
                      <FieldLabel field={f} className="flex-1" />
                      {sort?.fieldId === f.id && (sort.dir === 'asc' ? <ArrowDownAZ className="h-3 w-3 text-primary" /> : <ArrowUpAZ className="h-3 w-3 text-primary" />)}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button type="button" className="text-muted-foreground hover:text-foreground" aria-label={`${f.name} options`}><ChevronDown className="h-3.5 w-3.5" /></button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setSort({ fieldId: f.id, dir: 'asc' })}><ArrowDownAZ className="h-3.5 w-3.5 mr-2" /> Sort ascending</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setSort({ fieldId: f.id, dir: 'desc' })}><ArrowUpAZ className="h-3.5 w-3.5 mr-2" /> Sort descending</DropdownMenuItem>
                          {sort?.fieldId === f.id && <DropdownMenuItem onClick={() => setSort(null)}>Clear sort</DropdownMenuItem>}
                          <DropdownMenuItem onClick={() => setPrefs({ hidden: [...prefs.hidden, f.id] })}><EyeOff className="h-3.5 w-3.5 mr-2" /> Hide field</DropdownMenuItem>
                          {isAdmin && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => setFieldDialog(f)}><Pencil className="h-3.5 w-3.5 mr-2" /> Edit field</DropdownMenuItem>
                              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => removeField(f)}><Trash2 className="h-3.5 w-3.5 mr-2" /> Delete field</DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </th>
                ))}
                <th className="w-10 px-1 py-1.5 border-l border-border/50">
                  {isAdmin && (
                    <button type="button" onClick={() => setFieldDialog('new')} className="h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted" aria-label="Add a field" title="Add a field">
                      <Plus className="h-4 w-4" />
                    </button>
                  )}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={cn('border-b border-border/40 hover:bg-muted/10', selected.has(r.id) && 'bg-primary/5')} data-row={r.id}>
                  <td className="w-10 px-2 sticky left-0 bg-background z-10">
                    <Checkbox
                      checked={selected.has(r.id)}
                      onCheckedChange={(c) => setSelected((s) => { const n = new Set(s); if (c) n.add(r.id); else n.delete(r.id); return n; })}
                      aria-label="Select row"
                    />
                  </td>
                  {shownFields.map((f) => (
                    <td key={f.id} className={cn(COL_W, 'p-0.5 border-l border-border/30 align-middle')}>
                      <TableCell field={f} record={r} ctx={ctx} onCommit={(v) => commit(r.id, f.id, v)} />
                    </td>
                  ))}
                  <td className="border-l border-border/30" />
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && (
            <p className="text-xs text-muted-foreground px-4 py-6">
              {records.length === 0
                ? fields.length === 0
                  ? isAdmin ? 'No fields yet. Click + at the end of the header to add the first column.' : 'No fields yet. An admin needs to add columns first.'
                  : 'No rows yet. Click “New row”, import a CSV, or share a form.'
                : 'No rows match the search or filters.'}
            </p>
          )}
          <button type="button" onClick={newRow} className="w-full text-left px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/20 border-t border-border/50">
            + New row
          </button>
        </div>
      )}

      {fieldDialog && (
        <AddFieldDialog
          open
          onOpenChange={(o) => !o && setFieldDialog(null)}
          field={fieldDialog === 'new' ? undefined : fieldDialog}
          saving={createField.isPending || updateField.isPending}
          onSave={saveField}
        />
      )}
      {dialog === 'import' && (
        <ImportDialog open onOpenChange={(o) => !o && setDialog(null)} tableId={tableId} fields={fields} people={people} openTasks={openTasks} />
      )}
      {dialog === 'forms' && (
        <FormsDialog open onOpenChange={(o) => !o && setDialog(null)} tableId={tableId} tableName={table?.name ?? 'Table'} fields={fields} isAdmin={isAdmin} />
      )}
      {dialog === 'tasks' && (
        <CreateTasksDialog
          open
          onOpenChange={(o) => { if (!o) { setDialog(null); setSelected(new Set()); } }}
          tableId={tableId}
          fields={fields}
          rows={selectedRows.length ? selectedRows : rows}
          names={names}
        />
      )}
    </div>
  );
}

// Board: one column per option of a Single select field; drag a card to
// another column to change that field.
function TableBoard({ fields, shownFields, rows, groupFieldId, onGroupField, onMove, names }: {
  fields: TableField[];
  shownFields: TableField[];
  rows: TableRecordRow[];
  groupFieldId: string | null;
  onGroupField: (id: string) => void;
  onMove: (recordId: string, fieldId: string, value: unknown) => void;
  names: NameLookups;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const selects = fields.filter((f) => f.type === 'single_select');
  const group = selects.find((f) => f.id === groupFieldId) ?? selects[0];
  if (!group) {
    return <p className="text-sm text-muted-foreground py-10 text-center">The board groups rows by a Single select field. Add one to use it.</p>;
  }
  const titleField = shownFields.find((f) => f.id !== group.id && !FIELD_TYPES[f.type].computed) ?? shownFields[0];
  const detailFields = shownFields.filter((f) => f.id !== group.id && f.id !== titleField?.id).slice(0, 3);
  const columns = [...(group.config.options ?? []), ''];

  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over) return;
    const target = String(e.over.id).slice(4);
    const row = rows.find((r) => r.id === e.active.id);
    if (!row || (row.data[group.id] ?? '') === target) return;
    onMove(row.id, group.id, target || null);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs">
        <span className="text-muted-foreground">Group by</span>
        <Select value={group.id} onValueChange={onGroupField}>
          <SelectTrigger className="h-7 w-48 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>{selects.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {columns.map((opt) => (
            <BoardColumn key={opt || '__none'} id={`col:${opt}`} label={opt || 'No value'} chip={opt ? optionChip(group, opt) : 'bg-muted text-muted-foreground'}
              count={rows.filter((r) => (r.data[group.id] ?? '') === opt).length}>
              {rows.filter((r) => ((r.data[group.id] as string | undefined) ?? '') === opt).map((r) => (
                <BoardCard key={r.id} id={r.id}>
                  <p className="text-sm font-medium line-clamp-2">{titleField ? displayText(titleField, r, names) || 'Untitled' : 'Row'}</p>
                  {detailFields.map((f) => {
                    const t = displayText(f, r, names);
                    return t ? <p key={f.id} className="text-2xs text-muted-foreground truncate"><span className="font-medium">{f.name}:</span> {t}</p> : null;
                  })}
                </BoardCard>
              ))}
            </BoardColumn>
          ))}
        </div>
      </DndContext>
    </div>
  );
}

function BoardColumn({ id, label, chip, count, children }: { id: string; label: string; chip: string; count: number; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} data-board-col={label} className={cn('flex-1 min-w-[220px] rounded-lg bg-muted/30 p-2 space-y-2 min-h-[120px]', isOver && 'ring-2 ring-primary/50')}>
      <div className="flex items-center gap-2 px-1">
        <span className={cn('rounded px-1.5 py-0.5 text-2xs font-semibold', chip)}>{label}</span>
        <span className="text-2xs text-muted-foreground">{count}</span>
      </div>
      {children}
    </div>
  );
}

function BoardCard({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={transform ? { transform: `translate(${transform.x}px, ${transform.y}px)` } : undefined}
      className={cn('rounded-md border border-border/70 bg-card p-2.5 space-y-1 cursor-grab touch-none', isDragging && 'opacity-70 shadow-lg z-20 relative')}
    >
      {children}
    </div>
  );
}

export default TaskTablePage;
