import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { DndContext, type DragEndEvent } from '@dnd-kit/core';
import { ChevronRight, Loader2, Search, User } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Toggle } from '@/components/ui/toggle';
import { ToastAction } from '@/components/ui/toast';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store/authStore';
import { EmptyState } from '../components/EmptyState';
import { ToolbarMenu, type ToolbarOption } from '../components/Toolbar';
import { ViewTabs } from '../components/ViewTabs';
import { TaskGroupSection } from '../tasks/TaskGroupSection';
import { BoardView, type BoardGroupBy } from '../tasks/BoardView';
import { CalendarView } from '../tasks/CalendarView';
import { TaskTableView } from '../tasks/TaskTableView';
import { BulkBar } from '../tasks/BulkBar';
import { CreateViewDialog } from '../tasks/CreateViewDialog';
import { groupTasks, type ListGroupBy } from '../tasks/grouping';
import { sortTasks, type SortBy } from '../tasks/sorting';
import { FilterButton } from '../filter/FilterButton';
import { TASK_FILTER_FIELDS } from '../filter/fields';
import { matchesFilter, type FilterableTask } from '../filter/evaluate';
import type { FilterTree } from '../filter/types';
import { useList, useLists } from '../api/lists';
import { useSpace } from '../api/spaces';
import { useStatuses } from '../api/statuses';
import { useVisiblePeople } from '../api/people';
import { useTaskListRealtime } from '../api/realtime';
import { useViews, type TaskViewConfig } from '../api/views';
import {
  useArchiveTask,
  useCreateTask,
  useSetTaskAssignees,
  useTasksForList,
  useUpdateTask,
  type TaskPriority,
} from '../api/tasks';

const LIST_GROUP_OPTIONS: ToolbarOption<ListGroupBy>[] = [
  { value: 'status', label: 'Status' },
  { value: 'assignee', label: 'Assignee' },
  { value: 'priority', label: 'Priority' },
  { value: 'due_date', label: 'Due date' },
];
const BOARD_GROUP_OPTIONS: ToolbarOption<BoardGroupBy>[] = [
  { value: 'status', label: 'Status' },
  { value: 'assignee', label: 'Assignee' },
  { value: 'priority', label: 'Priority' },
];
const SORT_OPTIONS: ToolbarOption<SortBy>[] = [
  { value: 'manual', label: 'Manual order' },
  { value: 'due_date', label: 'Due date' },
  { value: 'priority', label: 'Priority' },
  { value: 'created_at', label: 'Created' },
  { value: 'title', label: 'Title' },
];

