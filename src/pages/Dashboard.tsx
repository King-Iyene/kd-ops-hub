import { useEffect, useState } from 'react';
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
import { useApprovalStore } from '@/store/approvalStore';
import { daysUntil, formatDate, formatDateTime, formatNaira } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { StatCard } from '@/components/ui-kit/StatCard';
import { EmptyState } from '@/components/ui-kit/EmptyState';

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
};

const prettyType = (t: string) => t.replace(/_/g, ' ');

const COLORS = ['#006994', '#00ECFF', '#D6AC50', '#22c55e', '#ef4444'];

const Dashboard = () => {
  const navigate = useNavigate();
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

  useEffect(() => {
    fetchDashboard();
    refreshApprovals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchDashboard = async () => {
    try {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const weekStart = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() - now.getDay(),
      ).toISOString();
      const inThirtyDays = new Date();
      inThirtyDays.setDate(inThirtyDays.getDate() + 30);

      const [
        batchesRes,
        fuelRes,
        activityRes,
        subsRes,
        budgetsRes,
        expensesRes,
        processedBatchesRes,
      ] = await Promise.all([
        supabase
          .from('payment_batches')
          .select('total_amount, beneficiary_count')
          .eq('status', 'processed')
          .gte('created_at', monthStart),
        supabase
          .from('fuel_requests')
          .select('amount_ngn')
          .eq('status', 'approved')
          .gte('created_at', weekStart),
        supabase
          .from('audit_logs')
          .select('id, action_type, description, performed_by_name, created_at')
          .order('created_at', { ascending: false })
          .limit(15),
        supabase
          .from('subscriptions')
          .select('id, name, amount_ngn, next_renewal_date')
          .eq('status', 'active')
          .lte('next_renewal_date', inThirtyDays.toISOString().slice(0, 10))
          .order('next_renewal_date', { ascending: true })
          .limit(6),
        supabase
          .from('budgets')
          .select('id, name, total_amount_ngn, period_start, period_end, status')
          .eq('status', 'approved')
          .limit(20),
        supabase
          .from('expenses')
          .select('amount_ngn, date, status')
          .eq('status', 'approved'),
        supabase
          .from('payment_batches')
          .select('total_amount, payment_date, status')
          .in('status', ['processed', 'funded']),
      ]);

      const totalDisbursed =
        batchesRes.data?.reduce((sum, b) => sum + (b.total_amount || 0), 0) || 0;
      const partnersPaid =
        batchesRes.data?.reduce(
          (sum, b) => sum + (b.beneficiary_count || 0),
          0,
        ) || 0;
      const fuelSpend =
        fuelRes.data?.reduce((sum, f) => sum + (f.amount_ngn || 0), 0) || 0;

      setStats({ partnersPaid, totalDisbursed, fuelSpend });
      setActivity((activityRes.data as AuditLogRow[]) || []);
      setUpcoming((subsRes.data as UpcomingSub[]) || []);

      // Compute planned vs actual for the approved budgets.
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
  const donut = totalPlanned === 0
    ? []
    : [
        { name: 'Used', value: totalActual },
        { name: 'Remaining', value: remaining },
      ];

  const statCards = [
    {
      title: 'Partners Paid',
      value: stats.partnersPaid,
      icon: Users,
      subtitle: 'This month',
      tone: 'primary' as const,
    },
    {
      title: 'Total Disbursed',
      value: formatNaira(stats.totalDisbursed),
      icon: CreditCard,
      subtitle: 'This month',
      tone: 'success' as const,
    },
    {
      title: 'Pending Approvals',
      value: approvalCounts.total,
      icon: Clock,
      subtitle: 'Across all modules',
      tone: 'warning' as const,
      onClick: () => navigate('/approvals'),
    },
    {
      title: 'Fleet Fuel Spend',
      value: formatNaira(stats.fuelSpend),
      icon: Fuel,
      subtitle: 'This week',
      tone: 'primary' as const,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground text-sm">
          Overview of KD Squares operations
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card) => (
          <StatCard
            key={card.title}
            title={card.title}
            value={card.value}
            subtitle={card.subtitle}
            icon={card.icon}
            tone={card.tone}
            onClick={card.onClick}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">Recent Activity</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => navigate('/approvals')}>
              View approvals <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Skeleton className="h-8 w-8 rounded-full" />
                    <div className="flex-1 space-y-1">
                      <Skeleton className="h-3 w-40" />
                      <Skeleton className="h-3 w-60" />
                    </div>
                  </div>
                ))}
              </div>
            ) : activity.length === 0 ? (
              <EmptyState
                icon={Inbox}
                title="No recent activity"
                description="Actions across all modules will appear here once people start using KDOps."
              />
            ) : (
              <div className="space-y-3">
                {activity.map((item) => {
                  const Icon = ICONS[item.action_type] || FileText;
                  return (
                    <div
                      key={item.id}
                      className="flex items-start gap-3 py-2 border-b last:border-0"
                    >
                      <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center mt-0.5 shrink-0">
                        <Icon className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium capitalize">
                          {prettyType(item.action_type)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {item.description}
                        </p>
                        <p className="text-xs text-muted-foreground/60 mt-0.5">
                          {item.performed_by_name
                            ? `${item.performed_by_name} · `
                            : ''}
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

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button
              className="w-full justify-start"
              onClick={() => navigate('/payments/new')}
            >
              <Plus className="mr-2 h-4 w-4" /> Create Payment Batch
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => navigate('/approvals')}
            >
              <CheckCircle className="mr-2 h-4 w-4" /> Approvals Inbox
              {approvalCounts.total > 0 && (
                <Badge variant="secondary" className="ml-auto bg-warning/10 text-warning">
                  {approvalCounts.total}
                </Badge>
              )}
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => navigate('/subscriptions')}
            >
              <CalendarClock className="mr-2 h-4 w-4" /> Subscriptions
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => navigate('/reports')}
            >
              <FileText className="mr-2 h-4 w-4" /> Reports
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">Upcoming Subscriptions</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => navigate('/subscriptions')}>
              View all <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : upcoming.length === 0 ? (
              <EmptyState
                icon={CalendarClock}
                title="No renewals in the next 30 days"
                description="Upcoming subscription renewals will appear here."
              />
            ) : (
              <div className="space-y-2">
                {upcoming.map((s) => {
                  const d = daysUntil(s.next_renewal_date);
                  const urgent = d !== null && d <= 7;
                  return (
                    <div
                      key={s.id}
                      className="flex items-center justify-between border rounded-lg p-3 kd-transition hover:bg-muted/40"
                    >
                      <div className="min-w-0">
                        <p className="font-medium truncate">{s.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(s.next_renewal_date)} ·{' '}
                          {d !== null && d >= 0
                            ? `in ${d}d`
                            : d === null
                            ? '—'
                            : 'overdue'}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-medium currency">
                          {formatNaira(s.amount_ngn)}
                        </p>
                        <Badge
                          variant="secondary"
                          className={
                            urgent
                              ? 'bg-warning/10 text-warning'
                              : 'bg-muted text-muted-foreground'
                          }
                        >
                          {urgent ? 'Soon' : 'Upcoming'}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">Budget Utilisation</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => navigate('/budgets')}>
              View budgets <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-48 w-full" />
            ) : totalPlanned === 0 ? (
              <EmptyState
                icon={PiggyBank}
                title="No approved budgets yet"
                description="Approve a budget to start tracking planned vs actual spend."
              />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={donut}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={55}
                      outerRadius={80}
                      paddingAngle={2}
                    >
                      {donut.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number) => formatNaira(v)} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-2">
                  <div>
                    <p className="text-xs text-muted-foreground">Planned</p>
                    <p className="font-bold currency">{formatNaira(totalPlanned)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Actual</p>
                    <p className="font-bold currency">{formatNaira(totalActual)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Utilisation</p>
                    <p className="font-bold">
                      {((totalActual / totalPlanned) * 100).toFixed(0)}%
                    </p>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;
