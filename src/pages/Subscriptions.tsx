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
  CreditCard,
  Eye,
} from 'lucide-react';
import { usePageTitle } from '@/hooks/usePageTitle';
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
const PRIORITIES: Subscription['priority'][] = ['high', 'medium', 'low'];

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
};

/* ═══════════════════════ Component ═══════════════════════ */

const Subscriptions = () => {
  usePageTitle('Subscriptions');
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
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<'all' | string>('all');

  const [dialog, setDialog] = useState(false);
  const [editing, setEditing] = useState<Subscription | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [renewingId, setRenewingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Subscription | null>(null);

  /* ── FX rate ── */
  const [fxRate, setFxRate] = useState<number | null>(null);

  /* ── Virtual cards for payment method ── */
  const [cards, setCards] = useState<{id: string; card_name: string; last_four: string | null}[]>([]);

  /* ── Detail dialog state ── */
  const [detailSub, setDetailSub] = useState<Subscription | null>(null);
  const [detailPayments, setDetailPayments] = useState<SubPayment[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  /* ── Fetch subscriptions ── */
  const fetchSubs = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from('subscriptions')
      .select('id, name, vendor, vendor_id, category, amount_ngn, currency, amount_usd, billing_cycle, next_renewal_date, last_renewed_at, status, notes, billing_day, payment_method, priority')
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

  /* ── Fetch virtual cards ── */
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('virtual_cards')
        .select('id, card_name, last_four')
        .eq('status', 'active')
        .order('card_name');
      if (data) setCards(data);
    })();
  }, []);

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
        // ignore -- notifications are best effort.
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
    const cardsUsed = new Set(active.map((s) => s.payment_method).filter(Boolean)).size;
    return {
      monthlyNgn,
      monthlyUsd,
      active: active.length,
      paused: paused.length,
      total: subs.length,
      dueSoon: nextIn30.length,
      cardsUsed,
    };
  }, [subs]);

  /* ── Derive unique payment methods from subs for filter dropdown ── */
  const uniquePaymentMethods = useMemo(() => {
    const methods = new Set<string>();
    for (const s of subs) {
      if (s.payment_method) methods.add(s.payment_method);
    }
    return Array.from(methods).sort();
  }, [subs]);

  /* ── Filtered + paginated ── */
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return subs.filter((s) => {
      if (statusFilter !== 'all' && s.status !== statusFilter) return false;
      if (categoryFilter !== 'all' && s.category !== categoryFilter) return false;
      if (priorityFilter !== 'all' && s.priority !== priorityFilter) return false;
      if (paymentMethodFilter !== 'all' && s.payment_method !== paymentMethodFilter) return false;
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        (s.vendor || '').toLowerCase().includes(q) ||
        s.category.toLowerCase().includes(q)
      );
    });
  }, [subs, search, statusFilter, categoryFilter, priorityFilter, paymentMethodFilter]);

  const pagination = usePagination(filtered, 20);
  const activeSubFilterCount = [
    statusFilter !== 'all',
    categoryFilter !== 'all',
    priorityFilter !== 'all',
    paymentMethodFilter !== 'all',
  ].filter(Boolean).length;

  /* ── Detail dialog ── */
  const openDetail = async (s: Subscription) => {
    setDetailSub(s);
    setLoadingDetail(true);
    const { data } = await supabase
      .from('subscription_payments')
      .select('id, month, status, amount_ngn, amount_usd, fx_rate_used, payment_method, paid_at')
      .eq('subscription_id', s.id)
      .order('month', { ascending: false });
    setDetailPayments((data as SubPayment[]) || []);
    setLoadingDetail(false);
  };

  const toggleDetailPaymentStatus = async (payment: SubPayment, newStatus: 'paid' | 'pending') => {
    try {
      const { error } = await supabase
        .from('subscription_payments')
        .update({
          status: newStatus,
          paid_at: newStatus === 'paid' ? new Date().toISOString() : null,
        })
        .eq('id', payment.id);
      if (error) throw error;
      // Re-fetch detail payments
      if (detailSub) {
        const { data } = await supabase
          .from('subscription_payments')
          .select('id, month, status, amount_ngn, amount_usd, fx_rate_used, payment_method, paid_at')
          .eq('subscription_id', detailSub.id)
          .order('month', { ascending: false });
        setDetailPayments((data as SubPayment[]) || []);
      }
      toast({ title: `Payment marked ${newStatus}` });
    } catch (err: any) {
      toast({
        title: 'Could not update payment',
        description: err?.message,
        variant: 'destructive',
      });
    }
  };

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
        `Subscription "${s.name}" marked renewed -- next: ${formatDate(next)}`,
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

  const paymentStatusBadge = (status: string) => {
    if (status === 'paid') return <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 text-[10px] px-1.5">Paid</Badge>;
    if (status === 'pending') return <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 text-[10px] px-1.5">Pending</Badge>;
    if (status === 'overdue') return <Badge className="bg-destructive/10 text-destructive text-[10px] px-1.5">Overdue</Badge>;
    return <Badge className="bg-slate-200/60 text-slate-600 dark:bg-slate-700/50 dark:text-slate-300 text-[10px] px-1.5">Skipped</Badge>;
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
    setPaymentMethodFilter('all');
  };

  /* ── Card display label helper ── */
  const cardLabel = (c: {card_name: string; last_four: string | null}) =>
    c.last_four ? `${c.card_name} ****${c.last_four}` : c.card_name;

  /* ── Detail dialog: summary helpers ── */
  const detailPaymentSummary = useMemo(() => {
    if (detailPayments.length === 0) return null;
    const paid = detailPayments.filter((p) => p.status === 'paid').length;
    const pending = detailPayments.filter((p) => p.status === 'pending').length;
    const overdue = detailPayments.filter((p) => p.status === 'overdue').length;
    const skipped = detailPayments.filter((p) => p.status === 'skipped').length;
    return { total: detailPayments.length, paid, pending, overdue, skipped };
  }, [detailPayments]);

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
          title="Cards Used"
          value={stats.cardsUsed}
          subtitle={`${stats.cardsUsed} distinct payment method${stats.cardsUsed !== 1 ? 's' : ''} across active subs`}
          icon={CreditCard}
          tone="default"
        />
      </div>

      {/* ── FX rate indicator ── */}
      {fxRate && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
          <DollarSign className="h-3 w-3" />
          <span>Live FX: $1 = {formatNaira(fxRate)}</span>
        </div>
      )}

      {/* ── Overview content (no tabs) ── */}
      <div className="space-y-4">
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
                  <Select value={paymentMethodFilter} onValueChange={(v) => { setPaymentMethodFilter(v); pagination.reset(); }}>
                    <SelectTrigger className="flex-1 sm:flex-initial sm:w-[160px] h-10 sm:h-9" data-mobile-filter-row>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All methods</SelectItem>
                      {uniquePaymentMethods.map((m) => (
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
                          <TableCell>
                            <span className="text-xs text-muted-foreground">{s.payment_method || '--'}</span>
                          </TableCell>
                          <TableCell className="text-sm">{formatDate(s.next_renewal_date)}</TableCell>
                          <TableCell>{renewalBadge(s)}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => openDetail(s)}
                                    title="View details"
                                  >
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>View details</TooltipContent>
                              </Tooltip>
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
                    <MobileCard key={s.id} onClick={() => openDetail(s)} className="cursor-pointer">
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
                      <MobileCardRow label="Payment">{s.payment_method || '--'}</MobileCardRow>
                      <MobileCardRow label="Next renewal">{formatDate(s.next_renewal_date)}</MobileCardRow>
                      <MobileCardRow label="Status">{renewalBadge(s)}</MobileCardRow>
                      <MobileCardFooter>
                        <div className="flex gap-1 flex-wrap" onClick={(e) => e.stopPropagation()}>
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
      </div>

      {/* ════════════ Detail dialog ════════════ */}
      <Dialog open={!!detailSub} onOpenChange={(v) => { if (!v) { setDetailSub(null); setDetailPayments([]); } }}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>{detailSub?.name}</DialogTitle>
            <DialogDescription>
              Subscription detail and payment history
            </DialogDescription>
          </DialogHeader>

          {detailSub && (
            <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
              {/* Summary bar */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                <div>
                  <span className="text-xs text-muted-foreground">Vendor</span>
                  <p className="font-medium">{detailSub.vendor || '--'}</p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Category</span>
                  <p className="font-medium capitalize">{detailSub.category}</p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Billing Cycle</span>
                  <p className="font-medium capitalize">{detailSub.billing_cycle}</p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Amount</span>
                  <div className="font-medium">{amountDisplay(detailSub)}</div>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Payment Method</span>
                  <p className="font-medium">{detailSub.payment_method || '--'}</p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Priority</span>
                  <div>{priorityBadge(detailSub.priority)}</div>
                </div>
              </div>

              {/* FX rate indicator for USD subs */}
              {detailSub.currency === 'USD' && fxRate && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground border rounded-md px-3 py-1.5">
                  <DollarSign className="h-3 w-3" />
                  <span>FX Rate: $1 = {formatNaira(fxRate)}</span>
                </div>
              )}

              {/* Payment history */}
              <div>
                <h4 className="text-sm font-semibold mb-2">Payment History</h4>
                {loadingDetail ? (
                  <TableSkeleton rows={4} cols={6} />
                ) : detailPayments.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">No payment records yet.</p>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Period</TableHead>
                            <TableHead className="text-right">Amount NGN</TableHead>
                            <TableHead className="text-right">Amount USD</TableHead>
                            <TableHead className="text-right">FX Rate</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Payment Method</TableHead>
                            <TableHead>Paid At</TableHead>
                            {canManage && <TableHead className="text-right">Actions</TableHead>}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {detailPayments.map((p) => (
                            <TableRow key={p.id}>
                              <TableCell className="text-sm whitespace-nowrap">{monthLabel(p.month)}</TableCell>
                              <TableCell className="text-right text-sm tabular-nums">
                                {p.amount_ngn != null ? formatNaira(p.amount_ngn) : '--'}
                              </TableCell>
                              <TableCell className="text-right text-sm tabular-nums">
                                {p.amount_usd != null ? formatUsd(p.amount_usd) : '--'}
                              </TableCell>
                              <TableCell className="text-right text-sm tabular-nums">
                                {p.fx_rate_used != null ? p.fx_rate_used.toLocaleString() : '--'}
                              </TableCell>
                              <TableCell>{paymentStatusBadge(p.status)}</TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {p.payment_method || '--'}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                                {p.paid_at ? new Date(p.paid_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '--'}
                              </TableCell>
                              {canManage && (
                                <TableCell className="text-right">
                                  <div className="flex justify-end gap-1">
                                    {p.status !== 'paid' && (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="text-xs h-7 px-2"
                                        onClick={() => toggleDetailPaymentStatus(p, 'paid')}
                                      >
                                        Mark Paid
                                      </Button>
                                    )}
                                    {p.status !== 'pending' && (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="text-xs h-7 px-2"
                                        onClick={() => toggleDetailPaymentStatus(p, 'pending')}
                                      >
                                        Mark Pending
                                      </Button>
                                    )}
                                  </div>
                                </TableCell>
                              )}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>

                    {/* Summary line */}
                    {detailPaymentSummary && (
                      <div className="flex flex-wrap items-center gap-3 px-2 py-2 border-t border-border/50 text-xs text-muted-foreground">
                        <span>{detailPaymentSummary.total} period{detailPaymentSummary.total !== 1 ? 's' : ''}</span>
                        <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-emerald-500" /> {detailPaymentSummary.paid} paid</span>
                        <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-amber-400" /> {detailPaymentSummary.pending} pending</span>
                        <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-destructive" /> {detailPaymentSummary.overdue} overdue</span>
                        <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-slate-400" /> {detailPaymentSummary.skipped} skipped</span>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ════════════ Create / Edit dialog ════════════ */}
      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editing ? 'Edit Subscription' : 'New Subscription'}
            </DialogTitle>
            <DialogDescription>
              Recurring software or service -- KDOps will remind you 7, 3, and 1 day before
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
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
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
                  value={form.payment_method || '__none__'}
                  onValueChange={(v) => setForm({ ...form, payment_method: v === '__none__' ? '' : v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    {cards.map((c) => (
                      <SelectItem key={c.id} value={c.card_name}>{cardLabel(c)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Priority</Label>
                <Select
                  value={form.priority || '__none__'}
                  onValueChange={(v) => setForm({ ...form, priority: v === '__none__' ? '' : v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
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
