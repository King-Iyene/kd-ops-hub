import { Fragment, useEffect, useMemo, useState } from 'react';
import {
  DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, horizontalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import {
  ArrowDownAZ, ArrowUpAZ, ChevronDown, Download, EyeOff, FileText, GripVertical, Inbox, ListPlus, Loader2,
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
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  useActivePeople, useAssignablePeople, useCreateTableField, useCreateTableRecord, useDeleteTableField, useDeleteTableRecords,
  useOpenTasksForPicker, useReorderTableFields, useSetRecordCell, useSetReportDateField, useTableFields, useTableRecords, useTaskLists, useTaskTables, useTaskTitles,
  useUpdateTableField,
  type TableField,
} from '@/queries/useTaskModule';
import { queryKeys } from '@/queries/keys';
import { useOpenTask } from '@/features/task-module/useOpenTask';
import { AddFieldDialog, type FieldDraft } from '@/features/task-module/table/AddFieldDialog';
import { FieldLabel, TableCell, type CellCtx } from '@/features/task-module/table/cells';
import { asList, type NameLookups } from '@/features/task-module/table/fieldTypes';
import { rowMatches, rowSearch, sortRows, type RowFilter, type RowSort } from '@/features/task-module/table/tableQuery';
import { ColumnsButton, CreateTasksDialog, ImportDialog, TableFilterButton } from '@/features/task-module/table/TableTools';
import { exportCsv } from '@/features/task-module/table/tableActions';
import { FormsDialog } from '@/features/task-module/table/FormsDialog';
import { RangeBar, ReportDatePicker, ReportInbox } from '@/features/task-module/table/ReportViews';
import {
  DEFAULT_RANGE, dayLabel, dayOfFor, groupByDay, inRange, newestFirst, resolveReportDateField, todayLagos, type ReportRange,
} from '@/features/task-module/table/reportDays';

interface TablePrefs { view: 'grid' | 'inbox'; hidden: string[]; groupDays: boolean; skipped: string[] }

const DEFAULT_PREFS: TablePrefs = { view: 'grid', hidden: [], groupDays: true, skipped: [] };

function loadPrefs(tableId: string): TablePrefs {
  try {
    const raw = localStorage.getItem(`kdops.task.table.${tableId}`);
    const saved = raw ? JSON.parse(raw) : {};
    const view = saved.view === 'inbox' ? 'inbox' : 'grid'; // the old Board view is gone
    return {
      view,
      hidden: Array.isArray(saved.hidden) ? saved.hidden : [],
      groupDays: saved.groupDays !== false,
      skipped: Array.isArray(saved.skipped) ? saved.skipped : [],
    };
  } catch {
    return DEFAULT_PREFS;
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
  const { data: activeData } = useActivePeople();
  const { data: openTasksData } = useOpenTasksForPicker();
  const { data: lists } = useTaskLists();
  const fields = useMemo(() => fieldsData ?? [], [fieldsData]);
  const records = useMemo(() => recordsData ?? [], [recordsData]);
  const people = useMemo(() => peopleData ?? [], [peopleData]);
  const activePeople = useMemo(() => activeData ?? [], [activeData]);
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
  const reorderFields = useReorderTableFields(tableId);
  const setReportDate = useSetReportDateField();

  const [prefs, setPrefsState] = useState<TablePrefs>(() => loadPrefs(tableId));
  const setPrefs = (patch: Partial<TablePrefs>) => setPrefsState((p) => {
    const next = { ...p, ...patch };
    try { localStorage.setItem(`kdops.task.table.${tableId}`, JSON.stringify(next)); } catch { /* not remembered */ }
    return next;
  });
  const today = todayLagos();
  // Always opens on this week; the choice isn't remembered.
  const [range, setRange] = useState<ReportRange>(DEFAULT_RANGE);
  const [inboxDay, setInboxDay] = useState(today);
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
  // Reports are dated by the table's Report Date field (not by when they were added).
  const dateField = useMemo(() => resolveReportDateField(table?.report_date_field, fields), [table?.report_date_field, fields]);
  const dayOf = useMemo(() => dayOfFor(dateField), [dateField]);
  const inRangeRecords = useMemo(() => records.filter((r) => inRange(dayOf(r), range, today)), [records, range, today, dayOf]);
  const rows = useMemo(() => {
    const matched = inRangeRecords.filter((r) => rowSearch(r, fields, search, names) && rowMatches(r, fields, filters, names));
    // Newest report first, unless a column sort says otherwise.
    return sort ? sortRows(matched, fields, sort, names) : newestFirst(matched, dayOf);
  }, [inRangeRecords, fields, search, filters, sort, names, dayOf]);
  const dayGroups = useMemo(() => (prefs.groupDays ? groupByDay(rows, dayOf) : null), [rows, prefs.groupDays, dayOf]);
  const personFields = useMemo(() => fields.filter((f) => f.type === 'person'), [fields]);

  // The Inbox follows reports as they come in: reload while it is open.
  const qc = useQueryClient();
  useEffect(() => {
    if (prefs.view !== 'inbox') return;
    const t = setInterval(() => { void qc.invalidateQueries({ queryKey: queryKeys.taskModule.records(tableId) }); }, 60_000);
    return () => clearInterval(t);
  }, [prefs.view, qc, tableId]);
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

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const onFieldDragEnd = (e: DragEndEvent) => {
    if (!isAdmin || !e.over || e.active.id === e.over.id) return;
    const ids = fields.map((f) => f.id);
    const from = ids.indexOf(String(e.active.id));
    const to = ids.indexOf(String(e.over.id));
    if (from < 0 || to < 0) return;
    reorderFields.mutate(arrayMove(ids, from, to), { onError: (err) => toast({ title: 'Could not move the field', description: errorMessage(err), variant: 'destructive' }) });
  };

  const loading = fieldsLoading || recordsLoading;
  const toolBtn = 'h-8 text-xs gap-1.5';
  const allChecked = rows.length > 0 && rows.every((r) => selected.has(r.id));

  return (
    <div className="space-y-3">
      <div className="flex items-baseline gap-2">
        <h1 className="text-lg font-bold tracking-tight">{table?.name ?? 'Table'}</h1>
        <span className="text-xs text-muted-foreground tabular-nums">
          {prefs.view === 'grid' && range.kind !== 'all' ? `${inRangeRecords.length} of ${records.length}` : records.length} row{records.length === 1 ? '' : 's'}
        </span>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        <div className="inline-flex rounded-md border border-border p-0.5" role="group" aria-label="View">
          {(['grid', 'inbox'] as const).map((v) => (
            <button key={v} type="button" aria-pressed={prefs.view === v} onClick={() => setPrefs({ view: v })}
              className={cn('h-7 px-2 rounded inline-flex items-center gap-1 text-xs', prefs.view === v ? 'bg-secondary text-secondary-foreground font-medium' : 'text-muted-foreground hover:text-foreground')}>
              {v === 'grid' ? <Table2 className="h-3.5 w-3.5" /> : <Inbox className="h-3.5 w-3.5" />} {v === 'grid' ? 'Grid' : 'Inbox'}
            </button>
          ))}
        </div>
        {prefs.view === 'grid' && (
          <>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search rows" className="h-8 w-40 sm:w-48 pl-8 text-xs" />
        </div>
        <TableFilterButton fields={fields} filters={filters} onChange={setFilters} people={people} openTasks={openTasks} taskTitle={names.taskTitle} />
        <ColumnsButton fields={fields} hidden={prefs.hidden} onChange={(hidden) => setPrefs({ hidden })} />

          </>
        )}

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

      {prefs.view === 'grid' && !loading && (
        <div className="flex items-center gap-3 flex-wrap">
          <RangeBar range={range} onChange={(r) => { setRange(r); setSelected(new Set()); }} records={records} today={today} dayOf={dayOf} />
          <ReportDatePicker
            fields={fields}
            setting={table?.report_date_field ?? null}
            resolvedId={dateField?.id ?? null}
            canEdit={isAdmin}
            saving={setReportDate.isPending}
            onChange={(setting) => setReportDate.mutate({ tableId, setting }, { onError: (e) => toast({ title: 'Could not save the report date', description: errorMessage(e), variant: 'destructive' }) })}
          />
          <label className="inline-flex items-center gap-1.5 text-xs cursor-pointer ml-auto">
            <Checkbox checked={prefs.groupDays} onCheckedChange={(c) => setPrefs({ groupDays: !!c })} aria-label="Group by day" /> Group by day
          </label>
        </div>
      )}

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
      ) : prefs.view === 'inbox' ? (
        <ReportInbox
          records={records}
          personFields={personFields}
          people={activePeople}
          day={inboxDay}
          dayOf={dayOf}
          onDay={setInboxDay}
          skipped={prefs.skipped}
          onSkip={(id) => setPrefs({ skipped: [...prefs.skipped, id] })}
          onRestore={() => setPrefs({ skipped: [] })}
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border/70">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onFieldDragEnd}>
          <table className="text-sm border-collapse w-max min-w-full">
            <thead>
              <tr className="border-b border-border/70 bg-muted/30">
                <th className="w-10 px-2 py-2 text-left sticky left-0 bg-muted/60 z-10">
                  <Checkbox checked={allChecked} onCheckedChange={(c) => setSelected(c ? new Set(rows.map((r) => r.id)) : new Set())} aria-label="Select all rows" />
                </th>
                <SortableContext items={shownFields.map((f) => f.id)} strategy={horizontalListSortingStrategy}>
                {shownFields.map((f) => (
                  <SortableTh key={f.id} id={f.id} name={f.name} canDrag={isAdmin && shownFields.length > 1}>
                    {(handle) => (
                    <div className="flex items-center gap-1">
                      {handle}
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
                    )}
                  </SortableTh>
                ))}
                </SortableContext>
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
              {(dayGroups ?? [{ day: '', rows }]).map((g) => (
                <Fragment key={g.day || 'all'}>
                  {dayGroups && (
                    <tr className="bg-muted/40 border-b border-border/60" data-day={g.day}>
                      <td colSpan={shownFields.length + 2} className="px-3 py-1.5 text-xs font-semibold sticky left-0">
                        {dayLabel(g.day, today)} <span className="font-normal text-muted-foreground tabular-nums">· {g.rows.length} report{g.rows.length === 1 ? '' : 's'}</span>
                      </td>
                    </tr>
                  )}
                  {g.rows.map((r) => (
                    <tr key={r.id} className={cn('border-b border-border/40 hover:bg-muted/10', selected.has(r.id) && 'bg-primary/5')} data-row={r.id}>
                      <td className="w-10 px-2 sticky left-0 bg-background z-10">
                        <Checkbox
                          checked={selected.has(r.id)}
                          onCheckedChange={(c) => setSelected((sel) => { const n = new Set(sel); if (c) n.add(r.id); else n.delete(r.id); return n; })}
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
                </Fragment>
              ))}
            </tbody>
          </table>
          </DndContext>
          {rows.length === 0 && (
            <p className="text-xs text-muted-foreground px-4 py-6">
              {records.length === 0
                ? fields.length === 0
                  ? isAdmin ? 'No fields yet. Click + at the end of the header to add the first column.' : 'No fields yet. An admin needs to add columns first.'
                  : 'No rows yet. Click “New row”, import a CSV, or share a form.'
                : inRangeRecords.length === 0
                  ? `No reports ${range.kind === 'week' ? 'in this week' : 'in this month'}. ${records.length} older row${records.length === 1 ? ' is' : 's are'} hidden.`
                  : 'No rows match the search or filters.'}
            </p>
          )}
          {inRangeRecords.length === 0 && range.kind !== 'all' && records.length > 0 && (
            <button type="button" className="px-4 pb-4 text-xs text-primary hover:underline" onClick={() => setRange({ kind: 'all' })}>Show all reports</button>
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

// A column header that can be dragged to a new place (admins).
function SortableTh({ id, name, canDrag, children }: { id: string; name: string; canDrag: boolean; children: (handle: React.ReactNode) => React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled: !canDrag });
  const handle = canDrag ? (
    <button type="button" {...attributes} {...listeners} aria-label={`Move ${name}`} title="Drag to move this column"
      className="cursor-grab touch-none text-muted-foreground/50 hover:text-foreground shrink-0">
      <GripVertical className="h-3.5 w-3.5" />
    </button>
  ) : <GripVertical className="h-3 w-3 text-muted-foreground/30 shrink-0" />;
  return (
    <th
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(COL_W, 'px-2 py-1.5 text-left text-xs font-semibold border-l border-border/50 bg-muted/30', isDragging && 'relative z-20 opacity-80 shadow-lg bg-muted')}
      data-col={name}
    >
      {children(handle)}
    </th>
  );
}

export default TaskTablePage;
