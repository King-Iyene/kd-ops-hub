import { useState, useRef } from 'react';
import {
  Plus, GripVertical, Calendar, Clock, CheckCircle2,
  ChevronRight, Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDate, daysUntil } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type {
  Task, TaskStatus, ProfileRow, Tag,
} from '@/lib/task-types';
import {
  STATUS_DOT, PRIORITY_CLASS, PRIORITY_BORDER,
} from '@/lib/task-types';

const COLUMNS: { status: TaskStatus; label: string; accent: string; bg: string }[] = [
  { status: 'open', label: 'Open', accent: 'bg-slate-500', bg: 'bg-slate-50 dark:bg-slate-900/40' },
  { status: 'in_progress', label: 'In Progress', accent: 'bg-blue-500', bg: 'bg-blue-50/50 dark:bg-blue-950/20' },
  { status: 'blocked', label: 'Blocked', accent: 'bg-red-500', bg: 'bg-red-50/30 dark:bg-red-950/10' },
  { status: 'complete', label: 'Complete', accent: 'bg-emerald-500', bg: 'bg-emerald-50/30 dark:bg-emerald-950/10' },
];

interface KanbanBoardProps {
  tasks: Task[];
  profiles: Map<string, ProfileRow>;
  availableTags: Tag[];
  subtaskCounts: Map<string, { total: number; done: number }>;
  onStatusChange: (taskId: string, newStatus: TaskStatus) => Promise<void>;
  onTaskClick: (task: Task) => void;
  onCreateTask: (status: TaskStatus) => void;
  onQuickCreate: (title: string, status: TaskStatus) => Promise<void>;
}

export function KanbanBoard({
  tasks, profiles, availableTags, subtaskCounts,
  onStatusChange, onTaskClick, onCreateTask, onQuickCreate,
}: KanbanBoardProps) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<TaskStatus | null>(null);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pb-4">
      {COLUMNS.map((col) => {
        const colTasks = tasks
          .filter((t) => t.status === col.status)
          .sort((a, b) => a.sort_order - b.sort_order);
        const isOver = overCol === col.status && draggedId !== null;

        return (
          <KanbanColumn
            key={col.status}
            col={col}
            tasks={colTasks}
            profiles={profiles}
            availableTags={availableTags}
            subtaskCounts={subtaskCounts}
            isOver={isOver}
            draggedId={draggedId}
            onDragOver={() => setOverCol(col.status)}
            onDragLeave={() => { if (overCol === col.status) setOverCol(null); }}
            onDrop={async () => {
              setOverCol(null);
              if (draggedId) {
                const task = tasks.find((t) => t.id === draggedId);
                if (task && task.status !== col.status) {
                  await onStatusChange(draggedId, col.status);
                }
                setDraggedId(null);
              }
            }}
            onDragStart={setDraggedId}
            onDragEnd={() => setDraggedId(null)}
            onTaskClick={onTaskClick}
            onCreateTask={() => onCreateTask(col.status)}
            onQuickCreate={(title) => onQuickCreate(title, col.status)}
          />
        );
      })}
    </div>
  );
}

function KanbanColumn({
  col, tasks, profiles, availableTags, subtaskCounts,
  isOver, draggedId, onDragOver, onDragLeave, onDrop,
  onDragStart, onDragEnd, onTaskClick, onCreateTask, onQuickCreate,
}: {
  col: typeof COLUMNS[number];
  tasks: Task[];
  profiles: Map<string, ProfileRow>;
  availableTags: Tag[];
  subtaskCounts: Map<string, { total: number; done: number }>;
  isOver: boolean;
  draggedId: string | null;
  onDragOver: () => void;
  onDragLeave: () => void;
  onDrop: () => Promise<void>;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onTaskClick: (task: Task) => void;
  onCreateTask: () => void;
  onQuickCreate: (title: string) => Promise<void>;
}) {
  const [quickAdd, setQuickAdd] = useState(false);
  const [quickTitle, setQuickTitle] = useState('');
  const [creating, setCreating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleQuickCreate = async () => {
    if (!quickTitle.trim()) return;
    setCreating(true);
    await onQuickCreate(quickTitle.trim());
    setQuickTitle('');
    setCreating(false);
    inputRef.current?.focus();
  };

  return (
    <div
      className={cn(
        'flex flex-col rounded-xl border transition-all min-h-[320px]',
        isOver
          ? 'border-primary/50 shadow-md shadow-primary/10 scale-[1.01]'
          : 'border-border/60',
        col.bg,
      )}
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; onDragOver(); }}
      onDragLeave={onDragLeave}
      onDrop={async (e) => { e.preventDefault(); await onDrop(); }}
    >
      {/* Column header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border/40">
        <div className={cn('h-2 w-2 rounded-full shrink-0', col.accent)} />
        <span className="text-[13px] font-semibold tracking-tight flex-1">{col.label}</span>
        <span className="text-[11px] text-muted-foreground tabular-nums font-medium bg-background/60 rounded-md px-1.5 py-0.5">
          {tasks.length}
        </span>
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={onCreateTask}>
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">New task</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Cards container */}
      <div className="flex-1 p-2 space-y-2 overflow-y-auto">
        {tasks.length === 0 && !isOver && (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className={cn('h-8 w-8 rounded-full flex items-center justify-center mb-2', col.bg)}>
              <div className={cn('h-3 w-3 rounded-full opacity-30', col.accent)} />
            </div>
            <p className="text-xs text-muted-foreground">No tasks</p>
          </div>
        )}

        {isOver && tasks.length === 0 && (
          <div className="rounded-lg border-2 border-dashed border-primary/40 bg-primary/5 h-20 flex items-center justify-center">
            <p className="text-xs text-primary/60 font-medium">Drop here</p>
          </div>
        )}

        {tasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            profiles={profiles}
            availableTags={availableTags}
            subtaskCount={subtaskCounts.get(task.id)}
            isDragging={draggedId === task.id}
            onDragStart={() => onDragStart(task.id)}
            onDragEnd={onDragEnd}
            onClick={() => onTaskClick(task)}
          />
        ))}

        {isOver && tasks.length > 0 && (
          <div className="rounded-lg border-2 border-dashed border-primary/30 bg-primary/5 h-12 flex items-center justify-center">
            <p className="text-[11px] text-primary/50 font-medium">Drop here</p>
          </div>
        )}
      </div>

      {/* Quick-add footer */}
      <div className="px-2 pb-2">
        {quickAdd ? (
          <div className="space-y-1.5">
            <Input
              ref={inputRef}
              className="h-8 text-sm bg-background"
              placeholder="Task name..."
              value={quickTitle}
              onChange={(e) => setQuickTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleQuickCreate();
                if (e.key === 'Escape') { setQuickAdd(false); setQuickTitle(''); }
              }}
              autoFocus
              disabled={creating}
            />
            <div className="flex gap-1.5">
              <Button size="sm" className="h-7 text-xs flex-1" disabled={creating || !quickTitle.trim()} onClick={handleQuickCreate}>
                {creating ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Plus className="h-3 w-3 mr-1" />}
                Add
              </Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setQuickAdd(false); setQuickTitle(''); }}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setQuickAdd(true)}
            className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-background/80 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add task</span>
          </button>
        )}
      </div>
    </div>
  );
}

