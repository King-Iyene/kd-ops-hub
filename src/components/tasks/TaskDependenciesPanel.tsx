import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link2, Plus, Trash2, Search, ArrowRight, ArrowLeft, ArrowLeftRight, Copy } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import type { Task, TaskDependency, DependencyType } from '@/lib/task-types';
import { STATUS_DOT } from '@/lib/task-types';

interface TaskDependenciesPanelProps {
  taskId: string;
  allTasks: Task[];
  onUpdate: () => void;
}

const DEP_TYPE_CONFIG: Record<DependencyType, { label: string; icon: typeof ArrowRight }> = {
  blocks: { label: 'Blocking', icon: ArrowRight },
  is_blocked_by: { label: 'Blocked by', icon: ArrowLeft },
  relates_to: { label: 'Related to', icon: ArrowLeftRight },
  duplicate_of: { label: 'Duplicate of', icon: Copy },
};

export function TaskDependenciesPanel({ taskId, allTasks, onUpdate }: TaskDependenciesPanelProps) {
  const { toast } = useToast();

  const [deps, setDeps] = useState<TaskDependency[]>([]);
  const [adding, setAdding] = useState(false);
  const [addType, setAddType] = useState<DependencyType>('blocks');
  const [search, setSearch] = useState('');

  const loadDeps = useCallback(async () => {
    const [{ data: asSource }, { data: asTarget }] = await Promise.all([
      supabase.from('task_dependencies').select('id, task_id, depends_on_id, dependency_type').eq('task_id', taskId),
      supabase.from('task_dependencies').select('id, task_id, depends_on_id, dependency_type').eq('depends_on_id', taskId),
    ]);
    setDeps([...(asSource as TaskDependency[]) || [], ...(asTarget as TaskDependency[]) || []]);
  }, [taskId]);

  useEffect(() => { loadDeps(); }, [loadDeps]);

  const taskMap = useMemo(() => {
    const m = new Map<string, Task>();
    for (const t of allTasks) m.set(t.id, t);
    return m;
  }, [allTasks]);

  const grouped = useMemo(() => {
    const blocking: { dep: TaskDependency; task: Task }[] = [];
    const blockedBy: { dep: TaskDependency; task: Task }[] = [];
    const relatedTo: { dep: TaskDependency; task: Task }[] = [];

    for (const dep of deps) {
      if (dep.dependency_type === 'blocks' && dep.task_id === taskId) {
        const t = taskMap.get(dep.depends_on_id);
        if (t) blocking.push({ dep, task: t });
      } else if (dep.dependency_type === 'is_blocked_by' && dep.task_id === taskId) {
        const t = taskMap.get(dep.depends_on_id);
        if (t) blockedBy.push({ dep, task: t });
      } else if (dep.dependency_type === 'blocks' && dep.depends_on_id === taskId) {
        const t = taskMap.get(dep.task_id);
        if (t) blockedBy.push({ dep, task: t });
      } else if (dep.dependency_type === 'is_blocked_by' && dep.depends_on_id === taskId) {
        const t = taskMap.get(dep.task_id);
        if (t) blocking.push({ dep, task: t });
      } else if (dep.dependency_type === 'relates_to') {
        const otherId = dep.task_id === taskId ? dep.depends_on_id : dep.task_id;
        const t = taskMap.get(otherId);
        if (t) relatedTo.push({ dep, task: t });
      }
    }

    return { blocking, blockedBy, relatedTo };
  }, [deps, taskId, taskMap]);

  const linkedIds = useMemo(() => {
    const ids = new Set<string>();
    for (const dep of deps) {
      ids.add(dep.task_id);
      ids.add(dep.depends_on_id);
    }
    return ids;
  }, [deps]);

  const filteredTasks = useMemo(() => {
    const q = search.toLowerCase().trim();
    return allTasks.filter((t) =>
      t.id !== taskId &&
      !linkedIds.has(t.id) &&
      (!q || t.title.toLowerCase().includes(q))
    );
  }, [allTasks, taskId, linkedIds, search]);

  const addDep = async (targetId: string) => {
    const { error } = await supabase.from('task_dependencies').insert({
      task_id: taskId,
      depends_on_id: targetId,
      dependency_type: addType,
    });
    if (error) {
      toast({ title: 'Failed to add dependency', description: error.message, variant: 'destructive' });
      return;
    }
    setAdding(false);
    setSearch('');
    loadDeps();
    onUpdate();
  };

  const removeDep = async (depId: string) => {
    const { error } = await supabase.from('task_dependencies').delete().eq('id', depId);
    if (error) {
      toast({ title: 'Failed to remove dependency', description: error.message, variant: 'destructive' });
      return;
    }
    loadDeps();
    onUpdate();
  };

  const renderGroup = (
    label: string,
    Icon: typeof ArrowRight,
    items: { dep: TaskDependency; task: Task }[],
  ) => {
    if (items.length === 0) return null;
    return (
      <div className="space-y-1">
        <div className="flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
          <Icon className="h-3 w-3" />
          {label}
        </div>
        {items.map(({ dep, task }) => (
          <div
            key={dep.id}
            className="group flex items-center gap-1.5 rounded px-1.5 py-1 hover:bg-muted/50"
          >
            <span className={cn('h-2 w-2 rounded-full shrink-0', STATUS_DOT[task.status])} />
            <span className="text-xs truncate flex-1">{task.title}</span>
            <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4 shrink-0">
              {task.status.replace('_', ' ')}
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100 shrink-0"
              onClick={() => removeDep(dep.id)}
            >
              <Trash2 className="h-3 w-3 text-destructive" />
            </Button>
          </div>
        ))}
      </div>
    );
  };

  const hasAny = grouped.blocking.length + grouped.blockedBy.length + grouped.relatedTo.length > 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Dependencies
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-5 w-5 p-0"
          onClick={() => { setAdding(!adding); setSearch(''); }}
        >
          <Plus className="h-3 w-3" />
        </Button>
      </div>

      {adding && (
        <div className="p-2 border rounded-md space-y-2 bg-muted/30">
          <Select value={addType} onValueChange={(v) => setAddType(v as DependencyType)}>
            <SelectTrigger className="h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.entries(DEP_TYPE_CONFIG) as [DependencyType, typeof DEP_TYPE_CONFIG['blocks']][]).map(
                ([type, config]) => (
                  <SelectItem key={type} value={type}>{config.label}</SelectItem>
                ),
              )}
            </SelectContent>
          </Select>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
            <Input
              className="h-7 text-xs pl-7"
              placeholder="Search tasks..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
          </div>
          <div className="max-h-36 overflow-y-auto space-y-0.5">
            {filteredTasks.length === 0 && (
              <p className="text-[10px] text-muted-foreground text-center py-2">No tasks found</p>
            )}
            {filteredTasks.slice(0, 20).map((t) => (
              <button
                key={t.id}
                className="w-full flex items-center gap-1.5 rounded px-1.5 py-1 text-left hover:bg-muted/60 transition-colors"
                onClick={() => addDep(t.id)}
              >
                <span className={cn('h-2 w-2 rounded-full shrink-0', STATUS_DOT[t.status])} />
                <span className="text-xs truncate">{t.title}</span>
              </button>
            ))}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-[10px] w-full"
            onClick={() => { setAdding(false); setSearch(''); }}
          >
            Cancel
          </Button>
        </div>
      )}

      {renderGroup('Blocking', ArrowRight, grouped.blocking)}
      {renderGroup('Blocked by', ArrowLeft, grouped.blockedBy)}
      {renderGroup('Related to', ArrowLeftRight, grouped.relatedTo)}

      {!hasAny && !adding && (
        <p className="text-[10px] text-muted-foreground">No dependencies</p>
      )}
    </div>
  );
}
