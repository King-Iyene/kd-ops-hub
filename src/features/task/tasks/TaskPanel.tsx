import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Archive,
  ArchiveRestore,
  ChevronRight,
  Copy,
  Eye,
  EyeOff,
  Loader2,
  MoreHorizontal,
  Move,
  Trash2,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import { confirm } from '@/hooks/use-confirm';
import { ToastAction } from '@/components/ui/toast';
import { useAuthStore } from '@/store/authStore';
import { EmptyState } from '../components/EmptyState';
import { StatusPill } from '../components/StatusPill';
import { PriorityFlag } from '../components/PriorityFlag';
import { AvatarStack } from '../components/AvatarStack';
import { TaskDatePicker } from '../components/TaskDatePicker';
import { PeoplePicker } from '../components/PeoplePicker';
import { RichTextEditor } from '../components/RichTextEditor';
import { CommentsActivityFeed } from './CommentsActivityFeed';
import { MoveTaskDialog } from './MoveTaskDialog';
import { useList } from '../api/lists';
import { useSpace } from '../api/spaces';
import { useStatuses } from '../api/statuses';
import { useVisiblePeople } from '../api/people';
import { useTaskEntityRealtime } from '../api/realtime';
import {
  useArchiveTask,
  useDeleteTask,
  useDuplicateTask,
  useIsWatching,
  useSetTaskAssignees,
  useTask,
  useToggleWatch,
  useUpdateTask,
  type TaskPriority,
} from '../api/tasks';

