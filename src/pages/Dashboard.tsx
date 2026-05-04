import { useEffect, useState } from 'react';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useTimeOfDay, greetingFor } from '@/hooks/useTimeOfDay';
import { AuroraHero } from '@/components/AuroraHero';
import { ChartGradients, GlassTooltip, chartAnim } from '@/components/ChartKit';
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
  AlertTriangle,
  RefreshCw,
  Building2,
  Bell,
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
import { Skeleton } from '@/components/ui/skeleton';
import { StatCard } from '@/components/ui-kit/StatCard';
import { EmptyState } from '@/components/ui-kit/EmptyState';
import { cn } from '@/lib/utils';

interface DashboardStats {
  totalEmployees: number;
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
    totalEmployees: 0,
    totalDisbursed: 0,
    fuelSpend: 0,
  });
  const [activity, setActivity] = useState<AuditLogRow[]>([]);
  const [upcoming, setUpcoming] = useState<UpcomingSub[]>([]);
  const [budgetUtil, setBudgetUtil] = useState<BudgetUtil[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [upcomingPayments, setUpcomingPayments] = useState<UpcomingPayment[]>([]);

  const [personalKPIs, setPersonalKPIs] = useState<PersonalKPIs>({
    pendingExpenses: 0,
    leaveDaysRemaining: 0,
    assignedTasks: 0,
    pendingFuel: 0,
  });
  const [personalLoading, setPersonalLoading] = useState(false);

  // ── Expiry alerts (documents + compliance filings due within 30 days) ───────
  const [expiringDocs, setExpiringDocs] = useState<{ id: string; title: string; expires_at: string }[]>([]);
  const [dueFilings, setDueFilings] = useState<{ id: string; kind: string; period: string; due_date: string }[]>([]);

  useEffect(() => {
    if (!isPersonal) {
      const today = new Date().toISOString().slice(0, 10);
      const in30 = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      Promise.all([
        supabase
          .from('documents')
          .select('id, title, expires_at')
          .is('deleted_at', null)
          .gte('expires_at', today)
          .lte('expires_at', in30)
          .order('expires_at', { ascending: true })
          .limit(5),
        supabase
          .from('compliance_filings')
          .select('id, kind, period, due_date')
          .neq('status', 'filed')
          .gte('due_date', today)
          .lte('due_date', in30)
          .order('due_date', { ascending: true })
          .limit(5),
      ]).then(([docsRes, filingsRes]) => {
        setExpiringDocs((docsRes.data as any[]) || []);
        setDueFilings((filingsRes.data as any[]) || []);
      });
    }
  }, [isPersonal]);

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-use-before-define -- safe: deferred call inside effect; fetchDashboard is initialized before the effect first runs
    fetchDashboard();
    refreshApprovals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!profile?.id || !isPersonal) return;

    const loadPersonalKPIs = () => {
      setPersonalLoading(true);
      Promise.all([
        supabase.from('expenses').select('id', { count: 'exact', head: true }).eq('employee_id', profile.id).eq('status', 'pending'),
        supabase.from('leave_balances').select('annual_quota, annual_used').eq('employee_id', profile.id).maybeSingle(),
        supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('assignee_id', profile.id).neq('status', 'complete'),
        supabase.from('fuel_requests').select('id', { count: 'exact', head: true }).eq('driver_id', profile.id).eq('status', 'pending'),
      ]).then(([expRes, leaveRes, taskRes, fuelRes]) => {
        // Nigerian Labour Act minimum: 6 working days for first year of service.
        // Default to 12 days as a reasonable starting quota — finance can adjust.
        const quota = (leaveRes.data as any)?.annual_quota ?? 12;
        const used = (leaveRes.data as any)?.annual_used ?? 0;
        setPersonalKPIs({
          pendingExpenses: expRes.count ?? 0,
          leaveDaysRemaining: Math.max(0, quota - used),
          assignedTasks: taskRes.count ?? 0,
          pendingFuel: fuelRes.count ?? 0,
        });
      }).catch((err) => console.error('[KDOps] personal KPI load failed:', err))
        .finally(() => setPersonalLoading(false));
    };

    loadPersonalKPIs();

    // Subscribe to changes that affect any of the four KPIs so the user sees
    // counters update in real time after submitting / cancelling / approving.
    const channel = supabase
      .channel(`personal-kpis-${profile.id}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'leave_balances', filter: `employee_id=eq.${profile.id}` },
        () => loadPersonalKPIs())
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'leave_requests', filter: `employee_id=eq.${profile.id}` },
        () => loadPersonalKPIs())
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'expenses', filter: `submitted_by=eq.${profile.id}` },
        () => loadPersonalKPIs())
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'fuel_requests', filter: `driver_id=eq.${profile.id}` },
        () => loadPersonalKPIs())
      .subscribe();

    // Refresh whenever the tab becomes visible again — covers cases where the
    // realtime subscription dropped or status changed in another tab.
    const onFocus = () => loadPersonalKPIs();
    window.addEventListener('focus', onFocus);

    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener('focus', onFocus);
    };
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
        expensesRes, processedBatchesRes, upcomingPaymentsRes, employeesRes,
      ] = await Promise.all([
        // Disbursed = money that actually left the bank. Includes 'processed'
        // (all items succeeded) and 'partially_processed' (some failed — failed
        // items are netted out below by joining batch_items).
        supabase.from('payment_batches').select('id, total_amount, beneficiary_count, status').in('status', ['processed', 'partially_processed']).gte('created_at', monthStart),
        supabase.from('fuel_requests').select('amount_ngn').eq('status', 'approved').gte('created_at', weekStart),
        supabase.from('audit_logs').select('id, action_type, description, performed_by_name, created_at').order('created_at', { ascending: false }).limit(15),
        supabase.from('subscriptions').select('id, name, amount_ngn, next_renewal_date').eq('status', 'active').lte('next_renewal_date', inThirtyDays.toISOString().slice(0, 10)).order('next_renewal_date', { ascending: true }).limit(6),
        supabase.from('budgets').select('id, name, total_amount_ngn, period_start, period_end, status').eq('status', 'approved').limit(20),
        supabase.from('expenses').select('amount_ngn, date, status').eq('status', 'approved').is('deleted_at', null).limit(2000),
        supabase.from('payment_batches').select('id, total_amount, payment_date, status').in('status', ['processed', 'partially_processed']).limit(500),
        supabase.from('payment_batches').select('id, name, total_amount, scheduled_date, status').gte('scheduled_date', today).lte('scheduled_date', sevenDaysFromNow).eq('status', 'scheduled').order('scheduled_date', { ascending: true }).limit(5),
        supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('status', 'active').neq('is_anonymised', true),
      ]);

      // Subtract failed batch_items from partially_processed batches so the
      // KPIs reflect actual money moved, not the gross intended amount.
      const allDisbursed = [...(batchesRes.data || []), ...(processedBatchesRes.data || [])] as any[];
      const partialIds = allDisbursed.filter((b) => b.status === 'partially_processed').map((b) => b.id);
      const succeededByBatch = new Map<string, number>();
      if (partialIds.length > 0) {
        const { data: items } = await supabase
          .from('batch_items')
          .select('batch_id, amount_ngn, status')
          .in('batch_id', partialIds);
        for (const it of (items || []) as any[]) {
          if (it.status === 'succeeded') {
            succeededByBatch.set(it.batch_id, (succeededByBatch.get(it.batch_id) ?? 0) + Number(it.amount_ngn || 0));
          }
        }
      }
      const actualDisbursedAmount = (b: any): number => {
        if (b.status === 'processed') return Number(b.total_amount || 0);
        if (b.status === 'partially_processed') return succeededByBatch.get(b.id) ?? 0;
        return 0;
      };

      const totalDisbursed = (batchesRes.data || []).reduce((sum: number, b: any) => sum + actualDisbursedAmount(b), 0);
      const totalEmployees = employeesRes.count ?? 0;
      const fuelSpend = fuelRes.data?.reduce((sum, f) => sum + (f.amount_ngn || 0), 0) || 0;

      setStats({ totalEmployees, totalDisbursed, fuelSpend });
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
          if (t >= s && t <= e) actual += actualDisbursedAmount(bx);
        }
        return { name: b.name, planned: Number(b.total_amount_ngn || 0), actual };
      });
      setBudgetUtil(util);
    } catch (err) {
      console.error('[KDOps] dashboard load failed:', err);
      setLoadError(true);
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

  const tod = useTimeOfDay();
  const greeting = greetingFor(tod);
  const firstName = profile?.full_name?.split(' ')[0] || 'there';
  const todSubtitle: Record<typeof tod, string> = {
    morning:   'A fresh slate. Here\'s where things stand today.',
    afternoon: 'Mid-day check-in. Here\'s what\'s in motion.',
    evening:   'Winding down. Here\'s your day at a glance.',
    night:     'The night shift. Here\'s the pulse of the system.',
  };

  /* ── Personal / field-staff view ───────────────────────────────── */
  if (loadError) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <div className="text-center space-y-4 max-w-sm">
          <AlertTriangle className="h-10 w-10 text-destructive mx-auto" />
          <h2 className="text-lg font-semibold">Dashboard failed to load</h2>
          <p className="text-sm text-muted-foreground">
            There was a problem fetching your data. Check your connection and try again.
          </p>
          <button
            onClick={() => { setLoadError(false); setLoading(true); fetchDashboard(); }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <RefreshCw className="h-4 w-4" /> Retry
          </button>
        </div>
      </div>
    );
  }

  if (isPersonal) {
    return (
      <div className="space-y-6">
        {/* Greeting */}
        <AuroraHero className="p-5 sm:p-6">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="h-4 w-4 opacity-80 kd-icon-glow" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-80">Personal Overview</span>
          </div>
          <h1 className="kd-display text-3xl sm:text-4xl font-bold">{greeting}, {firstName}.</h1>
          <p className="text-sm opacity-70 mt-1.5">{todSubtitle[tod]}</p>
        </AuroraHero>

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
      {/* ── Aurora greeting hero ─────────────────────────────────── */}
      <AuroraHero className="p-5 sm:p-7" scanLine>
        <div className="flex items-center gap-2 mb-1">
          <LayoutDashboard className="h-4 w-4 opacity-80 kd-icon-glow" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-80">Operations Command</span>
        </div>
        <h1 className="kd-display text-3xl sm:text-4xl font-bold tracking-tight">
          {greeting}, {firstName}.
        </h1>
        <p className="text-sm opacity-70 mt-1.5">
          {todSubtitle[tod]}
          <span className="opacity-50"> · {new Date().toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
        </p>
      </AuroraHero>

      <OnboardingChecklist />
      <AnnouncementsBanner />

      {/* ── Expiry alerts — documents and compliance filings due soon ─ */}
      {(expiringDocs.length > 0 || dueFilings.length > 0) && (
        <div className="rounded-xl border border-warning/40 bg-warning/5 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-warning shrink-0" />
            <p className="text-sm font-semibold text-foreground">Needs attention in the next 30 days</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {expiringDocs.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Documents expiring ({expiringDocs.length})
                </p>
                {expiringDocs.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => navigate('/documents')}
                    className="flex items-center justify-between w-full text-left rounded-lg px-3 py-2 bg-background/60 hover:bg-background text-xs kd-transition border border-border/50"
                  >
                    <span className="font-medium truncate max-w-[160px]">{d.title}</span>
                    <span className="text-warning ml-2 shrink-0">{formatDate(d.expires_at)}</span>
                  </button>
                ))}
              </div>
            )}
            {dueFilings.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Compliance filings due ({dueFilings.length})
                </p>
                {dueFilings.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => navigate('/compliance')}
                    className="flex items-center justify-between w-full text-left rounded-lg px-3 py-2 bg-background/60 hover:bg-background text-xs kd-transition border border-border/50"
                  >
                    <span className="font-medium uppercase">{f.kind} — {f.period}</span>
                    <span className="text-warning ml-2 shrink-0">{formatDate(f.due_date)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── 1. KPI stats — first data visible ────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Employees"
          value={loading ? '—' : stats.totalEmployees}
          icon={Users}
          subtitle="Active on payroll"
          tone="primary"
          onClick={() => navigate('/employees')}
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

      {/* ── 2. Quick Actions + Budget Utilisation ────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Quick Actions */}
        <Card>
          <CardHeader className="pb-3 border-b">
            <CardTitle className="text-sm font-semibold">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="p-3 space-y-2">
            {[
              { label: 'Create Payment Batch', icon: Plus, onClick: () => navigate('/payments/new'), variant: 'default' as const },
              { label: 'Approvals Inbox', icon: CheckCircle, onClick: () => navigate('/approvals'), badge: approvalCounts.total, variant: 'outline' as const },
              { label: 'Clients', icon: Building2, onClick: () => navigate('/clients'), variant: 'outline' as const },
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

        {/* Budget Utilisation — wider card with donut */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between pb-3 border-b">
            <CardTitle className="text-sm font-semibold">Budget Utilisation</CardTitle>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => navigate('/budgets')}>
              View all <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Button>
          </CardHeader>
          <CardContent className="pt-4">
            {loading ? (
              <Skeleton className="h-36 w-full" />
            ) : totalPlanned === 0 ? (
              <EmptyState icon={PiggyBank} title="No approved budgets" description="Approve a budget to see utilisation." compact />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 items-center">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs text-muted-foreground">Overall spend</span>
                    <span className="text-sm font-bold">{utilizationPct}%</span>
                  </div>
                  <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden mb-4">
                    <div
                      className={cn('h-full rounded-full kd-transition', utilizationPct > 90 ? 'bg-red-500' : utilizationPct > 70 ? 'bg-amber-500' : 'bg-primary')}
                      style={{ width: `${Math.min(utilizationPct, 100)}%` }}
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: 'Planned', value: totalPlanned },
                      { label: 'Actual', value: totalActual },
                      { label: 'Remaining', value: remaining },
                    ].map(({ label, value }) => (
                      <div key={label} className="rounded-lg bg-muted/60 px-2.5 py-2">
                        <p className="text-[11px] text-muted-foreground">{label}</p>
                        <p className="text-xs font-bold currency mt-0.5">{formatNaira(value)}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={160}>
                  <PieChart>
                    <ChartGradients />
                    <Pie
                      data={donut}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={42}
                      outerRadius={62}
                      paddingAngle={2}
                      stroke="none"
                      {...chartAnim}
                    >
                      {donut.map((_, i) => (
                        <Cell key={i} fill={i === 0 ? 'url(#kd-grad-donut)' : CHART_COLORS[1]} />
                      ))}
                    </Pie>
                    <Tooltip
                      content={<GlassTooltip />}
                      formatter={(v: number) => formatNaira(v)}
                      cursor={{ fill: 'transparent' }}
                    />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── 3. Financial Intelligence — finance/admin/super_admin only ── */}
      {isFinanceRole && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <FinancialHealthCard />
          <CashBurnCard />
        </div>
      )}

      {/* ── 4. Operational monitoring ─────────────────────────────── */}
      <div className={cn('grid grid-cols-1 gap-5', isFinanceRole ? 'lg:grid-cols-3' : 'lg:grid-cols-2')}>
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

        {/* Upcoming payments — finance / admin only */}
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
      </div>

      {/* ── 5. Productivity ───────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <MyTasksWidget />
        <MyGoalsWidget />
      </div>

      {/* ── 6. Audit log — reference data at bottom ───────────────── */}
      <Card className="overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between pb-3 border-b">
          <CardTitle className="text-sm font-semibold">Recent Activity</CardTitle>
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => navigate('/audit')}>
            Full audit log <ArrowRight className="ml-1 h-3.5 w-3.5" />
          </Button>
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
    </div>
  );
};

export default Dashboard;
