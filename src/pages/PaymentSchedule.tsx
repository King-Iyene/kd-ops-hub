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
import { StatCard } from '@/components/ui-kit/StatCard';
import { StatusBadge } from '@/components/ui-kit/StatusBadge';
import { TableSkeleton } from '@/components/ui-kit/TableSkeleton';
import { EmptyState } from '@/components/ui-kit/EmptyState';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertTriangle,
  CheckCircle2,
  CalendarClock,
  Repeat,
  Layers,
  Banknote,
  CreditCard,
  Plus,
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
  batch:        { label: 'Scheduled',    className: 'bg-blue-50 text-blue-700 border-blue-200',     icon: Layers },
  recurring:    { label: 'Recurring',    className: 'bg-purple-50 text-purple-700 border-purple-200', icon: Repeat },
  payroll:      { label: 'Payroll',      className: 'bg-green-50 text-green-700 border-green-200',   icon: Banknote },
  subscription: { label: 'Subscription', className: 'bg-amber-50 text-amber-700 border-amber-200',   icon: CreditCard },
};

// ─── Form ─────────────────────────────────────────────────────────────────────

type FrequencyType = RecurringSchedule['frequency'];
type CategoryType = 'contractor' | 'payroll' | 'subscription' | 'other';

interface RecurringForm {
  name: string;
  frequency: FrequencyType;
  next_due_date: string;
  estimated_amount_ngn: string;
  category: CategoryType;
  auto_create_draft_batch: boolean;
}