function TaskCard({
  task, profiles, availableTags, subtaskCount,
  isDragging, onDragStart, onDragEnd, onClick,
}: {
  task: Task;
  profiles: Map<string, ProfileRow>;
  availableTags: Tag[];
  subtaskCount?: { total: number; done: number };
  isDragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onClick: () => void;
}) {
  const assignee = task.assignee_id ? profiles.get(task.assignee_id) : null;
  const d = task.due_date ? daysUntil(task.due_date) : null;
  const overdue = task.status !== 'complete' && d !== null && d < 0;
  const initials = assignee
    ? assignee.full_name
        .split(' ')
        .map((w) => w[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : null;

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', task.id);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onClick={onClick}
      className={cn(
        'group rounded-lg border bg-card p-3 cursor-pointer transition-all',
        'hover:shadow-md hover:border-border',
        'active:scale-[0.98]',
        isDragging && 'opacity-30 scale-[0.95] ring-2 ring-primary/40',
        task.status === 'complete' && 'opacity-70',
      )}
    >
      {/* Priority strip */}
      <div className={cn('h-0.5 w-8 rounded-full mb-2', {
        'bg-red-500': task.priority === 'critical',
        'bg-orange-400': task.priority === 'high',
        'bg-blue-400': task.priority === 'normal',
        'bg-slate-300 dark:bg-slate-600': task.priority === 'low',
      })} />

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
              <span
                key={tagId}
                className="inline-flex text-[9px] px-1.5 py-0.5 rounded-md font-medium"
                style={tag.color ? { backgroundColor: `${tag.color}15`, color: tag.color } : undefined}
              >
                {tag.name}
              </span>
            );
          })}
          {task.tags.length > 3 && (
            <span className="text-[9px] text-muted-foreground">+{task.tags.length - 3}</span>
          )}
        </div>
      )}

      {/* Subtask progress */}
      {subtaskCount && subtaskCount.total > 0 && (
        <div className="mt-2 flex items-center gap-2">
          <div className="flex-1 bg-muted rounded-full h-1">
            <div
              className="bg-emerald-500 h-1 rounded-full transition-all"
              style={{ width: `${(subtaskCount.done / subtaskCount.total) * 100}%` }}
            />
          </div>
          <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
            {subtaskCount.done}/{subtaskCount.total}
          </span>
        </div>
      )}

      {/* Footer: assignee avatar + due date */}
      <div className="flex items-center justify-between mt-2.5 gap-2">
        {assignee ? (
          <div className="flex items-center gap-1.5 min-w-0">
            <div className="h-5 w-5 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <span className="text-[8px] font-bold leading-none">{initials}</span>
            </div>
            <span className="text-[11px] text-muted-foreground truncate">{assignee.full_name}</span>
          </div>
        ) : (
          <span className="text-[10px] text-muted-foreground/50">Unassigned</span>
        )}

        {task.due_date && (
          <span className={cn(
            'flex items-center gap-0.5 text-[10px] shrink-0 rounded-md px-1.5 py-0.5',
            overdue
              ? 'bg-destructive/10 text-destructive font-medium'
              : d !== null && d <= 2
                ? 'bg-warning/10 text-warning'
                : 'text-muted-foreground',
          )}>
            <Calendar className="h-2.5 w-2.5" />
            {overdue
              ? `${-(d as number)}d late`
              : d !== null && d === 0
                ? 'Today'
                : d !== null && d === 1
                  ? 'Tomorrow'
                  : formatDate(task.due_date)}
          </span>
        )}
      </div>
    </div>
  );
}
