import { useMemo, useState, useRef, useEffect } from 'react';
import {
  CheckCircle2, MessageSquare, ChevronDown, ChevronUp,
  ChevronRight, Square, CheckSquare, Minus, ArrowUpDown, MoreHorizontal,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { formatDate, daysUntil } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { EmptyState } from '@/components/ui-kit/EmptyState';
import type { Task, TaskStatus, Priority, ProfileRow, Tag, TaskList, SpaceFolder } from '@/lib/task-types';
import { STATUSES, PRIORITY_OPTIONS, STATUS_DOT, PRIORITY_CLASS, STATUS_CLASS } from '@/lib/task-types';
import { TaskContextMenu } from './TaskContextMenu';
import type { Space } from './TaskSidebar';

type GroupBy = 'status' | 'priority' | 'assignee' | 'none';
type SortField = 'title' | 'assignee' | 'due_date' | 'priority' | 'status' | 'created_at';
type SortDir = 'asc' | 'desc';

const PRIORITY_RANK: Record<string, number> = { critical: 0, high: 1, normal: 2, low: 3 };
const STATUS_RANK: Record<string, number> = { open: 0, in_progress: 1, blocked: 2, complete: 3 };

interface TaskListViewProps {
  tasks: Task[];
  profiles: Map<string, ProfileRow>;
  availableTags: Tag[];
  subtaskCounts: Map<string, { total: number; done: number }>;
  commentCounts: Map<string, number>;
  onTaskClick: (task: Task) => void;
  onUpdate: () => void;
  selectedTasks: Set<string>;
  onToggleSelect: (taskId: string) => void;
  onSelectAll: () => void;
  tableMode?: boolean;
  spaces: Space[];
  folders: SpaceFolder[];
  lists: TaskList[];
}

const STATUS_ORDER: TaskStatus[] = ['open', 'in_progress', 'blocked', 'complete'];
const PRIORITY_ORDER = ['critical', 'high', 'normal', 'low'] as const;

const STATUS_ACCENT: Record<TaskStatus, string> = {
  open: 'bg-slate-500',
  in_progress: 'bg-blue-500',
  blocked: 'bg-red-500',
  complete: 'bg-emerald-500',
};

export function TaskListView({
  tasks, profiles, availableTags, subtaskCounts, commentCounts,
  onTaskClick, onUpdate, selectedTasks, onToggleSelect, onSelectAll,
  tableMode = false, spaces, folders, lists,
}: TaskListViewProps) {
  const [groupBy, setGroupBy] = useState<GroupBy>(tableMode ? 'none' : 'status');
  const [sortField, setSortField] = useState<SortField>('created_at');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const sortedTasks = useMemo(() => {
    const sorted = [...tasks].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'title': cmp = a.title.localeCompare(b.title); break;
        case 'assignee': {
          const aName = a.assignee_id ? (profiles.get(a.assignee_id)?.full_name ?? '') : '';
          const bName = b.assignee_id ? (profiles.get(b.assignee_id)?.full_name ?? '') : '';
          cmp = aName.localeCompare(bName);
          break;
        }
        case 'due_date': {
          const aDate = a.due_date || '9999-12-31';
          const bDate = b.due_date || '9999-12-31';
          cmp = aDate.localeCompare(bDate);
          break;
        }
        case 'priority': cmp = (PRIORITY_RANK[a.priority] ?? 99) - (PRIORITY_RANK[b.priority] ?? 99); break;
        case 'status': cmp = (STATUS_RANK[a.status] ?? 99) - (STATUS_RANK[b.status] ?? 99); break;
        case 'created_at': cmp = a.created_at.localeCompare(b.created_at); break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [tasks, sortField, sortDir, profiles]);

  const groups = useMemo(() => {
    if (groupBy === 'none') {
      return [{ key: 'all', label: 'All Tasks', accent: 'bg-primary', tasks: sortedTasks }];
    }

    const map = new Map<string, Task[]>();
    for (const t of sortedTasks) {
      let key: string;
      if (groupBy === 'status') key = t.status;
      else if (groupBy === 'priority') key = t.priority;
      else key = t.assignee_id || '__unassigned';
      const list = map.get(key) || [];
      list.push(t);
      map.set(key, list);
    }

    if (groupBy === 'status') {
      return STATUS_ORDER.filter((s) => map.has(s)).map((s) => ({
        key: s,
        label: STATUSES.find((st) => st.value === s)?.label ?? s,
        accent: STATUS_ACCENT[s],
        tasks: map.get(s)!,
      }));
    }

    if (groupBy === 'priority') {
      return PRIORITY_ORDER.filter((p) => map.has(p)).map((p) => ({
        key: p,
        label: p.charAt(0).toUpperCase() + p.slice(1),
        accent: p === 'critical' ? 'bg-red-500' : p === 'high' ? 'bg-orange-400' : p === 'normal' ? 'bg-blue-400' : 'bg-slate-400',
        tasks: map.get(p)!,
      }));
    }

    const sortedKeys = Array.from(map.keys()).sort((a, b) => {
      if (a === '__unassigned') return 1;
      if (b === '__unassigned') return -1;
      return (profiles.get(a)?.full_name ?? '').localeCompare(profiles.get(b)?.full_name ?? '');
    });

    return sortedKeys.map((uid) => ({
      key: uid,
      label: uid === '__unassigned' ? 'Unassigned' : (profiles.get(uid)?.full_name ?? 'Unknown'),
      accent: 'bg-primary',
      tasks: map.get(uid)!,
    }));
  }, [sortedTasks, groupBy, profiles]);

  const allSelected = tasks.length > 0 && selectedTasks.size === tasks.length;
  const someSelected = selectedTasks.size > 0 && selectedTasks.size < tasks.length;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between px-1 mb-3">
        <div className="flex items-center gap-3">
          <button onClick={onSelectAll} className="text-muted-foreground hover:text-foreground transition-colors">
            {allSelected ? <CheckSquare className="h-4 w-4 text-primary" /> : someSelected ? <Minus className="h-4 w-4" /> : <Square className="h-4 w-4" />}
          </button>
          <span className="text-xs text-muted-foreground">
            {selectedTasks.size > 0 ? `${selectedTasks.size} selected` : `${tasks.length} task${tasks.length !== 1 ? 's' : ''}`}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Group by</span>
          <Select value={groupBy} onValueChange={(v) => setGroupBy(v as GroupBy)}>
            <SelectTrigger className="h-7 w-[120px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="status">Status</SelectItem>
              <SelectItem value="priority">Priority</SelectItem>
              <SelectItem value="assignee">Assignee</SelectItem>
              <SelectItem value="none">None</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {groups.length === 0 || tasks.length === 0 ? (
        <EmptyState
          illustration="radar"
          title="No tasks to display"
          description="Create your first task to start tracking work."
          tone="primary"
        />
      ) : (
        groups.map((group) => (
          <ListGroup
            key={group.key}
            label={group.label}
            accent={group.accent}
            tasks={group.tasks}
            profiles={profiles}
            availableTags={availableTags}
            subtaskCounts={subtaskCounts}
            commentCounts={commentCounts}
            onTaskClick={onTaskClick}
            onUpdate={onUpdate}
            groupBy={groupBy}
            selectedTasks={selectedTasks}
            onToggleSelect={onToggleSelect}
            sortField={sortField}
            sortDir={sortDir}
            onToggleSort={toggleSort}
            spaces={spaces}
            folders={folders}
            lists={lists}
          />
        ))
      )}
    </div>
  );
}

function ListGroup({
  label, accent, tasks, profiles, availableTags, subtaskCounts, commentCounts,
  onTaskClick, onUpdate, groupBy, selectedTasks, onToggleSelect,
  sortField, sortDir, onToggleSort, spaces, folders, lists,
}: {
  label: string;
  accent: string;
  tasks: Task[];
  profiles: Map<string, ProfileRow>;
  availableTags: Tag[];
  subtaskCounts: Map<string, { total: number; done: number }>;
  commentCounts: Map<string, number>;
  onTaskClick: (task: Task) => void;
  onUpdate: () => void;
  groupBy: GroupBy;
  selectedTasks: Set<string>;
  onToggleSelect: (taskId: string) => void;
  sortField: SortField;
  sortDir: SortDir;
  onToggleSort: (field: SortField) => void;
  spaces: Space[];
  folders: SpaceFolder[];
  lists: TaskList[];
}) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="mb-3">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center gap-2 w-full px-2 py-2 rounded-md text-sm font-semibold hover:bg-muted/50 transition-colors"
      >
        {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        <div className={cn('h-2.5 w-2.5 rounded-full shrink-0', accent)} />
        <span>{label}</span>
        <span className="text-[11px] tabular-nums text-muted-foreground ml-1">{tasks.length}</span>
      </button>

      {!collapsed && (
        <div className="rounded-lg border border-border/60 overflow-hidden bg-card">
          {/* Header */}
          <div className="hidden sm:grid grid-cols-[32px_1fr_120px_100px_90px_90px_70px_32px] gap-1 px-3 py-1.5 border-b border-border/40 bg-muted/30">
            <span />
            <SortableHeader label="Task" field="title" sortField={sortField} sortDir={sortDir} onToggleSort={onToggleSort} />
            <SortableHeader label="Assignee" field="assignee" sortField={sortField} sortDir={sortDir} onToggleSort={onToggleSort} />
            <SortableHeader label="Due" field="due_date" sortField={sortField} sortDir={sortDir} onToggleSort={onToggleSort} />
            <SortableHeader label="Priority" field="priority" sortField={sortField} sortDir={sortDir} onToggleSort={onToggleSort} />
            {groupBy !== 'status' && (
              <SortableHeader label="Status" field="status" sortField={sortField} sortDir={sortDir} onToggleSort={onToggleSort} />
            )}
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider text-right">Info</span>
            <span />
          </div>

          {tasks.map((task) => (
            <ListRow
              key={task.id}
              task={task}
              profiles={profiles}
              availableTags={availableTags}
              subtaskCounts={subtaskCounts}
              commentCounts={commentCounts}
              onClick={() => onTaskClick(task)}
              onUpdate={onUpdate}
              showStatus={groupBy !== 'status'}
              selected={selectedTasks.has(task.id)}
              onToggleSelect={() => onToggleSelect(task.id)}
              spaces={spaces}
              folders={folders}
              lists={lists}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ListRow({
  task, profiles, availableTags, subtaskCounts, commentCounts,
  onClick, onUpdate, showStatus, selected, onToggleSelect,
  spaces, folders, lists,
}: {
  task: Task;
  profiles: Map<string, ProfileRow>;
  availableTags: Tag[];
  subtaskCounts: Map<string, { total: number; done: number }>;
  commentCounts: Map<string, number>;
  onClick: () => void;
  onUpdate: () => void;
  showStatus: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  spaces: Space[];
  folders: SpaceFolder[];
  lists: TaskList[];
}) {
  const { toast } = useToast();
  const assignee = task.assignee_id ? profiles.get(task.assignee_id) : null;
  const d = task.due_date ? daysUntil(task.due_date) : null;
  const overdue = task.status !== 'complete' && d !== null && d < 0;
  const sc = subtaskCounts.get(task.id);
  const cc = commentCounts.get(task.id) ?? 0;

  const inlineUpdate = async (field: string, value: any) => {
    const update: Record<string, any> = { [field]: value };
    if (field === 'status' && value === 'complete') update.completed_at = new Date().toISOString();
    if (field === 'status' && value !== 'complete') update.completed_at = null;
    const { error } = await supabase.from('tasks').update(update).eq('id', task.id);
    if (error) toast({ title: 'Update failed', description: error.message, variant: 'destructive' });
    else onUpdate();
  };

  return (
    <div
      className={cn(
        'sm:grid sm:grid-cols-[32px_1fr_120px_100px_90px_90px_70px_32px] gap-1 w-full px-3 py-2.5 text-left transition-all',
        'hover:bg-muted/40 border-b border-border/20 last:border-b-0 group',
        'flex flex-col sm:flex-row sm:items-center',
        task.status === 'complete' && 'opacity-50',
        selected && 'bg-primary/5',
      )}
    >
      {/* Checkbox */}
      <div className="flex items-center justify-center shrink-0">
        <button
          onClick={(e) => { e.stopPropagation(); onToggleSelect(); }}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          {selected ? <CheckSquare className="h-4 w-4 text-primary" /> : <Square className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity" />}
        </button>
      </div>

      {/* Task name + tags — clickable to open detail */}
      <button onClick={onClick} className="flex items-center gap-2 min-w-0 text-left">
        <div className={cn('h-2 w-2 rounded-full shrink-0', STATUS_DOT[task.status])} />
        <span className={cn(
          'text-sm font-medium truncate',
          task.status === 'complete' && 'line-through text-muted-foreground',
        )}>
          {task.title}
        </span>
        {task.tags && task.tags.length > 0 && (
          <div className="hidden lg:flex items-center gap-1 shrink-0">
            {task.tags.slice(0, 2).map((tagId) => {
              const tag = availableTags.find((t) => t.id === tagId);
              if (!tag) return null;
              return (
                <span key={tagId} className="text-[9px] px-1.5 py-0.5 rounded-full font-medium"
                  style={tag.color ? { backgroundColor: `${tag.color}15`, color: tag.color } : undefined}>
                  {tag.name}
                </span>
              );
            })}
          </div>
        )}
      </button>

      {/* Assignee — inline editable */}
      <div className="hidden sm:block" onClick={(e) => e.stopPropagation()}>
        <Select value={task.assignee_id || '__none__'} onValueChange={(v) => inlineUpdate('assignee_id', v === '__none__' ? null : v)}>
          <SelectTrigger className="h-7 text-[11px] border-0 bg-transparent shadow-none hover:bg-muted/60 transition-colors px-1">
            <div className="flex items-center gap-1.5 min-w-0">
              {assignee ? (
                <>
                  <div className="h-5 w-5 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <span className="text-[7px] font-bold leading-none">
                      {assignee.full_name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)}
                    </span>
                  </div>
                  <span className="truncate">{assignee.full_name.split(' ')[0]}</span>
                </>
              ) : (
                <span className="text-muted-foreground/50">—</span>
              )}
            </div>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">Unassigned</SelectItem>
            {Array.from(profiles.values()).map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Due date — inline editable */}
      <div className="hidden sm:block" onClick={(e) => e.stopPropagation()}>
        <InlineDateInput
          value={task.due_date}
          overdue={overdue}
          daysUntilDue={d}
          onChange={(v) => inlineUpdate('due_date', v || null)}
        />
      </div>

      {/* Priority — inline editable */}
      <div className="hidden sm:block" onClick={(e) => e.stopPropagation()}>
        <Select value={task.priority} onValueChange={(v) => inlineUpdate('priority', v)}>
          <SelectTrigger className="h-7 text-[10px] border-0 bg-transparent shadow-none hover:bg-muted/60 transition-colors px-1">
            <Badge variant="secondary" className={cn('text-[10px] px-1.5 py-0', PRIORITY_CLASS[task.priority])}>
              {task.priority}
            </Badge>
          </SelectTrigger>
          <SelectContent>
            {PRIORITY_OPTIONS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Status — inline editable */}
      {showStatus && (
        <div className="hidden sm:block" onClick={(e) => e.stopPropagation()}>
          <Select value={task.status} onValueChange={(v) => inlineUpdate('status', v)}>
            <SelectTrigger className="h-7 text-[10px] border-0 bg-transparent shadow-none hover:bg-muted/60 transition-colors px-1">
              <Badge variant="secondary" className={cn('text-[10px] px-1.5 py-0', STATUS_CLASS[task.status])}>
                {task.status.replace('_', ' ')}
              </Badge>
            </SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Info */}
      <div className="hidden sm:flex items-center gap-2 justify-end">
        {sc && sc.total > 0 && (
          <span className="text-[10px] text-muted-foreground tabular-nums flex items-center gap-0.5">
            <CheckCircle2 className="h-3 w-3" />{sc.done}/{sc.total}
          </span>
        )}
        {cc > 0 && (
          <span className="text-[10px] text-muted-foreground tabular-nums flex items-center gap-0.5">
            <MessageSquare className="h-3 w-3" />{cc}
          </span>
        )}
      </div>

      {/* Context menu */}
      <div className="hidden sm:flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
        <TaskContextMenu task={task} spaces={spaces} folders={folders} lists={lists} profiles={profiles} onUpdate={onUpdate}>
          <button className="h-6 w-6 flex items-center justify-center rounded hover:bg-muted/80 opacity-0 group-hover:opacity-100 transition-opacity">
            <MoreHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </TaskContextMenu>
      </div>
    </div>
  );
}

function SortableHeader({ label, field, sortField, sortDir, onToggleSort }: {
  label: string;
  field: SortField;
  sortField: SortField;
  sortDir: SortDir;
  onToggleSort: (field: SortField) => void;
}) {
  const active = sortField === field;
  return (
    <button
      onClick={() => onToggleSort(field)}
      className="flex items-center gap-0.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors"
    >
      {label}
      {active ? (
        sortDir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
      ) : (
        <ArrowUpDown className="h-2.5 w-2.5 opacity-0 group-hover:opacity-40" />
      )}
    </button>
  );
}

function InlineDateInput({
  value, overdue, daysUntilDue, onChange,
}: {
  value: string | null;
  overdue: boolean;
  daysUntilDue: number | null;
  onChange: (value: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.showPicker?.();
  }, [editing]);

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="date"
        className="h-7 text-[11px] bg-transparent border-0 outline-none w-full px-1"
        defaultValue={value || ''}
        onBlur={(e) => { onChange(e.target.value); setEditing(false); }}
        onChange={(e) => { onChange(e.target.value); setEditing(false); }}
        autoFocus
      />
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="h-7 text-left w-full px-1 rounded hover:bg-muted/60 transition-colors"
    >
      {value ? (
        <span className={cn(
          'text-[11px] tabular-nums',
          overdue ? 'text-destructive font-medium' : 'text-muted-foreground',
        )}>
          {overdue
            ? `${Math.abs(daysUntilDue!)}d late`
            : daysUntilDue === 0 ? 'Today'
            : daysUntilDue === 1 ? 'Tomorrow'
            : formatDate(value)}
        </span>
      ) : (
        <span className="text-[11px] text-muted-foreground/40">—</span>
      )}
    </button>
  );
}
