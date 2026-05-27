import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { formatNaira, formatDate, toIsoDate, daysUntil } from '@/lib/format';
import { cn } from '@/lib/utils';
import { logAudit } from '@/lib/audit';
import { useAuthStore } from '@/store/authStore';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useToast } from '@/hooks/use-toast';
import { PageHeader } from '@/components/ui-kit/PageHeader';
import { StatusBadge } from '@/components/ui-kit/StatusBadge';
import {
  MobileCard,
  MobileCardHeader,
  MobileCardTitle,
  MobileCardMeta,
  MobileCardRow,
  MobileCardFooter,
} from '@/components/ui-kit/MobileCard';
import { TableSkeleton } from '@/components/ui-kit/TableSkeleton';
import { EmptyState } from '@/components/ui-kit/EmptyState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertTriangle,
  CheckCircle2,
  CalendarClock,
  Info,
  Repeat,
  Layers,
  Banknote,
  CreditCard,
  Pencil,
  Trash2,
  PauseCircle,
  PlayCircle,
  Loader2,
  RefreshCw,
} from 'lucide-react';

// ─── Interfaces ───────────────────────────────────────────────────────────────

interface BalanceData {
  available: number;
  currency: string;
}

interface ScheduleBatch {
  id: string;
  name: string;
  total_amount: number;
  scheduled_date: string;
  status: string;
}

interface RecurringSchedule {
  id: string;
  source_batch_id: string;
  frequency: string;
  next_run_date: string | null;
  last_run_date: string | null;
  day_of_week: number | null;
  day_of_month: number | null;
  status: string;
  batch_name: string;
}

interface ApprovedPayroll {
  id: string;
  period: string;
  total_burn_ngn: number;
  status: string;
  created_at: string;
}

interface ScheduleSubscription {
  id: string;
  name: string;
  amount_ngn: number;
  next_renewal_date: string;
  status: string;
}

type ScheduledItemType = 'batch' | 'recurring' | 'payroll' | 'subscription';

interface ScheduledItem {
  id: string;
  name: string;
  amount: number;
  dueDate: string;
  status: string;
  type: ScheduledItemType;
}

// ─── Date grouping ────────────────────────────────────────────────────────────

type DateGroup = 'Overdue' | 'Today' | 'Tomorrow' | 'This Week' | 'Next Week' | 'Later';

const DATE_GROUP_ORDER: DateGroup[] = [
  'Overdue', 'Today', 'Tomorrow', 'This Week', 'Next Week', 'Later',
];

function getDateGroup(dateStr: string | null | undefined): DateGroup {
  if (!dateStr) return 'Later';
  const days = daysUntil(dateStr);
  if (days === null) return 'Later';
  if (days < 0) return 'Overdue';
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days <= 7) return 'This Week';
  if (days <= 14) return 'Next Week';
  return 'Later';
}

// ─── Type badge config ────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<
  ScheduledItemType,
  { label: string; className: string; icon: typeof Layers }