const EMPTY_FORM: RecurringForm = {
  name: '',
  frequency: 'monthly',
  next_due_date: '',
  estimated_amount_ngn: '',
  category: 'other',
  auto_create_draft_batch: false,
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
        .gte('scheduled_date', today)
        .order('scheduled_date', { ascending: true }),
      supabase
        .from('payment_batches')
        .select('id, name, total_amount, scheduled_date, status')
        .eq('status', 'scheduled')
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
    const recurringSum = recurringSchedules
      .filter(
        (r) =>
          r.status === 'active' &&
          r.next_due_date &&
          r.next_due_date >= today &&
          r.next_due_date <= in7days,
      )
      .reduce((s, r) => s + (r.estimated_amount_ngn || 0), 0);
    const payrollSum = payrollRuns.reduce((s, p) => s + (p.total_burn_ngn || 0), 0);
    const subscriptionSum = subscriptions
      .filter((s) => s.next_renewal_date <= in7days)
      .reduce((s, sub) => s + (sub.amount_ngn || 0), 0);
    return batchSum + recurringSum + payrollSum + subscriptionSum;
  }, [batches, recurringSchedules, payrollRuns, subscriptions, today, in7days]);

  const obligations30 = useMemo(() => {
    const batchSum = batches
      .filter((b) => b.scheduled_date <= in30days)
      .reduce((s, b) => s + (b.total_amount || 0), 0);
    const recurringSum = recurringSchedules
      .filter(
        (r) =>
          r.status === 'active' &&
          r.next_due_date &&
          r.next_due_date >= today &&
          r.next_due_date <= in30days,
      )
      .reduce((s, r) => s + (r.estimated_amount_ngn || 0), 0);
    const payrollSum = payrollRuns.reduce((s, p) => s + (p.total_burn_ngn || 0), 0);
    const subscriptionSum = subscriptions
      .filter((s) => s.next_renewal_date <= in30days)
      .reduce((s, sub) => s + (sub.amount_ngn || 0), 0);
    return batchSum + recurringSum + payrollSum + subscriptionSum;
  }, [batches, recurringSchedules, payrollRuns, subscriptions, today, in30days]);

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
        .filter((r) => r.status === 'active' && r.next_due_date)
        .map((r) => ({
          id: r.id,
          name: r.name,
          amount: r.estimated_amount_ngn || 0,
          dueDate: r.next_due_date!,
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
    else if (item.type === 'payroll') navigate('/payroll');
    else if (item.type === 'subscription') navigate('/subscriptions');
    else recurringRef.current?.scrollIntoView({ behavior: 'smooth' });
  }

  // ─── Recurring CRUD ────────────────────────────────────────────────────────

  function openAdd() {
    setEditingSchedule(null);
    setForm(EMPTY_FORM);
    setScheduleDialog(true);
  }

  function openEdit(s: RecurringSchedule) {
    setEditingSchedule(s);
    setForm({
      name: s.name,
      frequency: s.frequency,
      next_due_date: s.next_due_date ?? '',
      estimated_amount_ngn: s.estimated_amount_ngn?.toString() ?? '',
      category: s.category,
      auto_create_draft_batch: s.auto_create_draft_batch,
    });
    setScheduleDialog(true);
  }

  async function saveSchedule() {
    if (!form.name.trim()) {
      toast({ title: 'Name is required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      frequency: form.frequency,
      next_due_date: form.next_due_date || null,
      estimated_amount_ngn: form.estimated_amount_ngn
        ? parseFloat(form.estimated_amount_ngn)
        : null,
      category: form.category,
      auto_create_draft_batch: form.auto_create_draft_batch,
    };

    if (editingSchedule) {
      const { error } = await supabase
        .from('recurring_schedules')
        .update(payload)
        .eq('id', editingSchedule.id);
      if (error) {
        toast({ title: 'Error', description: error.message, variant: 'destructive' });
        setSaving(false);
        return;
      }
      await logAudit('subscription_edited', `Recurring schedule updated: ${payload.name}`, profile);
      toast({ title: 'Schedule updated' });
    } else {
      const { error } = await supabase.from('recurring_schedules').insert(payload);
      if (error) {
        toast({ title: 'Error', description: error.message, variant: 'destructive' });
        setSaving(false);
        return;
      }
      await logAudit('subscription_added', `Recurring schedule created: ${payload.name}`, profile);
      toast({ title: 'Schedule added' });
    }

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
      `Recurring schedule ${next === 'paused' ? 'paused' : 'resumed'}: ${s.name}`,
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
      `Recurring schedule deleted: ${confirmDelete.name}`,
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

      {/* Section 1 — Balance alert bar */}
      {!balanceLoading && balance && surplus7 !== null && (
        <div
          className={cn(
            'flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium',
            surplus7 >= 0
              ? 'bg-green-50 text-green-800 border border-green-200'
              : 'bg-red-50 text-red-700 border border-red-200',
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

      {/* Section 2 — Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Next 7 Days"
          value={formatNaira(obligations7)}
          subtitle="Total NGN obligations"
          icon={CalendarClock}
          tone="primary"
        />
        <StatCard
          title="Next 30 Days"
          value={formatNaira(obligations30)}
          subtitle="Total NGN obligations"
          icon={CalendarClock}
          tone="default"
        />
        <StatCard
          title="Overdue"
          value={overdueBatches.length.toString()}
          subtitle={
            overdueBatches.length > 0
              ? `${formatNaira(overdueTotal)} past due`
              : 'All on schedule'
          }
          icon={AlertTriangle}
          tone={overdueBatches.length > 0 ? 'danger' : 'success'}
        />
      </div>

      {/* Section 3 — Upcoming payments list */}
      <Card>
        <CardHeader>
          <CardTitle>Upcoming Payments</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <TableSkeleton rows={5} cols={4} />
          ) : grouped.length === 0 ? (
            <EmptyState
              icon={CalendarClock}
              title="No upcoming payments"
              description="Scheduled batches, recurring schedules, and active subscriptions will appear here."
            />
          ) : (
            <div className="space-y-4">
              {grouped.map(({ group, items }) => (
                <div key={group}>
                  <div
                    className={cn(
                      'text-xs font-semibold uppercase tracking-wider px-1 pb-2',
                      group === 'Overdue'
                        ? 'text-destructive'
                        : 'text-muted-foreground',
                    )}
                  >
                    {group}
                  </div>
                  <div className="space-y-1">
                    {items.map((item) => {
                      const cfg = TYPE_CONFIG[item.type];
                      return (
                        <div
                          key={`${item.type}-${item.id}`}
                          onClick={() => handleItemClick(item)}
                          className="flex items-center gap-3 rounded-lg border px-4 py-3 cursor-pointer kd-transition hover:bg-muted/40"
                        >
                          <cfg.icon className="h-4 w-4 text-muted-foreground shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{item.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatDate(item.dueDate)}
                            </p>
                          </div>
                          <Badge
                            variant="outline"
                            className={cn('text-[11px] shrink-0', cfg.className)}
                          >
                            {cfg.label}
                          </Badge>
                          <span className="font-semibold currency shrink-0 text-sm">
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
        </CardContent>
      </Card>

      {/* Section 4 — Recurring schedules manager */}
      <div ref={recurringRef}>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Recurring Schedules</CardTitle>
            <Button size="sm" onClick={openAdd}>
              <Plus className="h-4 w-4 mr-2" />
              Add Recurring Schedule
            </Button>
          </CardHeader>
          <CardContent>
            {loading ? (
              <TableSkeleton rows={3} cols={6} />
            ) : recurringSchedules.length === 0 ? (
              <EmptyState
                icon={Repeat}
                title="No recurring schedules"
                description="Add recurring payment schedules to track predictable obligations."
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Frequency</TableHead>
                    <TableHead>Next Due</TableHead>
                    <TableHead>Est. Amount</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recurringSchedules.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell className="capitalize">{s.frequency}</TableCell>
                      <TableCell>{formatDate(s.next_due_date)}</TableCell>
                      <TableCell className="currency">
                        {s.estimated_amount_ngn != null
                          ? formatNaira(s.estimated_amount_ngn)
                          : '—'}
                      </TableCell>
                      <TableCell className="capitalize">{s.category}</TableCell>
                      <TableCell>
                        <StatusBadge status={s.status} size="sm" />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => openEdit(s)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => togglePause(s)}
                          >
                            {s.status === 'active' ? (
                              <PauseCircle className="h-3.5 w-3.5" />
                            ) : (
                              <PlayCircle className="h-3.5 w-3.5 text-green-600" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => setConfirmDelete(s)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Add / Edit dialog */}
      <Dialog open={scheduleDialog} onOpenChange={setScheduleDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingSchedule ? 'Edit' : 'Add'} Recurring Schedule
            </DialogTitle>
            <DialogDescription>
              Define a recurring payment obligation to track and optionally
              auto-generate draft batches.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="rs-name">Name *</Label>
              <Input
                id="rs-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Monthly Contractor Payments"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Frequency</Label>
                <Select
                  value={form.frequency}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, frequency: v as FrequencyType }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="biweekly">Biweekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="quarterly">Quarterly</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="rs-due">Next Due Date</Label>
                <Input
                  id="rs-due"
                  type="date"
                  value={form.next_due_date}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, next_due_date: e.target.value }))
                  }
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="rs-amount">Estimated Amount (NGN)</Label>
                <Input
                  id="rs-amount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.estimated_amount_ngn}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, estimated_amount_ngn: e.target.value }))
                  }
                  placeholder="0.00"
                />
              </div>

              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select
                  value={form.category}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, category: v as CategoryType }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="contractor">Contractor</SelectItem>
                    <SelectItem value="payroll">Payroll</SelectItem>
                    <SelectItem value="subscription">Subscription</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-lg border p-3">
              <Switch
                id="rs-auto"
                checked={form.auto_create_draft_batch}
                onCheckedChange={(v) =>
                  setForm((f) => ({ ...f, auto_create_draft_batch: v }))
                }
              />
              <Label htmlFor="rs-auto" className="cursor-pointer">
                Auto-create draft batch when due
              </Label>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setScheduleDialog(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button onClick={saveSchedule} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingSchedule ? 'Update' : 'Create'}
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
            <DialogTitle>Delete Recurring Schedule</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &ldquo;{confirmDelete?.name}&rdquo;? This
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={deleteSchedule}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
