import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Plus,
  Search,
  Download,
  Pencil,
  Trash2,
  CalendarClock,
  Repeat,
  DollarSign,
  AlertTriangle,
  Loader2,
  Info,
  CreditCard,
  Target,
  Zap,
  Calendar,
} from 'lucide-react';
import { InfoHint } from '@/components/ui-kit/InfoHint';
import { VendorCombobox } from '@/components/VendorCombobox';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { logAudit } from '@/lib/audit';
import { APPROVER_ROLES, hasRole } from '@/lib/roles';
import { daysUntil, formatDate, formatNaira, toIsoDate } from '@/lib/format';
import { toCsv, downloadCsv } from '@/lib/csv';
import { Card, CardContent } from '@/components/ui/card';
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
  DialogDescription,
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { PageHeader } from '@/components/ui-kit/PageHeader';
import { MobileFilterBar } from '@/components/ui-kit/MobileFilterBar';
import { StatCard } from '@/components/ui-kit/StatCard';
import { TableSkeleton } from '@/components/ui-kit/TableSkeleton';
import { EmptyState } from '@/components/ui-kit/EmptyState';
import { ErrorState } from '@/components/ui-kit/ErrorState';
import { Pagination } from '@/components/ui-kit/Pagination';
import { usePagination } from '@/hooks/usePagination';
import {
  MobileCard,
  MobileCardHeader,
  MobileCardTitle,
  MobileCardMeta,
  MobileCardRow,
  MobileCardFooter,
} from '@/components/ui-kit/MobileCard';

/* ─────────────────────── Types ─────────────────────── */

interface Subscription {
  id: string;
  name: string;
  vendor: string | null;
  vendor_id: string | null;
  category: string;
  amount_ngn: number;
  currency: 'NGN' | 'USD';
  amount_usd: number | null;
  billing_cycle: 'monthly' | 'quarterly' | 'yearly';
  next_renewal_date: string;
  last_renewed_at: string | null;
  status: 'active' | 'cancelled' | 'paused';
  notes: string | null;
  owner_id: string | null;
  department_id: string | null;
  billing_day: number | null;
  payment_method: string | null;
  priority: 'high' | 'medium' | 'low' | null;
  decision: 'keep' | 'kill' | 'undecided' | null;
  cost_original: number | null;
  updated_at: string | null;
}

interface SubPayment {
  id: string;
  subscription_id: string;
  month: string;
  status: 'paid' | 'pending' | 'skipped' | 'overdue';
  amount_ngn: number | null;
  amount_usd: number | null;
  fx_rate_used: number | null;
  payment_method: string | null;
  paid_at: string | null;
  notes: string | null;
}

/* ─────────────────────── Constants ─────────────────────── */

const CATEGORIES = ['software', 'hosting', 'office', 'telecom', 'finance', 'other'];
const CYCLES: Subscription['billing_cycle'][] = ['monthly', 'quarterly', 'yearly'];
const PAYMENT_METHODS = [
  'GeegPay Card',
  'Opay Card',
  'Moniepoint Card',
  'Transfer',
  'Kuda Card',
  "Tonye's Card",
];
const PRIORITIES: Subscription['priority'][] = ['high', 'medium', 'low'];
const DECISIONS: Subscription['decision'][] = ['keep', 'kill', 'undecided'];

/* ─────────────────────── Helpers ─────────────────────── */

const cycleLabel = (c: string) =>
  c.charAt(0).toUpperCase() + c.slice(1);

const nextDate = (iso: string, cycle: string): string => {
  const d = new Date(iso);
  if (cycle === 'monthly') d.setMonth(d.getMonth() + 1);
  else if (cycle === 'quarterly') d.setMonth(d.getMonth() + 3);
  else if (cycle === 'yearly') d.setFullYear(d.getFullYear() + 1);
  return toIsoDate(d);
};

const monthlyEquivalent = (sub: Subscription): number => {
  switch (sub.billing_cycle) {
    case 'monthly':
      return sub.amount_ngn;
    case 'quarterly':
      return sub.amount_ngn / 3;
    case 'yearly':
      return sub.amount_ngn / 12;
    default:
      return sub.amount_ngn;
  }
};

const monthlyEquivalentUsd = (sub: Subscription): number => {
  if (sub.currency !== 'USD' || sub.amount_usd == null) return 0;
  switch (sub.billing_cycle) {
    case 'monthly':
      return sub.amount_usd;
    case 'quarterly':
      return sub.amount_usd / 3;
    case 'yearly':
      return sub.amount_usd / 12;
    default:
      return sub.amount_usd;
  }
};

