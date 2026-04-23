import { useEffect, useState } from 'react';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useNavigate } from 'react-router-dom';
import {
  CreditCard,
  Users,
  Clock,
  Fuel,
  Plus,
  CheckCircle,
  FileText,
  MapPin,
  Receipt,
  UserPlus,
  XCircle,
  DollarSign,
  Play,
  CalendarClock,
  Inbox,
  PiggyBank,
  ArrowRight,
  CalendarDays,
  Lock,
  Unlock,
  Sparkles,
  LayoutDashboard,
} from 'lucide-react';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from 'recharts';
import { supabase } from '@/lib/supabase';
import { useAuthStore, useEffectiveRole } from '@/store/authStore';
import { useApprovalStore } from '@/store/approvalStore';
import { daysUntil, formatDate, formatDateTime, formatNaira } from '@/lib/format';
import ComplianceCard from '@/components/ComplianceCard';
import { AnnouncementsBanner } from '@/components/AnnouncementsBanner';
import { OnboardingChecklist } from '@/components/OnboardingChecklist';
import { FinancialHealthCard } from '@/components/FinancialHealthCard';
import { CashBurnCard } from '@/components/CashBurnCard';
import { MyTasksWidget } from '@/pages/Tasks';
import { MyGoalsWidget } from '@/pages/Goals';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { StatCard } from '@/components/ui-kit/StatCard';
import { EmptyState } from '@/components/ui-kit/EmptyState';
import { cn } from '@/lib/utils';

interface DashboardStats {
  partnersPaid: number;
  totalDisbursed: number;
  fuelSpend: number;
}

interface AuditLogRow {
  id: string;
  action_type: string;
  description: string;
  performed_by_name: string | null;
  created_at: string | null;
}

interface UpcomingSub {
  id: string;
  name: string;
  amount_ngn: number;
  next_renewal_date: string;
}

interface BudgetUtil {
  name: string;
  planned: number;
  actual: number;
}

interface PersonalKPIs {
  pendingExpenses: number;
  leaveDaysRemaining: number;
  assignedTasks: number;
  pendingFuel: number;
}

interface UpcomingPayment {
  id: string;
  name: string;
  total_amount: number;
  scheduled_date: string;
  status: string;
}

const ICONS: Record<string, typeof FileText> = {
  batch_created: Plus,
  batch_submitted: CheckCircle,
  batch_approved: CheckCircle,
  batch_rejected: XCircle,
  batch_funded: DollarSign,
  batch_processed: Play,
  contractor_added: UserPlus,
  contractor_edited: UserPlus,
  contractor_deactivated: UserPlus,
  fuel_request_submitted: Fuel,
  fuel_request_approved: Fuel,
  fuel_request_rejected: Fuel,
  trip_log_submitted: MapPin,
  expense_submitted: Receipt,
  expense_approved: Receipt,
  expense_rejected: Receipt,
  employee_added: Users,
  employee_edited: Users,
  employee_deactivated: Users,
  subscription_added: CalendarClock,
  subscription_edited: CalendarClock,
  subscription_cancelled: XCircle,
  subscription_renewed: CheckCircle,
  budget_created: PiggyBank,
  budget_submitted: PiggyBank,
  budget_approved: PiggyBank,
  budget_rejected: XCircle,
  document_uploaded: FileText,
  document_deleted: XCircle,
  leave_requested: CalendarDays,
  leave_approved: CheckCircle,
  leave_rejected: XCircle,
  leave_cancelled: XCircle,
  budget_locked: Lock,
  budget_unlocked: Unlock,
  batch_scheduled: CalendarClock,
  batch_item_retried: Play,
  batch_receipt_downloaded: FileText,
};

const ACTION_TONE: Record<string, string> = {
  batch_approved: 'text-emerald-600 bg-emerald-50',
  batch_processed: 'text-emerald-600 bg-emerald-50',
  subscription_renewed: 'text-emerald-600 bg-emerald-50',
  budget_approved: 'text-emerald-600 bg-emerald-50',
  leave_approved: 'text-emerald-600 bg-emerald-50',
  expense_approved: 'text-emerald-600 bg-emerald-50',
  batch_rejected: 'text-red-600 bg-red-50',
  budget_rejected: 'text-red-600 bg-red-50',
  leave_rejected: 'text-red-600 bg-red-50',
  expense_rejected: 'text-red-600 bg-red-50',
  batch_submitted: 'text-amber-600 bg-amber-50',
  budget_submitted: 'text-amber-600 bg-amber-50',
  batch_funded: 'text-blue-600 bg-blue-50',
};

const prettyType = (t: string) =>
  t
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

