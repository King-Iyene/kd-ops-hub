import { useMemo, useState } from 'react';
import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor, useDraggable, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core';
import {
  addDays, addMonths, endOfDay, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, parseISO,
  startOfDay, startOfMonth, startOfWeek, subMonths,
} from 'date-fns';
import {
  ArrowDownUp, Calendar as CalendarIcon, Check, ChevronDown, ChevronLeft, ChevronRight, Columns3,
  Flag, GripVertical, List as ListIcon, Loader2, Repeat, Search,
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useToast } from '@/hooks/use-toast';
import { errorMessage } from '@/lib/db-errors';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  STATUS_META, TASK_STATUSES, PRIORITY_META, PRIORITY_FLAG, useMoveTasks, useUpdateTask,
  type PersonOption, type TaskListRow, type TaskPriority, type TaskRow, type TaskStatus,
} from '@/queries/useTaskModule';
import { PersonAvatar, StatusPill } from './pickers';
import { dueDateOf, dueLabel, isOverdue } from './taskDates';
import { useOpenTask } from './useOpenTask';
import { FilterButton } from './TaskFilters';
import { matchesFilters, planMove, sortTasks, type FilterCond, type SortBy, type SortDir } from './taskQuery';
import { NewTaskDialog } from './NewTaskDialog';

export type ViewKind = 'list' | 'board' | 'calendar';
const VIEW_KINDS: ViewKind[] = ['list', 'board', 'calendar'];
export type GroupBy = 'status' | 'due' | 'assignee' | 'priority' | 'none';

const GROUP_LABELS: Record<GroupBy, string> = { status: 'Status', due: 'Due date', assignee: 'Assignee', priority: 'Priority', none: 'None' };
const SORT_LABELS: Record<SortBy, string> = { manual: 'Manual order', due: 'Due date', priority: 'Priority', title: 'Name', created: 'Date created' };
// What "asc" and "desc" mean for each sort, in words people use.
const DIR_LABELS: Record<Exclude<SortBy, 'manual'>, [string, string]> = {
  due: ['Earliest first', 'Latest first'],
  priority: ['Highest first', 'Lowest first'],
  title: ['A to Z', 'Z to A'],
  created: ['Newest first', 'Oldest first'],
};
const PRIORITY_ORDER: (TaskPriority | null)[] = ['urgent', 'high', 'medium', 'low', null];

interface Prefs { view: ViewKind; group: GroupBy; sort: SortBy; dir: SortDir; showClosed: boolean }

// View, grouping, sort and "show closed" are remembered per page in this
// browser; search and filters reset each visit.
function loadPrefs(key: string, fallback: Prefs): Prefs {
  try {
    const raw = localStorage.getItem(`kdops.task.view.${key}`);
    const prefs: Prefs = raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
    // A view that no longer exists (the old Table view) falls back to List.
    return VIEW_KINDS.includes(prefs.view) ? prefs : { ...prefs, view: 'list' };
  } catch {
    return fallback;
  }
}
function savePrefs(key: string, prefs: Prefs) {
  try { localStorage.setItem(`kdops.task.view.${key}`, JSON.stringify(prefs)); } catch { /* not remembered */ }
}

interface Group { key: string; label: string; dot?: string; status?: TaskStatus; items: TaskRow[] }

export interface TaskViewsProps {
  /** Every task in scope. In a list this includes subtasks (they're counted on their parent, not listed). */
  tasks: TaskRow[];
  mode: 'list' | 'mine';
  people: PersonOption[];
  lists: TaskListRow[];
  prefsKey: string;
  defaultGroup: GroupBy;
  loading?: boolean;
  /** On a list page: the list "+ Add task" creates tasks in. */
  listId?: string;
}