> = {
  batch:        { label: 'Scheduled',    className: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/30',         icon: Layers },
  recurring:    { label: 'Recurring',    className: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-500/10 dark:text-purple-400 dark:border-purple-500/30', icon: Repeat },
  payroll:      { label: 'Payroll',      className: 'bg-green-50 text-green-700 border-green-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/30', icon: Banknote },
  subscription: { label: 'Subscription', className: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/30',     icon: CreditCard },
};

// ─── Form ─────────────────────────────────────────────────────────────────────

interface RecurringForm {
  frequency: string;
  next_run_date: string;
  day_of_week: number | null;
  day_of_month: number | null;
  custom_interval_days: number | null;
}

const EMPTY_FORM: RecurringForm = {
  frequency: 'monthly',
  next_run_date: '',
  day_of_week: null,
  day_of_month: null,
  custom_interval_days: null,
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function PaymentSchedule() {
  usePageTitle('Payment Schedule');
  const navigate = useNavigate();
  const { toast } = useToast();
  const { profile } = useAuthStore();
  const recurringRef = useRef<HTMLDivElement>(null);

  const today = useMemo(() => toIsoDate(new Date()), []);
  const in7days = useMemo(() => toIsoDate(new Date(Date.now() + 7 * 86_400_000)), []);
  const in30days = useMemo(() => toIsoDate(new Date(Date.now() + 30 * 86_400_000)), []);

  const [loading, setLoading] = useState(true);
  const [balance, setBalance] = useState<BalanceData | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);

  const [batches, setBatches] = useState<ScheduleBatch[]>([]);
  const [overdueBatches, setOverdueBatches] = useState<ScheduleBatch[]>([]);
  const [recurringSchedules, setRecurringSchedules] = useState<RecurringSchedule[]>([]);
  const [payrollRuns, setPayrollRuns] = useState<ApprovedPayroll[]>([]);
  const [subscriptions, setSubscriptions] = useState<ScheduleSubscription[]>([]);

  const [scheduleDialog, setScheduleDialog] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<RecurringSchedule | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<RecurringSchedule | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<RecurringForm>(EMPTY_FORM);

  // ─── Data fetching ─────────────────────────────────────────────────────────

  const fetchBalance = useCallback(async () => {
    setBalanceLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('paystack-transfer', {
        body: { action: 'get_balance' },
      });
      if (error || !data?.ok) throw new Error(data?.error || error?.message || 'Failed');
      setBalance(data.data as BalanceData);
    } catch {
      // silently fail — balance is informational
    } finally {
      setBalanceLoading(false);
    }
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [batchRes, overdueRes, recurringRes, payrollRes, subRes] = await Promise.all([
      supabase
        .from('payment_batches')
        .select('id, name, total_amount, scheduled_date, status')
        .eq('status', 'scheduled')
        .is('deleted_at', null)
        .gte('scheduled_date', today)
        .order('scheduled_date', { ascending: true }),
      supabase
        .from('payment_batches')
        .select('id, name, total_amount, scheduled_date, status')
        .eq('status', 'scheduled')
        .is('deleted_at', null)
        .lt('scheduled_date', today)
        .order('scheduled_date', { ascending: true }),
      supabase
        .from('recurring_schedules')
        .select(`
          id,
          source_batch_id,
          frequency,
          next_run_date,
          last_run_date,
          day_of_week,
          day_of_month,
          status,
          payment_batches!source_batch_id(name)
        `)
        .order('next_run_date', { ascending: true }),
      supabase
        .from('payroll_runs')
        .select('id, period, total_burn_ngn, status, created_at')
        .eq('status', 'approved')
        .order('created_at', { ascending: false }),
      supabase
        .from('subscriptions')
        .select('id, name, amount_ngn, next_renewal_date, status')
        .eq('status', 'active')
        .gte('next_renewal_date', today)
        .order('next_renewal_date', { ascending: true }),
    ]);

    setBatches((batchRes.data as ScheduleBatch[]) ?? []);
    setOverdueBatches((overdueRes.data as ScheduleBatch[]) ?? []);
    const mapped = ((recurringRes.data as any[]) ?? []).map((r) => ({
      ...r,
      batch_name: (r.payment_batches as { name: string } | null)?.name ?? 'Unnamed Batch',
    })) as RecurringSchedule[];
    setRecurringSchedules(mapped);
    setPayrollRuns((payrollRes.data as ApprovedPayroll[]) ?? []);
    setSubscriptions((subRes.data as ScheduleSubscription[]) ?? []);
    setLoading(false);
  }, [today]);

  useEffect(() => {
    fetchBalance();
    fetchData();
  }, [fetchBalance, fetchData]);

  // ─── Derived values ────────────────────────────────────────────────────────

  const obligations7 = useMemo(() => {
    const batchSum = batches
      .filter((b) => b.scheduled_date <= in7days)
      .reduce((s, b) => s + (b.total_amount || 0), 0);
    const payrollSum = payrollRuns.reduce((s, p) => s + (p.total_burn_ngn || 0), 0);
    const subscriptionSum = subscriptions
      .filter((s) => s.next_renewal_date <= in7days)
      .reduce((s, sub) => s + (sub.amount_ngn || 0), 0);
    return batchSum + payrollSum + subscriptionSum;
  }, [batches, payrollRuns, subscriptions, in7days]);

  const obligations30 = useMemo(() => {
    const batchSum = batches
      .filter((b) => b.scheduled_date <= in30days)
      .reduce((s, b) => s + (b.total_amount || 0), 0);
    const payrollSum = payrollRuns.reduce((s, p) => s + (p.total_burn_ngn || 0), 0);
    const subscriptionSum = subscriptions
      .filter((s) => s.next_renewal_date <= in30days)
      .reduce((s, sub) => s + (sub.amount_ngn || 0), 0);
    return batchSum + payrollSum + subscriptionSum;
  }, [batches, payrollRuns, subscriptions, in30days]);

  const overdueTotal = useMemo(
    () => overdueBatches.reduce((s, b) => s + (b.total_amount || 0), 0),
    [overdueBatches],
  );

  const balanceAvailable = balance?.available ?? null;
  const surplus7 = balanceAvailable !== null ? balanceAvailable - obligations7 : null;

  // ─── Upcoming list ─────────────────────────────────────────────────────────

  const allItems = useMemo<ScheduledItem[]>(() => {
    const items: ScheduledItem[] = [
      ...overdueBatches.map((b) => ({
        id: b.id,
        name: b.name,
        amount: b.total_amount,
        dueDate: b.scheduled_date,
        status: b.status,
        type: 'batch' as const,
      })),
      ...batches.map((b) => ({
        id: b.id,
        name: b.name,
        amount: b.total_amount,
        dueDate: b.scheduled_date,
        status: b.status,
        type: 'batch' as const,
      })),
      ...recurringSchedules
        .filter((r) => r.status === 'active' && r.next_run_date)
        .map((r) => ({
          id: r.id,
          name: r.batch_name,
          amount: 0,
          dueDate: r.next_run_date!,
          status: r.status,
          type: 'recurring' as const,
        })),
      ...payrollRuns.map((p) => ({
        id: p.id,
        name: `Payroll – ${p.period}`,
        amount: p.total_burn_ngn,
        dueDate: p.created_at,
        status: p.status,
        type: 'payroll' as const,
      })),
      ...subscriptions.map((s) => ({
        id: s.id,
        name: s.name,
        amount: s.amount_ngn,
        dueDate: s.next_renewal_date,
        status: s.status,
        type: 'subscription' as const,
      })),
    ];
    return items.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }, [overdueBatches, batches, recurringSchedules, payrollRuns, subscriptions]);

  const grouped = useMemo(() => {
    const map = new Map<DateGroup, ScheduledItem[]>();
    for (const item of allItems) {
      const group = getDateGroup(item.dueDate);
      if (!map.has(group)) map.set(group, []);
      map.get(group)!.push(item);
    }
    return DATE_GROUP_ORDER.filter((g) => map.has(g)).map((g) => ({
      group: g,
      items: map.get(g)!,
    }));
  }, [allItems]);

  function handleItemClick(item: ScheduledItem) {
    if (item.type === 'batch') navigate(`/payments/${item.id}`);
    else if (item.type === 'payroll') navigate(`/payroll?run=${encodeURIComponent(item.id)}`);
    else if (item.type === 'subscription') navigate('/subscriptions');
    else recurringRef.current?.scrollIntoView({ behavior: 'smooth' });
  }

  // ─── Recurring CRUD ────────────────────────────────────────────────────────

  function openEdit(s: RecurringSchedule) {
    setEditingSchedule(s);
    setForm({
      frequency: s.frequency,
      next_run_date: s.next_run_date ?? '',
      day_of_week: s.day_of_week,
      day_of_month: s.day_of_month,
      custom_interval_days: null,
    });
    setScheduleDialog(true);
  }

  async function saveSchedule() {
    if (!editingSchedule) return;
    setSaving(true);
    const payload: Record<string, unknown> = {
      frequency: form.frequency,
      next_run_date: form.next_run_date || null,
      day_of_week: form.frequency === 'weekly' ? form.day_of_week : null,
      day_of_month: form.frequency === 'monthly' ? form.day_of_month : null,
      custom_interval_days: form.frequency === 'custom' ? (form.custom_interval_days ?? 30) : null,
    };
    const { error } = await supabase
      .from('recurring_schedules')
      .update(payload)
      .eq('id', editingSchedule.id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      setSaving(false);
      return;
    }
    await logAudit('subscription_edited', `Recurring schedule updated: ${editingSchedule.batch_name}`, profile);
    toast({ title: 'Schedule updated' });
    setSaving(false);
    setScheduleDialog(false);
    fetchData();
  }

  async function togglePause(s: RecurringSchedule) {
    const next = s.status === 'active' ? 'paused' : 'active';
    const { error } = await supabase
      .from('recurring_schedules')
      .update({ status: next })
      .eq('id', s.id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    await logAudit(
      next === 'paused' ? 'subscription_cancelled' : 'subscription_renewed',
      `Recurring schedule ${next === 'paused' ? 'paused' : 'resumed'}: ${s.batch_name}`,
      profile,
    );
    toast({ title: `Schedule ${next === 'paused' ? 'paused' : 'resumed'}` });
    fetchData();
  }

  async function deleteSchedule() {
    if (!confirmDelete) return;
    const { error } = await supabase
      .from('recurring_schedules')
      .delete()
      .eq('id', confirmDelete.id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      setConfirmDelete(null);
      return;
    }
    await logAudit(
      'subscription_cancelled',
      `Recurring schedule deleted: ${confirmDelete.batch_name}`,
      profile,
    );
    toast({ title: 'Schedule deleted' });
    setConfirmDelete(null);
    fetchData();
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payment Schedule"
        description="Monitor upcoming obligations and manage recurring payment schedules"
        actions={
          <Button variant="outline" size="sm" onClick={() => { fetchBalance(); fetchData(); }}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        }
      />

      {/* Recurring schedule info callout */}
      <div className="flex items-start gap-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 px-4 py-3 text-sm text-blue-800 dark:text-blue-300">
        <Info className="h-4 w-4 mt-0.5 shrink-0" />
        <p>
          To create a recurring schedule, open any payment batch and click{' '}
          <strong>"Make Recurring"</strong>. The schedule will appear here automatically and
          can be paused, edited, or stopped at any time.
        </p>
      </div>

      {/* Section 1 — Balance alert bar */}
      {!balanceLoading && balance && surplus7 !== null && (
        <div
          className={cn(
            'flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium',
            surplus7 >= 0
              ? 'bg-green-50 text-green-800 border border-green-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/30'
              : 'bg-red-50 text-red-700 border border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/30',
          )}
        >
          {surplus7 >= 0 ? (
            <CheckCircle2 className="h-4 w-4 shrink-0" />
          ) : (
            <AlertTriangle className="h-4 w-4 shrink-0" />
          )}
          <span>
            {surplus7 >= 0 ? (
              <>
                ✅ Paystack balance covers all payments due in the next 7 days.{' '}
                <strong>Surplus: {formatNaira(surplus7)}</strong>
              </>
            ) : (
              <>
                ⚠️ Paystack balance ({formatNaira(balanceAvailable!)}) may be insufficient
                for payments due in the next 7 days ({formatNaira(obligations7)}).{' '}
                <strong>Shortfall: {formatNaira(Math.abs(surplus7))}</strong>
              </>
            )}
          </span>
        </div>
      )}

      {/* Section 2 — Summary strip (pure Mercury: hairline tiles,
          mono ₦ values, ToD holographic hover). */}
      <div className="rounded-lg border border-border/70 bg-card grid grid-cols-1 sm:grid-cols-3 sm:divide-x divide-border/70 overflow-hidden">
        {[
          {
            label: 'Next 7 days',
            value: formatNaira(obligations7),
            sub: 'Outstanding obligations',
          },
          {
            label: 'Next 30 days',
            value: formatNaira(obligations30),
            sub: 'Outstanding obligations',
          },
          {
            label: 'Overdue',
            value: overdueBatches.length.toString(),
            sub: overdueBatches.length > 0 ? `${formatNaira(overdueTotal)} past due` : 'All on schedule',
            warn: overdueBatches.length > 0,
          },
        ].map(({ label, value, sub, warn }) => (
          <div key={label} className="kd-holographic relative px-4 py-3.5 kd-transition">
            <div className="relative z-[2]">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground flex items-center gap-1.5">
                {label}
                {warn && <span className="h-1.5 w-1.5 rounded-full shrink-0 bg-red-500 animate-pulse" />}
              </p>
              <p className="mt-1.5 text-[20px] font-semibold tabular-nums tracking-tight text-foreground leading-none font-mono truncate">
                {value}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground/80 tabular-nums truncate">{sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Section 3 — Upcoming payments list (dense ledger rows,
          status rail on the left, group label small-caps). */}
      <div className="space-y-4">
        <div className="flex items-baseline gap-2">
          <h2 className="text-[13px] font-semibold tracking-tight">Upcoming payments</h2>
        </div>
        {loading ? (
          <TableSkeleton rows={5} cols={4} />
        ) : grouped.length === 0 ? (
          <div className="rounded-lg border border-border/60 bg-card">
            <EmptyState
              icon={CalendarClock}
              title="No upcoming payments"
              description="Scheduled batches, recurring schedules, and active subscriptions will appear here."
            />
          </div>
        ) : (
          <div className="space-y-3">
            {grouped.map(({ group, items }) => (
              <div key={group}>
                <div
                  className={cn(
                    'text-[10.5px] font-semibold uppercase tracking-[0.1em] px-1 pb-1.5',
                    group === 'Overdue'
                      ? 'text-red-600'
                      : 'text-muted-foreground/80',
                  )}
                >
                  {group}
                </div>
                <div className="rounded-lg border border-border/60 bg-card overflow-hidden divide-y divide-border/40">
                  {items.map((item) => {
                    const cfg = TYPE_CONFIG[item.type];
                    const isOverdue = group === 'Overdue';
                    const railColor = isOverdue ? 'bg-red-500'
                      : group === 'Today' || group === 'This week' ? 'bg-amber-500'
                      : 'bg-slate-300';
                    return (
                      <div
                        key={`${item.type}-${item.id}`}
                        onClick={() => handleItemClick(item)}
                        className={cn(
                          'group relative flex items-center gap-2.5 pl-3 pr-3 h-11 cursor-pointer kd-transition',
                          'hover:bg-muted/40',
                          isOverdue && 'bg-red-50/30 dark:bg-red-950/10',
                        )}
                      >
                        <span className={cn('absolute left-0 top-0 h-full w-[3px]', railColor)} />
                        <cfg.icon className="h-3.5 w-3.5 text-muted-foreground/70 shrink-0 ml-0.5" />
                        <div className="flex-1 min-w-0 flex items-center gap-2">
                          <p className="font-medium text-[13px] truncate text-foreground shrink min-w-0">{item.name}</p>
                          <Badge
                            variant="outline"
                            className={cn('hidden md:inline-flex text-[10px] h-4 px-1.5 shrink-0', cfg.className)}
                          >
                            {cfg.label}
                          </Badge>
                          <span className="hidden md:inline text-[11px] text-muted-foreground/70 tabular-nums shrink-0">
                            {formatDate(item.dueDate)}
                          </span>
                        </div>
                        <span className="md:hidden text-[10.5px] text-muted-foreground/70 tabular-nums shrink-0">
                          {formatDate(item.dueDate)}
                        </span>
                        <span className={cn(
                          'shrink-0 font-mono font-semibold text-[13px] tabular-nums leading-none tracking-tight w-28 text-right',
                          isOverdue && 'text-red-700',
                        )}>
                          {formatNaira(item.amount)}
                        </span>
                        <StatusBadge status={item.status} size="sm" />
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Section 4 — Recurring schedules (native table, hairline
          divider, mono dates, dot+label status). */}
      <div ref={recurringRef} className="space-y-3">
        <h2 className="text-[13px] font-semibold tracking-tight">Recurring schedules</h2>
        {loading ? (
          <TableSkeleton rows={3} cols={6} />
        ) : recurringSchedules.length === 0 ? (
          <div className="rounded-lg border border-border/60 bg-card">
            <EmptyState
              icon={Repeat}
              title="No recurring schedules"
              description="Open a payment batch and click 'Make recurring' to set one up."
            />
          </div>
        ) : (
          <div className="rounded-lg border border-border/60 bg-card overflow-hidden">
            <div className="overflow-x-auto hidden md:block">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border/50">
                    <th className="text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground px-3 py-2">Batch</th>
                    <th className="text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground px-3 py-2">Frequency</th>
                    <th className="text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground px-3 py-2">Next run</th>
                    <th className="text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground px-3 py-2">Last run</th>
                    <th className="text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground px-3 py-2">Status</th>
                    <th className="text-right text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground px-3 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {recurringSchedules.map((s) => (
                    <tr key={s.id} className="hover:bg-muted/30 kd-transition">
                      <td className="px-3 py-2 text-[13px] font-medium">{s.batch_name}</td>
                      <td className="px-3 py-2 text-[12px] capitalize text-muted-foreground">{s.frequency}</td>
                      <td className="px-3 py-2 text-[12px] font-mono tabular-nums text-muted-foreground">
                        {s.next_run_date ? formatDate(s.next_run_date) : <span className="text-muted-foreground/30">—</span>}
                      </td>
                      <td className="px-3 py-2 text-[12px] font-mono tabular-nums text-muted-foreground">
                        {s.last_run_date ? formatDate(s.last_run_date) : <span className="text-muted-foreground/30">—</span>}
                      </td>
                      <td className="px-3 py-2">
                        <StatusBadge status={s.status} size="sm" />
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-end gap-0.5">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(s)}>
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => togglePause(s)}>
                            {s.status === 'active' ? (
                              <PauseCircle className="h-3 w-3" />
                            ) : (
                              <PlayCircle className="h-3 w-3 text-emerald-600" />
                            )}
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setConfirmDelete(s)}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile card list — same data, thumb-friendly */}
            <div className="md:hidden p-3 space-y-2">
              {recurringSchedules.map((s) => (
                <MobileCard key={s.id}>
                  <MobileCardHeader>
                    <MobileCardTitle>{s.batch_name}</MobileCardTitle>
                    <MobileCardMeta>
                      <StatusBadge status={s.status} size="sm" />
                    </MobileCardMeta>
                  </MobileCardHeader>

                  <MobileCardRow label="Frequency">
                    <span className="capitalize">{s.frequency}</span>
                  </MobileCardRow>
                  <MobileCardRow label="Next run">
                    {s.next_run_date ? formatDate(s.next_run_date) : '—'}
                  </MobileCardRow>
                  <MobileCardRow label="Last run">
                    {s.last_run_date ? formatDate(s.last_run_date) : '—'}
                  </MobileCardRow>

                  <MobileCardFooter>
                    <Button variant="outline" size="sm" className="flex-1 h-9" onClick={() => openEdit(s)}>
                      <Pencil className="h-4 w-4 mr-1.5" /> Edit
                    </Button>
                    <Button variant="outline" size="sm" className="flex-1 h-9" onClick={() => togglePause(s)}>
                      {s.status === 'active' ? (
                        <>
                          <PauseCircle className="h-4 w-4 mr-1.5" /> Pause
                        </>
                      ) : (
                        <>
                          <PlayCircle className="h-4 w-4 mr-1.5 text-emerald-600" /> Resume
                        </>
                      )}
                    </Button>
                    <Button variant="ghost" size="sm" className="flex-1 h-9 text-destructive hover:text-destructive" onClick={() => setConfirmDelete(s)}>
                      <Trash2 className="h-4 w-4 mr-1.5" /> Delete
                    </Button>
                  </MobileCardFooter>
                </MobileCard>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Edit schedule dialog */}
      <Dialog open={scheduleDialog} onOpenChange={setScheduleDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Recurring Schedule</DialogTitle>
            <DialogDescription>{editingSchedule?.batch_name}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Frequency</Label>
              <Select
                value={form.frequency}
                onValueChange={(v) => setForm((f) => ({ ...f, frequency: v }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="biweekly">Biweekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="custom">Custom interval</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {form.frequency === 'weekly' && (
              <div className="space-y-1.5">
                <Label>Day of week</Label>
                <Select
                  value={String(form.day_of_week ?? 1)}
                  onValueChange={(v) => setForm((f) => ({ ...f, day_of_week: Number(v) }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].map((d, i) => (
                      <SelectItem key={i} value={String(i)}>{d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {form.frequency === 'monthly' && (
              <div className="space-y-1.5">
                <Label>Day of month</Label>
                <Input
                  type="number"
                  min={1}
                  max={31}
                  value={form.day_of_month ?? 1}
                  onChange={(e) => setForm((f) => ({ ...f, day_of_month: Number(e.target.value) }))}
                />
              </div>
            )}

            {form.frequency === 'custom' && (
              <div className="space-y-1.5">
                <Label>Every N days</Label>
                <Input
                  type="number"
                  min={1}
                  value={form.custom_interval_days ?? 30}
                  onChange={(e) => setForm((f) => ({ ...f, custom_interval_days: Number(e.target.value) }))}
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Next run date</Label>
              <Input
                type="date"
                value={form.next_run_date}
                onChange={(e) => setForm((f) => ({ ...f, next_run_date: e.target.value }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setScheduleDialog(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={saveSchedule} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Update
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog
        open={!!confirmDelete}
        onOpenChange={(open) => { if (!open) setConfirmDelete(null); }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Stop Recurring Schedule</DialogTitle>
            <DialogDescription>
              Are you sure you want to stop &ldquo;{confirmDelete?.batch_name}&rdquo;? The
              schedule will be deleted and no further batches will be auto-created. This cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={deleteSchedule}>
              Stop &amp; Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