function getGreeting() {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return 'Good morning';
  if (h >= 12 && h < 17) return 'Good afternoon';
  return 'Good evening';
}

const CHART_COLORS = ['#006994', '#e2e8f0'];

const Dashboard = () => {
  usePageTitle('Dashboard');
  const navigate = useNavigate();
  const { profile } = useAuthStore();
  const effectiveRole = useEffectiveRole();
  const isPersonal = profile?.role === 'field_staff';
  const isFinanceRole = ['admin', 'finance', 'super_admin'].includes(profile?.role || '');
  const approvalCounts = useApprovalStore((s) => s.counts);
  const refreshApprovals = useApprovalStore((s) => s.refresh);

  const [stats, setStats] = useState<DashboardStats>({
    partnersPaid: 0,
    totalDisbursed: 0,
    fuelSpend: 0,
  });
  const [activity, setActivity] = useState<AuditLogRow[]>([]);
  const [upcoming, setUpcoming] = useState<UpcomingSub[]>([]);
  const [budgetUtil, setBudgetUtil] = useState<BudgetUtil[]>([]);
  const [loading, setLoading] = useState(true);
  const [upcomingPayments, setUpcomingPayments] = useState<UpcomingPayment[]>([]);

  const [personalKPIs, setPersonalKPIs] = useState<PersonalKPIs>({
    pendingExpenses: 0,
    leaveDaysRemaining: 0,
    assignedTasks: 0,
    pendingFuel: 0,
  });
  const [personalLoading, setPersonalLoading] = useState(false);

  useEffect(() => {
    fetchDashboard();
    refreshApprovals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!profile?.id || !isPersonal) return;
    setPersonalLoading(true);
    Promise.all([
      supabase.from('expenses').select('id', { count: 'exact', head: true }).eq('employee_id', profile.id).eq('status', 'pending'),
      supabase.from('leave_balances').select('annual_quota, annual_used').eq('employee_id', profile.id).maybeSingle(),
      supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('assignee_id', profile.id).neq('status', 'complete'),
      supabase.from('fuel_requests').select('id', { count: 'exact', head: true }).eq('driver_id', profile.id).eq('status', 'pending'),
    ]).then(([expRes, leaveRes, taskRes, fuelRes]) => {
      const quota = (leaveRes.data as any)?.annual_quota ?? 21;
      const used = (leaveRes.data as any)?.annual_used ?? 0;
      setPersonalKPIs({
        pendingExpenses: expRes.count ?? 0,
        leaveDaysRemaining: Math.max(0, quota - used),
        assignedTasks: taskRes.count ?? 0,
        pendingFuel: fuelRes.count ?? 0,
      });
    }).catch((err) => console.error('[KDOps] personal KPI load failed:', err))
      .finally(() => setPersonalLoading(false));
  }, [profile?.id, isPersonal]);

  const fetchDashboard = async () => {
    try {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay()).toISOString();
      const inThirtyDays = new Date();
      inThirtyDays.setDate(inThirtyDays.getDate() + 30);
      const today = now.toISOString().slice(0, 10);
      const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

      const [
        batchesRes, fuelRes, activityRes, subsRes, budgetsRes,
        expensesRes, processedBatchesRes, upcomingPaymentsRes,
      ] = await Promise.all([
        supabase.from('payment_batches').select('total_amount, beneficiary_count').eq('status', 'processed').gte('created_at', monthStart),
        supabase.from('fuel_requests').select('amount_ngn').eq('status', 'approved').gte('created_at', weekStart),
        supabase.from('audit_logs').select('id, action_type, description, performed_by_name, created_at').order('created_at', { ascending: false }).limit(15),
        supabase.from('subscriptions').select('id, name, amount_ngn, next_renewal_date').eq('status', 'active').lte('next_renewal_date', inThirtyDays.toISOString().slice(0, 10)).order('next_renewal_date', { ascending: true }).limit(6),
        supabase.from('budgets').select('id, name, total_amount_ngn, period_start, period_end, status').eq('status', 'approved').limit(20),
        supabase.from('expenses').select('amount_ngn, date, status').eq('status', 'approved'),
        supabase.from('payment_batches').select('total_amount, payment_date, status').in('status', ['processed', 'funded']),
        supabase.from('payment_batches').select('id, name, total_amount, scheduled_date, status').gte('scheduled_date', today).lte('scheduled_date', sevenDaysFromNow).eq('status', 'scheduled').order('scheduled_date', { ascending: true }).limit(5),
      ]);

      const totalDisbursed = batchesRes.data?.reduce((sum, b) => sum + (b.total_amount || 0), 0) || 0;
      const partnersPaid = batchesRes.data?.reduce((sum, b) => sum + (b.beneficiary_count || 0), 0) || 0;
      const fuelSpend = fuelRes.data?.reduce((sum, f) => sum + (f.amount_ngn || 0), 0) || 0;

      setStats({ partnersPaid, totalDisbursed, fuelSpend });
      setActivity((activityRes.data as AuditLogRow[]) || []);
      setUpcoming((subsRes.data as UpcomingSub[]) || []);
      setUpcomingPayments((upcomingPaymentsRes.data as UpcomingPayment[]) || []);

      const expenses = expensesRes.data || [];
      const batches = processedBatchesRes.data || [];
      const util: BudgetUtil[] = ((budgetsRes.data as any[]) || []).map((b) => {
        const s = new Date(b.period_start).getTime();
        const e = new Date(b.period_end).getTime() + 24 * 60 * 60 * 1000 - 1;
        let actual = 0;
        for (const ex of expenses as any[]) {
          const t = new Date(ex.date).getTime();
          if (t >= s && t <= e) actual += Number(ex.amount_ngn || 0);
        }
        for (const bx of batches as any[]) {
          const t = new Date(bx.payment_date).getTime();
          if (t >= s && t <= e) actual += Number(bx.total_amount || 0);
        }
        return { name: b.name, planned: Number(b.total_amount_ngn || 0), actual };
      });
      setBudgetUtil(util);
    } catch (err) {
      console.error('[KDOps] dashboard load failed:', err);
    } finally {
      setLoading(false);
    }
  };

  const totalPlanned = budgetUtil.reduce((s, b) => s + b.planned, 0);
  const totalActual = budgetUtil.reduce((s, b) => s + b.actual, 0);
  const remaining = Math.max(0, totalPlanned - totalActual);
  const utilizationPct = totalPlanned > 0 ? Math.round((totalActual / totalPlanned) * 100) : 0;
  const donut = totalPlanned === 0
    ? []
    : [
        { name: 'Used', value: totalActual },
        { name: 'Remaining', value: remaining },
      ];

  const greeting = getGreeting();
  const firstName = profile?.full_name?.split(' ')[0] || 'there';

  /* ── Personal / field-staff view ───────────────────────────────── */
  if (isPersonal) {
    return (
      <div className="space-y-6">
        {/* Greeting */}
        <div className="rounded-2xl kd-gradient-brand p-5 text-white">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="h-4 w-4 opacity-80" />
            <span className="text-sm font-medium opacity-80">Personal Overview</span>
          </div>
          <h1 className="text-2xl font-bold">{greeting}, {firstName}</h1>
          <p className="text-sm opacity-70 mt-0.5">Here's your status for today.</p>
        </div>

        <AnnouncementsBanner />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="Pending Expenses" value={personalLoading ? '—' : personalKPIs.pendingExpenses} icon={Receipt} subtitle="Awaiting approval" tone="warning" onClick={() => navigate('/expenses')} />
          <StatCard title="Leave Days Left" value={personalLoading ? '—' : personalKPIs.leaveDaysRemaining} icon={CalendarDays} subtitle="Annual leave balance" tone="primary" onClick={() => navigate('/leave')} />
          <StatCard title="Assigned Tasks" value={personalLoading ? '—' : personalKPIs.assignedTasks} icon={CheckCircle} subtitle="Open tasks" tone="primary" onClick={() => navigate('/tasks')} />
          <StatCard title="Fuel Requests" value={personalLoading ? '—' : personalKPIs.pendingFuel} icon={Fuel} subtitle="Pending requests" tone="warning" onClick={() => navigate('/fleet')} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <MyTasksWidget />
          <MyGoalsWidget />
        </div>
      </div>
    );
  }

  /* ── Finance / admin / operations view ─────────────────────────── */
  return (
    <div className="space-y-5">
      {/* ── Greeting banner ──────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl kd-gradient-brand p-5 text-white">
        {/* Decorative circle */}
        <div className="pointer-events-none absolute -right-8 -top-8 h-40 w-40 rounded-full bg-white/5" />
        <div className="pointer-events-none absolute -right-2 bottom-4 h-20 w-20 rounded-full bg-cyan-400/10" />
        <div className="relative">
          <div className="flex items-center gap-2 mb-1">
            <LayoutDashboard className="h-4 w-4 opacity-70" />
            <span className="text-xs font-semibold uppercase tracking-wider opacity-70">Operations Dashboard</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">{greeting}, {firstName}.</h1>
          <p className="text-sm opacity-60 mt-0.5">
            {new Date().toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
      </div>

      <OnboardingChecklist />
      <AnnouncementsBanner />

      {/* ── Command centre row ───────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <FinancialHealthCard />
        <CashBurnCard />
        <MyTasksWidget />
        <MyGoalsWidget />
      </div>

      {/* ── KPI stats ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Partners Paid"
          value={loading ? '—' : stats.partnersPaid}
          icon={Users}
          subtitle="This month"
          tone="primary"
        />
        <StatCard
          title="Total Disbursed"
          value={loading ? '—' : formatNaira(stats.totalDisbursed)}
          icon={CreditCard}
          subtitle="This month"
          tone="success"
        />
        <StatCard
          title="Pending Approvals"
          value={loading ? '—' : approvalCounts.total}
          icon={Clock}
          subtitle="Across all modules"
          tone="warning"
          onClick={() => navigate('/approvals')}
        />
        <StatCard
          title="Fleet Fuel Spend"
          value={loading ? '—' : formatNaira(stats.fuelSpend)}
          icon={Fuel}
          subtitle="This week"
          tone="primary"
        />
      </div>

      {/* ── Main content grid ────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Activity feed */}
        <Card className="lg:col-span-2 overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between pb-3 border-b">
            <CardTitle className="text-sm font-semibold">Recent Activity</CardTitle>
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => navigate('/audit')}>
                Audit Log <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => navigate('/approvals')}>
                Approvals
                {approvalCounts.total > 0 && (
                  <Badge className="ml-1 h-4 px-1 bg-amber-100 text-amber-700 text-[10px]">{approvalCounts.total}</Badge>
                )}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-4 space-y-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full kd-skeleton shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3 w-36 kd-skeleton rounded" />
                      <div className="h-2.5 w-56 kd-skeleton rounded" />
                    </div>
                  </div>
                ))}
              </div>
            ) : activity.length === 0 ? (
              <EmptyState icon={Inbox} title="No recent activity" description="Actions across all modules will appear here." compact />
            ) : (
              <div className="divide-y divide-border/40">
                {activity.map((item, i) => {
                  const Icon = ICONS[item.action_type] || FileText;
                  const toneCls = ACTION_TONE[item.action_type] || 'text-muted-foreground bg-muted';
                  return (
                    <div
                      key={item.id}
                      className={cn('flex items-start gap-3 px-4 py-3 hover:bg-muted/30 kd-transition', i === 0 && 'pt-4')}
                    >
                      <div className={cn('h-7 w-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5', toneCls)}>
                        <Icon className="h-3.5 w-3.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium leading-snug">{prettyType(item.action_type)}</p>
                        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{item.description}</p>
                        <p className="text-[11px] text-muted-foreground/50 mt-1">
                          {item.performed_by_name ? `${item.performed_by_name} · ` : ''}
                          {item.created_at ? formatDateTime(item.created_at) : ''}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick actions */}
        <div className="space-y-3">
          <Card>
            <CardHeader className="pb-3 border-b">
              <CardTitle className="text-sm font-semibold">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="p-3 space-y-2">
              {[
                { label: 'Create Payment Batch', icon: Plus, onClick: () => navigate('/payments/new'), variant: 'default' as const },
                { label: 'Approvals Inbox', icon: CheckCircle, onClick: () => navigate('/approvals'), badge: approvalCounts.total, variant: 'outline' as const },
                { label: 'Subscriptions', icon: CalendarClock, onClick: () => navigate('/subscriptions'), variant: 'outline' as const },
                { label: 'Reports', icon: FileText, onClick: () => navigate('/reports'), variant: 'outline' as const },
                { label: 'Payroll', icon: DollarSign, onClick: () => navigate('/payroll'), variant: 'outline' as const },
              ].map(({ label, icon: Icon, onClick, badge, variant }) => (
                <Button
                  key={label}
                  variant={variant}
                  className="w-full justify-start h-9 text-sm"
                  onClick={onClick}
                >
                  <Icon className="mr-2 h-4 w-4 shrink-0" />
                  {label}
                  {badge !== undefined && badge > 0 && (
                    <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-100 px-1.5 text-[10px] font-bold text-amber-700">
                      {badge}
                    </span>
                  )}
                </Button>
              ))}
            </CardContent>
          </Card>

          {/* Budget utilisation mini */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2 border-b">
              <CardTitle className="text-sm font-semibold">Budget Utilisation</CardTitle>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => navigate('/budgets')}>
                View <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Button>
            </CardHeader>
            <CardContent className="pt-3">
              {loading ? (
                <Skeleton className="h-32 w-full" />
              ) : totalPlanned === 0 ? (
                <EmptyState icon={PiggyBank} title="No approved budgets" description="Approve a budget to see utilisation." compact />
              ) : (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-muted-foreground">Used</span>
                    <span className="text-xs font-semibold">{utilizationPct}%</span>
                  </div>
                  {/* Progress bar */}
                  <div className="h-2 w-full rounded-full bg-muted overflow-hidden mb-3">
                    <div
                      className={cn('h-full rounded-full kd-transition', utilizationPct > 90 ? 'bg-red-500' : utilizationPct > 70 ? 'bg-amber-500' : 'bg-primary')}
                      style={{ width: `${Math.min(utilizationPct, 100)}%` }}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-lg bg-muted/60 px-2.5 py-2">
                      <p className="text-muted-foreground">Planned</p>
                      <p className="font-bold currency mt-0.5">{formatNaira(totalPlanned)}</p>
                    </div>
                    <div className="rounded-lg bg-muted/60 px-2.5 py-2">
                      <p className="text-muted-foreground">Actual</p>
                      <p className="font-bold currency mt-0.5">{formatNaira(totalActual)}</p>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── Lower row ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ComplianceCard />

        {/* Upcoming subscriptions */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3 border-b">
            <CardTitle className="text-sm font-semibold">Upcoming Renewals</CardTitle>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => navigate('/subscriptions')}>
              View all <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-4 space-y-2">
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : upcoming.length === 0 ? (
              <EmptyState icon={CalendarClock} title="No renewals in 30 days" description="Upcoming subscription renewals will appear here." compact />
            ) : (
              <div className="divide-y divide-border/40">
                {upcoming.map((s, i) => {
                  const d = daysUntil(s.next_renewal_date);
                  const urgent = d !== null && d <= 7;
                  return (
                    <div key={s.id} className={cn('flex items-center justify-between px-4 py-3 hover:bg-muted/30 kd-transition', i === 0 && 'pt-4')}>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{s.name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {formatDate(s.next_renewal_date)}
                          {d !== null && d >= 0 ? ` · in ${d}d` : d === null ? '' : ' · overdue'}
                        </p>
                      </div>
                      <div className="text-right shrink-0 ml-3">
                        <p className="text-sm font-semibold currency">{formatNaira(s.amount_ngn)}</p>
                        <span className={cn('inline-block rounded-full px-2 py-0.5 text-[10px] font-medium mt-0.5', urgent ? 'bg-amber-100 text-amber-700' : 'bg-muted text-muted-foreground')}>
                          {urgent ? 'Soon' : 'Upcoming'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Upcoming payments */}
        {isFinanceRole && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3 border-b">
              <CardTitle className="text-sm font-semibold">Payments This Week</CardTitle>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => navigate('/payments/schedule')}>
                Schedule <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="p-4 space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : upcomingPayments.length === 0 ? (
                <EmptyState icon={CalendarClock} title="No payments in the next 7 days" description="Scheduled payment batches will appear here." compact />
              ) : (
                <div className="divide-y divide-border/40">
                  {upcomingPayments.map((p, i) => (
                    <div key={p.id} className={cn('flex items-center justify-between px-4 py-3 hover:bg-muted/30 kd-transition', i === 0 && 'pt-4')}>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{p.name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{formatDate(p.scheduled_date)}</p>
                      </div>
                      <p className="text-sm font-semibold currency shrink-0 ml-3">{formatNaira(p.total_amount)}</p>
                    </div>
                  ))}
                  <div className="flex items-center justify-between px-4 py-3 bg-muted/30">
                    <span className="text-xs font-medium text-muted-foreground">Total upcoming</span>
                    <span className="text-sm font-bold currency">
                      {formatNaira(upcomingPayments.reduce((s, p) => s + (p.total_amount || 0), 0))}
                    </span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Budget donut */}
        {!isFinanceRole && totalPlanned > 0 && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-semibold">Budget Utilisation</CardTitle>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => navigate('/budgets')}>
                View budgets <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Button>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 items-center">
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie data={donut} dataKey="value" nameKey="name" innerRadius={50} outerRadius={72} paddingAngle={2}>
                      {donut.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => formatNaira(v)} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-2.5">
                  {[
                    { label: 'Planned', value: totalPlanned },
                    { label: 'Actual', value: totalActual },
                    { label: 'Remaining', value: remaining },
                  ].map(({ label, value }) => (
                    <div key={label}>
                      <p className="text-[11px] text-muted-foreground uppercase tracking-wide">{label}</p>
                      <p className="text-sm font-bold currency">{formatNaira(value)}</p>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