export default function ListPage() {
  const { listId } = useParams<{ listId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const qc = useQueryClient();
  const userId = useAuthStore((s) => s.user?.id);

  const { data: list, isLoading: listLoading } = useList(listId);
  const { data: space } = useSpace(list?.space_id);
  const { data: statuses } = useStatuses(list?.space_id);
  const { data: tasks, isLoading: tasksLoading } = useTasksForList(listId);
  const { data: views } = useViews('list', listId);
  const { data: people } = useVisiblePeople();
  const { data: spaceLists } = useLists(list?.space_id);

  useTaskListRealtime(listId);

  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const archiveTask = useArchiveTask();
  const setAssignees = useSetTaskAssignees();

  const [activeViewId, setActiveViewId] = useState<string>();
  const [createViewOpen, setCreateViewOpen] = useState(false);

  const [filterTree, setFilterTree] = useState<FilterTree>([]);
  const [groupBy, setGroupBy] = useState<ListGroupBy>('status');
  const [boardGroupBy, setBoardGroupBy] = useState<BoardGroupBy>('status');
  const [sortBy, setSortBy] = useState<SortBy>('manual');
  const [search, setSearch] = useState('');
  const [meOnly, setMeOnly] = useState(false);
  const [showClosed, setShowClosed] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const activeView = views?.find((v) => v.id === activeViewId);

  useEffect(() => {
    if (!activeViewId && views && views.length > 0) {
      setActiveViewId((views.find((v) => v.type === 'list') ?? views[0]).id);
    }
  }, [views, activeViewId]);

  useEffect(() => {
    if (!activeView) return;
    const cfg = (activeView.config ?? {}) as Partial<TaskViewConfig>;
    setFilterTree(cfg.filter ?? []);
    setGroupBy((cfg.groupBy as ListGroupBy) ?? 'status');
    setBoardGroupBy((cfg.groupBy as BoardGroupBy) ?? 'status');
    setSortBy(cfg.sortBy ?? 'manual');
    setMeOnly(cfg.meOnly ?? false);
    setShowClosed(cfg.showClosed ?? false);
    setSelected(new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeView?.id]);

  const statusesById = useMemo(() => new Map((statuses ?? []).map((s) => [s.id, s])), [statuses]);
  const peopleOptions = useMemo(() => (people ?? []).map((p) => ({ value: p.id, label: p.full_name })), [people]);
  const statusOptions = useMemo(() => (statuses ?? []).map((s) => ({ value: s.id, label: s.name })), [statuses]);

  const filtered = useMemo(() => {
    if (!tasks) return [];
    const ctx = { now: new Date(), viewerId: userId };
    const q = search.trim().toLowerCase();
    return tasks.filter((t) => {
      if (q && !t.title.toLowerCase().includes(q) && !(t.description_text ?? '').toLowerCase().includes(q)) return false;
      if (meOnly && !t.assignees.some((a) => a.user_id === userId)) return false;
      if (!showClosed) {
        const st = t.status_id ? statusesById.get(t.status_id) : undefined;
        if (st && (st.category === 'done' || st.category === 'closed')) return false;
      }
      if (filterTree.length > 0) {
        const record: FilterableTask = {
          title: t.title,
          status: t.status_id,
          priority: t.priority,
          assignees: t.assignees.map((a) => a.user_id),
          due_date: t.due_date,
          start_date: t.start_date,
          created_at: t.created_at,
        };
        if (!matchesFilter(record, filterTree, ctx)) return false;
      }
      return true;
    });
  }, [tasks, search, meOnly, showClosed, filterTree, statusesById, userId]);

  const sorted = useMemo(() => sortTasks(filtered, sortBy), [filtered, sortBy]);
  const { groups, byGroup } = useMemo(
    () => groupTasks(sorted, groupBy, statuses ?? [], new Date()),
    [sorted, groupBy, statuses],
  );

  const selectedTasks = useMemo(() => (tasks ?? []).filter((t) => selected.has(t.id)), [tasks, selected]);
  const toggleSelect = (id: string) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || !listId || groupBy !== 'status') return;
    const task = tasks?.find((t) => t.id === active.id);
    const newStatusId = over.id as string;
    if (!task || task.status_id === newStatusId) return;
    updateTask.mutate({ id: task.id, listId, patch: { status_id: newStatusId } });
  };

  const handleAddTask = (group: { key: string }, title: string) => {
    if (!listId || !userId) return;
    const base = {
      listId,
      title,
      priority: 'normal' as TaskPriority,
      dueDate: null,
      dueHasTime: false,
      assigneeIds: [] as string[],
      createdBy: userId,
    };
    if (groupBy === 'assignee' && group.key !== 'unassigned') {
      createTask.mutate({ ...base, statusId: [...statusesById.values()].sort((a, b) => a.position - b.position)[0]?.id ?? null, assigneeIds: [group.key] });
    } else if (groupBy === 'priority') {
      createTask.mutate({ ...base, statusId: [...statusesById.values()].sort((a, b) => a.position - b.position)[0]?.id ?? null, priority: group.key as TaskPriority });
    } else if (groupBy === 'status') {
      createTask.mutate({ ...base, statusId: group.key });
    } else {
      createTask.mutate({ ...base, statusId: [...statusesById.values()].sort((a, b) => a.position - b.position)[0]?.id ?? null });
    }
  };

  const handleBoardMove = (taskId: string, columnKey: string) => {
    if (!listId) return;
    const task = tasks?.find((t) => t.id === taskId);
    if (!task) return;
    if (boardGroupBy === 'status') {
      if (task.status_id !== columnKey) updateTask.mutate({ id: taskId, listId, patch: { status_id: columnKey } });
    } else if (boardGroupBy === 'priority') {
      if (task.priority !== columnKey) updateTask.mutate({ id: taskId, listId, patch: { priority: columnKey } });
    } else if (boardGroupBy === 'assignee' && userId) {
      const currentIds = task.assignees.map((a) => a.user_id);
      const remove = currentIds.filter((id) => id !== columnKey);
      const add = columnKey === 'unassigned' || currentIds.includes(columnKey) ? [] : [columnKey];
      if (remove.length > 0 || add.length > 0) {
        setAssignees.mutate({ taskId, listId, add, remove, assignedBy: userId });
      }
    }
  };

  const handleReschedule = (taskId: string, date: string) => {
    if (!listId) return;
    updateTask.mutate({ id: taskId, listId, patch: { due_date: date } });
  };

  const handleTableUpdate = (taskId: string, patch: Record<string, unknown>) => {
    if (!listId) return;
    updateTask.mutate({ id: taskId, listId, patch });
  };

  const bulkChangeStatus = (statusId: string) => {
    if (!listId) return;
    for (const t of selectedTasks) updateTask.mutate({ id: t.id, listId, patch: { status_id: statusId } });
  };
  const bulkChangePriority = (priority: TaskPriority) => {
    if (!listId) return;
    for (const t of selectedTasks) updateTask.mutate({ id: t.id, listId, patch: { priority } });
  };
  const bulkChangeDueDate = (date: string | null) => {
    if (!listId) return;
    for (const t of selectedTasks) updateTask.mutate({ id: t.id, listId, patch: { due_date: date } });
  };
  const bulkAddAssignee = (addUserId: string) => {
    if (!listId || !userId) return;
    for (const t of selectedTasks) setAssignees.mutate({ taskId: t.id, listId, add: [addUserId], remove: [], assignedBy: userId });
  };
  const bulkMove = (targetListId: string) => {
    if (!listId) return;
    for (const t of selectedTasks) updateTask.mutate({ id: t.id, listId, patch: { list_id: targetListId } });
    qc.invalidateQueries({ queryKey: ['tk', 'list', targetListId, 'tasks'] });
    setSelected(new Set());
  };
  const bulkArchive = () => {
    if (!listId) return;
    const ids = selectedTasks.map((t) => t.id);
    for (const id of ids) archiveTask.mutate({ id, listId, archived: true });
    setSelected(new Set());
    toast({
      title: `${ids.length} task${ids.length === 1 ? '' : 's'} archived`,
      duration: 8000,
      action: (
        <ToastAction altText="Undo" onClick={() => { for (const id of ids) archiveTask.mutate({ id, listId, archived: false }); }}>
          Undo
        </ToastAction>
      ),
    });
  };

  if (listLoading || tasksLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!list || !space) {
    return <EmptyState title="Not found" description="This list does not exist, or you do not have access to it." />;
  }

  const viewType = activeView?.type ?? 'list';
  const showGroupMenu = viewType === 'list' || viewType === 'board';
  const showSortMenu = viewType === 'list' || viewType === 'board' || viewType === 'table';

  return (
    <div className="max-w-6xl mx-auto flex flex-col h-full relative">
      <div className="flex items-center justify-between gap-3 mb-3 shrink-0">
        <div className="flex items-center gap-1 text-sm font-semibold text-foreground min-w-0">
          <span className="truncate">{space.name}</span>
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="truncate">{list.name}</span>
        </div>
        {views && (
          <ViewTabs views={views} activeId={activeViewId} onSelect={setActiveViewId} onCreate={() => setCreateViewOpen(true)} />
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4 shrink-0">
        <div className="relative flex-1 min-w-[160px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search tasks" className="h-8 pl-8 text-xs" />
        </div>
        <FilterButton tree={filterTree} onChange={setFilterTree} fields={TASK_FILTER_FIELDS} statusOptions={statusOptions} peopleOptions={peopleOptions} />
        {showGroupMenu && viewType === 'list' && (
          <ToolbarMenu prefix="Group" value={groupBy} options={LIST_GROUP_OPTIONS} onChange={setGroupBy} />
        )}
        {showGroupMenu && viewType === 'board' && (
          <ToolbarMenu prefix="Group" value={boardGroupBy} options={BOARD_GROUP_OPTIONS} onChange={setBoardGroupBy} />
        )}
        {showSortMenu && <ToolbarMenu prefix="Sort" value={sortBy} options={SORT_OPTIONS} onChange={setSortBy} />}
        <Toggle pressed={meOnly} onPressedChange={setMeOnly} size="sm" className="h-8 text-2xs gap-1.5">
          <User className="h-3 w-3" /> Me
        </Toggle>
        <Toggle pressed={showClosed} onPressedChange={setShowClosed} size="sm" className="h-8 text-2xs">
          Show closed
        </Toggle>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        {viewType === 'list' && (
          <div className="flex-1 overflow-y-auto">
            <DndContext onDragEnd={handleDragEnd}>
              {groups.map((g) => (
                <TaskGroupSection
                  key={g.key}
                  group={g}
                  tasks={byGroup.get(g.key) ?? []}
                  statusesById={statusesById}
                  collapsed={!!collapsed[g.key]}
                  selectedIds={selected}
                  droppable={groupBy === 'status'}
                  onToggleCollapse={() => setCollapsed((prev) => ({ ...prev, [g.key]: !prev[g.key] }))}
                  onToggleSelect={toggleSelect}
                  onOpenTask={(taskId) => navigate(`/task/t/${taskId}`)}
                  onAddTask={(title) => handleAddTask(g, title)}
                />
              ))}
            </DndContext>
            {groups.length === 0 && <EmptyState title="No statuses yet." description="This space has no statuses to group tasks by." />}
          </div>
        )}

        {viewType === 'board' && (
          <BoardView
            tasks={sorted}
            statuses={statuses ?? []}
            groupBy={boardGroupBy}
            onOpenTask={(id) => navigate(`/task/t/${id}`)}
            onAddTask={(columnKey, title) => handleAddTask({ key: columnKey }, title)}
            onMoveTask={handleBoardMove}
          />
        )}

        {viewType === 'calendar' && (
          <CalendarView tasks={sorted} onOpenTask={(id) => navigate(`/task/t/${id}`)} onReschedule={handleReschedule} />
        )}

        {viewType === 'table' && (
          <TaskTableView
            tasks={sorted}
            statuses={statuses ?? []}
            onOpenTask={(id) => navigate(`/task/t/${id}`)}
            onUpdateTask={handleTableUpdate}
          />
        )}
      </div>

      <BulkBar
        selected={selectedTasks}
        statuses={statuses ?? []}
        people={people ?? []}
        sameSpaceLists={(spaceLists ?? []).filter((l) => l.id !== listId)}
        spanningMultipleSpaces={false}
        onChangeStatus={bulkChangeStatus}
        onChangePriority={bulkChangePriority}
        onChangeDueDate={bulkChangeDueDate}
        onAddAssignee={bulkAddAssignee}
        onMove={bulkMove}
        onArchive={bulkArchive}
        onClear={() => setSelected(new Set())}
      />

      {listId && (
        <CreateViewDialog
          listId={listId}
          position={(views?.length ?? 0)}
          currentConfig={{ filter: filterTree, groupBy: viewType === 'board' ? boardGroupBy : groupBy, sortBy, meOnly, showClosed }}
          open={createViewOpen}
          onOpenChange={setCreateViewOpen}
          onCreated={setActiveViewId}
        />
      )}
    </div>
  );
}