export function TaskPanel({ taskId, onClose }: { taskId: string; onClose: () => void }) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const userId = useAuthStore((s) => s.user?.id);

  const { data: task, isLoading } = useTask(taskId);
  const { data: list } = useList(task?.list_id);
  const { data: space } = useSpace(list?.space_id);
  const { data: statuses } = useStatuses(space?.id);
  const { data: people } = useVisiblePeople();
  const { data: watching } = useIsWatching(taskId, userId);

  useTaskEntityRealtime('task', taskId);

  const updateTask = useUpdateTask();
  const archiveTask = useArchiveTask();
  const deleteTask = useDeleteTask();
  const duplicateTask = useDuplicateTask();
  const setAssignees = useSetTaskAssignees();
  const toggleWatch = useToggleWatch();

  const [titleDraft, setTitleDraft] = useState('');
  const [moveOpen, setMoveOpen] = useState(false);

  const descPending = useRef<{ json: unknown; text: string } | null>(null);
  const descTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    setTitleDraft(task?.title ?? '');
  }, [task?.id, task?.title]);

  const flushDescription = () => {
    if (!descPending.current || !task) return;
    const { json, text } = descPending.current;
    descPending.current = null;
    updateTask.mutate({ id: task.id, listId: task.list_id, patch: { description: json, description_text: text } });
  };

  // A plain `useEffect(() => () => flushDescription(), [])` would close over
  // the very first render's `flushDescription` — whose `task` is still
  // undefined while the query is loading — so the unmount cleanup would
  // always no-op and the behaviour rule this exists for (AC-13: a
  // description typed quickly and then navigated away from is saved in
  // full) would silently fail. Route every call through a ref that always
  // points at the latest closure instead.
  const flushDescriptionRef = useRef(flushDescription);
  flushDescriptionRef.current = flushDescription;
  useEffect(() => () => flushDescriptionRef.current(), []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!task || !list || !space) {
    return <EmptyState title="Not found" description="This task does not exist, or you do not have access to it." />;
  }

  const currentStatus = statuses?.find((s) => s.id === task.status_id);

  const commitTitle = () => {
    const trimmed = titleDraft.trim();
    if (trimmed && trimmed !== task.title) {
      updateTask.mutate({ id: task.id, listId: task.list_id, patch: { title: trimmed } });
    } else {
      setTitleDraft(task.title);
    }
  };

  const handleCopyLink = async () => {
    await navigator.clipboard.writeText(`${window.location.origin}/task/t/${task.id}`);
    toast({ title: 'Link copied' });
  };

  const handleToggleWatch = () => {
    if (!userId) return;
    toggleWatch.mutate({ taskId: task.id, userId, watching: !!watching });
  };

  const handleDuplicate = async () => {
    if (!userId) return;
    try {
      const copy = await duplicateTask.mutateAsync({ task, createdBy: userId });
      toast({ title: 'Task duplicated' });
      navigate(`/task/t/${copy.id}`);
    } catch (err) {
      toast({ title: 'Could not duplicate task', description: (err as Error).message, variant: 'destructive' });
    }
  };

  const handleArchive = () => {
    archiveTask.mutate(
      { id: task.id, listId: task.list_id, archived: true },
      {
        onSuccess: () => {
          toast({
            title: 'Task archived',
            duration: 8000,
            action: (
              <ToastAction altText="Undo" onClick={() => archiveTask.mutate({ id: task.id, listId: task.list_id, archived: false })}>
                Undo
              </ToastAction>
            ),
          });
          onClose();
        },
      },
    );
  };

  const handleDelete = async () => {
    const ok = await confirm({
      title: `Delete "${task.title}"?`,
      description: 'This cannot be undone.',
      confirmLabel: 'Delete',
      variant: 'destructive',
    });
    if (!ok) return;
    deleteTask.mutate(
      { id: task.id, listId: task.list_id },
      {
        onSuccess: () => { toast({ title: 'Task deleted' }); onClose(); },
        onError: (err) => toast({ title: 'Could not delete task', description: (err as Error).message, variant: 'destructive' }),
      },
    );
  };

  const assigneeIds = task.assignees.map((a) => a.user_id);

  return (
    <div className="fixed inset-0 z-40 flex items-start md:items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-card w-full h-full md:h-[85vh] md:max-w-[1100px] md:rounded-xl shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-border shrink-0">
          <div className="flex items-center gap-1 text-xs text-muted-foreground min-w-0 truncate">
            <span className="truncate">{space.name}</span>
            <ChevronRight className="h-3 w-3 shrink-0" />
            <span className="truncate">{list.name}</span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleCopyLink} aria-label="Copy link">
              <Copy className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleToggleWatch} aria-label={watching ? 'Unwatch' : 'Watch'}>
              {watching ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="More">
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setMoveOpen(true)}>
                  <Move className="h-3.5 w-3.5 mr-2" /> Move
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={handleDuplicate}>
                  <Copy className="h-3.5 w-3.5 mr-2" /> Duplicate
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={handleArchive}>
                  <Archive className="h-3.5 w-3.5 mr-2" /> Archive
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={handleDelete} className="text-destructive focus:text-destructive">
                  <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose} aria-label="Close">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {task.archived_at && (
          <div className="flex items-center justify-between px-4 py-2 bg-muted/40 border-b border-border text-xs text-muted-foreground shrink-0">
            This task is archived.
            <Button
              variant="outline"
              size="sm"
              className="h-7"
              onClick={() => archiveTask.mutate({ id: task.id, listId: task.list_id, archived: false })}
            >
              <ArchiveRestore className="h-3 w-3 mr-1.5" /> Unarchive
            </Button>
          </div>
        )}

        {/* Body: left pane + right pane */}
        <div className="flex-1 flex flex-col md:flex-row min-h-0">
          <div className="flex-1 overflow-y-auto px-5 py-4 md:border-r border-border">
            <input
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
              className="w-full text-xl font-semibold text-foreground bg-transparent border-none outline-none focus:ring-0 p-0 mb-3"
            />

            <div className="flex flex-wrap items-center gap-x-5 gap-y-2.5 mb-4 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-2xs text-muted-foreground w-16 shrink-0">Status</span>
                <StatusPill
                  status={currentStatus}
                  statuses={statuses ?? []}
                  onChange={(statusId) => updateTask.mutate({ id: task.id, listId: task.list_id, patch: { status_id: statusId } })}
                />
              </div>

              <div className="flex items-center gap-2">
                <span className="text-2xs text-muted-foreground w-20 shrink-0">Assignees</span>
                <div className="flex items-center gap-1.5">
                  <AvatarStack people={task.assignees} size={24} max={5} />
                  <PeoplePicker
                    people={people ?? []}
                    excludeIds={assigneeIds}
                    label="Add"
                    onSelect={(p) => {
                      if (!userId) return;
                      setAssignees.mutate({ taskId: task.id, listId: task.list_id, add: [p.id], remove: [], assignedBy: userId });
                    }}
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-2xs text-muted-foreground w-16 shrink-0">Start</span>
                <TaskDatePicker
                  value={task.start_date}
                  onChange={(d) => updateTask.mutate({ id: task.id, listId: task.list_id, patch: { start_date: d } })}
                />
              </div>

              <div className="flex items-center gap-2">
                <span className="text-2xs text-muted-foreground w-16 shrink-0">Due</span>
                <TaskDatePicker
                  value={task.due_date}
                  onChange={(d) => updateTask.mutate({ id: task.id, listId: task.list_id, patch: { due_date: d } })}
                />
              </div>

              <div className="flex items-center gap-2">
                <span className="text-2xs text-muted-foreground w-16 shrink-0">Priority</span>
                <PriorityFlag
                  priority={task.priority}
                  onChange={(p: TaskPriority) => updateTask.mutate({ id: task.id, listId: task.list_id, patch: { priority: p } })}
                />
              </div>
            </div>

            <div>
              <p className="text-2xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Description</p>
              <RichTextEditor
                content={task.description ?? ''}
                placeholder="Add a description..."
                onChange={(json, text) => {
                  descPending.current = { json, text };
                  if (descTimer.current) clearTimeout(descTimer.current);
                  descTimer.current = setTimeout(flushDescription, 600);
                }}
              />
            </div>
          </div>

          <div className="w-full md:w-[380px] shrink-0 min-h-0 flex flex-col border-t md:border-t-0 border-border">
            <CommentsActivityFeed entityType="task" entityId={task.id} statuses={statuses ?? []} />
          </div>
        </div>
      </div>

      <MoveTaskDialog
        taskId={task.id}
        currentListId={task.list_id}
        spaceId={space.id}
        open={moveOpen}
        onOpenChange={setMoveOpen}
      />
    </div>
  );
}
