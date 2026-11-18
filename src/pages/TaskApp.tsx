import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Home, Inbox, CheckSquare, LayoutDashboard, ChevronDown, ChevronRight,
  Plus, Layers, ListTodo, Circle, CircleDot, CheckCircle2, Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { formatDate, daysUntil } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui-kit/EmptyState';

// =============================================================================
// Task — the new module (PRD v1.0, 18 Nov 2026). Self-contained: its own
// left rail (Home / Inbox / My Tasks / Dashboards / Spaces tree), matching
// the structure of the reference screenshots. Colours are KD Ops's own
// design tokens throughout, not the reference's palette.
//
// Backed entirely by the new tm_* tables — no connection to the legacy
// tasks/project_spaces schema other modules still use.
// =============================================================================

interface TmSpace { id: string; name: string; color: string; }
interface TmList { id: string; space_id: string; name: string; position: number; }
interface TmStatus { id: string; space_id: string; name: string; color: string; category: string; position: number; }
interface TmTask {
  id: string; list_id: string; title: string; status_id: string | null;
  priority: string; due_date: string | null; created_by: string | null; position: number;
}
interface ProfileLite { id: string; full_name: string; email: string; }

type NavKey = 'home' | 'inbox' | 'my-tasks' | 'dashboards';

export default function TaskApp() {
  const { profile } = useAuthStore();
  const [nav, setNav] = useState<NavKey>('my-tasks');
  const [selectedList, setSelectedList] = useState<string | null>(null);

  const [spaces, setSpaces] = useState<TmSpace[]>([]);
  const [lists, setLists] = useState<TmList[]>([]);
  const [statuses, setStatuses] = useState<TmStatus[]>([]);
  const [tasks, setTasks] = useState<TmTask[]>([]);
  const [profiles, setProfiles] = useState<Map<string, ProfileLite>>(new Map());
  const [assigneesByTask, setAssigneesByTask] = useState<Map<string, string[]>>(new Map());
  const [expandedSpaces, setExpandedSpaces] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [newTaskTitle, setNewTaskTitle] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const [spacesRes, listsRes, statusesRes, tasksRes, assigneesRes, profilesRes] = await Promise.all([
      supabase.from('tm_spaces').select('id, name, color').order('position'),
      supabase.from('tm_lists').select('id, space_id, name, position').order('position'),
      supabase.from('tm_statuses').select('id, space_id, name, color, category, position').order('position'),
      supabase.from('tm_tasks').select('id, list_id, title, status_id, priority, due_date, created_by, position').is('archived_at', null).order('position'),
      supabase.from('tm_task_assignees').select('task_id, user_id'),
      supabase.from('profiles').select('id, full_name, email'),
    ]);
    setSpaces((spacesRes.data as TmSpace[]) || []);
    setLists((listsRes.data as TmList[]) || []);
    setStatuses((statusesRes.data as TmStatus[]) || []);
    setTasks((tasksRes.data as TmTask[]) || []);

    const map = new Map<string, string[]>();
    for (const a of (assigneesRes.data as { task_id: string; user_id: string }[]) || []) {
      const arr = map.get(a.task_id) || [];
      arr.push(a.user_id);
      map.set(a.task_id, arr);
    }
    setAssigneesByTask(map);

    const pMap = new Map<string, ProfileLite>();
    for (const p of (profilesRes.data as ProfileLite[]) || []) pMap.set(p.id, p);
    setProfiles(pMap);

    setExpandedSpaces(new Set(((spacesRes.data as TmSpace[]) || []).map((s) => s.id)));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const myTasks = useMemo(() => {
    if (!profile?.id) return [];
    return tasks.filter((t) => (assigneesByTask.get(t.id) || []).includes(profile.id));
  }, [tasks, assigneesByTask, profile?.id]);

  const listTasks = useMemo(() => {
    if (!selectedList) return [];
    return tasks.filter((t) => t.list_id === selectedList);
  }, [tasks, selectedList]);

  const statusById = useMemo(() => new Map(statuses.map((s) => [s.id, s])), [statuses]);

  const toggleSpace = (id: string) => {
    setExpandedSpaces((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const createTask = async () => {
    if (!newTaskTitle.trim() || !selectedList) return;
    const { error } = await supabase.from('tm_tasks').insert({
      list_id: selectedList,
      title: newTaskTitle.trim(),
      created_by: profile?.id || null,
      status_id: statuses.find((s) => s.space_id === lists.find((l) => l.id === selectedList)?.space_id && s.category === 'not_started')?.id || null,
    });
    if (!error) { setNewTaskTitle(''); load(); }
  };

  const NAV_ITEMS: { key: NavKey; label: string; icon: typeof Home }[] = [
    { key: 'home', label: 'Home', icon: Home },
    { key: 'inbox', label: 'Inbox', icon: Inbox },
    { key: 'my-tasks', label: 'My Tasks', icon: CheckSquare },
    { key: 'dashboards', label: 'Dashboards', icon: LayoutDashboard },
  ];

  return (
    <div className="flex h-[calc(100dvh-theme(spacing.14)-theme(spacing.8))] -m-4 md:-m-5 lg:-m-6">
      {/* Internal rail — self-contained, matching the PRD's own sidebar structure */}
      <div className="w-60 shrink-0 border-r border-border/60 flex flex-col bg-muted/20">
        <div className="px-3 py-3 border-b border-border/40">
          <p className="text-sm font-semibold truncate">KD Squares</p>
        </div>

        <div className="p-2 space-y-0.5">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.key}
              onClick={() => { setNav(item.key); setSelectedList(null); }}
              className={cn(
                'flex items-center gap-2 w-full px-2.5 py-1.5 rounded-md text-sm font-medium transition-colors',
                nav === item.key && !selectedList ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </button>
          ))}
        </div>

        <div className="px-3 pt-3 pb-1 flex items-center justify-between">
          <p className="text-2xs font-semibold text-muted-foreground uppercase tracking-wide">Spaces</p>
          <Plus className="h-3.5 w-3.5 text-muted-foreground" />
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5">
          {spaces.map((space) => {
            const spaceLists = lists.filter((l) => l.space_id === space.id);
            const expanded = expandedSpaces.has(space.id);
            return (
              <div key={space.id}>
                <button
                  onClick={() => toggleSpace(space.id)}
                  className="flex items-center gap-1.5 w-full px-2 py-1.5 rounded-md text-sm font-medium hover:bg-muted/60 transition-colors"
                >
                  {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  <Layers className="h-3.5 w-3.5" style={{ color: space.color }} />
                  <span className="truncate">{space.name}</span>
                </button>
                {expanded && (
                  <div className="ml-5 space-y-0.5">
                    {spaceLists.map((list) => (
                      <button
                        key={list.id}
                        onClick={() => { setSelectedList(list.id); setNav('my-tasks'); }}
                        className={cn(
                          'flex items-center gap-1.5 w-full px-2 py-1 rounded-md text-xs transition-colors',
                          selectedList === list.id ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                        )}
                      >
                        <ListTodo className="h-3 w-3" />
                        <span className="truncate">{list.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 lg:p-6">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : selectedList ? (
          <ListContent
            list={lists.find((l) => l.id === selectedList)!}
            tasks={listTasks}
            statuses={statuses.filter((s) => s.space_id === lists.find((l) => l.id === selectedList)?.space_id)}
            profiles={profiles}
            assigneesByTask={assigneesByTask}
            newTaskTitle={newTaskTitle}
            setNewTaskTitle={setNewTaskTitle}
            onCreateTask={createTask}
          />
        ) : nav === 'my-tasks' ? (
          <MyTasksContent tasks={myTasks} statusById={statusById} />
        ) : nav === 'home' ? (
          <HomeContent myTaskCount={myTasks.length} profile={profile} />
        ) : nav === 'inbox' ? (
          <InboxContent userId={profile?.id} />
        ) : (
          <DashboardsContent tasks={tasks} statusById={statusById} />
        )}
      </div>
    </div>
  );
}

function StatusDot({ category }: { category?: string }) {
  if (category === 'done' || category === 'closed') return <CheckCircle2 className="h-3.5 w-3.5 text-success" />;
  if (category === 'active') return <CircleDot className="h-3.5 w-3.5 text-primary" />;
  return <Circle className="h-3.5 w-3.5 text-muted-foreground" />;
}

function HomeContent({ myTaskCount, profile }: { myTaskCount: number; profile: { full_name?: string } | null }) {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Welcome back{profile?.full_name ? `, ${profile.full_name.split(' ')[0]}` : ''}</h1>
      <div className="rounded-lg border p-4">
        <p className="text-sm text-muted-foreground">You have</p>
        <p className="text-3xl font-bold text-primary">{myTaskCount}</p>
        <p className="text-sm text-muted-foreground">task{myTaskCount === 1 ? '' : 's'} assigned to you</p>
      </div>
    </div>
  );
}

function MyTasksContent({ tasks, statusById }: { tasks: TmTask[]; statusById: Map<string, TmStatus> }) {
  if (tasks.length === 0) {
    return (
      <EmptyState
        illustration="plane"
        title="Nothing assigned to you"
        description="Tasks assigned to you across every space will show up here."
        tone="success"
      />
    );
  }
  return (
    <div className="space-y-1">
      <h1 className="text-xl font-semibold mb-3">My Tasks</h1>
      {tasks.map((t) => {
        const status = statusById.get(t.status_id || '');
        const d = t.due_date ? daysUntil(t.due_date) : null;
        const overdue = d !== null && d < 0 && status?.category !== 'done';
        return (
          <div key={t.id} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-muted/50 transition-colors">
            <StatusDot category={status?.category} />
            <span className="flex-1 text-sm font-medium truncate">{t.title}</span>
            {status && <span className="text-2xs px-1.5 py-0.5 rounded-full" style={{ backgroundColor: `${status.color}20`, color: status.color }}>{status.name}</span>}
            {t.due_date && (
              <span className={cn('text-2xs tabular-nums', overdue ? 'text-destructive font-medium' : 'text-muted-foreground')}>
                {formatDate(t.due_date)}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ListContent({
  list, tasks, statuses, profiles, assigneesByTask, newTaskTitle, setNewTaskTitle, onCreateTask,
}: {
  list: TmList; tasks: TmTask[]; statuses: TmStatus[];
  profiles: Map<string, ProfileLite>; assigneesByTask: Map<string, string[]>;
  newTaskTitle: string; setNewTaskTitle: (v: string) => void; onCreateTask: () => void;
}) {
  const grouped = useMemo(() => {
    const byStatus = new Map<string, TmTask[]>();
    for (const s of statuses) byStatus.set(s.id, []);
    byStatus.set('__none__', []);
    for (const t of tasks) {
      const key = t.status_id && byStatus.has(t.status_id) ? t.status_id : '__none__';
      byStatus.get(key)!.push(t);
    }
    return byStatus;
  }, [statuses, tasks]);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">{list.name}</h1>
      {[...statuses].sort((a, b) => a.position - b.position).map((status) => {
        const group = grouped.get(status.id) || [];
        return (
          <div key={status.id}>
            <div className="flex items-center gap-2 mb-1.5">
              <div className="h-2 w-2 rounded-full" style={{ backgroundColor: status.color }} />
              <span className="text-sm font-semibold">{status.name}</span>
              <span className="text-2xs text-muted-foreground tabular-nums">{group.length}</span>
            </div>
            <div className="space-y-0.5 ml-1">
              {group.map((t) => {
                const assignees = (assigneesByTask.get(t.id) || []).map((id) => profiles.get(id)?.full_name).filter(Boolean);
                return (
                  <div key={t.id} className="flex items-center gap-3 px-3 py-1.5 rounded-lg hover:bg-muted/50 transition-colors">
                    <span className="flex-1 text-sm truncate">{t.title}</span>
                    {assignees.length > 0 && <span className="text-2xs text-muted-foreground truncate max-w-[140px]">{assignees.join(', ')}</span>}
                  </div>
                );
              })}
              {group.length === 0 && <p className="text-2xs text-muted-foreground px-3 py-1">No tasks</p>}
            </div>
          </div>
        );
      })}

      <div className="flex gap-2 pt-2">
        <Input
          className="h-8 text-sm"
          placeholder="New task title..."
          value={newTaskTitle}
          onChange={(e) => setNewTaskTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') onCreateTask(); }}
        />
        <Button size="sm" onClick={onCreateTask}>Add task</Button>
      </div>
    </div>
  );
}

function InboxContent({ userId }: { userId?: string }) {
  const [items, setItems] = useState<{ id: string; title: string; body: string; created_at: string; read_at: string | null }[]>([]);

  useEffect(() => {
    if (!userId) return;
    supabase
      .from('notifications')
      .select('id, title, body, created_at, read')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(30)
      .then(({ data }) => setItems(((data as any[]) || []).map((n) => ({ ...n, read_at: n.read ? n.created_at : null }))));
  }, [userId]);

  if (items.length === 0) {
    return <EmptyState illustration="radar" title="All caught up" description="Notifications will show up here." tone="default" compact />;
  }

  return (
    <div className="space-y-1">
      <h1 className="text-xl font-semibold mb-3">Inbox</h1>
      {items.map((n) => (
        <div key={n.id} className={cn('px-3 py-2 rounded-lg', !n.read_at && 'bg-primary/5')}>
          <p className="text-sm font-medium">{n.title}</p>
          <p className="text-xs text-muted-foreground">{n.body}</p>
        </div>
      ))}
    </div>
  );
}

function DashboardsContent({ tasks, statusById }: { tasks: TmTask[]; statusById: Map<string, TmStatus> }) {
  const open = tasks.filter((t) => statusById.get(t.status_id || '')?.category !== 'done').length;
  const done = tasks.length - open;
  const overdue = tasks.filter((t) => {
    if (!t.due_date) return false;
    const d = daysUntil(t.due_date);
    return d !== null && d < 0 && statusById.get(t.status_id || '')?.category !== 'done';
  }).length;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Dashboards</h1>
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border p-4">
          <p className="text-2xl font-bold">{open}</p>
          <p className="text-xs text-muted-foreground">Open</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-2xl font-bold text-success">{done}</p>
          <p className="text-xs text-muted-foreground">Completed</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-2xl font-bold text-destructive">{overdue}</p>
          <p className="text-xs text-muted-foreground">Overdue</p>
        </div>
      </div>
    </div>
  );
}
