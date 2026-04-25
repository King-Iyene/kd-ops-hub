import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Briefcase,
  Inbox,
  ListTodo,
  CalendarDays,
  Clock,
  ArrowRight,
  Flag,
  Plus,
  Loader2,
  AlertTriangle,
  Receipt,
  CreditCard,
  ChevronRight,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { useApprovalStore } from '@/store/approvalStore';
import { logAudit } from '@/lib/audit';
import { formatDate, daysUntil, toIsoDate } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { PageHeader } from '@/components/ui-kit/PageHeader';
import { StatCard } from '@/components/ui-kit/StatCard';
import { usePageTitle } from '@/hooks/usePageTitle';

type Priority = 'critical' | 'high' | 'normal' | 'low';
type TaskStatus = 'open' | 'in_progress' | 'blocked' | 'complete';

interface Task {
  id: string;
  title: string;
  priority: Priority;
  status: TaskStatus;
  due_date: string | null;
  assignee_id: string | null;
  assignee_name?: string;
}

interface ApprovalSnippet {
  id: string;
  kind: 'expense' | 'batch';
  label: string;
  date: string;
}

interface Profile {
  id: string;
  full_name: string;
}

const PRIORITY_CLASS: Record<Priority, string> = {
  critical: 'bg-destructive/10 text-destructive border-destructive/30',
  high: 'bg-warning/10 text-warning border-warning/30',
  normal: 'bg-info/10 text-info border-info/30',
  low: 'bg-muted text-muted-foreground border-border',
};

const STATUS_CLASS: Record<TaskStatus, string> = {
  open: 'bg-muted text-muted-foreground',
  in_progress: 'bg-info/10 text-info',
  blocked: 'bg-destructive/10 text-destructive',
  complete: 'bg-success/10 text-success',
};