export function TaskViews({ tasks, mode, people, lists, prefsKey, defaultGroup, loading, listId }: TaskViewsProps) {
  const { profile } = useAuthStore();
  const { open } = useOpenTask();
  const [prefs, setPrefsState] = useState<Prefs>(() => loadPrefs(prefsKey, { view: 'list', group: defaultGroup, sort: 'manual', dir: 'asc', showClosed: false }));
  const setPrefs = (patch: Partial<Prefs>) => setPrefsState((p) => { const next = { ...p, ...patch }; savePrefs(prefsKey, next); return next; });
  const [search, setSearch] = useState('');
  const [onlyMe, setOnlyMe] = useState(false);
  const [conds, setConds] = useState<FilterCond[]>([]);
  const [addingIn, setAddingIn] = useState<{ status?: TaskStatus } | null>(null);

  const peopleById = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const listNameById = useMemo(() => new Map(lists.map((l) => [l.id, l.name])), [lists]);

  const subtaskCounts = useMemo(() => {
    const m = new Map<string, { done: number; total: number }>();
    for (const t of tasks) {
      if (!t.parent_id) continue;
      const c = m.get(t.parent_id) ?? { done: 0, total: 0 };
      c.total += 1;
      if (t.status === 'done') c.done += 1;
      m.set(t.parent_id, c);
    }
    return m;
  }, [tasks]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = (mode === 'list' ? tasks.filter((t) => !t.parent_id) : tasks).filter((t) => {
      if (!prefs.showClosed && t.status === 'done') return false;
      if (q && !t.title.toLowerCase().includes(q)) return false;
      if (onlyMe && t.assignee_id !== profile?.id) return false;
      return matchesFilters(t, conds, profile?.id);
    });
    return sortTasks(rows, prefs.sort, prefs.dir);
  }, [tasks, mode, search, onlyMe, profile?.id, conds, prefs.showClosed, prefs.sort, prefs.dir]);

  const groups: Group[] = useMemo(() => {
    const g = prefs.group;
    if (g === 'none') return [{ key: 'all', label: 'All tasks', items: visible }];
    if (g === 'status') {
      return TASK_STATUSES
        .filter((s) => s !== 'done' || prefs.showClosed)
        .map((s) => ({ key: s, label: STATUS_META[s].label, dot: STATUS_META[s].dot, status: s, items: visible.filter((t) => t.status === s) }))
        // A list keeps every status group so each has "+ Add task"; elsewhere empty groups are noise.
        .filter((grp) => mode === 'list' || grp.items.length > 0);
    }
    if (g === 'priority') {
      return PRIORITY_ORDER.map((p) => ({
        key: p ?? 'none',
        label: p ? PRIORITY_META[p].label : 'No priority',
        items: visible.filter((t) => (t.priority ?? null) === p),
      })).filter((grp) => grp.items.length > 0);
    }
    if (g === 'assignee') {
      const ids = [...new Set(visible.map((t) => t.assignee_id ?? 'none'))];
      return ids
        .map((id) => ({ key: id, label: id === 'none' ? 'Unassigned' : peopleById.get(id)?.full_name ?? 'Unknown', items: visible.filter((t) => (t.assignee_id ?? 'none') === id) }))
        .sort((a, b) => (a.key === 'none' ? 1 : b.key === 'none' ? -1 : a.label.localeCompare(b.label)));
    }
    const today = startOfDay(new Date());
    const in7 = endOfDay(addDays(today, 7));
    const buckets: Group[] = [
      { key: 'overdue', label: 'Overdue', items: [] },
      { key: 'today', label: 'Today', items: [] },
      { key: 'next7', label: 'Next 7 days', items: [] },
      { key: 'later', label: 'Later', items: [] },
      { key: 'nodate', label: 'No due date', items: [] },
    ];
    for (const t of visible) {
      const due = dueDateOf(t);
      if (!due) buckets[4].items.push(t);
      else if (due < today) buckets[t.status === 'done' ? 3 : 0].items.push(t);
      else if (isSameDay(due, today)) buckets[1].items.push(t);
      else if (due <= in7) buckets[2].items.push(t);
      else buckets[3].items.push(t);
    }
    return buckets.filter((b) => b.items.length > 0);
  }, [visible, prefs.group, prefs.showClosed, mode, peopleById]);

  const toolBtn = 'h-8 text-xs gap-1.5';
  const rowProps = { mode, peopleById, listNameById, subtaskCounts, onOpen: open };
  // Rows can be dragged into place only where "manual order" means
  // something: inside one list, sorted manually, grouped by status or not at all.
  const canDrag = mode === 'list' && prefs.sort === 'manual' && (prefs.group === 'status' || prefs.group === 'none');
  const sortLabel = prefs.sort === 'manual' ? SORT_LABELS.manual : `${SORT_LABELS[prefs.sort]} · ${DIR_LABELS[prefs.sort][prefs.dir === 'asc' ? 0 : 1]}`;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5 flex-wrap">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search tasks" className="h-8 w-48 sm:w-56 pl-8 text-xs" />
        </div>

        <FilterButton conds={conds} onChange={setConds} className={toolBtn} ctx={{ mode, meId: profile?.id, people, lists, tasks }} />

        {prefs.view === 'list' && (
          <OptionMenu label={`Group: ${GROUP_LABELS[prefs.group]}`} options={GROUP_LABELS} value={prefs.group} onChange={(group) => setPrefs({ group })} className={toolBtn} />
        )}
        {prefs.view !== 'calendar' && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className={toolBtn}><ArrowDownUp className="h-3.5 w-3.5" /> Sort: {sortLabel}</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              {(Object.keys(SORT_LABELS) as SortBy[]).map((k) => (
                <DropdownMenuItem key={k} onClick={() => setPrefs({ sort: k })}>
                  <Check className={cn('h-3.5 w-3.5 mr-2', k === prefs.sort ? 'opacity-100' : 'opacity-0')} /> {SORT_LABELS[k]}
                </DropdownMenuItem>
              ))}
              {prefs.sort !== 'manual' && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-3xs uppercase tracking-wide text-muted-foreground">Order</DropdownMenuLabel>
                  {(['asc', 'desc'] as SortDir[]).map((d, i) => (
                    <DropdownMenuItem key={d} onClick={() => setPrefs({ dir: d })}>
                      <Check className={cn('h-3.5 w-3.5 mr-2', d === prefs.dir ? 'opacity-100' : 'opacity-0')} /> {DIR_LABELS[prefs.sort as Exclude<SortBy, 'manual'>][i]}
                    </DropdownMenuItem>
                  ))}
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {mode === 'list' && (
          <Button size="sm" variant={onlyMe ? 'secondary' : 'outline'} className={toolBtn} onClick={() => setOnlyMe((v) => !v)}>Me</Button>
        )}
        <Button size="sm" variant={prefs.showClosed ? 'secondary' : 'outline'} className={toolBtn} onClick={() => setPrefs({ showClosed: !prefs.showClosed })}>
          Show closed
        </Button>

        <div className="ml-auto flex items-center gap-0.5">
          {([['list', 'List', ListIcon], ['board', 'Board', Columns3], ['calendar', 'Calendar', CalendarIcon]] as const).map(([v, label, Icon]) => (
            <Button key={v} size="sm" variant={prefs.view === v ? 'secondary' : 'ghost'} className="h-7 px-2 text-2xs gap-1" onClick={() => setPrefs({ view: v })}>
              <Icon className="h-3.5 w-3.5" /> {label}
            </Button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="py-16 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : prefs.view === 'list' ? (
        <ListView
          groups={groups}
          {...rowProps}
          canDrag={canDrag}
          moveAcrossStatus={prefs.group === 'status'}
          onAdd={mode === 'list' && listId ? (status) => setAddingIn({ status }) : undefined}
        />
      ) : prefs.view === 'board' ? (
        <BoardView tasks={visible} showClosed={prefs.showClosed} {...rowProps} />
      ) : (
        <CalendarView tasks={visible} onOpen={open} />
      )}

      {!loading && visible.length === 0 && prefs.view === 'list' && !(mode === 'list' && prefs.group === 'status') && (
        <p className="text-sm text-muted-foreground text-center py-10">
          {tasks.length === 0 ? (mode === 'mine' ? 'Nothing is assigned to you yet.' : 'No tasks in this list yet.') : 'No tasks match.'}
        </p>
      )}

      {addingIn && listId && (
        <NewTaskDialog open onOpenChange={(o) => !o && setAddingIn(null)} initialListId={listId} initialStatus={addingIn.status ?? 'to_do'} />
      )}
    </div>
  );
}

function OptionMenu<T extends string>({ label, options, value, onChange, className }: {
  label: string; options: Record<T, string>; value: T; onChange: (v: T) => void; className?: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline" className={className}>{label}</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {(Object.keys(options) as T[]).map((k) => (
          <DropdownMenuItem key={k} onClick={() => onChange(k)}>
            <Check className={cn('h-3.5 w-3.5 mr-2', k === value ? 'opacity-100' : 'opacity-0')} /> {options[k]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface RowCtx {
  mode: 'list' | 'mine';
  peopleById: Map<string, PersonOption>;
  listNameById: Map<string, string>;
  subtaskCounts: Map<string, { done: number; total: number }>;
  onOpen: (id: string) => void;
}

function FlagIcon({ priority }: { priority: TaskPriority | null }) {
  return <Flag className={cn('h-3.5 w-3.5 shrink-0', priority ? PRIORITY_FLAG[priority] : 'text-muted-foreground/40')} />;
}

function DueCell({ task }: { task: TaskRow }) {
  if (!task.due_date) return <span className="w-16 shrink-0" />;
  return (
    <span className={cn('w-16 shrink-0 text-right text-2xs tabular-nums', isOverdue(task) ? 'text-destructive font-medium' : 'text-muted-foreground')}>
      {dueLabel(task.due_date)}
    </span>
  );
}

function TaskLine({ task, mode, peopleById, listNameById, subtaskCounts, onOpen, handle }: RowCtx & { task: TaskRow; handle?: React.ReactNode }) {
  const done = task.status === 'done';
  const sub = subtaskCounts.get(task.id);
  const assignee = task.assignee_id ? peopleById.get(task.assignee_id) : undefined;
  return (
    <div className="group/row relative flex items-center border-b border-border/40 hover:bg-muted/30 kd-transition">
      {handle}
      <button
        type="button"
        onClick={() => onOpen(task.id)}
        className="flex-1 min-w-0 flex items-center gap-2.5 px-3 py-1.5 text-left"
      >
        <FlagIcon priority={task.priority} />
        {mode === 'mine' ? <StatusPill status={task.status} /> : <span className={cn('h-2 w-2 rounded-full shrink-0', STATUS_META[task.status].dot)} />}
        <span className={cn('min-w-0 truncate text-sm', done && 'line-through text-muted-foreground')}>{task.title}</span>
        {task.recurrence && <Repeat className="h-3 w-3 shrink-0 text-muted-foreground" aria-label="Repeats" />}
        {sub && <span className="text-2xs text-muted-foreground shrink-0 tabular-nums">{sub.done}/{sub.total}</span>}
        {mode === 'mine' && listNameById.get(task.list_id) && (
          <span className="text-2xs text-primary/80 shrink-0 truncate max-w-[30%]">{listNameById.get(task.list_id)}</span>
        )}
        <span className="flex-1" />
        <DueCell task={task} />
        <span className="w-6 shrink-0 flex justify-end">{assignee && <PersonAvatar person={assignee} size={20} />}</span>
      </button>
    </div>
  );
}

// One row that can be picked up by its grip and dropped onto (= placed before).
function DraggableLine({ task, ...ctx }: RowCtx & { task: TaskRow }) {
  const drag = useDraggable({ id: task.id });
  const drop = useDroppable({ id: `row:${task.id}` });
  return (
    <div
      ref={(el) => { drag.setNodeRef(el); drop.setNodeRef(el); }}
      data-task-row={task.id}
      className={cn('relative', drag.isDragging && 'opacity-40')}
    >
      {drop.isOver && !drag.isDragging && <span className="absolute inset-x-0 -top-px h-0.5 bg-primary z-10" />}
      <TaskLine
        task={task}
        {...ctx}
        handle={
          <button
            type="button"
            {...drag.listeners}
            {...drag.attributes}
            aria-label={`Drag to move ${task.title}`}
            className="absolute -left-4 top-1/2 -translate-y-1/2 p-0.5 text-muted-foreground/60 opacity-0 group-hover/row:opacity-100 focus:opacity-100 cursor-grab touch-none"
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>
        }
      />
    </div>
  );
}

function GroupEnd({ groupKey, children, active }: { groupKey: string; children?: React.ReactNode; active: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: `end:${groupKey}`, disabled: !active });
  return (
    <div ref={setNodeRef} className={cn('min-h-[6px]', isOver && 'border-t-2 border-primary')}>
      {children}
    </div>
  );
}

function ListView({ groups, canDrag, moveAcrossStatus, onAdd, ...ctx }: RowCtx & {
  groups: Group[];
  canDrag: boolean;
  moveAcrossStatus: boolean;
  onAdd?: (status?: TaskStatus) => void;
}) {
  const { toast } = useToast();
  const moveTasks = useMoveTasks();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [dragging, setDragging] = useState<TaskRow | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor));

  const findTask = (id: string) => groups.flatMap((g) => g.items).find((t) => t.id === id);

  const onDragEnd = (e: DragEndEvent) => {
    setDragging(null);
    const task = findTask(String(e.active.id));
    const overId = e.over ? String(e.over.id) : '';
    if (!task || !overId || overId === `row:${task.id}`) return;
    const target = overId.startsWith('end:')
      ? groups.find((g) => g.key === overId.slice(4))
      : groups.find((g) => g.items.some((t) => `row:${t.id}` === overId));
    if (!target) return;
    const sameGroup = target.items.some((t) => t.id === task.id);
    if (!sameGroup && !moveAcrossStatus) return;
    const items = target.items.filter((t) => t.id !== task.id);
    const at = overId.startsWith('end:') ? items.length : items.findIndex((t) => `row:${t.id}` === overId);
    const moves = planMove(items, task, at, moveAcrossStatus && target.status !== task.status ? target.status : undefined);
    moveTasks.mutate(moves, {
      onSuccess: () => {
        if (moves.some((m) => m.status === 'done' && m.task.status !== 'done' && m.task.recurrence)) {
          toast({ title: 'Completed — the next one has been created' });
        }
      },
      onError: (err) => toast({ title: 'Could not move task', description: errorMessage(err), variant: 'destructive' }),
    });
  };

  const body = (
    <div className={cn('space-y-1', canDrag && 'pl-4')}>
      {groups.map((g) => {
        const isCollapsed = collapsed.has(g.key);
        return (
          <section key={g.key} data-group={g.key}>
            <button
              type="button"
              onClick={() => setCollapsed((prev) => { const n = new Set(prev); if (n.has(g.key)) n.delete(g.key); else n.add(g.key); return n; })}
              className="flex items-center gap-2 py-2 text-left"
            >
              <ChevronDown className={cn('h-3.5 w-3.5 text-muted-foreground transition-transform', isCollapsed && '-rotate-90')} />
              {g.dot && <span className={cn('h-2 w-2 rounded-full', g.dot)} />}
              <span className="text-xs font-bold uppercase tracking-wide">{g.label}</span>
              <span className="text-2xs text-muted-foreground tabular-nums">{g.items.length}</span>
            </button>
            {!isCollapsed && (
              <div className="border-t border-border/40">
                {g.items.map((t) => (canDrag ? <DraggableLine key={t.id} task={t} {...ctx} /> : <TaskLine key={t.id} task={t} {...ctx} />))}
                <GroupEnd groupKey={g.key} active={canDrag}>
                  {onAdd && (
                    <button type="button" onClick={() => onAdd(g.status)} className="w-full text-left px-3 py-1.5 text-2xs text-muted-foreground hover:text-foreground hover:bg-muted/20">
                      + Add task
                    </button>
                  )}
                </GroupEnd>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );

  if (!canDrag) return body;
  return (
    <DndContext
      sensors={sensors}
      onDragStart={(e: DragStartEvent) => setDragging(findTask(String(e.active.id)) ?? null)}
      onDragEnd={onDragEnd}
      onDragCancel={() => setDragging(null)}
    >
      {body}
      <DragOverlay dropAnimation={null}>
        {dragging && (
          <div className="rounded-md border border-primary/50 bg-card shadow-lg px-3 py-1.5 text-sm truncate max-w-xl">{dragging.title}</div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

// The board is always one column per status; dragging a card to another
// column changes the task's status.
function BoardView({ tasks, showClosed, mode, peopleById, listNameById, subtaskCounts, onOpen }: RowCtx & { tasks: TaskRow[]; showClosed: boolean }) {
  const { toast } = useToast();
  const updateTask = useUpdateTask();
  const [dragging, setDragging] = useState<TaskRow | null>(null);
  const sensors = useSensors(
    // A small move threshold keeps a plain click opening the task.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );
  const ctx = { mode, peopleById, listNameById, subtaskCounts, onOpen };

  const onDragStart = (e: DragStartEvent) => setDragging(tasks.find((t) => t.id === e.active.id) ?? null);
  const onDragEnd = (e: DragEndEvent) => {
    setDragging(null);
    const task = tasks.find((t) => t.id === e.active.id);
    const status = e.over?.id as TaskStatus | undefined;
    if (!task || !status || status === task.status) return;
    updateTask.mutate({ task, patch: { status } }, {
      onSuccess: () => { if (status === 'done' && task.recurrence) toast({ title: 'Completed — the next one has been created' }); },
      onError: (err) => toast({ title: 'Could not move task', description: errorMessage(err), variant: 'destructive' }),
    });
  };

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {TASK_STATUSES.map((s) => (
          <BoardColumn key={s} status={s} hiddenNote={s === 'done' && !showClosed}>
            {tasks.filter((t) => t.status === s).map((t) => <BoardCard key={t.id} task={t} {...ctx} />)}
          </BoardColumn>
        ))}
      </div>
      <DragOverlay dropAnimation={null}>
        {dragging && <CardBody task={dragging} {...ctx} className="shadow-lg rotate-1 cursor-grabbing" />}
      </DragOverlay>
    </DndContext>
  );
}

function BoardColumn({ status, hiddenNote, children }: { status: TaskStatus; hiddenNote: boolean; children: React.ReactNode[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <div
      ref={setNodeRef}
      data-status={status}
      className={cn('flex-1 min-w-[220px] rounded-lg bg-muted/30 p-2 flex flex-col min-h-[140px] kd-transition', isOver && 'ring-2 ring-primary/50 bg-primary/5')}
    >
      <div className="flex items-center gap-2 px-1 pb-2">
        <span className={cn('h-2 w-2 rounded-full', STATUS_META[status].dot)} />
        <span className="text-xs font-bold uppercase tracking-wide">{STATUS_META[status].label}</span>
        {!hiddenNote && <span className="text-2xs text-muted-foreground">{children.length}</span>}
      </div>
      <div className="space-y-2 flex-1">
        {children}
        {hiddenNote && (
          <p className="text-2xs text-muted-foreground px-1 py-2">Drop here to complete. Turn on "Show closed" to see completed tasks.</p>
        )}
      </div>
    </div>
  );
}

function BoardCard({ task, ...ctx }: RowCtx & { task: TaskRow }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id });
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} className={cn('touch-none', isDragging && 'opacity-40')}>
      <CardBody task={task} {...ctx} />
    </div>
  );
}

function CardBody({ task, mode, peopleById, listNameById, subtaskCounts, onOpen, className }: RowCtx & { task: TaskRow; className?: string }) {
  const sub = subtaskCounts.get(task.id);
  const assignee = task.assignee_id ? peopleById.get(task.assignee_id) : undefined;
  return (
    <button
      type="button"
      onClick={() => onOpen(task.id)}
      className={cn('w-full text-left rounded-md border border-border/70 bg-card p-2.5 hover:border-primary/50 kd-transition space-y-2 cursor-grab', className)}
    >
      <p className={cn('text-sm font-medium line-clamp-2', task.status === 'done' && 'line-through text-muted-foreground')}>
        {task.recurrence && <Repeat className="inline h-3 w-3 mr-1 -mt-0.5 text-muted-foreground" aria-label="Repeats" />}{task.title}
      </p>
      {mode === 'mine' && listNameById.get(task.list_id) && (
        <p className="text-2xs text-primary/80 truncate">{listNameById.get(task.list_id)}</p>
      )}
      <div className="flex items-center gap-2">
        <FlagIcon priority={task.priority} />
        {task.due_date && <span className={cn('text-2xs', isOverdue(task) ? 'text-destructive' : 'text-muted-foreground')}>{dueLabel(task.due_date)}</span>}
        {sub && <span className="text-2xs text-muted-foreground">{sub.done}/{sub.total}</span>}
        <span className="flex-1" />
        {assignee && <PersonAvatar person={assignee} size={18} />}
      </div>
    </button>
  );
}

function CalendarView({ tasks, onOpen }: { tasks: TaskRow[]; onOpen: (id: string) => void }) {
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
  const end = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
  const days: Date[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);
  const today = new Date();
  const undated = tasks.filter((t) => !t.due_date).length;
  return (
    <div className="rounded-lg border border-border/70 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border/70">
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setMonth((m) => subMonths(m, 1))} aria-label="Previous month"><ChevronLeft className="h-4 w-4" /></Button>
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setMonth((m) => addMonths(m, 1))} aria-label="Next month"><ChevronRight className="h-4 w-4" /></Button>
        <span className="text-sm font-semibold">{format(month, 'MMMM yyyy')}</span>
        <Button size="sm" variant="outline" className="h-7 text-2xs ml-1" onClick={() => setMonth(startOfMonth(new Date()))}>Today</Button>
        {undated > 0 && <span className="ml-auto text-2xs text-muted-foreground">{undated} without a due date not shown</span>}
      </div>
      <div className="grid grid-cols-7 text-3xs font-bold uppercase tracking-wide text-muted-foreground border-b border-border/70">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <div key={d} className="px-2 py-1.5">{d}</div>)}
      </div>
      <div className="grid grid-cols-7">
        {days.map((day) => {
          const items = tasks.filter((t) => t.due_date && isSameDay(parseISO(t.due_date), day));
          return (
            <div key={day.toISOString()} className={cn('min-h-[96px] border-r border-b border-border/50 p-1', !isSameMonth(day, month) && 'bg-muted/20')}>
              <div className={cn('text-2xs px-1 mb-1', isSameDay(day, today) ? 'text-primary font-bold' : isSameMonth(day, month) ? 'text-muted-foreground' : 'text-muted-foreground/50')}>
                {format(day, 'd')}
              </div>
              <div className="space-y-0.5">
                {items.slice(0, 3).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    title={t.title}
                    onClick={() => onOpen(t.id)}
                    className={cn('w-full flex items-center gap-1 rounded px-1 py-0.5 text-left text-2xs bg-card border border-border/60 hover:border-primary/50', t.status === 'done' && 'line-through text-muted-foreground')}
                  >
                    <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', STATUS_META[t.status].dot)} />
                    <span className="truncate">{t.title}</span>
                  </button>
                ))}
                {items.length > 3 && <p className="text-3xs text-muted-foreground px-1">+{items.length - 3} more</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
