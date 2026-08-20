import { useState, useRef, useMemo, useCallback } from 'react';
import {
  Plus, Calendar, MessageSquare,
  Loader2, MoreHorizontal,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { formatDate, daysUntil } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';
import type {
  Task, TaskStatus, Priority, ProfileRow, Tag, TaskList, SpaceFolder,
} from '@/lib/task-types';
import { TaskContextMenu } from './TaskContextMenu';
import type { Space } from './TaskSidebar';

const STATUS_COLUMNS: { key: TaskStatus; label: string; accent: string; bg: string }[] = [
  { key: 'open', label: 'Open', accent: 'bg-slate-500', bg: 'bg-slate-50/50 dark:bg-slate-900/30' },
  { key: 'in_progress', label: 'In Progress', accent: 'bg-blue-500', bg: 'bg-blue-50/40 dark:bg-blue-950/20' },
  { key: 'blocked', label: 'Blocked', accent: 'bg-red-500', bg: 'bg-red-50/30 dark:bg-red-950/10' },
  { key: 'complete', label: 'Complete', accent: 'bg-emerald-500', bg: 'bg-emerald-50/30 dark:bg-emerald-950/10' },
];

const PRIORITY_COLUMNS: { key: Priority; label: string; accent: string; bg: string }[] = [
  { key: 'critical', label: 'Critical', accent: 'bg-red-500', bg: 'bg-red-50/30 dark:bg-red-950/10' },
  { key: 'high', label: 'High', accent: 'bg-orange-400', bg: 'bg-orange-50/30 dark:bg-orange-950/10' },
  { key: 'normal', label: 'Normal', accent: 'bg-blue-400', bg: 'bg-blue-50/30 dark:bg-blue-950/10' },
  { key: 'low', label: 'Low', accent: 'bg-slate-400', bg: 'bg-slate-50/30 dark:bg-slate-900/20' },
];

export type BoardGroupBy = 'status' | 'priority' | 'assignee';

interface KanbanBoardProps {
  tasks: Task[];
  profiles: Map<string, ProfileRow>;
  availableTags: Tag[];
  subtaskCounts: Map<string, { total: number; done: number }>;
  commentCounts?: Map<string, number>;
  onStatusChange: (taskId: string, newStatus: TaskStatus) => Promise<void>;
  onFieldChange: (taskId: string, field: string, value: any) => Promise<void>;
  onTaskClick: (task: Task) => void;
  onCreateTask: (status: TaskStatus) => void;
  onQuickCreate: (title: string, status: TaskStatus) => Promise<void>;
  spaces: Space[];
  folders: SpaceFolder[];
  lists: TaskList[];
  onUpdate: () => void;
}

export function KanbanBoard({
  tasks, profiles, availableTags, subtaskCounts, commentCounts,
  onStatusChange, onFieldChange, onTaskClick, onCreateTask, onQuickCreate,
  spaces, folders, lists, onUpdate,
}: KanbanBoardProps) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<string | null>(null);
  const [groupBy, setGroupBy] = useState<BoardGroupBy>('status');
  const [dropIndicator, setDropIndicator] = useState<{ colKey: string; index: number } | null>(null);
  const dragSourceCol = useRef<string | null>(null);

  const columns = useMemo(() => {
    if (groupBy === 'status') {
      return STATUS_COLUMNS.map((col) => ({
        ...col,
        tasks: tasks.filter((t) => t.status === col.key).sort((a, b) => a.sort_order - b.sort_order),
      }));
    }
    if (groupBy === 'priority') {
      return PRIORITY_COLUMNS.map((col) => ({
        ...col,
        tasks: tasks.filter((t) => t.priority === col.key).sort((a, b) => a.sort_order - b.sort_order),
      }));
    }
    // Group by assignee
    const assigneeMap = new Map<string, { label: string; tasks: Task[] }>();
    for (const t of tasks) {
      const uid = t.assignee_id || '__unassigned';
      if (!assigneeMap.has(uid)) {
        const name = t.assignee_id ? (profiles.get(t.assignee_id)?.full_name ?? 'Unknown') : 'Unassigned';
        assigneeMap.set(uid, { label: name, tasks: [] });
      }
      assigneeMap.get(uid)!.tasks.push(t);
    }
    const sorted = Array.from(assigneeMap.entries()).sort(([a], [b]) => {
      if (a === '__unassigned') return 1;
      if (b === '__unassigned') return -1;
      return (assigneeMap.get(a)!.label).localeCompare(assigneeMap.get(b)!.label);
    });
    return sorted.map(([uid, data]) => ({
      key: uid,
      label: data.label,
      accent: uid === '__unassigned' ? 'bg-slate-400' : 'bg-primary',
      bg: 'bg-muted/20',
      tasks: data.tasks.sort((a, b) => a.sort_order - b.sort_order),
    }));
  }, [tasks, groupBy, profiles]);

  const handleCardDragOver = useCallback((e: React.DragEvent, colKey: string, cardIndex: number) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    const rect = e.currentTarget.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    const insertIndex = e.clientY < midY ? cardIndex : cardIndex + 1;
    setOverCol(colKey);
    setDropIndicator((prev) =>
      prev?.colKey === colKey && prev?.index === insertIndex ? prev : { colKey, index: insertIndex }
    );
  }, []);

  const reorderWithinColumn = useCallback(async (colKey: string, insertIndex: number) => {
    if (!draggedId) return;
    const col = columns.find((c) => c.key === colKey);
    if (!col) return;

    const currentIndex = col.tasks.findIndex((t) => t.id === draggedId);
    if (currentIndex === -1) return;

    // Dropping at the same position or adjacent (no-op)
    if (insertIndex === currentIndex || insertIndex === currentIndex + 1) return;

    // Build new order: remove dragged task, insert at target position
    const reordered = [...col.tasks];
    const [moved] = reordered.splice(currentIndex, 1);
    // Adjust insert index after removal
    const adjustedIndex = insertIndex > currentIndex ? insertIndex - 1 : insertIndex;
    reordered.splice(adjustedIndex, 0, moved);

    // Assign new sort_order values (index * 1000)
    const updates = reordered.map((t, i) => ({
      id: t.id,
      sort_order: i * 1000,
    }));

    // Batch update via supabase
    await Promise.all(
      updates.map(({ id, sort_order }) =>
        supabase.from('tasks').update({ sort_order }).eq('id', id)
      )
    );
    onUpdate();
  }, [draggedId, columns, onUpdate]);

  const handleDrop = async (targetKey: string) => {
    const indicator = dropIndicator;
    setOverCol(null);
    setDropIndicator(null);
    if (!draggedId) return;
    const task = tasks.find((t) => t.id === draggedId);
    if (!task) { setDraggedId(null); return; }

    // Determine if this is a same-column drop
    const isSameColumn = dragSourceCol.current === targetKey;

    if (isSameColumn && indicator && indicator.colKey === targetKey) {
      // Same-column reorder
      await reorderWithinColumn(targetKey, indicator.index);
      setDraggedId(null);
      return;
    }

    if (groupBy === 'status' && task.status !== targetKey) {
      await onStatusChange(draggedId, targetKey as TaskStatus);
    } else if (groupBy === 'priority' && task.priority !== targetKey) {
      await onFieldChange(draggedId, 'priority', targetKey);
    } else if (groupBy === 'assignee') {
      const newAssignee = targetKey === '__unassigned' ? null : targetKey;
      if (task.assignee_id !== newAssignee) {
        await onFieldChange(draggedId, 'assignee_id', newAssignee);
      }
    }
    setDraggedId(null);
  };

  return (
    <div className="space-y-3">
      {/* Board toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Group by</span>
          <Select value={groupBy} onValueChange={(v) => setGroupBy(v as BoardGroupBy)}>
            <SelectTrigger className="h-7 w-[110px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="status">Status</SelectItem>
              <SelectItem value="priority">Priority</SelectItem>
              <SelectItem value="assignee">Assignee</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <span className="text-xs text-muted-foreground tabular-nums">
          {tasks.length} task{tasks.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Board columns */}
      <div className="flex gap-3 overflow-x-auto pb-4 -mx-4 px-4 lg:mx-0 lg:px-0">
        {columns.map((col) => {
          const isOver = overCol === col.key && draggedId !== null;
          return (
            <div
              key={col.key}
              className={cn(
                'flex flex-col rounded-xl border transition-all min-w-[280px] w-[280px] shrink-0 lg:flex-1 lg:min-w-0 lg:w-auto',
                isOver
                  ? 'border-primary/50 shadow-md shadow-primary/10 scale-[1.01]'
                  : 'border-border/60',
                col.bg,
              )}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                setOverCol(col.key);
                // If dragging over the column body (not over a card), show indicator at end
                if (e.target === e.currentTarget || !(e.target as HTMLElement).closest('[data-task-card]')) {
                  setDropIndicator({ colKey: col.key, index: col.tasks.length });
                }
              }}
              onDragLeave={(e) => {
                // Only clear if actually leaving the column (not entering a child)
                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                  if (overCol === col.key) setOverCol(null);
                  if (dropIndicator?.colKey === col.key) setDropIndicator(null);
                }
              }}
              onDrop={async (e) => { e.preventDefault(); await handleDrop(col.key); }}
            >
              {/* Column header */}
              <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border/40">
                <div className={cn('h-2 w-2 rounded-full shrink-0', col.accent)} />
                <span className="text-[13px] font-semibold tracking-tight flex-1 truncate">{col.label}</span>
                <span className="text-[11px] text-muted-foreground tabular-nums font-medium bg-background/60 rounded-md px-1.5 py-0.5">
                  {col.tasks.length}
                </span>
                {groupBy === 'status' && (
                  <TooltipProvider delayDuration={200}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button size="icon" variant="ghost" className="h-6 w-6" aria-label="New task" onClick={() => onCreateTask(col.key as TaskStatus)}>
                          <Plus className="h-3.5 w-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="top">New task</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>

              {/* Cards */}
              <div className="flex-1 p-2 space-y-2 overflow-y-auto max-h-[calc(100vh-280px)]">
                {col.tasks.length === 0 && !isOver && (
                  <div className="flex flex-col items-center justify-center py-10 text-center">
                    <div className={cn('h-10 w-10 rounded-xl flex items-center justify-center mb-3', col.bg, 'bg-muted/50')}>
                      <div className={cn('h-3 w-3 rounded-full opacity-40', col.accent)} />
                    </div>
                    <p className="text-xs text-muted-foreground font-medium">No tasks here</p>
                    <p className="text-[10px] text-muted-foreground/60 mt-0.5">Drag tasks here or create new ones</p>
                  </div>
                )}

                {isOver && col.tasks.length === 0 && (
                  <div className="rounded-lg border-2 border-dashed border-primary/40 bg-primary/5 h-20 flex items-center justify-center">
                    <p className="text-xs text-primary/60 font-medium">Drop here</p>
                  </div>
                )}

                {col.tasks.map((task, idx) => {
                  const showIndicatorBefore =
                    draggedId !== null &&
                    dropIndicator?.colKey === col.key &&
                    dropIndicator?.index === idx &&
                    dragSourceCol.current === col.key;
                  return (
                    <div key={task.id}>
                      {showIndicatorBefore && (
                        <div className="h-0.5 bg-blue-500 rounded-full mx-1 -mt-1 mb-1 transition-all" />
                      )}
                      <TaskCard
                        task={task}
                        profiles={profiles}
                        availableTags={availableTags}
                        subtaskCount={subtaskCounts.get(task.id)}
                        commentCount={commentCounts?.get(task.id) ?? 0}
                        isDragging={draggedId === task.id}
                        onDragStart={() => { setDraggedId(task.id); dragSourceCol.current = col.key; }}
                        onDragEnd={() => { setDraggedId(null); setDropIndicator(null); dragSourceCol.current = null; }}
                        onCardDragOver={(e) => handleCardDragOver(e, col.key, idx)}
                        onClick={() => onTaskClick(task)}
                        spaces={spaces}
                        folders={folders}
                        lists={lists}
                        onUpdate={onUpdate}
                      />
                    </div>
                  );
                })}

                {/* Show indicator at end of column when dropping after last card */}
                {draggedId !== null &&
                  dropIndicator?.colKey === col.key &&
                  dropIndicator?.index === col.tasks.length &&
                  dragSourceCol.current === col.key && (
                  <div className="h-0.5 bg-blue-500 rounded-full mx-1 -mt-1 mb-1 transition-all" />
                )}

                {isOver && col.tasks.length > 0 && dragSourceCol.current !== col.key && (
                  <div className="rounded-lg border-2 border-dashed border-primary/30 bg-primary/5 h-12 flex items-center justify-center">
                    <p className="text-[11px] text-primary/50 font-medium">Drop here</p>
                  </div>
                )}
              </div>

              {/* Quick-add footer */}
              {groupBy === 'status' && (
                <QuickAddFooter
                  status={col.key as TaskStatus}
                  onQuickCreate={onQuickCreate}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function QuickAddFooter({ status, onQuickCreate }: { status: TaskStatus; onQuickCreate: (title: string, status: TaskStatus) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [creating, setCreating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const create = async () => {
    if (!title.trim()) return;
    setCreating(true);
    await onQuickCreate(title.trim(), status);
    setTitle('');
    setCreating(false);
    inputRef.current?.focus();
  };

  return (
    <div className="px-2 pb-2">
      {open ? (
        <div className="space-y-1.5">
          <Input
            ref={inputRef}
            className="h-8 text-sm bg-background"
            placeholder="Task name..."
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') create();
              if (e.key === 'Escape') { setOpen(false); setTitle(''); }
            }}
            autoFocus
            disabled={creating}
          />
          <div className="flex gap-1.5">
            <Button size="sm" className="h-7 text-xs flex-1" disabled={creating || !title.trim()} onClick={create}>
              {creating ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Plus className="h-3 w-3 mr-1" />}
              Add
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setOpen(false); setTitle(''); }}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-background/80 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" /> Add task
        </button>
      )}
    </div>
  );
}

function TaskCard({
  task, profiles, availableTags, subtaskCount, commentCount,
  isDragging, onDragStart, onDragEnd, onCardDragOver, onClick,
  spaces, folders, lists, onUpdate,
}: {
  task: Task;
  profiles: Map<string, ProfileRow>;
  availableTags: Tag[];
  subtaskCount?: { total: number; done: number };
  commentCount: number;
  isDragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onCardDragOver: (e: React.DragEvent) => void;
  onClick: () => void;
  spaces: Space[];
  folders: SpaceFolder[];
  lists: TaskList[];
  onUpdate: () => void;
}) {
  const assignee = task.assignee_id ? profiles.get(task.assignee_id) : null;
  const d = task.due_date ? daysUntil(task.due_date) : null;
  const overdue = task.status !== 'complete' && d !== null && d < 0;
  const initials = assignee
    ? assignee.full_name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)
    : null;

  return (
    <div
      data-task-card
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', task.id);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onDragOver={onCardDragOver}
      onClick={onClick}
      className={cn(
        'group rounded-lg border bg-card p-3 cursor-pointer transition-all',
        'hover:shadow-md hover:border-border',
        'active:scale-[0.98]',
        isDragging && 'opacity-30 scale-[0.95] ring-2 ring-primary/40',
        task.status === 'complete' && 'opacity-60',
      )}
    >
      {/* Priority strip + context menu */}
      <div className="flex items-start justify-between mb-2">
        <div className={cn('h-0.5 w-8 rounded-full mt-1', {
          'bg-red-500': task.priority === 'critical',
          'bg-orange-400': task.priority === 'high',
          'bg-blue-400': task.priority === 'normal',
          'bg-slate-300 dark:bg-slate-600': task.priority === 'low',
        })} />
        <div onClick={(e) => e.stopPropagation()}>
          <TaskContextMenu task={task} spaces={spaces} folders={folders} lists={lists} profiles={profiles} onUpdate={onUpdate}>
            <button className="h-5 w-5 flex items-center justify-center rounded hover:bg-muted/80 opacity-0 group-hover:opacity-100 transition-opacity -mt-1 -mr-1">
              <MoreHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          </TaskContextMenu>
        </div>
      </div>

      {/* Title */}
      <p className={cn(
        'text-sm font-medium leading-snug',
        task.status === 'complete' && 'line-through text-muted-foreground',
      )}>
        {task.title}
      </p>

      {/* Tags */}
      {task.tags && task.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {task.tags.slice(0, 3).map((tagId) => {
            const tag = availableTags.find((t) => t.id === tagId);
            if (!tag) return null;
            return (
              <span key={tagId} className="inline-flex text-[9px] px-1.5 py-0.5 rounded-full font-medium"
                style={tag.color ? { backgroundColor: `${tag.color}15`, color: tag.color } : undefined}>
                {tag.name}
              </span>
            );
          })}
          {task.tags.length > 3 && <span className="text-[9px] text-muted-foreground">+{task.tags.length - 3}</span>}
        </div>
      )}

      {/* Subtask progress */}
      {subtaskCount && subtaskCount.total > 0 && (
        <div className="mt-2 flex items-center gap-2">
          <div className="flex-1 bg-muted rounded-full h-1">
            <div className="bg-emerald-500 h-1 rounded-full transition-all"
              style={{ width: `${(subtaskCount.done / subtaskCount.total) * 100}%` }} />
          </div>
          <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
            {subtaskCount.done}/{subtaskCount.total}
          </span>
        </div>
      )}

      {/* Footer: assignee + due date + comment count */}
      <div className="flex items-center justify-between mt-2.5 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {assignee ? (
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="h-6 w-6 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <span className="text-[8px] font-bold leading-none">{initials}</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom">{assignee.full_name}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center shrink-0">
              <span className="text-[8px] text-muted-foreground/40">?</span>
            </div>
          )}

          {commentCount > 0 && (
            <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground tabular-nums">
              <MessageSquare className="h-3 w-3" />{commentCount}
            </span>
          )}
        </div>

        {task.due_date && (
          <span className={cn(
            'flex items-center gap-0.5 text-[10px] shrink-0 rounded-full px-2 py-0.5',
            overdue
              ? 'bg-destructive/10 text-destructive font-medium'
              : d !== null && d <= 2
                ? 'bg-warning/10 text-warning'
                : 'text-muted-foreground bg-muted/50',
          )}>
            <Calendar className="h-2.5 w-2.5" />
            {overdue
              ? `${-(d as number)}d late`
              : d === 0 ? 'Today'
              : d === 1 ? 'Tmrw'
              : formatDate(task.due_date)}
          </span>
        )}
      </div>
    </div>
  );
}