export default function ExecAssist() {
  usePageTitle('Executive Assist');
  const { profile } = useAuthStore();
  const { toast } = useToast();
  const navigate = useNavigate();
  const approvalTotal = useApprovalStore((s) => s.counts.total);
  const refreshApprovals = useApprovalStore((s) => s.refresh);

  const [loading, setLoading] = useState(true);
  const [priorityTasks, setPriorityTasks] = useState<Task[]>([]);
  const [upcomingTasks, setUpcomingTasks] = useState<Task[]>([]);
  const [overdueCount, setOverdueCount] = useState(0);
  const [pendingLeaveCount, setPendingLeaveCount] = useState(0);
  const [approvalSnippets, setApprovalSnippets] = useState<ApprovalSnippet[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);

  const [newTitle, setNewTitle] = useState('');
  const [newPriority, setNewPriority] = useState<Priority>('normal');
  const [newDue, setNewDue] = useState('');
  const [newAssignee, setNewAssignee] = useState('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const today = toIsoDate(new Date());
    const in7 = toIsoDate(new Date(Date.now() + 7 * 86400000));

    const [priorityRes, upcomingRes, overdueRes, leaveRes, expenseRes, batchRes, profilesRes] =
      await Promise.all([
        supabase
          .from('tasks')
          .select('id, title, priority, status, due_date, assignee_id')
          .in('priority', ['critical', 'high'])
          .neq('status', 'complete')
          .order('priority', { ascending: false })
          .limit(8),

        supabase
          .from('tasks')
          .select('id, title, priority, status, due_date, assignee_id')
          .neq('status', 'complete')
          .gte('due_date', today)
          .lte('due_date', in7)
          .order('due_date', { ascending: true })
          .limit(7),

        supabase
          .from('tasks')
          .select('id', { count: 'exact', head: true })
          .neq('status', 'complete')
          .lt('due_date', today),

        supabase
          .from('leave_requests')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'pending'),

        supabase
          .from('expenses')
          .select('id, description, created_at')
          .eq('status', 'pending')
          .order('created_at', { ascending: false })
          .limit(3),

        supabase
          .from('payment_batches')
          .select('id, name, created_at')
          .eq('status', 'pending_approval')
          .order('created_at', { ascending: false })
          .limit(2),

        supabase.from('profiles').select('id, full_name').order('full_name'),
      ]);

    const profileMap = new Map<string, string>();
    for (const p of (profilesRes.data ?? []) as Profile[]) {
      profileMap.set(p.id, p.full_name);
    }
    setProfiles((profilesRes.data ?? []) as Profile[]);

    const enrich = (t: Omit<Task, 'assignee_name'>): Task => ({
      ...t,
      assignee_name: t.assignee_id ? (profileMap.get(t.assignee_id) ?? undefined) : undefined,
    });

    setPriorityTasks(((priorityRes.data ?? []) as Omit<Task, 'assignee_name'>[]).map(enrich));
    setUpcomingTasks(((upcomingRes.data ?? []) as Omit<Task, 'assignee_name'>[]).map(enrich));
    setOverdueCount(overdueRes.count ?? 0);
    setPendingLeaveCount(leaveRes.count ?? 0);

    const snippets: ApprovalSnippet[] = [];
    for (const e of (expenseRes.data ?? []) as any[]) {
      snippets.push({ id: e.id, kind: 'expense', label: e.description ?? 'Expense', date: e.created_at });
    }
    for (const b of (batchRes.data ?? []) as any[]) {
      snippets.push({ id: b.id, kind: 'batch', label: b.name ?? 'Payment Batch', date: b.created_at });
    }
    snippets.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    setApprovalSnippets(snippets.slice(0, 5));

    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    refreshApprovals();
  }, [load, refreshApprovals]);

  async function createTask() {
    if (!newTitle.trim()) return;
    setCreating(true);
    const payload: Record<string, unknown> = {
      title: newTitle.trim(),
      priority: newPriority,
      status: 'open',
      created_by: profile?.id ?? null,
    };
    if (newDue) payload.due_date = newDue;
    if (newAssignee) payload.assignee_id = newAssignee;

    const { error } = await supabase.from('tasks').insert(payload);
    if (error) {
      toast({ title: 'Failed to create task', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Task created' });
      if (profile?.id) {
        logAudit(supabase, profile.id, 'task_created', 'tasks', undefined, { title: payload.title });
      }
      setNewTitle('');
      setNewPriority('normal');
      setNewDue('');
      setNewAssignee('');
      load();
    }
    setCreating(false);
  }

  const criticalCount = priorityTasks.filter((t) => t.priority === 'critical').length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Executive Assist"
        description="Your command centre — approvals, tasks, and deadlines at a glance"
        icon={Briefcase}
      />

      {/* Briefing strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Pending Approvals"
          value={approvalTotal}
          icon={Inbox}
          tone={approvalTotal > 0 ? 'warning' : 'default'}
          onClick={() => navigate('/approvals')}
        />
        <StatCard
          title="Critical Tasks"
          value={criticalCount}
          icon={Flag}
          tone={criticalCount > 0 ? 'danger' : 'default'}
          onClick={() => navigate('/tasks')}
        />
        <StatCard
          title="Overdue Items"
          value={overdueCount}
          icon={AlertTriangle}
          tone={overdueCount > 0 ? 'danger' : 'default'}
          onClick={() => navigate('/tasks')}
        />
        <StatCard
          title="Pending Leave"
          value={pendingLeaveCount}
          icon={CalendarDays}
          tone={pendingLeaveCount > 0 ? 'warning' : 'default'}
          onClick={() => navigate('/leave')}
        />
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Priority tasks panel */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Flag className="h-4 w-4 text-orange-500" />
                Priority Tasks
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                asChild
                className="h-7 text-xs gap-1 text-muted-foreground"
              >
                <Link to="/tasks">
                  View all <ChevronRight className="h-3 w-3" />
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : priorityTasks.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No critical or high-priority tasks.
              </p>
            ) : (
              <ul className="space-y-2">
                {priorityTasks.map((t) => (
                  <li
                    key={t.id}
                    className="flex items-start gap-2.5 p-2.5 rounded-lg border border-border/50 bg-card hover:bg-accent/30 kd-transition"
                  >
                    <span
                      className={`mt-0.5 shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded border ${PRIORITY_CLASS[t.priority]}`}
                    >
                      {t.priority.slice(0, 4).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{t.title}</p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span
                          className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${STATUS_CLASS[t.status]}`}
                        >
                          {t.status.replace('_', ' ')}
                        </span>
                        {t.assignee_name && (
                          <span className="text-[11px] text-muted-foreground truncate">
                            {t.assignee_name}
                          </span>
                        )}
                        {t.due_date && (
                          <span
                            className={`text-[11px] flex items-center gap-1 ${
                              (daysUntil(t.due_date) ?? 1) < 0
                                ? 'text-destructive'
                                : 'text-muted-foreground'
                            }`}
                          >
                            <Clock className="h-3 w-3" />
                            {formatDate(t.due_date)}
                          </span>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Pending approvals panel */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Inbox className="h-4 w-4 text-amber-500" />
                Pending Approvals
                {approvalTotal > 0 && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-400/90 px-1.5 text-[10px] font-bold text-amber-900">
                    {approvalTotal > 99 ? '99+' : approvalTotal}
                  </span>
                )}
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                asChild
                className="h-7 text-xs gap-1 text-muted-foreground"
              >
                <Link to="/approvals">
                  View all <ChevronRight className="h-3 w-3" />
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : approvalSnippets.length === 0 ? (
              <div className="text-center py-8 space-y-2">
                <p className="text-sm text-muted-foreground">
                  {approvalTotal > 0
                    ? 'Items are awaiting your action.'
                    : 'No pending approvals. All clear!'}
                </p>
                {approvalTotal > 0 && (
                  <Button variant="outline" size="sm" asChild>
                    <Link to="/approvals">
                      Go to Approvals <ArrowRight className="h-3.5 w-3.5 ml-1" />
                    </Link>
                  </Button>
                )}
              </div>
            ) : (
              <>
                <ul className="space-y-2">
                  {approvalSnippets.map((s) => (
                    <li
                      key={s.id}
                      className="flex items-center gap-2.5 p-2.5 rounded-lg border border-border/50 bg-card hover:bg-accent/30 kd-transition cursor-pointer"
                      onClick={() => navigate('/approvals')}
                    >
                      {s.kind === 'expense' ? (
                        <Receipt className="h-4 w-4 text-muted-foreground shrink-0" />
                      ) : (
                        <CreditCard className="h-4 w-4 text-muted-foreground shrink-0" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{s.label}</p>
                        <p className="text-[11px] text-muted-foreground">{formatDate(s.date)}</p>
                      </div>
                      <Badge variant="outline" className="text-[10px] shrink-0 capitalize">
                        {s.kind === 'batch' ? 'Payment' : 'Expense'}
                      </Badge>
                    </li>
                  ))}
                </ul>
                {approvalTotal > approvalSnippets.length && (
                  <p className="text-xs text-muted-foreground text-center mt-3">
                    +{approvalTotal - approvalSnippets.length} more in{' '}
                    <Link to="/approvals" className="text-primary underline-offset-4 hover:underline">
                      Approvals
                    </Link>
                  </p>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Upcoming deadlines */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-blue-500" />
                Due This Week
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                asChild
                className="h-7 text-xs gap-1 text-muted-foreground"
              >
                <Link to="/tasks">
                  Tasks <ChevronRight className="h-3 w-3" />
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : upcomingTasks.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Nothing due in the next 7 days.
              </p>
            ) : (
              <ul className="space-y-2">
                {upcomingTasks.map((t) => {
                  const days = daysUntil(t.due_date!);
                  const urgency =
                    days !== null && days <= 1
                      ? 'text-destructive'
                      : days !== null && days <= 3
                        ? 'text-warning'
                        : 'text-muted-foreground';
                  return (
                    <li
                      key={t.id}
                      className="flex items-center gap-2.5 p-2.5 rounded-lg border border-border/50 bg-card hover:bg-accent/30 kd-transition"
                    >
                      <CalendarDays className={`h-4 w-4 shrink-0 ${urgency}`} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{t.title}</p>
                        <p className={`text-[11px] ${urgency}`}>
                          {days === 0
                            ? 'Due today'
                            : days === 1
                              ? 'Due tomorrow'
                              : `Due in ${days} days`}
                        </p>
                      </div>
                      <span
                        className={`text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0 ${STATUS_CLASS[t.status]}`}
                      >
                        {t.status.replace('_', ' ')}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Quick create task */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <ListTodo className="h-4 w-4 text-primary" />
              Quick Create Task
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-3">
            <div>
              <Label htmlFor="qt-title" className="text-xs">
                Title
              </Label>
              <Input
                id="qt-title"
                placeholder="What needs to be done?"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && createTask()}
                className="mt-1 h-8 text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="qt-priority" className="text-xs">
                  Priority
                </Label>
                <Select value={newPriority} onValueChange={(v) => setNewPriority(v as Priority)}>
                  <SelectTrigger id="qt-priority" className="mt-1 h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="qt-due" className="text-xs">
                  Due Date
                </Label>
                <Input
                  id="qt-due"
                  type="date"
                  value={newDue}
                  onChange={(e) => setNewDue(e.target.value)}
                  className="mt-1 h-8 text-sm"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="qt-assignee" className="text-xs">
                Assign To
              </Label>
              <Select value={newAssignee} onValueChange={setNewAssignee}>
                <SelectTrigger id="qt-assignee" className="mt-1 h-8 text-sm">
                  <SelectValue placeholder="Select person (optional)" />
                </SelectTrigger>
                <SelectContent>
                  {profiles.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={createTask}
              disabled={!newTitle.trim() || creating}
              size="sm"
              className="w-full"
            >
              {creating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-1" /> Create Task
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