const formatUsd = (v: number) =>
  `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const monthKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

const monthLabel = (iso: string) => {
  const [y, m] = iso.split('-');
  const d = new Date(Number(y), Number(m) - 1);
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
};

const PAYMENT_STATUS_NEXT: Record<string, SubPayment['status']> = {
  pending: 'paid',
  paid: 'skipped',
  skipped: 'pending',
  overdue: 'paid',
};

/* ─────────────────────── Form ─────────────────────── */

interface FormState {
  name: string;
  vendor: string;
  vendor_id: string;
  category: string;
  currency: 'NGN' | 'USD';
  amount_ngn: string;
  amount_usd: string;
  billing_cycle: Subscription['billing_cycle'];
  next_renewal_date: string;
  notes: string;
  billing_day: string;
  payment_method: string;
  priority: string;
  decision: string;
}

const emptyForm: FormState = {
  name: '',
  vendor: '',
  vendor_id: '',
  category: 'software',
  currency: 'NGN',
  amount_ngn: '',
  amount_usd: '',
  billing_cycle: 'monthly',
  next_renewal_date: toIsoDate(new Date()),
  notes: '',
  billing_day: '',
  payment_method: '',
  priority: '',
  decision: '',
};

/* ═══════════════════════ Component ═══════════════════════ */

const Subscriptions = () => {
  const { profile } = useAuthStore();
  const { toast } = useToast();
  const canManage = hasRole(profile?.role, APPROVER_ROLES);

  /* ── Core state ── */
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'cancelled' | 'paused'>('all');
  const [categoryFilter, setCategoryFilter] = useState<'all' | string>('all');
  const [priorityFilter, setPriorityFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all');
  const [decisionFilter, setDecisionFilter] = useState<'all' | 'keep' | 'kill' | 'undecided'>('all');
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<'all' | string>('all');

  const [dialog, setDialog] = useState(false);
  const [editing, setEditing] = useState<Subscription | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [renewingId, setRenewingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Subscription | null>(null);

  /* ── Tab state ── */
  const [activeTab, setActiveTab] = useState('overview');

  /* ── FX rate ── */
  const [fxRate, setFxRate] = useState<number | null>(null);

  /* ── Payment tracker state ── */
  const [payments, setPayments] = useState<SubPayment[]>([]);
  const [loadingPayments, setLoadingPayments] = useState(false);
  const [togglingPayment, setTogglingPayment] = useState<string | null>(null);

  /* ── Fetch subscriptions ── */
  const fetchSubs = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from('subscriptions')
      .select('*')
      .order('next_renewal_date', { ascending: true })
      .limit(200);
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    setSubs((data as Subscription[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchSubs();
  }, [fetchSubs]);

  /* ── Fetch live FX rate ── */
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('fx_rates')
        .select('rate')
        .eq('base', 'USD')
        .eq('quote', 'NGN')
        .eq('status', 'active')
        .order('valid_from', { ascending: false })
        .limit(1)
        .single();
      if (data?.rate) setFxRate(Number(data.rate));
    })();
  }, []);

  /* ── Fetch payment tracker data (only when tab active) ── */
  const fetchPayments = useCallback(async () => {
    setLoadingPayments(true);
    const { data } = await supabase
      .from('subscription_payments')
      .select('*')
      .order('month', { ascending: true });
    setPayments((data as SubPayment[]) || []);
    setLoadingPayments(false);
  }, []);

  useEffect(() => {
    if (activeTab === 'payments') fetchPayments();
  }, [activeTab, fetchPayments]);

  /* ── Renewal notifications ── */
  useEffect(() => {
    if (loading || subs.length === 0 || !profile) return;
    const unique: Record<number, Subscription[]> = { 7: [], 3: [], 1: [] };
    for (const s of subs) {
      if (s.status !== 'active') continue;
      const d = daysUntil(s.next_renewal_date);
      if (d === null) continue;
      if (d === 7) unique[7].push(s);
      else if (d === 3) unique[3].push(s);
      else if (d === 1) unique[1].push(s);
    }

    const write = async (list: Subscription[], days: number) => {
      if (list.length === 0) return;
      const title =
        days === 1
          ? 'Subscription renewal tomorrow'
          : `Subscription renewal in ${days} days`;
      const body = list
        .map((s) => `${s.name} (${formatNaira(s.amount_ngn)})`)
        .slice(0, 5)
        .join(', ');
      try {
        await supabase.from('notifications').insert({
          user_id: profile.id,
          type: 'subscription_renewal',
          title,
          body,
        });
      } catch {
        // ignore — notifications are best effort.
      }
    };
    write(unique[7], 7);
    write(unique[3], 3);
    write(unique[1], 1);
  }, [subs, loading, profile]);

  /* ── Stats ── */
  const stats = useMemo(() => {
    const active = subs.filter((s) => s.status === 'active');
    const paused = subs.filter((s) => s.status === 'paused');
    const monthlyNgn = active.reduce((sum, s) => sum + monthlyEquivalent(s), 0);
    const monthlyUsd = active.reduce((sum, s) => sum + monthlyEquivalentUsd(s), 0);
    const nextIn30 = active.filter((s) => {
      const d = daysUntil(s.next_renewal_date);
      return d !== null && d >= 0 && d <= 30;
    });
    const killSubs = subs.filter((s) => s.decision === 'kill' && s.status === 'active');
    const killSavings = killSubs.reduce((sum, s) => sum + monthlyEquivalent(s), 0);
    return {
      monthlyNgn,
      monthlyUsd,
      active: active.length,
      paused: paused.length,
      total: subs.length,
      dueSoon: nextIn30.length,
      killCount: killSubs.length,
      killSavings,
    };
  }, [subs]);

  /* ── Filtered + paginated ── */
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return subs.filter((s) => {
      if (statusFilter !== 'all' && s.status !== statusFilter) return false;
      if (categoryFilter !== 'all' && s.category !== categoryFilter) return false;
      if (priorityFilter !== 'all' && s.priority !== priorityFilter) return false;
      if (decisionFilter !== 'all' && s.decision !== decisionFilter) return false;
      if (paymentMethodFilter !== 'all' && s.payment_method !== paymentMethodFilter) return false;
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        (s.vendor || '').toLowerCase().includes(q) ||
        s.category.toLowerCase().includes(q)
      );
    });
  }, [subs, search, statusFilter, categoryFilter, priorityFilter, decisionFilter, paymentMethodFilter]);

  const pagination = usePagination(filtered, 20);
  const activeSubFilterCount = [
    statusFilter !== 'all',
    categoryFilter !== 'all',
    priorityFilter !== 'all',
    decisionFilter !== 'all',
    paymentMethodFilter !== 'all',
  ].filter(Boolean).length;

  /* ── Kill banner stats ── */
  const showKillBanner = decisionFilter === 'kill' && filtered.length > 0;
  const killBannerSavingsMonthly = useMemo(() => {
    if (!showKillBanner) return 0;
    return filtered.reduce((sum, s) => sum + monthlyEquivalent(s), 0);
  }, [showKillBanner, filtered]);

  /* ── Payment tracker grid data ── */
  const paymentGrid = useMemo(() => {
    const activeMonthlySubs = subs.filter(
      (s) => s.status === 'active' && s.billing_cycle === 'monthly',
    );
    // Build column months: 6 months from 3 months ago to 2 months ahead
    const now = new Date();
    const months: string[] = [];
    for (let i = -3; i <= 2; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      months.push(monthKey(d));
    }
    // Index payments by sub+month
    const payMap = new Map<string, SubPayment>();
    for (const p of payments) {
      const key = `${p.subscription_id}|${p.month.slice(0, 7)}`;
      payMap.set(key, p);
    }
    return { subs: activeMonthlySubs, months, payMap };
  }, [subs, payments]);

  /* ── CRUD handlers ── */
  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setDialog(true);
  };

  const openEdit = (s: Subscription) => {
    setEditing(s);
    setForm({
      name: s.name,
      vendor: s.vendor || '',
      vendor_id: s.vendor_id || '',
      category: s.category,
      currency: s.currency || 'NGN',
      amount_ngn: String(s.amount_ngn),
      amount_usd: s.amount_usd != null ? String(s.amount_usd) : '',
      billing_cycle: s.billing_cycle,
      next_renewal_date: s.next_renewal_date,
      notes: s.notes || '',
      billing_day: s.billing_day != null ? String(s.billing_day) : '',
      payment_method: s.payment_method || '',
      priority: s.priority || '',
      decision: s.decision || '',
    });
    setDialog(true);
  };

  const save = async () => {
    if (!form.name.trim()) {
      toast({ title: 'Name is required', variant: 'destructive' });
      return;
    }
    if (!form.next_renewal_date) {
      toast({ title: 'Next renewal date is required', variant: 'destructive' });
      return;
    }

    let amountNgn: number;
    let amountUsd: number | null = null;

    if (form.currency === 'USD') {
      const usd = parseFloat(form.amount_usd);
      if (!Number.isFinite(usd) || usd < 0) {
        toast({ title: 'Enter a valid USD amount', variant: 'destructive' });
        return;
      }
      amountUsd = usd;
      amountNgn = parseFloat(form.amount_ngn) || 0;
    } else {
      const ngn = parseFloat(form.amount_ngn);
      if (!Number.isFinite(ngn) || ngn < 0) {
        toast({ title: 'Enter a valid amount', variant: 'destructive' });
        return;
      }
      amountNgn = ngn;
    }

    const billingDay = form.billing_day ? parseInt(form.billing_day, 10) : null;
    if (billingDay != null && (billingDay < 1 || billingDay > 31)) {
      toast({ title: 'Billing day must be 1-31', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        vendor: form.vendor || null,
        vendor_id: form.vendor_id || null,
        category: form.category,
        currency: form.currency,
        amount_ngn: amountNgn,
        amount_usd: amountUsd,
        billing_cycle: form.billing_cycle,
        next_renewal_date: form.next_renewal_date,
        notes: form.notes || null,
        billing_day: billingDay,
        payment_method: form.payment_method || null,
        priority: form.priority || null,
        decision: form.decision || null,
      };
      if (editing) {
        const { error } = await supabase
          .from('subscriptions')
          .update(payload)
          .eq('id', editing.id);
        if (error) throw error;
        await logAudit(
          'subscription_edited',
          `Subscription "${payload.name}" updated`,
          profile,
        );
        toast({ title: 'Subscription updated' });
      } else {
        const { error } = await supabase.from('subscriptions').insert({
          ...payload,
          status: 'active',
          created_by: profile?.id,
        });
        if (error) throw error;
        await logAudit(
          'subscription_added',
          `Subscription "${payload.name}" added (${form.currency === 'USD' ? `$${amountUsd}` : formatNaira(amountNgn)} / ${cycleLabel(form.billing_cycle)})`,
          profile,
        );
        toast({ title: 'Subscription added' });
      }
      setDialog(false);
      setEditing(null);
      await fetchSubs();
    } catch (err: any) {
      toast({
        title: 'Save failed',
        description: err?.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const markRenewed = async (s: Subscription) => {
    setRenewingId(s.id);
    try {
      const today = toIsoDate(new Date());
      const base =
        new Date(s.next_renewal_date) > new Date()
          ? s.next_renewal_date
          : today;
      const next = nextDate(base, s.billing_cycle);
      const { error } = await supabase
        .from('subscriptions')
        .update({ last_renewed_at: today, next_renewal_date: next })
        .eq('id', s.id);
      if (error) throw error;
      await logAudit(
        'subscription_renewed',
        `Subscription "${s.name}" marked renewed — next: ${formatDate(next)}`,
        profile,
      );
      toast({ title: 'Renewed', description: `Next renewal: ${formatDate(next)}` });
      fetchSubs();
    } catch (err: any) {
      toast({
        title: 'Could not mark renewed',
        description: err?.message,
        variant: 'destructive',
      });
    } finally {
      setRenewingId(null);
    }
  };

  const cancelSub = async (s: Subscription) => {
    try {
      const { error } = await supabase
        .from('subscriptions')
        .update({ status: 'cancelled' })
        .eq('id', s.id);
      if (error) throw error;
      await logAudit(
        'subscription_cancelled',
        `Subscription "${s.name}" cancelled`,
        profile,
      );
      toast({ title: 'Subscription cancelled' });
      fetchSubs();
    } catch (err: any) {
      toast({
        title: 'Could not cancel',
        description: err?.message,
        variant: 'destructive',
      });
    }
  };

  const pauseSub = async (s: Subscription) => {
    try {
      const { error } = await supabase
        .from('subscriptions')
        .update({ status: 'paused' })
        .eq('id', s.id);
      if (error) throw error;
      await logAudit('subscription_edited', `Subscription "${s.name}" paused`, profile);
      toast({ title: 'Subscription paused' });
      fetchSubs();
    } catch (err: any) {
      toast({
        title: 'Could not pause',
        description: err?.message,
        variant: 'destructive',
      });
    }
  };

  const deleteSub = async (s: Subscription) => {
    try {
      const { error } = await supabase
        .from('subscriptions')
        .delete()
        .eq('id', s.id);
      if (error) throw error;
      await logAudit(
        'subscription_cancelled',
        `Subscription "${s.name}" deleted`,
        profile,
      );
      toast({ title: 'Subscription deleted' });
      setPendingDelete(null);
      fetchSubs();
    } catch (err: any) {
      toast({
        title: 'Could not delete',
        description: err?.message,
        variant: 'destructive',
      });
    }
  };

  const reactivate = async (s: Subscription) => {
    try {
      const { error } = await supabase
        .from('subscriptions')
        .update({ status: 'active' })
        .eq('id', s.id);
      if (error) throw error;
      await logAudit('subscription_edited', `Subscription "${s.name}" reactivated`, profile);
      toast({ title: 'Subscription reactivated' });
      fetchSubs();
    } catch (err: any) {
      toast({
        title: 'Could not reactivate',
        description: err?.message,
        variant: 'destructive',
      });
    }
  };

  /* ── Payment tracker toggle ── */
  const togglePaymentStatus = async (subId: string, month: string, current: SubPayment | undefined) => {
    const key = `${subId}|${month}`;
    setTogglingPayment(key);
    try {
      if (current) {
        const nextStatus = PAYMENT_STATUS_NEXT[current.status] || 'pending';
        const { error } = await supabase
          .from('subscription_payments')
          .update({
            status: nextStatus,
            paid_at: nextStatus === 'paid' ? new Date().toISOString() : null,
          })
          .eq('id', current.id);
        if (error) throw error;
      } else {
        // Create new payment record as paid
        const { error } = await supabase.from('subscription_payments').insert({
          subscription_id: subId,
          month: `${month}-01`,
          status: 'paid',
          paid_at: new Date().toISOString(),
        });
        if (error) throw error;
      }
      await fetchPayments();
    } catch (err: any) {
      toast({
        title: 'Could not update payment',
        description: err?.message,
        variant: 'destructive',
      });
    } finally {
      setTogglingPayment(null);
    }
  };

  /* ── CSV export ── */
  const exportCsv = () => {
    const header = [
      'name',
      'vendor',
      'category',
      'amount_ngn',
      'currency',
      'amount_usd',
      'billing_cycle',
      'next_renewal_date',
      'last_renewed_at',
      'status',
      'priority',
      'decision',
      'payment_method',
      'billing_day',
    ];
    const rows = filtered.map((s) => [
      s.name,
      s.vendor || '',
      s.category,
      s.amount_ngn,
      s.currency,
      s.amount_usd ?? '',
      s.billing_cycle,
      s.next_renewal_date,
      s.last_renewed_at || '',
      s.status,
      s.priority || '',
      s.decision || '',
      s.payment_method || '',
      s.billing_day ?? '',
    ]);
    downloadCsv(
      `kdops-subscriptions-${toIsoDate(new Date())}.csv`,
      toCsv(header, rows),
    );
    toast({ title: 'CSV exported' });
  };

  /* ── Badge helpers ── */
  const renewalBadge = (s: Subscription) => {
    if (s.status === 'cancelled') {
      return <Badge variant="secondary">Cancelled</Badge>;
    }
    if (s.status === 'paused') {
      return <Badge className="bg-slate-200/60 text-slate-600 dark:bg-slate-700/50 dark:text-slate-300">Paused</Badge>;
    }
    const d = daysUntil(s.next_renewal_date);
    if (d === null) return <Badge variant="secondary">--</Badge>;
    if (d < 0) return <Badge className="bg-destructive/10 text-destructive">Overdue</Badge>;
    if (d === 0) return <Badge className="bg-warning/10 text-warning">Due today</Badge>;
    if (d <= 7) return <Badge className="bg-warning/10 text-warning">{d}d</Badge>;
    if (d <= 30) return <Badge className="bg-accent/10 text-accent-foreground">{d}d</Badge>;
    return <Badge variant="secondary">{d}d</Badge>;
  };

  const priorityBadge = (p: string | null) => {
    if (!p) return <span className="text-xs text-muted-foreground">--</span>;
    if (p === 'high') return <Badge className="bg-destructive/10 text-destructive text-[10px] px-1.5">High</Badge>;
    if (p === 'medium') return <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 text-[10px] px-1.5">Medium</Badge>;
    return <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 text-[10px] px-1.5">Low</Badge>;
  };

  const decisionBadge = (d: string | null) => {
    if (!d) return <span className="text-xs text-muted-foreground">--</span>;
    if (d === 'keep') return <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 text-[10px] px-1.5">Keep</Badge>;
    if (d === 'kill') return <Badge className="bg-destructive/10 text-destructive text-[10px] px-1.5">Kill</Badge>;
    return <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 text-[10px] px-1.5">Undecided</Badge>;
  };

  const paymentStatusDot = (status: string | undefined) => {
    if (!status) return 'bg-border';
    if (status === 'paid') return 'bg-emerald-500';
    if (status === 'pending') return 'bg-amber-400';
    if (status === 'overdue') return 'bg-destructive';
    return 'bg-slate-400'; // skipped
  };

  const paymentStatusLabel = (status: string | undefined) => {
    if (!status) return 'No record';
    return status.charAt(0).toUpperCase() + status.slice(1);
  };

  /* ── Amount display with FX ── */
  const amountDisplay = (s: Subscription) => {
    if (s.currency === 'USD' && s.amount_usd != null) {
      return (
        <div>
          <span>{formatUsd(s.amount_usd)}</span>
          {fxRate && (
            <span className="block text-[10px] text-muted-foreground">
              {formatNaira(s.amount_usd * fxRate)}
            </span>
          )}
        </div>
      );
    }
    return formatNaira(s.amount_ngn);
  };

  /* ── Clear all filters ── */
  const clearAllFilters = () => {
    setStatusFilter('all');
    setCategoryFilter('all');
    setPriorityFilter('all');
    setDecisionFilter('all');
    setPaymentMethodFilter('all');
  };

  const reviewKillList = () => {
    setDecisionFilter('kill');
    setStatusFilter('active');
    pagination.reset();
  };

  /* ═══════════════════════ Render ═══════════════════════ */

  return (
    <div className="space-y-6">
      <PageHeader
        title="Subscriptions"
        description="Track recurring software and service subscriptions with renewal alerts."
        icon={Repeat}
        info="Track recurring software and service subscriptions, renewal dates, monthly costs and status. Renewal alerts help you avoid unexpected charges."
        actions={
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={filtered.length === 0}>
              <Download className="mr-2 h-4 w-4" /> Export CSV
            </Button>
            {canManage && (
              <Button size="sm" onClick={openCreate}>
                <Plus className="mr-2 h-4 w-4" /> New Subscription
              </Button>
            )}
          </div>
        }
      />

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          title="Monthly Spend"
          value={formatNaira(stats.monthlyNgn)}
          subtitle={stats.monthlyUsd > 0 ? `+ ${formatUsd(stats.monthlyUsd)} USD` : 'Normalised across cycles'}
          icon={DollarSign}
          tone="primary"
        />
        <StatCard
          title="Active / Paused / Total"
          value={stats.active}
          subtitle={`${stats.paused} paused, ${stats.total} total`}
          icon={Repeat}
          tone="success"
        />
        <StatCard
          title="Due in 30 days"
          value={stats.dueSoon}
          subtitle="Renewals upcoming"
          icon={CalendarClock}
          tone="warning"
        />
        <StatCard
          title="Kill Savings"
          value={formatNaira(stats.killSavings)}
          subtitle={stats.killCount > 0 ? `${stats.killCount} sub${stats.killCount !== 1 ? 's' : ''} marked kill` : 'No subs marked kill'}
          icon={Zap}
          tone={stats.killCount > 0 ? 'danger' : 'default'}
        />
      </div>

      {/* ── FX rate indicator ── */}
      {fxRate && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
          <DollarSign className="h-3 w-3" />
          <span>Live FX: $1 = {formatNaira(fxRate)}</span>
        </div>
      )}

      {/* ── Kill banner ── */}
      {showKillBanner && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-destructive" />
            <span className="text-sm font-medium">
              You have {filtered.length} subscription{filtered.length !== 1 ? 's' : ''} marked for killing.
              Cancelling them would save{' '}
              <span className="font-semibold">{formatNaira(killBannerSavingsMonthly)}/month</span>
              {' '}({formatNaira(killBannerSavingsMonthly * 12)}/year).
            </span>
          </div>
        </div>
      )}

      {/* ── Tabs ── */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">
            <Repeat className="h-3.5 w-3.5 mr-1.5" /> Overview
          </TabsTrigger>
          <TabsTrigger value="payments">
            <Calendar className="h-3.5 w-3.5 mr-1.5" /> Payment Tracker
          </TabsTrigger>
        </TabsList>

        {/* ════════════ Overview tab ════════════ */}
        <TabsContent value="overview" className="space-y-4 mt-4">
          <Card className="rounded-xl">
            <div className="p-3 sm:p-4 border-b border-border/50">
              <MobileFilterBar
                activeCount={activeSubFilterCount}
                onClear={clearAllFilters}
                search={
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search subscriptions..."
                      className="pl-9 h-10 sm:h-9"
                      value={search}
                      onChange={(e) => {
                        setSearch(e.target.value);
                        pagination.reset();
                      }}
                    />
                  </div>
                }
                filters={
                  <>
                    <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v as any); pagination.reset(); }}>
                      <SelectTrigger className="flex-1 sm:flex-initial sm:w-[140px] h-10 sm:h-9" data-mobile-filter-row>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All statuses</SelectItem>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="paused">Paused</SelectItem>
                        <SelectItem value="cancelled">Cancelled</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={categoryFilter} onValueChange={(v) => { setCategoryFilter(v); pagination.reset(); }}>
                      <SelectTrigger className="flex-1 sm:flex-initial sm:w-[140px] h-10 sm:h-9" data-mobile-filter-row>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All categories</SelectItem>
                        {CATEGORIES.map((c) => (
                          <SelectItem key={c} value={c} className="capitalize">
                            {c}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={priorityFilter} onValueChange={(v) => { setPriorityFilter(v as any); pagination.reset(); }}>
                      <SelectTrigger className="flex-1 sm:flex-initial sm:w-[140px] h-10 sm:h-9" data-mobile-filter-row>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All priorities</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="low">Low</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={decisionFilter} onValueChange={(v) => { setDecisionFilter(v as any); pagination.reset(); }}>
                      <SelectTrigger className="flex-1 sm:flex-initial sm:w-[140px] h-10 sm:h-9" data-mobile-filter-row>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All decisions</SelectItem>
                        <SelectItem value="keep">Keep</SelectItem>
                        <SelectItem value="kill">Kill</SelectItem>
                        <SelectItem value="undecided">Undecided</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={paymentMethodFilter} onValueChange={(v) => { setPaymentMethodFilter(v); pagination.reset(); }}>
                      <SelectTrigger className="flex-1 sm:flex-initial sm:w-[160px] h-10 sm:h-9" data-mobile-filter-row>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All methods</SelectItem>
                        {PAYMENT_METHODS.map((m) => (
                          <SelectItem key={m} value={m}>{m}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </>
                }
              />
            </div>

            <CardContent className="p-0">
              {loading ? (
                <TableSkeleton rows={6} cols={7} />
              ) : error ? (
                <ErrorState message={error} onRetry={fetchSubs} />
              ) : filtered.length === 0 ? (
                <EmptyState
                  illustration="coin"
                  title="No subscriptions yet"
                  description="Add your first recurring software or service to start tracking renewals."
                  action={
                    canManage ? (
                      <Button onClick={openCreate}>
                        <Plus className="mr-2 h-4 w-4" /> New Subscription
                      </Button>
                    ) : undefined
                  }
                />
              ) : (
                <>
                  {/* Desktop table */}
                  <div className="hidden md:block overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                          <TableHead>Cycle</TableHead>
                          <TableHead>Priority</TableHead>
                          <TableHead>Decision</TableHead>
                          <TableHead>Payment Method</TableHead>
                          <TableHead>Next Renewal</TableHead>
                          <TableHead>Days</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pagination.slice.map((s) => (
                          <TableRow key={s.id} className="kd-transition">
                            <TableCell>
                              <p className="font-medium">{s.name}</p>
                              {s.vendor && (
                                <p className="text-xs text-muted-foreground">{s.vendor}</p>
                              )}
                            </TableCell>
                            <TableCell className="text-right currency font-medium tabular-nums">
                              {amountDisplay(s)}
                            </TableCell>
                            <TableCell className="capitalize text-sm">{s.billing_cycle}</TableCell>
                            <TableCell>{priorityBadge(s.priority)}</TableCell>
                            <TableCell>{decisionBadge(s.decision)}</TableCell>
                            <TableCell>
                              <span className="text-xs text-muted-foreground">{s.payment_method || '--'}</span>
                            </TableCell>
                            <TableCell className="text-sm">{formatDate(s.next_renewal_date)}</TableCell>
                            <TableCell>{renewalBadge(s)}</TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1">
                                {s.status === 'active' ? (
                                  <>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      disabled={!canManage || renewingId === s.id}
                                      onClick={() => markRenewed(s)}
                                    >
                                      {renewingId === s.id ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                      ) : (
                                        'Mark renewed'
                                      )}
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      disabled={!canManage}
                                      onClick={() => openEdit(s)}
                                      title="Edit"
                                    >
                                      <Pencil className="h-4 w-4" />
                                    </Button>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          disabled={!canManage}
                                          onClick={() => pauseSub(s)}
                                          title="Pause"
                                        >
                                          <span className="text-xs">||</span>
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>Pause subscription</TooltipContent>
                                    </Tooltip>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      disabled={!canManage}
                                      onClick={() => cancelSub(s)}
                                      title="Cancel"
                                    >
                                      <Trash2 className="h-4 w-4 text-destructive" />
                                    </Button>
                                  </>
                                ) : s.status === 'paused' ? (
                                  <>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      disabled={!canManage}
                                      onClick={() => reactivate(s)}
                                    >
                                      Reactivate
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      disabled={!canManage}
                                      onClick={() => openEdit(s)}
                                      title="Edit"
                                    >
                                      <Pencil className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      disabled={!canManage}
                                      onClick={() => cancelSub(s)}
                                      title="Cancel"
                                    >
                                      <Trash2 className="h-4 w-4 text-destructive" />
                                    </Button>
                                  </>
                                ) : (
                                  <>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      disabled={!canManage}
                                      onClick={() => reactivate(s)}
                                    >
                                      Reactivate
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      disabled={!canManage}
                                      onClick={() => setPendingDelete(s)}
                                      title="Delete permanently"
                                      aria-label={`Delete subscription ${s.name}`}
                                    >
                                      <Trash2 className="h-4 w-4 text-destructive" />
                                    </Button>
                                  </>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Mobile card view */}
                  <div className="md:hidden space-y-2 p-1">
                    {pagination.slice.map((s) => (
                      <MobileCard key={s.id}>
                        <MobileCardHeader>
                          <MobileCardTitle>
                            {s.name}
                            {s.vendor && (
                              <span className="block text-xs font-normal text-muted-foreground truncate">{s.vendor}</span>
                            )}
                          </MobileCardTitle>
                          <MobileCardMeta className="currency">
                            {s.currency === 'USD' && s.amount_usd != null
                              ? formatUsd(s.amount_usd)
                              : formatNaira(s.amount_ngn)}
                            {s.currency === 'USD' && s.amount_usd != null && fxRate && (
                              <span className="block text-[10px] text-muted-foreground">{formatNaira(s.amount_usd * fxRate)}</span>
                            )}
                          </MobileCardMeta>
                        </MobileCardHeader>
                        <MobileCardRow label="Cycle">
                          <span className="capitalize">{s.billing_cycle}</span>
                        </MobileCardRow>
                        <MobileCardRow label="Priority">{priorityBadge(s.priority)}</MobileCardRow>
                        <MobileCardRow label="Decision">{decisionBadge(s.decision)}</MobileCardRow>
                        <MobileCardRow label="Payment">{s.payment_method || '--'}</MobileCardRow>
                        <MobileCardRow label="Next renewal">{formatDate(s.next_renewal_date)}</MobileCardRow>
                        <MobileCardRow label="Status">{renewalBadge(s)}</MobileCardRow>
                        <MobileCardFooter>
                          <div className="flex gap-1 flex-wrap">
                            {s.status === 'active' ? (
                              <>
                                <Button size="sm" variant="outline" disabled={!canManage || renewingId === s.id} onClick={() => markRenewed(s)}>
                                  {renewingId === s.id ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Renewed'}
                                </Button>
                                <Button size="sm" variant="ghost" disabled={!canManage} onClick={() => openEdit(s)}>
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button size="sm" variant="ghost" disabled={!canManage} onClick={() => pauseSub(s)}>
                                  <span className="text-xs">||</span>
                                </Button>
                                <Button size="sm" variant="ghost" disabled={!canManage} onClick={() => cancelSub(s)}>
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </>
                            ) : s.status === 'paused' ? (
                              <>
                                <Button size="sm" variant="outline" disabled={!canManage} onClick={() => reactivate(s)}>
                                  Reactivate
                                </Button>
                                <Button size="sm" variant="ghost" disabled={!canManage} onClick={() => openEdit(s)}>
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button size="sm" variant="ghost" disabled={!canManage} onClick={() => cancelSub(s)}>
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </>
                            ) : (
                              <>
                                <Button size="sm" variant="outline" disabled={!canManage} onClick={() => reactivate(s)}>
                                  Reactivate
                                </Button>
                                <Button size="sm" variant="ghost" disabled={!canManage} onClick={() => setPendingDelete(s)}>
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </>
                            )}
                          </div>
                        </MobileCardFooter>
                      </MobileCard>
                    ))}
                  </div>

                  <Pagination
                    page={pagination.page}
                    totalPages={pagination.totalPages}
                    totalItems={pagination.totalItems}
                    pageSize={pagination.pageSize}
                    onPrev={pagination.prev}
                    onNext={pagination.next}
                    hasPrev={pagination.hasPrev}
                    hasNext={pagination.hasNext}
                  />
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ════════════ Payment Tracker tab ════════════ */}
        <TabsContent value="payments" className="space-y-4 mt-4">
          <Card className="rounded-xl">
            <div className="p-3 sm:p-4 border-b border-border/50 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold">Monthly Payment Tracker</h3>
                <p className="text-xs text-muted-foreground">Click a cell to cycle status: paid &rarr; skipped &rarr; pending</p>
              </div>
              <Button variant="outline" size="sm" onClick={fetchPayments} disabled={loadingPayments}>
                {loadingPayments ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Refresh'}
              </Button>
            </div>
            <CardContent className="p-0">
              {loadingPayments ? (
                <TableSkeleton rows={6} cols={7} />
              ) : paymentGrid.subs.length === 0 ? (
                <EmptyState
                  illustration="coin"
                  title="No active monthly subscriptions"
                  description="Payment tracking is available for active monthly subscriptions."
                />
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="sticky left-0 bg-card z-10 min-w-[180px]">Subscription</TableHead>
                        {paymentGrid.months.map((m) => (
                          <TableHead key={m} className="text-center min-w-[90px] text-xs">
                            {monthLabel(m + '-01')}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paymentGrid.subs.map((sub) => (
                        <TableRow key={sub.id}>
                          <TableCell className="sticky left-0 bg-card z-10">
                            <p className="font-medium text-sm">{sub.name}</p>
                            {sub.vendor && (
                              <p className="text-[10px] text-muted-foreground">{sub.vendor}</p>
                            )}
                          </TableCell>
                          {paymentGrid.months.map((m) => {
                            const key = `${sub.id}|${m}`;
                            const payment = paymentGrid.payMap.get(key);
                            const isToggling = togglingPayment === key;
                            return (
                              <TableCell key={m} className="text-center">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button
                                      className="inline-flex items-center justify-center"
                                      disabled={!canManage || isToggling}
                                      onClick={() => togglePaymentStatus(sub.id, m, payment)}
                                    >
                                      {isToggling ? (
                                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                      ) : (
                                        <span
                                          className={`inline-block h-3 w-3 rounded-full ${paymentStatusDot(payment?.status)} transition-colors`}
                                        />
                                      )}
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    {paymentStatusLabel(payment?.status)}
                                    {payment?.paid_at && ` - ${formatDate(payment.paid_at)}`}
                                  </TooltipContent>
                                </Tooltip>
                              </TableCell>
                            );
                          })}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>

                  {/* Legend */}
                  <div className="flex items-center gap-4 px-4 py-2 border-t border-border/50 text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-emerald-500" /> Paid</span>
                    <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-amber-400" /> Pending</span>
                    <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-destructive" /> Overdue</span>
                    <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-slate-400" /> Skipped</span>
                    <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-border" /> No record</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ════════════ Create / Edit dialog ════════════ */}
      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editing ? 'Edit Subscription' : 'New Subscription'}
            </DialogTitle>
            <DialogDescription>
              Recurring software or service — KDOps will remind you 7, 3, and 1 day before
              the renewal date.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            <div className="space-y-1">
              <Label>Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Figma Organization Plan"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Vendor</Label>
                <VendorCombobox
                  value={form.vendor}
                  onChange={(name, id) => setForm({ ...form, vendor: name, vendor_id: id })}
                />
              </div>
              <div className="space-y-1">
                <Label>Category</Label>
                <Select
                  value={form.category}
                  onValueChange={(v) => setForm({ ...form, category: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c} className="capitalize">
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>Currency</Label>
                <Select
                  value={form.currency}
                  onValueChange={(v) => setForm({ ...form, currency: v as 'NGN' | 'USD' })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NGN">NGN (naira)</SelectItem>
                    <SelectItem value="USD">USD ($)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {form.currency === 'USD' ? (
                <div className="space-y-1">
                  <Label>Amount ($)</Label>
                  <Input
                    type="number"
                    value={form.amount_usd}
                    onChange={(e) => setForm({ ...form, amount_usd: e.target.value })}
                    placeholder="USD amount"
                  />
                </div>
              ) : (
                <div className="space-y-1">
                  <Label>Amount (naira)</Label>
                  <Input
                    type="number"
                    value={form.amount_ngn}
                    onChange={(e) => setForm({ ...form, amount_ngn: e.target.value })}
                  />
                </div>
              )}
              <div className="space-y-1">
                <Label>Billing cycle</Label>
                <Select
                  value={form.billing_cycle}
                  onValueChange={(v) =>
                    setForm({ ...form, billing_cycle: v as Subscription['billing_cycle'] })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CYCLES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {cycleLabel(c)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* New fields row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="space-y-1">
                <Label>Billing day</Label>
                <Input
                  type="number"
                  min={1}
                  max={31}
                  value={form.billing_day}
                  onChange={(e) => setForm({ ...form, billing_day: e.target.value })}
                  placeholder="1-31"
                />
              </div>
              <div className="space-y-1">
                <Label>Payment method</Label>
                <Select
                  value={form.payment_method}
                  onValueChange={(v) => setForm({ ...form, payment_method: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">None</SelectItem>
                    {PAYMENT_METHODS.map((m) => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Priority</Label>
                <Select
                  value={form.priority}
                  onValueChange={(v) => setForm({ ...form, priority: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">None</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Decision</Label>
                <Select
                  value={form.decision}
                  onValueChange={(v) => setForm({ ...form, decision: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">None</SelectItem>
                    <SelectItem value="keep">Keep</SelectItem>
                    <SelectItem value="kill">Kill</SelectItem>
                    <SelectItem value="undecided">Undecided</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1">
              <Label>Next renewal date</Label>
              <Input
                type="date"
                value={form.next_renewal_date}
                onChange={(e) =>
                  setForm({ ...form, next_renewal_date: e.target.value })
                }
              />
            </div>
            <div className="space-y-1">
              <Label>Notes</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Optional notes about owners, seat counts, contract terms..."
              />
            </div>

            {!canManage && (
              <div className="kd-card-warning flex items-start gap-2 text-xs">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-warning" />
                <span>Only Admin or Finance roles can create subscriptions.</span>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(false)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving || !canManage}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editing ? 'Save changes' : 'Add subscription'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ════════════ Delete confirmation ════════════ */}
      <AlertDialog open={!!pendingDelete} onOpenChange={(v) => { if (!v) setPendingDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete subscription?</AlertDialogTitle>
            <AlertDialogDescription>
              "{pendingDelete?.name}" will be permanently removed. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => pendingDelete && deleteSub(pendingDelete)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Subscriptions;
