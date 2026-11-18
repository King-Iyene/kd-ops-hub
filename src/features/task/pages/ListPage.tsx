import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { DndContext, type DragEndEvent } from '@dnd-kit/core';
import { ChevronRight, Loader2, Search, User } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Toggle } from '@/components/ui/toggle';
import { useAuthStore } from '@/store/authStore';
import { EmptyState } from '../components/EmptyState';
import { TaskGroupSection } from '../tasks/TaskGroupSection';
import { useList } from '../api/lists';
import { useSpace } from '../api/spaces';
import { useStatuses } from '../api/statuses';
import { useCreateTask, useTasksForList, useUpdateTask } from '../api/tasks';

export default function ListPage() {
  const { listId } = useParams<{ listId: string }>();
  const navigate = useNavigate();
  const userId = useAuthStore((s) => s.user?.id);

  const { data: list, isLoading: listLoading } = useList(listId);
  const { data: space } = useSpace(list?.space_id);
  const { data: statuses } = useStatuses(list?.space_id);
  const { data: tasks, isLoading: tasksLoading } = useTasksForList(listId);
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();

  const [search, setSearch] = useState('');
  const [meOnly, setMeOnly] = useState(false);
  const [showClosed, setShowClosed] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const filtered = useMemo(() => {
    if (!tasks) return [];
    const q = search.trim().toLowerCase();
    return tasks.filter((t) => {
      if (q && !t.title.toLowerCase().includes(q) && !(t.description_text ?? '').toLowerCase().includes(q)) return false;
      if (meOnly && !t.assignees.some((a) => a.user_id === userId)) return false;
      return true;
    });
  }, [tasks, search, meOnly, userId]);

  const orderedStatuses = useMemo(() => {
    const all = [...(statuses ?? [])].sort((a, b) => a.position - b.position);
    if (showClosed) return all;
    return all.filter((s) => s.category !== 'done' && s.category !== 'closed');
  }, [statuses, showClosed]);

  const tasksByStatus = useMemo(() => {
    const map = new Map<string, typeof filtered>();
    for (const status of orderedStatuses) map.set(status.id, []);
    for (const task of filtered) {
      if (!task.status_id) continue;
      const bucket = map.get(task.status_id);
      if (bucket) bucket.push(task);
    }
    return map;
  }, [filtered, orderedStatuses]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || !listId) return;
    const task = tasks?.find((t) => t.id === active.id);
    const newStatusId = over.id as string;
    if (!task || task.status_id === newStatusId) return;
    updateTask.mutate({ id: task.id, listId, patch: { status_id: newStatusId } });
  };

  const handleAddTask = (statusId: string, title: string) => {
    if (!listId || !userId) return;
    createTask.mutate({
      listId,
      title,
      statusId,
      priority: 'normal',
      dueDate: null,
      dueHasTime: false,
      assigneeIds: [],
      createdBy: userId,
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

  return (
    <div className="max-w-5xl mx-auto flex flex-col h-full">
      {/* Content header */}
      <div className="flex items-center justify-between gap-3 mb-3 shrink-0">
        <div className="flex items-center gap-1 text-sm font-semibold text-foreground min-w-0">
          <span className="truncate">{space.name}</span>
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="truncate">{list.name}</span>
        </div>
        {/* Only "List" is built this phase — Board/Calendar/Table and +View arrive in Phase 4. */}
        <div className="flex items-center rounded-lg border border-border bg-muted/30 p-0.5">
          <span className="px-3 py-1 rounded-md text-xs font-medium bg-background shadow-sm text-foreground">List</span>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 mb-4 shrink-0">
        <div className="relative flex-1 min-w-[160px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tasks"
            className="h-8 pl-8 text-xs"
          />
        </div>
        <span className="h-8 inline-flex items-center rounded-md border border-border px-2.5 text-2xs font-medium text-muted-foreground">
          Group: Status
        </span>
        <span className="h-8 inline-flex items-center rounded-md border border-border px-2.5 text-2xs font-medium text-muted-foreground">
          Sort: Manual order
        </span>
        <Toggle pressed={meOnly} onPressedChange={setMeOnly} size="sm" className="h-8 text-2xs gap-1.5">
          <User className="h-3 w-3" /> Me
        </Toggle>
        <Toggle pressed={showClosed} onPressedChange={setShowClosed} size="sm" className="h-8 text-2xs">
          Show closed
        </Toggle>
      </div>

      {/* List view */}
      <div className="flex-1 overflow-y-auto">
        <DndContext onDragEnd={handleDragEnd}>
          {orderedStatuses.map((status) => (
            <TaskGroupSection
              key={status.id}
              status={status}
              tasks={tasksByStatus.get(status.id) ?? []}
              collapsed={!!collapsed[status.id]}
              onToggleCollapse={() => setCollapsed((prev) => ({ ...prev, [status.id]: !prev[status.id] }))}
              onOpenTask={(taskId) => navigate(`/task/t/${taskId}`)}
              onAddTask={(title) => handleAddTask(status.id, title)}
            />
          ))}
        </DndContext>
        {orderedStatuses.length === 0 && (
          <EmptyState title="No statuses yet." description="This space has no statuses to group tasks by." />
        )}
      </div>
    </div>
  );
}
