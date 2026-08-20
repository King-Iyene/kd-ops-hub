import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDebounce } from '@/hooks/useDebounce';
import {
  Target,
  Plus,
  Loader2,
  Pencil,
  Trash2,
  CheckCircle2,
  Download,
  Search,
  Building2,
  User as UserIcon,
  Users as UsersIcon,
  ChevronDown,
  ChevronRight,
  ListTodo,
  Link2,
  Unlink,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { usePageTitle } from '@/hooks/usePageTitle';
import { logAudit } from '@/lib/audit';
import { formatDate, toIsoDate } from '@/lib/format';
import { toCsv, downloadCsv } from '@/lib/csv';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { PageHeader } from '@/components/ui-kit/PageHeader';
import { EmptyState } from '@/components/ui-kit/EmptyState';
import { StatCard } from '@/components/ui-kit/StatCard';
import {
  MobileCard,
  MobileCardHeader,
  MobileCardTitle,
  MobileCardMeta,
  MobileCardRow,
  MobileCardFooter,
} from '@/components/ui-kit/MobileCard';
import { TableSkeleton } from '@/components/ui-kit/TableSkeleton';

type Scope = 'company' | 'team' | 'individual';
type Status = 'open' | 'in_progress' | 'complete' | 'missed';

interface Goal {
  id: string;
  title: string;
  description: string | null;
  scope: Scope;
  owner_id: string | null;
  department_id: string | null;
  quarter: string;
  status: Status;
  progress_pct: number;
  created_by: string | null;
  completed_at: string | null;
  created_at: string;
}

interface ProfileRow {
  id: string;
  full_name: string;
  email: string;
}

interface Department {
  id: string;
  name: string;
}

interface LinkedTask {
  id: string;
  title: string;
  status: string;
  priority: string;
  assignee_id: string | null;
}

const SCOPE_LABEL: Record<Scope, string> = {
  company: 'Company',
  team: 'Team',
  individual: 'Individual',
};

const SCOPE_ICON: Record<Scope, typeof Target> = {
  company: Building2,
  team: UsersIcon,
  individual: UserIcon,
};

const STATUS_CLASS: Record<Status, string> = {
  open: 'bg-muted text-muted-foreground',
  in_progress: 'bg-info/10 text-info',
  complete: 'bg-success/10 text-success',
  missed: 'bg-destructive/10 text-destructive',
};

const currentQuarter = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`;
};

const quarterOptions = (): string[] => {
  const now = new Date();
  const current = Math.floor(now.getMonth() / 3) + 1;
  const q = (y: number, n: number) => `${y}-Q${n}`;
  return [
    q(now.getFullYear() + 1, 1),
    q(now.getFullYear(), 4),
    q(now.getFullYear(), 3),
    q(now.getFullYear(), 2),
    q(now.getFullYear(), 1),
    q(now.getFullYear() - 1, 4),
  ].filter((val) => {
    const [y, qn] = val.split('-Q').map(Number);
    return y !== now.getFullYear() || qn >= current - 2;
  });
};

const Goals = () => {
  usePageTitle('Goals');
  const { profile } = useAuthStore();
  const { toast } = useToast();

  const isSuperAdmin = profile?.role === 'super_admin';
  const isAdmin =
    profile?.role === 'admin' || profile?.role === 'super_admin';

  const [goals, setGoals] = useState<Goal[]>([]);
  const [profiles, setProfiles] = useState<Map<string, ProfileRow>>(new Map());
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);

  const [goalTasksMap, setGoalTasksMap] = useState<Map<string, LinkedTask[]>>(new Map());
  const [expandedGoals, setExpandedGoals] = useState<Set<string>>(new Set());

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search);
  const [scopeFilter, setScopeFilter] = useState<'all' | Scope>('all');
  const [quarterFilter, setQuarterFilter] = useState<'all' | string>(currentQuarter());
  const [statusFilter, setStatusFilter] = useState<'all' | Status>('all');

  const [dialog, setDialog] = useState(false);
  const [editing, setEditing] = useState<Goal | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Goal | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: '',
    description: '',
    scope: 'individual' as Scope,
    owner_id: profile?.id || '',
    department_id: '',
    quarter: currentQuarter(),
    progress_pct: 0,
    status: 'open' as Status,
  });

  const load = useCallback(async () => {
    setLoading(true);
    const [goalsRes, profilesRes, depsRes] = await Promise.all([
      supabase.from('goals').select('id, title, description, scope, owner_id, department_id, quarter, status, progress_pct, completed_at, created_at').order('created_at', { ascending: false }).limit(200),
      supabase.from('profiles_directory').select('id, full_name, email').neq('is_anonymised', true).order('full_name').limit(500),
      supabase.from('departments').select('id, name').order('name'),
    ]);
    const goalsData = (goalsRes.data as Goal[]) || [];
    setGoals(goalsData);
    const m = new Map<string, ProfileRow>();
    for (const p of (profilesRes.data as ProfileRow[]) || []) m.set(p.id, p);
    setProfiles(m);
    setDepartments((depsRes.data as Department[]) || []);

    const goalIds = goalsData.map((g) => g.id);
    if (goalIds.length > 0) {
      const [directRes, junctionRes] = await Promise.all([
        supabase
          .from('tasks')
          .select('id, title, status, priority, assignee_id, goal_id')
          .in('goal_id', goalIds),
        supabase
          .from('goal_tasks')
          .select('goal_id, task:task_id(id, title, status, priority, assignee_id)')
          .in('goal_id', goalIds),
      ]);
      const taskMap = new Map<string, LinkedTask[]>();
      for (const t of (directRes.data || []) as any[]) {
        if (!t.goal_id) continue;
        const arr = taskMap.get(t.goal_id) || [];
        arr.push({ id: t.id, title: t.title, status: t.status, priority: t.priority, assignee_id: t.assignee_id });
        taskMap.set(t.goal_id, arr);
      }
      for (const row of (junctionRes.data || []) as any[]) {
        const t = row.task;
        if (!t || !row.goal_id) continue;
        const arr = taskMap.get(row.goal_id) || [];
        if (!arr.some((x: LinkedTask) => x.id === t.id)) {
          arr.push({ id: t.id, title: t.title, status: t.status, priority: t.priority, assignee_id: t.assignee_id });
        }
        taskMap.set(row.goal_id, arr);
      }
      setGoalTasksMap(taskMap);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const resetForm = () =>
    setForm({
      title: '',
      description: '',
      scope: 'individual',
      owner_id: profile?.id || '',
      department_id: '',
      quarter: currentQuarter(),
      progress_pct: 0,
      status: 'open',
    });

  const openCreate = () => {
    setEditing(null);
    resetForm();
    setDialog(true);
  };

  const syncProgressFromTasks = async (g: Goal) => {
    const tasks = goalTasksMap.get(g.id) || [];
    if (tasks.length === 0) {
      toast({ title: 'No linked tasks', description: 'Link tasks first to sync progress', variant: 'destructive' });
      return;
    }
    const pct = Math.round((tasks.filter((t) => t.status === 'complete').length / tasks.length) * 100);
    const newStatus = pct === 100 ? 'complete' : pct > 0 ? 'in_progress' : g.status;
    const { error } = await supabase
      .from('goals')
      .update({
        progress_pct: pct,
        status: newStatus,
        completed_at: newStatus === 'complete' ? new Date().toISOString() : null,
      })
      .eq('id', g.id);
    if (error) {
      toast({ title: 'Sync failed', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: `Progress synced to ${pct}%` });
    load();
  };

  const openEdit = (g: Goal) => {
    setEditing(g);
    setForm({
      title: g.title,
      description: g.description || '',
      scope: g.scope,
      owner_id: g.owner_id || '',
      department_id: g.department_id || '',
      quarter: g.quarter,
      progress_pct: g.progress_pct,
      status: g.status,
    });
    setDialog(true);
  };

  const save = async () => {
    if (!form.title.trim()) {
      toast({ title: 'Title is required', variant: 'destructive' });
      return;
    }
    if (form.scope === 'company' && !isSuperAdmin) {
      toast({
        title: 'Only Super Admin can set company goals',
        variant: 'destructive',
      });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description || null,
        scope: form.scope,
        owner_id: form.scope === 'company' ? null : form.owner_id || null,
        department_id: form.scope === 'team' ? form.department_id || null : null,
        quarter: form.quarter,
        progress_pct: form.progress_pct,
        status: form.status,
        completed_at: form.status === 'complete' ? new Date().toISOString() : null,
      };
      if (editing) {
        const { error } = await supabase.from('goals').update(payload).eq('id', editing.id);
        if (error) throw error;
        await logAudit('goal_updated', `Goal "${payload.title}" updated`, profile);
        toast({ title: 'Goal updated' });
      } else {
        const { error } = await supabase.from('goals').insert({
          ...payload,
          created_by: profile?.id || null,
        });
        if (error) throw error;
        await logAudit('goal_created', `Goal "${payload.title}" created (${form.scope})`, profile);
        toast({ title: 'Goal created' });
      }
      setDialog(false);
      setEditing(null);
      resetForm();
      load();
    } catch (err: any) {
      toast({ title: 'Save failed', description: err?.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const markComplete = async (g: Goal) => {
    const { error } = await supabase
      .from('goals')
      .update({
        status: 'complete',
        progress_pct: 100,
        completed_at: new Date().toISOString(),
      })
      .eq('id', g.id);
    if (error) {
      toast({ title: 'Update failed', description: error.message, variant: 'destructive' });
      return;
    }
    await logAudit('goal_completed', `Goal "${g.title}" completed`, profile);
    toast({ title: 'Goal completed' });
    load();
  };

  const remove = (g: Goal) => setPendingDelete(g);

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const { error } = await supabase.from('goals').delete().eq('id', pendingDelete.id);
    setPendingDelete(null);
    if (error) {
      toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Goal deleted' });
    load();
  };

  const toggleExpand = (id: string) => {
    setExpandedGoals((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const unlinkTask = async (goalId: string, taskId: string) => {
    await Promise.all([
      supabase.from('tasks').update({ goal_id: null }).eq('id', taskId).eq('goal_id', goalId),
      supabase.from('goal_tasks').delete().eq('goal_id', goalId).eq('task_id', taskId),
    ]);
    toast({ title: 'Task unlinked' });
    load();
  };

  const exportCsv = () => {
    const header = [
      'title',
      'scope',
      'owner',
      'quarter',
      'status',
      'progress_pct',
      'created_at',
      'completed_at',
    ];
    const rows = goals.map((g) => [
      g.title,
      g.scope,
      g.owner_id ? profiles.get(g.owner_id)?.full_name || g.owner_id : '—',
      g.quarter,
      g.status,
      g.progress_pct,
      formatDate(g.created_at),
      g.completed_at ? formatDate(g.completed_at) : '',
    ]);
    downloadCsv(`kdops-goals-${toIsoDate(new Date())}.csv`, toCsv(header, rows));
  };

  const visible = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    return goals.filter((g) => {
      if (scopeFilter !== 'all' && g.scope !== scopeFilter) return false;
      if (quarterFilter !== 'all' && g.quarter !== quarterFilter) return false;
      if (statusFilter !== 'all' && g.status !== statusFilter) return false;
      if (!q) return true;
      const owner = g.owner_id ? profiles.get(g.owner_id)?.full_name || '' : '';
      return (
        g.title.toLowerCase().includes(q) ||
        (g.description || '').toLowerCase().includes(q) ||
        owner.toLowerCase().includes(q)
      );
    });
  }, [goals, debouncedSearch, scopeFilter, quarterFilter, statusFilter, profiles]);

  const myStats = useMemo(() => {
    const mine = goals.filter(
      (g) =>
        g.owner_id === profile?.id &&
        g.quarter === currentQuarter(),
    );
    const complete = mine.filter((g) => g.status === 'complete').length;
    const avg =
      mine.length > 0
        ? Math.round(
            mine.reduce((s, g) => s + g.progress_pct, 0) / mine.length,
          )
        : 0;
    return { count: mine.length, complete, avg };
  }, [goals, profile?.id]);

  const orgStats = useMemo(() => {
    const cq = currentQuarter();
    const thisQ = goals.filter((g) => g.quarter === cq);
    const total = thisQ.length;
    const complete = thisQ.filter((g) => g.status === 'complete').length;
    const missed = thisQ.filter((g) => g.status === 'missed').length;
    const avgProgress = total > 0 ? Math.round(thisQ.reduce((s, g) => s + g.progress_pct, 0) / total) : 0;
    const byScope = {
      company: thisQ.filter((g) => g.scope === 'company').length,
      team: thisQ.filter((g) => g.scope === 'team').length,
      individual: thisQ.filter((g) => g.scope === 'individual').length,
    };
    return { total, complete, missed, avgProgress, byScope };
  }, [goals]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Goals & Performance"
        description="Track company, team and individual goals by quarter. Celebrate what ships."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={goals.length === 0}>
              <Download className="mr-2 h-4 w-4" /> Export CSV
            </Button>
            <Button size="sm" onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" /> New goal
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard
          title="My goals this quarter"
          value={myStats.count}
          subtitle={currentQuarter()}
          icon={Target}
          tone="primary"
        />
        <StatCard
          title="Completed"
          value={`${myStats.complete} / ${myStats.count}`}
          subtitle="This quarter"
          icon={CheckCircle2}
          tone="success"
        />
        <StatCard
          title="Avg progress"
          value={`${myStats.avg}%`}
          subtitle="Across my goals"
          icon={Target}
          tone="warning"
        />
      </div>

      {isAdmin && orgStats.total > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <StatCard title="Org goals" value={orgStats.total} subtitle={currentQuarter()} icon={Building2} tone="primary" />
          <StatCard title="Completed" value={orgStats.complete} subtitle="This quarter" icon={CheckCircle2} tone="success" />
          <StatCard title="Missed" value={orgStats.missed} icon={Target} tone={orgStats.missed > 0 ? 'danger' : 'default'} />
          <StatCard title="Org avg progress" value={`${orgStats.avgProgress}%`} icon={Target} tone="warning" />
          <StatCard title="Company / Team / Individual" value={`${orgStats.byScope.company} / ${orgStats.byScope.team} / ${orgStats.byScope.individual}`} icon={UsersIcon} tone="default" />
        </div>
      )}

      <Card>
        <div className="p-3 sm:p-4 border-b flex gap-2 items-center flex-wrap">
          <div className="relative w-full sm:flex-1 sm:min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9 h-10 sm:h-9"
              placeholder="Search goals..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={scopeFilter} onValueChange={(v) => setScopeFilter(v as any)}>
            <SelectTrigger className="flex-1 sm:flex-initial sm:w-[150px] h-10 sm:h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All scopes</SelectItem>
              <SelectItem value="company">Company</SelectItem>
              <SelectItem value="team">Team</SelectItem>
              <SelectItem value="individual">Individual</SelectItem>
            </SelectContent>
          </Select>
          <Select value={quarterFilter} onValueChange={setQuarterFilter}>
            <SelectTrigger className="flex-1 sm:flex-initial sm:w-[140px] h-10 sm:h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All quarters</SelectItem>
              {quarterOptions().map((q) => (
                <SelectItem key={q} value={q}>
                  {q}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
            <SelectTrigger className="flex-1 sm:flex-initial sm:w-[160px] h-10 sm:h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="complete">Complete</SelectItem>
              <SelectItem value="missed">Missed</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <CardContent className="p-0">
          {loading ? (
            <TableSkeleton rows={6} cols={7} />
          ) : visible.length === 0 ? (
            <EmptyState
              illustration="satellite"
              title="No goals match"
              description="Set your first goal — company-wide, per team, or for yourself."
              action={
                <Button onClick={openCreate}>
                  <Plus className="mr-2 h-4 w-4" /> New goal
                </Button>
              }
            />
          ) : (
            <>
            <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>Goal</TableHead>
                  <TableHead>Scope</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Quarter</TableHead>
                  <TableHead className="w-[160px]">Progress</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((g) => {
                  const Icon = SCOPE_ICON[g.scope];
                  const owner = g.owner_id ? profiles.get(g.owner_id) : null;
                  const isMine = g.owner_id === profile?.id;
                  const linkedTasks = goalTasksMap.get(g.id) || [];
                  const isExpanded = expandedGoals.has(g.id);
                  const taskProgress = linkedTasks.length > 0
                    ? Math.round((linkedTasks.filter((t) => t.status === 'complete').length / linkedTasks.length) * 100)
                    : null;
                  return (
                    <>
                    <TableRow key={g.id} className="kd-transition">
                      <TableCell className="w-8 px-2">
                        {linkedTasks.length > 0 ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            onClick={() => toggleExpand(g.id)}
                          >
                            {isExpanded
                              ? <ChevronDown className="h-4 w-4" />
                              : <ChevronRight className="h-4 w-4" />}
                          </Button>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <p className="font-medium">{g.title}</p>
                        {g.description && (
                          <p className="text-xs text-muted-foreground truncate max-w-md">
                            {g.description}
                          </p>
                        )}
                        {linkedTasks.length > 0 && (
                          <div className="flex items-center gap-1 mt-1">
                            <ListTodo className="h-3 w-3 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">
                              {linkedTasks.filter((t) => t.status === 'complete').length}/{linkedTasks.length} tasks done
                            </span>
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="gap-1">
                          <Icon className="h-3 w-3" />
                          {SCOPE_LABEL[g.scope]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {g.scope === 'company' ? (
                          <span className="text-muted-foreground">All hands</span>
                        ) : owner ? (
                          owner.full_name || owner.email
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>{g.quarter}</TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full bg-primary kd-transition"
                              style={{ width: `${g.progress_pct}%` }}
                            />
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {g.progress_pct}%
                            {taskProgress !== null && taskProgress !== g.progress_pct && (
                              <span className="ml-1 text-info">({taskProgress}% by tasks)</span>
                            )}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={STATUS_CLASS[g.status]}>
                          {g.status.replace('_', ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {linkedTasks.length > 0 && taskProgress !== g.progress_pct && (isMine || isAdmin) && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => syncProgressFromTasks(g)}
                              title="Sync progress from linked tasks"
                            >
                              <ListTodo className="h-4 w-4 text-info" />
                            </Button>
                          )}
                          {g.status !== 'complete' && isMine && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => markComplete(g)}
                              title="Mark complete"
                            >
                              <CheckCircle2 className="h-4 w-4 text-success" />
                            </Button>
                          )}
                          {(isMine || isAdmin) && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => openEdit(g)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          )}
                          {isAdmin && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => remove(g)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                    {isExpanded && linkedTasks.map((t) => (
                      <TableRow key={`${g.id}-${t.id}`} className="bg-muted/30">
                        <TableCell />
                        <TableCell colSpan={5} className="pl-8">
                          <div className="flex items-center gap-2">
                            <Link2 className="h-3 w-3 text-muted-foreground shrink-0" />
                            <span className="text-sm">{t.title}</span>
                            <Badge variant="secondary" className={
                              t.status === 'complete' ? 'bg-success/10 text-success' :
                              t.status === 'in_progress' ? 'bg-info/10 text-info' :
                              t.status === 'blocked' ? 'bg-destructive/10 text-destructive' :
                              'bg-muted text-muted-foreground'
                            }>
                              {t.status.replace('_', ' ')}
                            </Badge>
                            {t.assignee_id && profiles.get(t.assignee_id) && (
                              <span className="text-xs text-muted-foreground">
                                {profiles.get(t.assignee_id)!.full_name}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell />
                        <TableCell className="text-right">
                          {(isMine || isAdmin) && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0"
                              onClick={() => unlinkTask(g.id, t.id)}
                              title="Unlink task"
                            >
                              <Unlink className="h-3 w-3 text-muted-foreground" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                    </>
                  );
                })}
              </TableBody>
            </Table>
            </div>
            {/* Mobile card view */}
            <div className="md:hidden space-y-2 p-1">
              {visible.map((g) => {
                const Icon = SCOPE_ICON[g.scope];
                const owner = g.owner_id ? profiles.get(g.owner_id) : null;
                const isMine = g.owner_id === profile?.id;
                const linkedTasks = goalTasksMap.get(g.id) || [];
                const taskProgress = linkedTasks.length > 0
                  ? Math.round((linkedTasks.filter((t) => t.status === 'complete').length / linkedTasks.length) * 100)
                  : null;
                return (
                  <MobileCard key={g.id}>
                    <MobileCardHeader>
                      <MobileCardTitle>{g.title}</MobileCardTitle>
                      <MobileCardMeta>
                        <Badge variant="secondary" className={STATUS_CLASS[g.status]}>
                          {g.status.replace('_', ' ')}
                        </Badge>
                      </MobileCardMeta>
                    </MobileCardHeader>
                    <div className="space-y-1.5">
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full bg-primary kd-transition"
                          style={{ width: `${g.progress_pct}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>
                          {g.progress_pct}%
                          {taskProgress !== null && taskProgress !== g.progress_pct && (
                            <span className="ml-1 text-info">({taskProgress}% by tasks)</span>
                          )}
                        </span>
                        <span>{g.quarter}</span>
                      </div>
                    </div>
                    <MobileCardRow label="Scope">
                      <Badge variant="secondary" className="gap-1">
                        <Icon className="h-3 w-3" />
                        {SCOPE_LABEL[g.scope]}
                      </Badge>
                    </MobileCardRow>
                    <MobileCardRow label="Owner">
                      {g.scope === 'company' ? 'All hands' : owner ? (owner.full_name || owner.email) : '—'}
                    </MobileCardRow>
                    <MobileCardFooter>
                      <div className="flex gap-1">
                        {g.status !== 'complete' && isMine && (
                          <Button size="sm" variant="ghost" onClick={() => markComplete(g)} title="Mark complete">
                            <CheckCircle2 className="h-4 w-4 text-success" />
                          </Button>
                        )}
                        {(isMine || isAdmin) && (
                          <Button size="sm" variant="ghost" onClick={() => openEdit(g)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                        {isAdmin && (
                          <Button size="sm" variant="ghost" onClick={() => remove(g)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </MobileCardFooter>
                  </MobileCard>
                );
              })}
            </div>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit goal' : 'New goal'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Title</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. Ship invoice automation by end of Q2"
              />
            </div>
            <div className="space-y-1">
              <Label>Description</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={3}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Scope</Label>
                <Select
                  value={form.scope}
                  onValueChange={(v) => setForm({ ...form, scope: v as Scope })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {isSuperAdmin && <SelectItem value="company">Company</SelectItem>}
                    <SelectItem value="team">Team</SelectItem>
                    <SelectItem value="individual">Individual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Quarter</Label>
                <Select
                  value={form.quarter}
                  onValueChange={(v) => setForm({ ...form, quarter: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {quarterOptions().map((q) => (
                      <SelectItem key={q} value={q}>
                        {q}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {form.scope !== 'company' && (
                <div className="space-y-1 col-span-2">
                  <Label>{form.scope === 'team' ? 'Department' : 'Owner'}</Label>
                  {form.scope === 'team' ? (
                    <Select
                      value={form.department_id || 'none'}
                      onValueChange={(v) =>
                        setForm({ ...form, department_id: v === 'none' ? '' : v })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Unassigned</SelectItem>
                        {departments.map((d) => (
                          <SelectItem key={d.id} value={d.id}>
                            {d.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Select
                      value={form.owner_id}
                      onValueChange={(v) => setForm({ ...form, owner_id: v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Pick an owner" />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from(profiles.values()).map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.full_name || p.email}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              )}
              <div className="space-y-1">
                <Label>Progress (%)</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={form.progress_pct}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      progress_pct: Math.max(
                        0,
                        Math.min(100, parseInt(e.target.value, 10) || 0),
                      ),
                    })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>Status</Label>
                <Select
                  value={form.status}
                  onValueChange={(v) => setForm({ ...form, status: v as Status })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="complete">Complete</SelectItem>
                    <SelectItem value="missed">Missed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(false)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editing ? 'Save changes' : 'Create goal'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <GoalDeleteDialog
        goal={pendingDelete}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
};

function GoalDeleteDialog({ goal, onConfirm, onCancel }: { goal: Goal | null; onConfirm: () => void; onCancel: () => void }) {
  return (
    <AlertDialog open={!!goal} onOpenChange={(v) => { if (!v) onCancel(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete goal?</AlertDialogTitle>
          <AlertDialogDescription>
            "{goal?.title}" will be permanently deleted. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default Goals;

// --- Dashboard widget -------------------------------------------------------

export function MyGoalsWidget() {
  const { profile } = useAuthStore();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile?.id) return;
    supabase
      .from('goals')
      .select('id, title, status, progress_pct')
      .eq('owner_id', profile.id)
      .eq('quarter', currentQuarter())
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setGoals((data as Goal[]) || []);
        setLoading(false);
      });
  }, [profile?.id]);

  const avg =
    goals.length > 0
      ? Math.round(goals.reduce((s, g) => s + g.progress_pct, 0) / goals.length)
      : 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Target className="h-4 w-4 text-primary" /> My goals this quarter
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="py-4 flex items-center justify-center">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : goals.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">
            No goals assigned for {currentQuarter()}.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-full flex items-center justify-center text-sm font-bold"
                   style={{
                     background: `conic-gradient(#006994 ${avg * 3.6}deg, #e5e7eb 0)`,
                   }}>
                <span className="h-10 w-10 rounded-full bg-background flex items-center justify-center">
                  {avg}%
                </span>
              </div>
              <div>
                <p className="text-sm font-semibold">{currentQuarter()}</p>
                <p className="text-xs text-muted-foreground">
                  {goals.filter((g) => g.status === 'complete').length} of{' '}
                  {goals.length} complete
                </p>
              </div>
            </div>
            <div className="space-y-1">
              {goals.slice(0, 3).map((g) => (
                <div
                  key={g.id}
                  className="flex items-center justify-between text-xs border rounded-md px-2 py-1.5"
                >
                  <span className="truncate max-w-[220px]">{g.title}</span>
                  <Badge variant="secondary" className={STATUS_CLASS[g.status]}>
                    {g.progress_pct}%
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
