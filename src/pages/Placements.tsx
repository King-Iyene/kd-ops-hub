import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Briefcase, Plus, Search, Download, Pencil, Trash2, Loader2,
  Calendar, DollarSign, Users, CheckCircle2, Clock, AlertCircle,
  Eye, RotateCcw, TrendingUp, Building2, BarChart3, PieChart as PieIcon,
  AlertTriangle, ArrowUpRight, Percent, RefreshCw, ArrowRightLeft,
  Zap, Globe, TrendingDown, Shield, Save,
} from 'lucide-react';
import {
  BarChart, Bar, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  ComposedChart, Line,
} from 'recharts';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { logAudit } from '@/lib/audit';
import { hasRole } from '@/lib/roles';
import { formatDate, formatNaira } from '@/lib/format';
import { toCsv, downloadCsv } from '@/lib/csv';
import { useDebounce } from '@/hooks/useDebounce';
import { usePagination } from '@/hooks/usePagination';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useToast } from '@/hooks/use-toast';
import { confirm } from '@/hooks/use-confirm';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from '@/components/ui/tabs';
import { PageHeader } from '@/components/ui-kit/PageHeader';
import { AuroraHero } from '@/components/AuroraHero';
import { StatCard } from '@/components/ui-kit/StatCard';
import { TableSkeleton } from '@/components/ui-kit/TableSkeleton';
import { EmptyState } from '@/components/ui-kit/EmptyState';
import { Pagination } from '@/components/ui-kit/Pagination';
import { MobileCard, MobileCardHeader, MobileCardTitle, MobileCardMeta, MobileCardRow, MobileCardFooter } from '@/components/ui-kit/MobileCard';
import { StatusBadge } from '@/components/ui-kit/StatusBadge';
import { chartTheme, chartPalette, ChartGradients, GlassTooltip, axisTick, chartAnim } from '@/components/ChartKit';

// ── Types ────────────────────────────────────────────────────────────────────

type PlacementStatus = 'active' | 'completed' | 'suspended' | 'pending';
type PlacementType = 'kd_receives' | 'employee_receives';
type PlacementCategory = 'security' | 'cleaning' | 'logistics' | 'technical' | 'administrative' | 'hospitality' | 'maintenance' | 'general';
type PaymentStatus = 'pending' | 'paid' | 'overdue' | 'partial' | 'waived';
type RateType = 'hourly' | 'daily' | 'weekly' | 'monthly';
type BillingCycle = 'weekly' | 'bi_weekly' | 'monthly';

interface Placement {
  id: string;
  employee_id: string;
  client_id: string;
  placement_type: PlacementType;
  commission_pct: number;
  placement_category: PlacementCategory;
  client_rate_ngn: number;
  client_rate_usd: number | null;
  fx_rate_used: number | null;
  employee_rate_ngn: number;
  commission_ngn: number;
  rate_type: RateType;
  billing_cycle: BillingCycle;
  start_date: string;
  end_date: string | null;
  status: PlacementStatus;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  employee_name?: string;
  client_name?: string;
}

interface PlacementPayment {
  id: string;
  placement_id: string;
  month: string;
  gross_amount_ngn: number;
  gross_amount_usd: number | null;
  fx_rate_used: number | null;
  commission_ngn: number;
  net_employee_ngn: number;
  status: PaymentStatus;
  auto_verified: boolean;
  paid_at: string | null;
  verified_by: string | null;
  verified_at: string | null;
  notes: string | null;
  created_at: string;
  period_start: string | null;
  period_end: string | null;
  hours_worked: number | null;
  days_worked: number | null;
  client_paid: boolean;
  client_paid_at: string | null;
  client_paid_ref: string | null;
  operator_paid: boolean;
  operator_paid_at: string | null;
  operator_paid_ref: string | null;
  fx_rate_locked: boolean;
  fx_rate_edit_reason: string | null;
  fx_rate_edited_by: string | null;
  fx_rate_edited_at: string | null;
}

interface EmployeeOption { id: string; full_name: string; }
interface ClientOption { id: string; name: string; }

// ── Constants ────────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<PlacementCategory, string> = {
  security: 'Security', cleaning: 'Cleaning', logistics: 'Logistics',
  technical: 'Technical', administrative: 'Administrative',
  hospitality: 'Hospitality', maintenance: 'Maintenance', general: 'General',
};

const CATEGORY_COLORS: Record<PlacementCategory, string> = {
  security: 'bg-red-500/10 text-red-600',
  cleaning: 'bg-cyan-500/10 text-cyan-600',
  logistics: 'bg-amber-500/10 text-amber-600',
  technical: 'bg-violet-500/10 text-violet-600',
  administrative: 'bg-sky-500/10 text-sky-600',
  hospitality: 'bg-pink-500/10 text-pink-600',
  maintenance: 'bg-orange-500/10 text-orange-600',
  general: 'bg-slate-500/10 text-slate-600',
};

const TYPE_LABELS: Record<PlacementType, string> = {
  kd_receives: 'KD Receives → Pays Employee',
  employee_receives: 'Employee Receives → Pays KD',
};

const TYPE_SHORT: Record<PlacementType, string> = {
  kd_receives: 'KD Receives',
  employee_receives: 'Employee Receives',
};

const STATUS_LABELS: Record<PlacementStatus, string> = {
  active: 'Active', completed: 'Completed', suspended: 'Suspended', pending: 'Pending',
};

const RATE_TYPE_LABELS: Record<RateType, string> = {
  hourly: 'Hourly', daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly',
};

const BILLING_CYCLE_LABELS: Record<BillingCycle, string> = {
  weekly: 'Weekly', bi_weekly: 'Bi-weekly', monthly: 'Monthly',
};

const RATE_SUFFIX: Record<RateType, string> = {
  hourly: '/hr', daily: '/day', weekly: '/wk', monthly: '/mo',
};

const PAYMENT_STATUS_TONE: Record<PaymentStatus, string> = {
  pending: 'bg-amber-500/10 text-amber-600',
  paid: 'bg-emerald-500/10 text-emerald-600',
  overdue: 'bg-red-500/10 text-red-600',
  partial: 'bg-orange-500/10 text-orange-600',
  waived: 'bg-slate-500/10 text-slate-600',
};

const emptyForm = {
  employee_id: '',
  client_id: '',
  placement_type: 'kd_receives' as PlacementType,
  commission_pct: '40',
  placement_category: 'general' as PlacementCategory,
  rate_type: 'monthly' as RateType,
  billing_cycle: 'monthly' as BillingCycle,
  client_rate_usd: '',
  client_rate_ngn: '',
  start_date: '',
  end_date: '',
  status: 'active' as PlacementStatus,
  notes: '',
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function monthLabel(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-NG', { year: 'numeric', month: 'short' });
}

function shortMonth(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-NG', { month: 'short', year: '2-digit' });
}

function formatUsd(amount: number | null | undefined): string {
  if (amount == null) return '—';
  return '$' + Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatFxRate(rate: number | null | undefined): string {
  if (rate == null) return '—';
  return '₦' + Number(rate).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── Component ────────────────────────────────────────────────────────────────

function Placements() {
  usePageTitle('Placements');
  const { profile } = useAuthStore();
  const { toast } = useToast();
  const isAdmin = hasRole(profile?.role, ['super_admin', 'admin']);
  const isSuperAdmin = profile?.role === 'super_admin';

  const [activeTab, setActiveTab] = useState('overview');

  // ── Data ──
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [allPayments, setAllPayments] = useState<(PlacementPayment & { employee_name?: string; client_name?: string; placement_type?: PlacementType })[]>([]);
  const [loadingAllPayments, setLoadingAllPayments] = useState(false);

  // ── FX ──
  const [currentFxRate, setCurrentFxRate] = useState<number | null>(null);
  const [loadingFxRate, setLoadingFxRate] = useState(false);

  // ── Filters ──
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 250);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');

  // ── Form ──
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Placement | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);

  // ── Payment detail ──
  const [detailPlacement, setDetailPlacement] = useState<Placement | null>(null);
  const [payments, setPayments] = useState<PlacementPayment[]>([]);
  const [loadingPayments, setLoadingPayments] = useState(false);
  const [generatingPayments, setGeneratingPayments] = useState(false);

  // ── Payment tracker filters ──
  const [payFilterStatus, setPayFilterStatus] = useState<string>('all');
  const [payFilterMonth, setPayFilterMonth] = useState<string>('all');

  // ── FX rate edit (super_admin only) ──
  const [fxEditOpen, setFxEditOpen] = useState<PlacementPayment | null>(null);
  const [fxEditRate, setFxEditRate] = useState('');
  const [fxEditReason, setFxEditReason] = useState('');
  const [fxEditSaving, setFxEditSaving] = useState(false);

  // ── Fetch FX rate ──
  const fetchFxRate = useCallback(async () => {
    setLoadingFxRate(true);
    try {
      const { data, error } = await supabase.rpc('get_current_rate', { p_base: 'USD', p_quote: 'NGN' });
      if (!error && data) setCurrentFxRate(Number(data));
    } catch {
      // FX rate not available — user can still enter NGN directly
    }
    setLoadingFxRate(false);
  }, []);

  // ── Fetch ──
  const fetchPlacements = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('placements')
      .select(`
        id, employee_id, client_id, placement_type, commission_pct, placement_category,
        client_rate_ngn, client_rate_usd, fx_rate_used, employee_rate_ngn, commission_ngn,
        rate_type, billing_cycle, start_date, end_date, status, notes,
        profiles!placements_employee_id_fkey ( full_name ),
        clients!placements_client_id_fkey ( name )
      `)
      .order('created_at', { ascending: false })
      .limit(5000);

    if (error) {
      toast({ title: 'Error loading placements', description: error.message, variant: 'destructive' });
      setPlacements([]);
    } else {
      setPlacements(
        (data || []).map((p: any) => ({
          ...p,
          employee_name: p.profiles?.full_name ?? 'Unknown',
          client_name: p.clients?.name ?? 'Unknown',
        })),
      );
    }
    setLoading(false);
  }, [toast]);

  const fetchLookups = useCallback(async () => {
    const [empRes, clientRes] = await Promise.all([
      supabase.from('profiles').select('id, full_name').eq('status', 'active').order('full_name'),
      supabase.from('clients').select('id, name').eq('status', 'active').order('name'),
    ]);
    setEmployees((empRes.data as EmployeeOption[]) || []);
    setClients((clientRes.data as ClientOption[]) || []);
  }, []);

  const fetchAllPayments = useCallback(async () => {
    setLoadingAllPayments(true);
    const { data, error } = await supabase
      .from('placement_payments')
      .select(`
        id, month, gross_amount_ngn, gross_amount_usd, fx_rate_used, commission_ngn,
        net_employee_ngn, status, client_paid, client_paid_at, client_paid_ref,
        operator_paid, operator_paid_at, operator_paid_ref,
        placements!inner (
          employee_id, client_id, placement_type,
          profiles!placements_employee_id_fkey ( full_name ),
          clients!placements_client_id_fkey ( name )
        )
      `)
      .order('month', { ascending: false })
      .limit(5000);

    if (error) {
      toast({ title: 'Error loading payments', description: error.message, variant: 'destructive' });
      setAllPayments([]);
    } else {
      setAllPayments(
        (data || []).map((pp: any) => ({
          ...pp,
          employee_name: pp.placements?.profiles?.full_name ?? 'Unknown',
          client_name: pp.placements?.clients?.name ?? 'Unknown',
          placement_type: pp.placements?.placement_type,
        })),
      );
    }
    setLoadingAllPayments(false);
  }, [toast]);

  useEffect(() => { fetchPlacements(); fetchLookups(); fetchAllPayments(); fetchFxRate(); }, [fetchPlacements, fetchLookups, fetchAllPayments, fetchFxRate]);

  // ── Filter logic ──
  const filtered = useMemo(() => {
    const q = debouncedSearch.toLowerCase();
    return placements.filter((p) => {
      if (filterStatus !== 'all' && p.status !== filterStatus) return false;
      if (filterCategory !== 'all' && p.placement_category !== filterCategory) return false;
      if (filterType !== 'all' && p.placement_type !== filterType) return false;
      if (q) {
        const haystack = `${p.employee_name} ${p.client_name} ${p.placement_category} ${p.notes ?? ''}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [placements, debouncedSearch, filterStatus, filterCategory, filterType]);

  const pagination = usePagination(filtered, 20);

  // ── Stats ──
  const stats = useMemo(() => {
    const active = placements.filter((p) => p.status === 'active');
    const totalRevenue = active.reduce((s, p) => s + (p.commission_ngn ?? 0), 0);
    const totalPayout = active.reduce((s, p) => s + (p.employee_rate_ngn ?? 0), 0);
    const totalGross = active.reduce((s, p) => s + (p.client_rate_ngn ?? 0), 0);
    const totalGrossUsd = active.reduce((s, p) => s + (p.client_rate_usd ?? 0), 0);
    const kdReceives = active.filter((p) => p.placement_type === 'kd_receives').length;
    const empReceives = active.filter((p) => p.placement_type === 'employee_receives').length;
    const avgCommission = active.length > 0 ? active.reduce((s, p) => s + p.commission_pct, 0) / active.length : 0;
    const usdPlacements = active.filter((p) => p.client_rate_usd != null && p.client_rate_usd > 0);
    const ngnOnlyPlacements = active.filter((p) => p.client_rate_usd == null || p.client_rate_usd === 0);

    const paidPayments = allPayments.filter((pp) => pp.status === 'paid');
    const pendingPayments = allPayments.filter((pp) => pp.status === 'pending');
    const overduePayments = allPayments.filter((pp) => pp.status === 'overdue');
    const totalCollected = paidPayments.reduce((s, pp) => s + pp.commission_ngn, 0);
    const totalOutstanding = pendingPayments.reduce((s, pp) => s + pp.commission_ngn, 0);
    const collectionRate = allPayments.length > 0
      ? (paidPayments.length / allPayments.length) * 100
      : 0;

    const expiringPlacements = active.filter((p) => {
      if (!p.end_date) return false;
      const daysLeft = (new Date(p.end_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
      return daysLeft >= 0 && daysLeft <= 30;
    });

    // FX margin analysis
    const fxExposure = usdPlacements.reduce((s, p) => s + (p.client_rate_usd ?? 0), 0);
    const avgFxRate = usdPlacements.length > 0
      ? usdPlacements.reduce((s, p) => s + (p.fx_rate_used ?? 0), 0) / usdPlacements.length
      : 0;
    const currentRateVal = currentFxRate ?? 0;
    const fxGainLoss = currentRateVal > 0 && avgFxRate > 0
      ? ((currentRateVal - avgFxRate) / avgFxRate) * 100
      : 0;

    return {
      active: active.length, total: placements.length, totalRevenue, totalPayout, totalGross,
      totalGrossUsd, kdReceives, empReceives, avgCommission, totalCollected, totalOutstanding,
      collectionRate, paidCount: paidPayments.length, pendingCount: pendingPayments.length,
      overdueCount: overduePayments.length, expiringPlacements,
      usdPlacementCount: usdPlacements.length, ngnOnlyCount: ngnOnlyPlacements.length,
      fxExposure, avgFxRate, fxGainLoss,
    };
  }, [placements, allPayments, currentFxRate]);

  // ── Chart data ──
  const chartData = useMemo(() => {
    const monthMap = new Map<string, { month: string; commission: number; payout: number; gross: number; paid: number; pending: number; grossUsd: number; fxRate: number; fxCount: number }>();
    allPayments.forEach((pp) => {
      const m = pp.month.slice(0, 7);
      const existing = monthMap.get(m) || { month: m, commission: 0, payout: 0, gross: 0, paid: 0, pending: 0, grossUsd: 0, fxRate: 0, fxCount: 0 };
      existing.commission += pp.commission_ngn;
      existing.payout += pp.net_employee_ngn;
      existing.gross += pp.gross_amount_ngn;
      if (pp.status === 'paid') existing.paid += 1;
      else existing.pending += 1;
      if (pp.gross_amount_usd != null && pp.gross_amount_usd > 0) {
        existing.grossUsd += pp.gross_amount_usd;
        if (pp.fx_rate_used) { existing.fxRate += pp.fx_rate_used; existing.fxCount += 1; }
      }
      monthMap.set(m, existing);
    });
    const revenueByMonth = Array.from(monthMap.values())
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-12)
      .map((d) => ({
        ...d,
        label: shortMonth(d.month + '-01'),
        avgFxRate: d.fxCount > 0 ? d.fxRate / d.fxCount : null,
      }));

    // By category
    const catMap = new Map<string, number>();
    placements.filter((p) => p.status === 'active').forEach((p) => {
      catMap.set(p.placement_category, (catMap.get(p.placement_category) || 0) + 1);
    });
    const byCategory = Array.from(catMap.entries()).map(([cat, count]) => ({
      name: CATEGORY_LABELS[cat as PlacementCategory] || cat,
      value: count,
    })).sort((a, b) => b.value - a.value);

    // By client (top 10 by revenue)
    const clientMap = new Map<string, { name: string; revenue: number; revenueUsd: number; count: number }>();
    placements.filter((p) => p.status === 'active').forEach((p) => {
      const existing = clientMap.get(p.client_id) || { name: p.client_name || 'Unknown', revenue: 0, revenueUsd: 0, count: 0 };
      existing.revenue += p.commission_ngn ?? 0;
      existing.revenueUsd += p.client_rate_usd ?? 0;
      existing.count += 1;
      clientMap.set(p.client_id, existing);
    });
    const byClient = Array.from(clientMap.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 8);

    // By employee (top earners)
    const empMap = new Map<string, { name: string; earnings: number; placements: number }>();
    placements.filter((p) => p.status === 'active').forEach((p) => {
      const existing = empMap.get(p.employee_id) || { name: p.employee_name || 'Unknown', earnings: 0, placements: 0 };
      existing.earnings += p.employee_rate_ngn ?? 0;
      existing.placements += 1;
      empMap.set(p.employee_id, existing);
    });
    const topEarners = Array.from(empMap.values())
      .sort((a, b) => b.earnings - a.earnings)
      .slice(0, 10);

    // Payment direction split
    const directionSplit = [
      { name: 'KD Receives', value: stats.kdReceives },
      { name: 'Employee Receives', value: stats.empReceives },
    ].filter((d) => d.value > 0);

    // Payment status distribution
    const paymentDist = [
      { name: 'Paid', value: stats.paidCount, color: chartTheme.success },
      { name: 'Pending', value: stats.pendingCount, color: chartTheme.warning },
      { name: 'Overdue', value: stats.overdueCount, color: chartTheme.danger },
    ].filter((d) => d.value > 0);

    // Currency split
    const currencySplit = [
      { name: 'USD Contracts', value: stats.usdPlacementCount, color: chartTheme.primary },
      { name: 'NGN Only', value: stats.ngnOnlyCount, color: chartTheme.gold },
    ].filter((d) => d.value > 0);

    // FX rate history from payments
    const fxHistory = revenueByMonth
      .filter((d) => d.avgFxRate != null)
      .map((d) => ({ label: d.label, rate: d.avgFxRate }));

    return { revenueByMonth, byCategory, byClient, topEarners, directionSplit, paymentDist, currencySplit, fxHistory };
  }, [placements, allPayments, stats]);

  // ── Payment tracker filtered ──
  const filteredPayments = useMemo(() => {
    return allPayments.filter((pp) => {
      if (payFilterStatus !== 'all' && pp.status !== payFilterStatus) return false;
      if (payFilterMonth !== 'all' && pp.month.slice(0, 7) !== payFilterMonth) return false;
      return true;
    });
  }, [allPayments, payFilterStatus, payFilterMonth]);

  const paymentMonths = useMemo(() => {
    const months = new Set(allPayments.map((pp) => pp.month.slice(0, 7)));
    return Array.from(months).sort().reverse();
  }, [allPayments]);

  const paymentPagination = usePagination(filteredPayments, 20);

  // ── FX impact data ──
  const fxImpact = useMemo(() => {
    if (!currentFxRate) return null;
    const usdPlacements = placements.filter((p) => p.status === 'active' && p.client_rate_usd != null && p.client_rate_usd > 0);
    if (usdPlacements.length === 0) return null;

    const rows = usdPlacements.map((p) => {
      const lockedNgn = p.client_rate_ngn;
      const currentNgn = (p.client_rate_usd ?? 0) * currentFxRate;
      const diff = currentNgn - lockedNgn;
      const diffPct = lockedNgn > 0 ? (diff / lockedNgn) * 100 : 0;
      return {
        id: p.id,
        employee: p.employee_name ?? 'Unknown',
        client: p.client_name ?? 'Unknown',
        rateUsd: p.client_rate_usd ?? 0,
        lockedFx: p.fx_rate_used ?? 0,
        currentFx: currentFxRate,
        lockedNgn,
        currentNgn,
        diff,
        diffPct,
      };
    });

    const totalDiff = rows.reduce((s, r) => s + r.diff, 0);
    const totalLockedNgn = rows.reduce((s, r) => s + r.lockedNgn, 0);
    const totalCurrentNgn = rows.reduce((s, r) => s + r.currentNgn, 0);

    return { rows, totalDiff, totalLockedNgn, totalCurrentNgn };
  }, [placements, currentFxRate]);

  // ── Margin analysis ──
  const marginAnalysis = useMemo(() => {
    const active = placements.filter((p) => p.status === 'active');
    if (active.length === 0) return [];

    return active
      .map((p) => {
        const grossNgn = p.client_rate_ngn;
        const commission = p.commission_ngn ?? 0;
        const marginPct = grossNgn > 0 ? (commission / grossNgn) * 100 : 0;
        const annualCommission = commission * 12;
        return {
          id: p.id,
          employee: p.employee_name ?? 'Unknown',
          client: p.client_name ?? 'Unknown',
          category: CATEGORY_LABELS[p.placement_category],
          rateUsd: p.client_rate_usd,
          rateNgn: grossNgn,
          commission,
          marginPct,
          annualCommission,
          commissionPct: p.commission_pct,
        };
      })
      .sort((a, b) => b.annualCommission - a.annualCommission);
  }, [placements]);

  // ── Form handlers ──
  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setShowForm(true);
  }

  function openEdit(p: Placement) {
    setEditing(p);
    setForm({
      employee_id: p.employee_id,
      client_id: p.client_id,
      placement_type: p.placement_type,
      commission_pct: String(p.commission_pct),
      placement_category: p.placement_category,
      rate_type: p.rate_type || 'monthly',
      billing_cycle: p.billing_cycle || 'monthly',
      client_rate_usd: p.client_rate_usd != null ? String(p.client_rate_usd) : '',
      client_rate_ngn: String(p.client_rate_ngn),
      start_date: p.start_date,
      end_date: p.end_date ?? '',
      status: p.status,
      notes: p.notes ?? '',
    });
    setShowForm(true);
  }

  const formNgnFromUsd = useMemo(() => {
    const usd = Number(form.client_rate_usd);
    if (!isNaN(usd) && usd > 0 && currentFxRate) {
      return usd * currentFxRate;
    }
    return null;
  }, [form.client_rate_usd, currentFxRate]);

  async function handleSubmit() {
    const hasUsd = form.client_rate_usd && Number(form.client_rate_usd) > 0;
    const hasNgn = form.client_rate_ngn && Number(form.client_rate_ngn) > 0;
    if (!form.employee_id || !form.client_id || (!hasUsd && !hasNgn) || !form.start_date) {
      toast({ title: 'Missing fields', description: 'Employee, client, rate (USD or NGN), and start date are required.', variant: 'destructive' });
      return;
    }
    const pct = Number(form.commission_pct);
    if (isNaN(pct) || pct <= 0 || pct > 100) {
      toast({ title: 'Invalid commission', description: 'Commission must be between 1 and 100.', variant: 'destructive' });
      return;
    }

    let ngnRate: number;
    let usdRate: number | null = null;
    let fxRate: number | null = null;

    if (hasUsd && currentFxRate) {
      usdRate = Number(form.client_rate_usd);
      fxRate = currentFxRate;
      ngnRate = usdRate * fxRate;
    } else {
      ngnRate = Number(form.client_rate_ngn);
      if (hasUsd) usdRate = Number(form.client_rate_usd);
    }

    if (isNaN(ngnRate) || ngnRate < 0) {
      toast({ title: 'Invalid rate', description: 'Client rate must be a positive number.', variant: 'destructive' });
      return;
    }

    setSubmitting(true);
    const payload: any = {
      employee_id: form.employee_id,
      client_id: form.client_id,
      placement_type: form.placement_type,
      commission_pct: pct,
      placement_category: form.placement_category,
      rate_type: form.rate_type,
      billing_cycle: form.billing_cycle,
      client_rate_ngn: ngnRate,
      client_rate_usd: usdRate,
      fx_rate_used: fxRate,
      start_date: form.start_date,
      end_date: form.end_date || null,
      status: form.status,
      notes: form.notes || null,
    };

    if (editing) {
      const { error } = await supabase.from('placements').update(payload).eq('id', editing.id);
      if (error) {
        toast({ title: 'Update failed', description: error.message, variant: 'destructive' });
      } else {
        toast({ title: 'Placement updated' });
        logAudit('update_placement', `Updated placement ${editing.id}`, profile);
      }
    } else {
      payload.created_by = profile?.id;
      const { data, error } = await supabase.from('placements').insert(payload).select('id').single();
      if (error) {
        toast({ title: 'Create failed', description: error.message, variant: 'destructive' });
      } else {
        toast({ title: 'Placement created' });
        logAudit('create_placement', `Created placement for employee ${form.employee_id}`, profile);
        if (data?.id) {
          const { error: genErr } = await supabase.rpc('generate_placement_payments', { p_placement_id: data.id });
          if (genErr) {
            toast({ title: 'Payment generation warning', description: genErr.message, variant: 'destructive' });
          }
        }
      }
    }
    setSubmitting(false);
    setShowForm(false);
    fetchPlacements();
    fetchAllPayments();
  }

  async function handleDelete(p: Placement) {
    const yes = await confirm({
      title: 'Delete placement?',
      description: `This will permanently delete the placement of ${p.employee_name} at ${p.client_name} and all associated payment records.`,
      confirmLabel: 'Delete',
      variant: 'destructive',
    });
    if (!yes) return;
    const { error } = await supabase.from('placements').delete().eq('id', p.id);
    if (error) {
      toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Placement deleted' });
      logAudit('delete_placement', `Deleted placement ${p.id}`, profile);
      fetchPlacements();
      fetchAllPayments();
    }
  }

  // ── Payment detail ──
  async function openPayments(p: Placement) {
    setDetailPlacement(p);
    setLoadingPayments(true);
    const { data, error } = await supabase
      .from('placement_payments')
      .select('id, month, gross_amount_ngn, gross_amount_usd, fx_rate_used, commission_ngn, net_employee_ngn, period_start, period_end, hours_worked, days_worked, client_paid, client_paid_at, client_paid_ref, operator_paid, operator_paid_at, operator_paid_ref, fx_rate_edit_reason')
      .eq('placement_id', p.id)
      .order('month', { ascending: false });
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    setPayments((data as PlacementPayment[]) || []);
    setLoadingPayments(false);
  }

  async function generatePayments() {
    if (!detailPlacement) return;
    setGeneratingPayments(true);
    const { data, error } = await supabase.rpc('generate_placement_payments', { p_placement_id: detailPlacement.id });
    if (error) {
      toast({ title: 'Generation failed', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: `Generated ${data} payment month(s)` });
    }
    const { data: fresh } = await supabase
      .from('placement_payments')
      .select('id, month, gross_amount_ngn, gross_amount_usd, fx_rate_used, commission_ngn, net_employee_ngn, period_start, period_end, hours_worked, days_worked, client_paid, client_paid_at, client_paid_ref, operator_paid, operator_paid_at, operator_paid_ref, fx_rate_edit_reason')
      .eq('placement_id', detailPlacement.id)
      .order('month', { ascending: false });
    setPayments((fresh as PlacementPayment[]) || []);
    setGeneratingPayments(false);
    fetchAllPayments();
  }

  async function markPaymentStatus(paymentId: string, newStatus: PaymentStatus) {
    const update: any = { status: newStatus };
    if (newStatus === 'paid') {
      update.paid_at = new Date().toISOString();
      update.verified_by = profile?.id;
      update.verified_at = new Date().toISOString();
    }
    const { error } = await supabase.from('placement_payments').update(update).eq('id', paymentId);
    if (error) {
      toast({ title: 'Update failed', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: `Payment marked as ${newStatus}` });
      setPayments((prev) => prev.map((pp) => (pp.id === paymentId ? { ...pp, ...update } : pp)));
      setAllPayments((prev) => prev.map((pp) => (pp.id === paymentId ? { ...pp, ...update } : pp)));
    }
  }

  async function toggleClientPaid(paymentId: string, paid: boolean) {
    const update: Record<string, unknown> = {
      client_paid: paid,
      client_paid_at: paid ? new Date().toISOString() : null,
    };
    const rec = payments.find((pp) => pp.id === paymentId) ?? allPayments.find((pp) => pp.id === paymentId);
    if (paid && !rec?.operator_paid) {
      update.status = 'partial';
    } else if (paid) {
      update.status = 'paid';
    } else {
      update.status = rec?.operator_paid ? 'partial' : 'pending';
    }
    const { error } = await supabase.from('placement_payments').update(update).eq('id', paymentId);
    if (error) {
      toast({ title: 'Update failed', description: error.message, variant: 'destructive' });
    } else {
      setPayments((prev) => prev.map((pp) => (pp.id === paymentId ? { ...pp, ...update } as PlacementPayment : pp)));
      setAllPayments((prev) => prev.map((pp) => (pp.id === paymentId ? { ...pp, ...update } as any : pp)));
    }
  }

  async function toggleOperatorPaid(paymentId: string, paid: boolean) {
    const update: Record<string, unknown> = {
      operator_paid: paid,
      operator_paid_at: paid ? new Date().toISOString() : null,
    };
    const rec = payments.find((pp) => pp.id === paymentId) ?? allPayments.find((pp) => pp.id === paymentId);
    if (paid && !rec?.client_paid) {
      update.status = 'partial';
    } else if (paid) {
      update.status = 'paid';
    } else {
      update.status = rec?.client_paid ? 'partial' : 'pending';
    }
    const { error } = await supabase.from('placement_payments').update(update).eq('id', paymentId);
    if (error) {
      toast({ title: 'Update failed', description: error.message, variant: 'destructive' });
    } else {
      setPayments((prev) => prev.map((pp) => (pp.id === paymentId ? { ...pp, ...update } as PlacementPayment : pp)));
      setAllPayments((prev) => prev.map((pp) => (pp.id === paymentId ? { ...pp, ...update } as any : pp)));
    }
  }

  async function editPaymentFxRate(paymentId: string, newRate: number, reason: string, placementUsd: number | null, commissionPct: number) {
    if (!isSuperAdmin) return;
    setFxEditSaving(true);
    const ngn = (placementUsd && placementUsd > 0) ? placementUsd * newRate : null;
    const update: Record<string, unknown> = {
      fx_rate_used: newRate,
      fx_rate_edit_reason: reason,
      fx_rate_edited_by: profile?.id,
      fx_rate_edited_at: new Date().toISOString(),
    };
    if (ngn != null) {
      update.gross_amount_ngn = ngn;
      update.commission_ngn = ngn * (commissionPct / 100);
      update.net_employee_ngn = ngn * (1 - commissionPct / 100);
    }
    const { error } = await supabase.from('placement_payments').update(update).eq('id', paymentId);
    if (error) {
      toast({ title: 'Update failed', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'FX rate updated', description: `Rate changed to ₦${newRate.toLocaleString()} with reason recorded.` });
      setPayments((prev) => prev.map((pp) => (pp.id === paymentId ? { ...pp, ...update } as PlacementPayment : pp)));
      setAllPayments((prev) => prev.map((pp) => (pp.id === paymentId ? { ...pp, ...update } as any : pp)));
      setFxEditOpen(null);
      setFxEditRate('');
      setFxEditReason('');
    }
    setFxEditSaving(false);
  }

  // ── Export ──
  function exportCsv() {
    const rows = filtered.map((p) => ({
      Employee: p.employee_name,
      Client: p.client_name,
      Category: CATEGORY_LABELS[p.placement_category],
      'Payment Direction': TYPE_SHORT[p.placement_type],
      'Commission %': p.commission_pct,
      'Client Rate (USD)': p.client_rate_usd ?? '',
      'FX Rate': p.fx_rate_used ?? '',
      'Client Rate (NGN)': p.client_rate_ngn,
      'Employee Rate (NGN)': p.employee_rate_ngn,
      'Commission (NGN)': p.commission_ngn,
      'Start Date': p.start_date,
      'End Date': p.end_date ?? 'Ongoing',
      Status: STATUS_LABELS[p.status],
    }));
    downloadCsv(toCsv(rows), 'placements-export.csv');
    toast({ title: 'Exported', description: `${rows.length} placements exported.` });
  }

  function exportPaymentsCsv() {
    const rows = filteredPayments.map((pp) => ({
      Employee: pp.employee_name,
      Client: pp.client_name,
      Month: monthLabel(pp.month),
      'Gross (USD)': pp.gross_amount_usd ?? '',
      'FX Rate': pp.fx_rate_used ?? '',
      'Gross (NGN)': pp.gross_amount_ngn,
      'Commission (NGN)': pp.commission_ngn,
      'Operator Net (NGN)': pp.net_employee_ngn,
      'Client Paid': pp.client_paid ? 'Yes' : 'No',
      'Client Paid At': pp.client_paid_at ? formatDate(pp.client_paid_at) : '',
      'Client Paid Ref': pp.client_paid_ref ?? '',
      'Operator Paid': pp.operator_paid ? 'Yes' : 'No',
      'Operator Paid At': pp.operator_paid_at ? formatDate(pp.operator_paid_at) : '',
      'Operator Paid Ref': pp.operator_paid_ref ?? '',
      Status: pp.status,
    }));
    downloadCsv(toCsv(rows), 'placement-payments-export.csv');
    toast({ title: 'Exported', description: `${rows.length} payment records exported.` });
  }

  // ── Computed ──
  const computedRate = useMemo(() => {
    const usd = Number(form.client_rate_usd);
    const ngn = Number(form.client_rate_ngn);
    const pct = Number(form.commission_pct);
    const effectiveNgn = (!isNaN(usd) && usd > 0 && currentFxRate) ? usd * currentFxRate : ngn;
    if (isNaN(effectiveNgn) || isNaN(pct) || effectiveNgn <= 0) return null;
    return {
      commission: effectiveNgn * (pct / 100),
      employee: effectiveNgn * (1 - pct / 100),
      totalNgn: effectiveNgn,
      hasUsd: !isNaN(usd) && usd > 0,
      usd,
    };
  }, [form.client_rate_usd, form.client_rate_ngn, form.commission_pct, currentFxRate]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Hero */}
      <AuroraHero className="p-5 sm:p-6" pattern="constellation">
        <PageHeader
          title="Placements"
          description="Track employee deployments, commissions, and payment collections across USD & NGN"
          icon={Briefcase}
          actions={
            <div className="flex items-center gap-2">
              {currentFxRate && (
                <Badge variant="outline" className="hidden sm:flex gap-1.5 bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                  <Globe className="h-3 w-3" />
                  1 USD = {formatFxRate(currentFxRate)}
                </Badge>
              )}
              <Button variant="outline" size="sm" onClick={exportCsv} disabled={placements.length === 0}>
                <Download className="h-4 w-4 mr-1.5" /> Export
              </Button>
              {isAdmin && (
                <Button size="sm" onClick={openCreate}>
                  <Plus className="h-4 w-4 mr-1.5" /> New Placement
                </Button>
              )}
            </div>
          }
        />
      </AuroraHero>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="overview" className="gap-1.5">
            <BarChart3 className="h-3.5 w-3.5" /> Overview
          </TabsTrigger>
          <TabsTrigger value="placements" className="gap-1.5">
            <Briefcase className="h-3.5 w-3.5" /> Placements
            <Badge variant="outline" className="ml-1 text-[10px] px-1.5 py-0">{stats.total}</Badge>
          </TabsTrigger>
          <TabsTrigger value="payments" className="gap-1.5">
            <DollarSign className="h-3.5 w-3.5" /> Payment Tracker
            {stats.pendingCount > 0 && (
              <Badge variant="outline" className="ml-1 text-[10px] px-1.5 py-0 bg-amber-500/10 text-amber-600">{stats.pendingCount}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="fx" className="gap-1.5">
            <ArrowRightLeft className="h-3.5 w-3.5" /> FX Intelligence
          </TabsTrigger>
          <TabsTrigger value="reports" className="gap-1.5">
            <PieIcon className="h-3.5 w-3.5" /> Reports
          </TabsTrigger>
        </TabsList>

        {/* ════════════════════════════════════════════════════════════════════
            OVERVIEW TAB
           ════════════════════════════════════════════════════════════════════ */}
        <TabsContent value="overview" className="space-y-4 mt-4">
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            <StatCard title="Active Placements" value={stats.active} icon={Users} tone="primary" subtitle={`${stats.total} total`} onClick={() => setActiveTab('placements')} />
            <StatCard title="Monthly Revenue" value={stats.totalGrossUsd > 0 ? formatUsd(stats.totalGrossUsd) : formatNaira(stats.totalGross)} icon={DollarSign} tone="gold" subtitle={stats.totalGrossUsd > 0 ? `${formatNaira(stats.totalGross)} NGN` : 'Gross client billing'} />
            <StatCard title="KD Commission" value={formatNaira(stats.totalRevenue)} icon={TrendingUp} tone="success" subtitle={`Avg ${stats.avgCommission.toFixed(0)}% rate`} />
            <StatCard title="Employee Payouts" value={formatNaira(stats.totalPayout)} icon={Briefcase} tone="primary" subtitle="Monthly total" />
            <StatCard title="Collected" value={formatNaira(stats.totalCollected)} icon={CheckCircle2} tone="success" subtitle={`${stats.collectionRate.toFixed(0)}% rate`} onClick={() => setActiveTab('payments')} />
            <StatCard title="Outstanding" value={formatNaira(stats.totalOutstanding)} icon={Clock} tone={stats.totalOutstanding > 0 ? 'warning' : 'default'} subtitle={`${stats.pendingCount} pending`} onClick={() => setActiveTab('payments')} />
          </div>

          {/* Currency & FX Strip */}
          {(stats.usdPlacementCount > 0 || currentFxRate) && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard title="USD Contracts" value={stats.usdPlacementCount} icon={Globe} tone="primary" subtitle={formatUsd(stats.fxExposure) + '/mo exposure'} onClick={() => setActiveTab('fx')} />
              <StatCard title="Current FX Rate" value={currentFxRate ? formatFxRate(currentFxRate) : '—'} icon={ArrowRightLeft} tone="default" subtitle="NGN per 1 USD" onClick={() => setActiveTab('fx')} />
              <StatCard
                title="FX Gain/Loss"
                value={stats.fxGainLoss !== 0 ? `${stats.fxGainLoss > 0 ? '+' : ''}${stats.fxGainLoss.toFixed(1)}%` : '—'}
                icon={stats.fxGainLoss >= 0 ? TrendingUp : TrendingDown}
                tone={stats.fxGainLoss > 0 ? 'success' : stats.fxGainLoss < 0 ? 'danger' : 'default'}
                subtitle="vs locked rates"
                onClick={() => setActiveTab('fx')}
              />
              <StatCard title="Avg Locked Rate" value={stats.avgFxRate > 0 ? formatFxRate(stats.avgFxRate) : '—'} icon={Shield} tone="default" subtitle="Across USD placements" />
            </div>
          )}

          {/* Alerts */}
          {(stats.overdueCount > 0 || stats.expiringPlacements.length > 0) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {stats.overdueCount > 0 && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-4 flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-sm text-red-600">Overdue Payments</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {stats.overdueCount} payment{stats.overdueCount !== 1 ? 's' : ''} overdue. Review in the Payment Tracker tab.
                    </p>
                    <Button variant="ghost" size="sm" className="mt-2 h-7 text-xs text-red-600" onClick={() => { setActiveTab('payments'); setPayFilterStatus('overdue'); }}>
                      View Overdue <ArrowUpRight className="h-3 w-3 ml-1" />
                    </Button>
                  </div>
                </div>
              )}
              {stats.expiringPlacements.length > 0 && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-sm text-amber-600">Expiring Soon</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {stats.expiringPlacements.length} placement{stats.expiringPlacements.length !== 1 ? 's' : ''} ending within 30 days:
                    </p>
                    <div className="mt-1.5 space-y-1">
                      {stats.expiringPlacements.slice(0, 3).map((p) => (
                        <p key={p.id} className="text-xs">
                          <span className="font-medium">{p.employee_name}</span> at {p.client_name} — ends {formatDate(p.end_date!)}
                        </p>
                      ))}
                      {stats.expiringPlacements.length > 3 && (
                        <p className="text-xs text-muted-foreground">+{stats.expiringPlacements.length - 3} more</p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Charts Row 1: Revenue Trend + Category Breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 rounded-lg border border-border/70 bg-card p-4">
              <h3 className="text-sm font-semibold mb-3">Monthly Revenue & Commission</h3>
              {chartData.revenueByMonth.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={chartData.revenueByMonth} {...chartAnim}>
                    <ChartGradients />
                    <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridLine} />
                    <XAxis dataKey="label" tick={axisTick} />
                    <YAxis tick={axisTick} tickFormatter={(v) => `₦${(v / 1000).toFixed(0)}k`} />
                    <Tooltip content={<GlassTooltip formatter={(v: number) => formatNaira(v)} />} />
                    <Area type="monotone" dataKey="gross" name="Gross Revenue" stroke={chartTheme.primary} fill="url(#kd-grad-primary)" />
                    <Area type="monotone" dataKey="commission" name="KD Commission" stroke={chartTheme.success} fill="url(#kd-grad-success)" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState icon={BarChart3} title="No data yet" description="Revenue chart will appear once placements generate payments." />
              )}
            </div>

            <div className="rounded-lg border border-border/70 bg-card p-4">
              <h3 className="text-sm font-semibold mb-3">Placements by Category</h3>
              {chartData.byCategory.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={chartData.byCategory}
                      cx="50%" cy="50%"
                      innerRadius={55} outerRadius={90}
                      paddingAngle={3}
                      dataKey="value"
                      {...chartAnim}
                    >
                      {chartData.byCategory.map((_, i) => (
                        <Cell key={i} fill={chartPalette[i % chartPalette.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<GlassTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState icon={PieIcon} title="No data" description="Category breakdown appears with active placements." />
              )}
            </div>
          </div>

          {/* Charts Row 2: Top Clients + Payment Status */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 rounded-lg border border-border/70 bg-card p-4">
              <h3 className="text-sm font-semibold mb-3">Revenue by Client (Top 8)</h3>
              {chartData.byClient.length > 0 ? (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={chartData.byClient} layout="vertical" {...chartAnim}>
                    <ChartGradients />
                    <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridLine} horizontal={false} />
                    <XAxis type="number" tick={axisTick} tickFormatter={(v) => `₦${(v / 1000).toFixed(0)}k`} />
                    <YAxis type="category" dataKey="name" tick={axisTick} width={120} />
                    <Tooltip content={<GlassTooltip formatter={(v: number) => formatNaira(v)} />} />
                    <Bar dataKey="revenue" name="Monthly Commission" fill="url(#kd-grad-cyan)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState icon={Building2} title="No data" description="Client revenue chart appears with active placements." />
              )}
            </div>

            <div className="rounded-lg border border-border/70 bg-card p-4">
              <h3 className="text-sm font-semibold mb-3">Payment Collection</h3>
              {chartData.paymentDist.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie
                        data={chartData.paymentDist}
                        cx="50%" cy="50%"
                        innerRadius={45} outerRadius={70}
                        paddingAngle={3}
                        dataKey="value"
                        {...chartAnim}
                      >
                        {chartData.paymentDist.map((d, i) => (
                          <Cell key={i} fill={d.color} />
                        ))}
                      </Pie>
                      <Tooltip content={<GlassTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-2 mt-2">
                    {chartData.paymentDist.map((d) => (
                      <div key={d.name} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: d.color }} />
                          <span className="text-muted-foreground">{d.name}</span>
                        </div>
                        <span className="font-semibold tabular-nums">{d.value}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <EmptyState icon={CheckCircle2} title="No payments" description="Payment distribution appears once payments are generated." />
              )}
            </div>
          </div>

          {/* Top Earners */}
          {chartData.topEarners.length > 0 && (
            <div className="rounded-lg border border-border/70 bg-card p-4">
              <h3 className="text-sm font-semibold mb-3">Top Employee Earners (Monthly)</h3>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8">#</TableHead>
                      <TableHead>Employee</TableHead>
                      <TableHead className="text-right">Monthly Pay</TableHead>
                      <TableHead className="text-right">Active Placements</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {chartData.topEarners.map((e, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                        <TableCell className="font-medium">{e.name}</TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">{formatNaira(e.earnings)}</TableCell>
                        <TableCell className="text-right">{e.placements}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ════════════════════════════════════════════════════════════════════
            PLACEMENTS TAB (CRUD)
           ════════════════════════════════════════════════════════════════════ */}
        <TabsContent value="placements" className="space-y-4 mt-4">
          {/* Stats row */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <StatCard title="Active" value={stats.active} icon={Users} tone="success" />
            <StatCard title="Monthly Commission" value={formatNaira(stats.totalRevenue)} icon={DollarSign} tone="gold" />
            <StatCard title="Monthly Payouts" value={formatNaira(stats.totalPayout)} icon={Briefcase} tone="primary" />
            <StatCard title="KD Receives" value={stats.kdReceives} icon={CheckCircle2} tone="default" />
            <StatCard title="Employee Receives" value={stats.empReceives} icon={Clock} tone="default" />
          </div>

          {/* Table Card */}
          <div className="rounded-lg border border-border/70 bg-card overflow-hidden">
            {/* Filter strip */}
            <div className="px-3 py-2.5 border-b border-border/50 flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[180px]">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search employee, client…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 h-9 text-sm"
                />
              </div>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-[130px] h-9 text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  {(Object.entries(STATUS_LABELS) as [PlacementStatus, string][]).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterCategory} onValueChange={setFilterCategory}>
                <SelectTrigger className="w-[140px] h-9 text-xs"><SelectValue placeholder="Category" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {(Object.entries(CATEGORY_LABELS) as [PlacementCategory, string][]).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-[160px] h-9 text-xs hidden sm:flex"><SelectValue placeholder="Direction" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Directions</SelectItem>
                  <SelectItem value="kd_receives">KD Receives</SelectItem>
                  <SelectItem value="employee_receives">Employee Receives</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Content */}
            {loading ? (
              <TableSkeleton />
            ) : filtered.length === 0 ? (
              <EmptyState
                icon={Briefcase}
                title="No placements found"
                description={placements.length > 0 ? 'Try adjusting your filters.' : 'Create your first employee placement to get started.'}
              />
            ) : (
              <>
                {/* Desktop Table */}
                <div className="hidden md:block overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Employee</TableHead>
                        <TableHead>Client</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Direction</TableHead>
                        <TableHead className="text-right">Commission</TableHead>
                        <TableHead className="text-right">Client Rate</TableHead>
                        <TableHead className="text-right">Employee Rate</TableHead>
                        <TableHead>Period</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pagination.slice.map((p) => (
                        <TableRow key={p.id} className="group">
                          <TableCell className="font-medium">{p.employee_name}</TableCell>
                          <TableCell>{p.client_name}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={CATEGORY_COLORS[p.placement_category]}>
                              {CATEGORY_LABELS[p.placement_category]}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <span className="text-xs">{TYPE_SHORT[p.placement_type]}</span>
                          </TableCell>
                          <TableCell className="text-right font-medium">{p.commission_pct}%</TableCell>
                          <TableCell className="text-right">
                            {p.client_rate_usd != null && p.client_rate_usd > 0 ? (
                              <div>
                                <span className="font-semibold">{formatUsd(p.client_rate_usd)}</span>
                                <span className="block text-[10px] text-muted-foreground">{formatNaira(p.client_rate_ngn)}</span>
                              </div>
                            ) : (
                              formatNaira(p.client_rate_ngn)
                            )}
                          </TableCell>
                          <TableCell className="text-right">{formatNaira(p.employee_rate_ngn)}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {formatDate(p.start_date)} — {p.end_date ? formatDate(p.end_date) : 'Ongoing'}
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={p.status} />
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Button variant="ghost" size="icon" onClick={() => openPayments(p)} aria-label="View payments">
                                <Eye className="h-4 w-4" />
                              </Button>
                              {isAdmin && (
                                <>
                                  <Button variant="ghost" size="icon" onClick={() => openEdit(p)} aria-label="Edit">
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  <Button variant="ghost" size="icon" onClick={() => handleDelete(p)} aria-label="Delete">
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

                {/* Mobile Cards */}
                <div className="md:hidden p-3 space-y-2">
                  {pagination.slice.map((p) => (
                    <MobileCard key={p.id} onClick={() => openPayments(p)} chevron>
                      <MobileCardHeader>
                        <MobileCardTitle>{p.employee_name}</MobileCardTitle>
                        <MobileCardMeta>
                          <StatusBadge status={p.status} />
                        </MobileCardMeta>
                      </MobileCardHeader>
                      <MobileCardRow label="Client">{p.client_name}</MobileCardRow>
                      <MobileCardRow label="Category">
                        <Badge variant="outline" className={`text-[10px] ${CATEGORY_COLORS[p.placement_category]}`}>
                          {CATEGORY_LABELS[p.placement_category]}
                        </Badge>
                      </MobileCardRow>
                      <MobileCardRow label="Direction">{TYPE_SHORT[p.placement_type]}</MobileCardRow>
                      <MobileCardRow label="Commission">{p.commission_pct}% — {formatNaira(p.commission_ngn)}/mo</MobileCardRow>
                      <MobileCardRow label="Client Rate">
                        {p.client_rate_usd != null && p.client_rate_usd > 0
                          ? `${formatUsd(p.client_rate_usd)} (${formatNaira(p.client_rate_ngn)})`
                          : `${formatNaira(p.client_rate_ngn)}/mo`}
                      </MobileCardRow>
                      <MobileCardRow label="Period">
                        {formatDate(p.start_date)} — {p.end_date ? formatDate(p.end_date) : 'Ongoing'}
                      </MobileCardRow>
                      {isAdmin && (
                        <MobileCardFooter>
                          <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); openEdit(p); }}>
                            <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                          </Button>
                          <Button variant="ghost" size="sm" className="text-destructive" onClick={(e) => { e.stopPropagation(); handleDelete(p); }}>
                            <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
                          </Button>
                        </MobileCardFooter>
                      )}
                    </MobileCard>
                  ))}
                </div>

                <Pagination
                  page={pagination.page}
                  totalPages={pagination.totalPages}
                  totalItems={pagination.totalItems}
                  onNext={pagination.next}
                  onPrev={pagination.prev}
                />
              </>
            )}
          </div>
        </TabsContent>

        {/* ════════════════════════════════════════════════════════════════════
            PAYMENT TRACKER TAB
           ════════════════════════════════════════════════════════════════════ */}
        <TabsContent value="payments" className="space-y-4 mt-4">
          {/* Payment KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard title="Total Collected" value={formatNaira(stats.totalCollected)} icon={CheckCircle2} tone="success" subtitle={`${stats.paidCount} payments`} />
            <StatCard title="Outstanding" value={formatNaira(stats.totalOutstanding)} icon={Clock} tone="warning" subtitle={`${stats.pendingCount} pending`} />
            <StatCard title="Overdue" value={stats.overdueCount} icon={AlertTriangle} tone={stats.overdueCount > 0 ? 'danger' : 'default'} />
            <StatCard title="Collection Rate" value={`${stats.collectionRate.toFixed(1)}%`} icon={Percent} tone={stats.collectionRate >= 80 ? 'success' : stats.collectionRate >= 50 ? 'warning' : 'danger'} />
          </div>

          {/* Payment collection trend */}
          {chartData.revenueByMonth.length > 0 && (
            <div className="rounded-lg border border-border/70 bg-card p-4">
              <h3 className="text-sm font-semibold mb-3">Monthly Payment Status</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData.revenueByMonth} {...chartAnim}>
                  <ChartGradients />
                  <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridLine} />
                  <XAxis dataKey="label" tick={axisTick} />
                  <YAxis tick={axisTick} />
                  <Tooltip content={<GlassTooltip />} />
                  <Bar dataKey="paid" name="Paid" fill={chartTheme.success} radius={[4, 4, 0, 0]} stackId="stack" />
                  <Bar dataKey="pending" name="Pending" fill={chartTheme.warning} radius={[4, 4, 0, 0]} stackId="stack" />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* All Payments Table */}
          <div className="rounded-lg border border-border/70 bg-card overflow-hidden">
            <div className="px-3 py-2.5 border-b border-border/50 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Select value={payFilterStatus} onValueChange={setPayFilterStatus}>
                  <SelectTrigger className="w-[130px] h-9 text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="paid">Paid</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="overdue">Overdue</SelectItem>
                    <SelectItem value="partial">Partial</SelectItem>
                    <SelectItem value="waived">Waived</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={payFilterMonth} onValueChange={setPayFilterMonth}>
                  <SelectTrigger className="w-[150px] h-9 text-xs"><SelectValue placeholder="Month" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Months</SelectItem>
                    {paymentMonths.map((m) => (
                      <SelectItem key={m} value={m}>{monthLabel(m + '-01')}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button variant="outline" size="sm" onClick={exportPaymentsCsv} disabled={filteredPayments.length === 0}>
                <Download className="h-4 w-4 mr-1.5" /> Export
              </Button>
            </div>

            {loadingAllPayments ? (
              <TableSkeleton />
            ) : filteredPayments.length === 0 ? (
              <EmptyState
                icon={DollarSign}
                title="No payments found"
                description={allPayments.length > 0 ? 'Try adjusting your filters.' : 'Payment records appear after creating placements and generating monthly payments.'}
              />
            ) : (
              <>
                {/* Desktop */}
                <div className="hidden md:block overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Month</TableHead>
                        <TableHead>Employee</TableHead>
                        <TableHead>Client</TableHead>
                        <TableHead>Direction</TableHead>
                        <TableHead className="text-right">Gross</TableHead>
                        <TableHead className="text-right">Commission</TableHead>
                        <TableHead className="text-right">Operator Net</TableHead>
                        <TableHead className="text-center">Client Paid</TableHead>
                        <TableHead className="text-center">Operator Paid</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paymentPagination.slice.map((pp) => (
                        <TableRow key={pp.id}>
                          <TableCell className="font-medium">{monthLabel(pp.month)}</TableCell>
                          <TableCell>{pp.employee_name}</TableCell>
                          <TableCell>{pp.client_name}</TableCell>
                          <TableCell className="text-xs">{pp.placement_type ? TYPE_SHORT[pp.placement_type] : '—'}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {pp.gross_amount_usd != null && pp.gross_amount_usd > 0 ? (
                              <div>
                                <span>{formatUsd(pp.gross_amount_usd)}</span>
                                <span className="block text-[10px] text-muted-foreground">{formatNaira(pp.gross_amount_ngn)}</span>
                              </div>
                            ) : (
                              formatNaira(pp.gross_amount_ngn)
                            )}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{formatNaira(pp.commission_ngn)}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatNaira(pp.net_employee_ngn)}</TableCell>
                          <TableCell className="text-center">
                            {pp.client_paid ? (
                              <button
                                className="inline-flex items-center gap-1 text-xs text-emerald-600 hover:underline"
                                onClick={() => isAdmin && toggleClientPaid(pp.id, false)}
                                title={pp.client_paid_ref ? `Ref: ${pp.client_paid_ref}` : pp.client_paid_at ? `Paid ${formatDate(pp.client_paid_at)}` : 'Paid'}
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" /> Paid
                              </button>
                            ) : isAdmin ? (
                              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => toggleClientPaid(pp.id, true)}>
                                Mark Paid
                              </Button>
                            ) : (
                              <span className="text-xs text-amber-600">Unpaid</span>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            {pp.operator_paid ? (
                              <button
                                className="inline-flex items-center gap-1 text-xs text-emerald-600 hover:underline"
                                onClick={() => isAdmin && toggleOperatorPaid(pp.id, false)}
                                title={pp.operator_paid_ref ? `Ref: ${pp.operator_paid_ref}` : pp.operator_paid_at ? `Paid ${formatDate(pp.operator_paid_at)}` : 'Paid'}
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" /> Paid
                              </button>
                            ) : isAdmin ? (
                              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => toggleOperatorPaid(pp.id, true)}>
                                Mark Paid
                              </Button>
                            ) : (
                              <span className="text-xs text-amber-600">Unpaid</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Mobile */}
                <div className="md:hidden p-3 space-y-2">
                  {paymentPagination.slice.map((pp) => (
                    <MobileCard key={pp.id}>
                      <MobileCardHeader>
                        <MobileCardTitle>{monthLabel(pp.month)}</MobileCardTitle>
                        <MobileCardMeta>
                          <Badge variant="outline" className={`text-[10px] ${PAYMENT_STATUS_TONE[pp.status as PaymentStatus]}`}>
                            {pp.status}
                          </Badge>
                        </MobileCardMeta>
                      </MobileCardHeader>
                      <MobileCardRow label="Employee">{pp.employee_name}</MobileCardRow>
                      <MobileCardRow label="Client">{pp.client_name}</MobileCardRow>
                      <MobileCardRow label="Gross">
                        {pp.gross_amount_usd != null && pp.gross_amount_usd > 0
                          ? `${formatUsd(pp.gross_amount_usd)} (${formatNaira(pp.gross_amount_ngn)})`
                          : formatNaira(pp.gross_amount_ngn)}
                      </MobileCardRow>
                      <MobileCardRow label="Commission">{formatNaira(pp.commission_ngn)}</MobileCardRow>
                      <MobileCardRow label="Operator Net">{formatNaira(pp.net_employee_ngn)}</MobileCardRow>
                      <MobileCardRow label="Client Paid">
                        {pp.client_paid
                          ? <span className="text-emerald-600 flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Yes{pp.client_paid_at ? ` · ${formatDate(pp.client_paid_at)}` : ''}</span>
                          : <span className="text-amber-600">No</span>}
                      </MobileCardRow>
                      <MobileCardRow label="Operator Paid">
                        {pp.operator_paid
                          ? <span className="text-emerald-600 flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Yes{pp.operator_paid_at ? ` · ${formatDate(pp.operator_paid_at)}` : ''}</span>
                          : <span className="text-amber-600">No</span>}
                      </MobileCardRow>
                      {isAdmin && (!pp.client_paid || !pp.operator_paid) && (
                        <MobileCardFooter>
                          {!pp.client_paid && (
                            <Button size="sm" className="h-8 text-xs flex-1" onClick={() => toggleClientPaid(pp.id, true)}>
                              Client Paid
                            </Button>
                          )}
                          {!pp.operator_paid && (
                            <Button size="sm" variant="outline" className="h-8 text-xs flex-1" onClick={() => toggleOperatorPaid(pp.id, true)}>
                              Operator Paid
                            </Button>
                          )}
                        </MobileCardFooter>
                      )}
                    </MobileCard>
                  ))}
                </div>

                <Pagination
                  page={paymentPagination.page}
                  totalPages={paymentPagination.totalPages}
                  totalItems={paymentPagination.totalItems}
                  onNext={paymentPagination.next}
                  onPrev={paymentPagination.prev}
                />
              </>
            )}
          </div>
        </TabsContent>

        {/* ════════════════════════════════════════════════════════════════════
            FX INTELLIGENCE TAB
           ════════════════════════════════════════════════════════════════════ */}
        <TabsContent value="fx" className="space-y-4 mt-4">
          {/* FX KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard
              title="Live FX Rate"
              value={currentFxRate ? formatFxRate(currentFxRate) : '—'}
              icon={Globe}
              tone="primary"
              subtitle={
                <span className="flex items-center gap-1">
                  1 USD = NGN
                  {loadingFxRate && <Loader2 className="h-3 w-3 animate-spin" />}
                </span>
              }
            />
            <StatCard
              title="USD Exposure"
              value={formatUsd(stats.fxExposure)}
              icon={DollarSign}
              tone="gold"
              subtitle={`${stats.usdPlacementCount} USD contract${stats.usdPlacementCount !== 1 ? 's' : ''}`}
            />
            <StatCard
              title="FX Impact"
              value={fxImpact ? formatNaira(fxImpact.totalDiff) : '—'}
              icon={fxImpact && fxImpact.totalDiff >= 0 ? TrendingUp : TrendingDown}
              tone={fxImpact && fxImpact.totalDiff >= 0 ? 'success' : 'danger'}
              subtitle="Monthly gain/loss at current rate"
            />
            <StatCard
              title="Avg Locked Rate"
              value={stats.avgFxRate > 0 ? formatFxRate(stats.avgFxRate) : '—'}
              icon={Shield}
              tone="default"
              subtitle="Weighted across placements"
            />
          </div>

          {/* FX Explanation */}
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
            <div className="flex items-start gap-3">
              <Zap className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-sm">How dual-currency placements work</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Clients pay KD in <strong>USD</strong>. When you create a placement, the current FX rate is locked in,
                  converting to NGN for employee payments and commission calculations. If the naira weakens (rate goes up),
                  your USD contracts are worth more in NGN — that&apos;s the FX gain shown above. Use this tab to monitor
                  your currency exposure and identify renegotiation opportunities.
                </p>
              </div>
            </div>
          </div>

          {/* Currency Split Chart */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-lg border border-border/70 bg-card p-4">
              <h3 className="text-sm font-semibold mb-3">Contract Currency Split</h3>
              {chartData.currencySplit.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie
                        data={chartData.currencySplit}
                        cx="50%" cy="50%"
                        innerRadius={50} outerRadius={80}
                        paddingAngle={4}
                        dataKey="value"
                        {...chartAnim}
                      >
                        {chartData.currencySplit.map((d, i) => (
                          <Cell key={i} fill={d.color} />
                        ))}
                      </Pie>
                      <Tooltip content={<GlassTooltip />} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="mt-2 space-y-1.5">
                    {chartData.currencySplit.map((d) => (
                      <div key={d.name} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ background: d.color }} />
                          <span className="text-muted-foreground">{d.name}</span>
                        </div>
                        <span className="font-semibold">{d.value}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <EmptyState icon={Globe} title="No currency data" description="Currency split appears with active placements." />
              )}
            </div>

            {/* FX Rate History */}
            <div className="rounded-lg border border-border/70 bg-card p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold">FX Rate Trend (from payments)</h3>
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={fetchFxRate}>
                  <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loadingFxRate ? 'animate-spin' : ''}`} /> Refresh
                </Button>
              </div>
              {chartData.fxHistory.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <ComposedChart data={chartData.fxHistory} {...chartAnim}>
                    <ChartGradients />
                    <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridLine} />
                    <XAxis dataKey="label" tick={axisTick} />
                    <YAxis tick={axisTick} tickFormatter={(v) => `₦${v.toLocaleString()}`} />
                    <Tooltip content={<GlassTooltip formatter={(v: number) => `₦${v.toLocaleString()}`} />} />
                    <Line type="monotone" dataKey="rate" name="FX Rate" stroke={chartTheme.primary} strokeWidth={2} dot={{ r: 3 }} />
                    {currentFxRate && (
                      <Line
                        type="monotone"
                        dataKey={() => currentFxRate}
                        name="Current Rate"
                        stroke={chartTheme.success}
                        strokeWidth={1}
                        strokeDasharray="5 5"
                        dot={false}
                      />
                    )}
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState icon={ArrowRightLeft} title="No FX data" description="FX rate history appears once you create USD-denominated placements." />
              )}
            </div>
          </div>

          {/* FX Impact Table */}
          {fxImpact && fxImpact.rows.length > 0 && (
            <div className="rounded-lg border border-border/70 bg-card p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold">Placement-Level FX Impact Analysis</h3>
                <div className="text-sm font-semibold">
                  {fxImpact.totalDiff >= 0 ? (
                    <span className="text-emerald-600">+{formatNaira(fxImpact.totalDiff)}/mo gain</span>
                  ) : (
                    <span className="text-red-600">{formatNaira(fxImpact.totalDiff)}/mo loss</span>
                  )}
                </div>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead className="text-right">USD Rate</TableHead>
                      <TableHead className="text-right">Locked FX</TableHead>
                      <TableHead className="text-right">Current FX</TableHead>
                      <TableHead className="text-right">Locked NGN</TableHead>
                      <TableHead className="text-right">Current NGN</TableHead>
                      <TableHead className="text-right">Impact</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {fxImpact.rows.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{r.employee}</TableCell>
                        <TableCell>{r.client}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatUsd(r.rateUsd)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatFxRate(r.lockedFx)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatFxRate(r.currentFx)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatNaira(r.lockedNgn)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatNaira(r.currentNgn)}</TableCell>
                        <TableCell className={`text-right font-semibold tabular-nums ${r.diff >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                          {r.diff >= 0 ? '+' : ''}{formatNaira(r.diff)}
                          <span className="block text-[10px] font-normal">
                            {r.diffPct >= 0 ? '+' : ''}{r.diffPct.toFixed(1)}%
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <p className="text-[11px] text-muted-foreground mt-3">
                Impact shows what each placement would be worth today vs. the rate locked at creation.
                Positive = naira weakened (you earn more NGN per USD). Consider renegotiating placements with large negative impact.
              </p>
            </div>
          )}

          {/* Margin Analysis */}
          {marginAnalysis.length > 0 && (
            <div className="rounded-lg border border-border/70 bg-card p-4">
              <h3 className="text-sm font-semibold mb-3">Profit Margin Leaderboard</h3>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8">#</TableHead>
                      <TableHead>Employee</TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-right">Client Rate</TableHead>
                      <TableHead className="text-right">Commission %</TableHead>
                      <TableHead className="text-right">Monthly Commission</TableHead>
                      <TableHead className="text-right">Annual Value</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {marginAnalysis.slice(0, 15).map((m, i) => (
                      <TableRow key={m.id}>
                        <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                        <TableCell className="font-medium">{m.employee}</TableCell>
                        <TableCell>{m.client}</TableCell>
                        <TableCell>{m.category}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {m.rateUsd != null && m.rateUsd > 0 ? (
                            <div>
                              <span>{formatUsd(m.rateUsd)}</span>
                              <span className="block text-[10px] text-muted-foreground">{formatNaira(m.rateNgn)}</span>
                            </div>
                          ) : (
                            formatNaira(m.rateNgn)
                          )}
                        </TableCell>
                        <TableCell className="text-right font-medium">{m.commissionPct}%</TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">{formatNaira(m.commission)}</TableCell>
                        <TableCell className="text-right font-semibold tabular-nums text-emerald-600">{formatNaira(m.annualCommission)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ════════════════════════════════════════════════════════════════════
            REPORTS TAB
           ════════════════════════════════════════════════════════════════════ */}
        <TabsContent value="reports" className="space-y-4 mt-4">
          {/* Revenue Summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard title="Total Gross Revenue" value={formatNaira(allPayments.reduce((s, pp) => s + pp.gross_amount_ngn, 0))} icon={DollarSign} tone="gold" />
            <StatCard title="Total Commission" value={formatNaira(allPayments.reduce((s, pp) => s + pp.commission_ngn, 0))} icon={TrendingUp} tone="success" />
            <StatCard title="Total Payouts" value={formatNaira(allPayments.reduce((s, pp) => s + pp.net_employee_ngn, 0))} icon={Briefcase} tone="primary" />
            <StatCard title="Avg Commission Rate" value={`${stats.avgCommission.toFixed(1)}%`} icon={Percent} tone="default" />
          </div>

          {/* Commission trend */}
          {chartData.revenueByMonth.length > 0 && (
            <div className="rounded-lg border border-border/70 bg-card p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold">Commission Earned by Month</h3>
                <Button variant="outline" size="sm" onClick={exportPaymentsCsv}>
                  <Download className="h-4 w-4 mr-1.5" /> Export Report
                </Button>
              </div>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={chartData.revenueByMonth} {...chartAnim}>
                  <ChartGradients />
                  <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridLine} />
                  <XAxis dataKey="label" tick={axisTick} />
                  <YAxis tick={axisTick} tickFormatter={(v) => `₦${(v / 1000).toFixed(0)}k`} />
                  <Tooltip content={<GlassTooltip formatter={(v: number) => formatNaira(v)} />} />
                  <Bar dataKey="commission" name="KD Commission" fill="url(#kd-grad-success)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="payout" name="Employee Payout" fill="url(#kd-grad-primary)" radius={[4, 4, 0, 0]} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Direction Split + Category Revenue */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-lg border border-border/70 bg-card p-4">
              <h3 className="text-sm font-semibold mb-3">Payment Direction Split</h3>
              {chartData.directionSplit.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie
                        data={chartData.directionSplit}
                        cx="50%" cy="50%"
                        innerRadius={50} outerRadius={80}
                        paddingAngle={4}
                        dataKey="value"
                        {...chartAnim}
                      >
                        <Cell fill={chartTheme.primary} />
                        <Cell fill={chartTheme.gold} />
                      </Pie>
                      <Tooltip content={<GlassTooltip />} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <p className="text-xs text-muted-foreground text-center mt-2">
                    KD-controlled placements are auto-verified. Employee-receives require manual payment verification.
                  </p>
                </>
              ) : (
                <EmptyState icon={PieIcon} title="No data" description="Direction split appears with active placements." />
              )}
            </div>

            {/* Client Summary Table */}
            <div className="rounded-lg border border-border/70 bg-card p-4">
              <h3 className="text-sm font-semibold mb-3">Client Revenue Summary</h3>
              {chartData.byClient.length > 0 ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Client</TableHead>
                        <TableHead className="text-right">Placements</TableHead>
                        <TableHead className="text-right">Monthly Revenue</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {chartData.byClient.map((c, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-medium">{c.name}</TableCell>
                          <TableCell className="text-right">{c.count}</TableCell>
                          <TableCell className="text-right font-semibold tabular-nums">
                            {c.revenueUsd > 0 ? (
                              <div>
                                <span>{formatUsd(c.revenueUsd)}</span>
                                <span className="block text-[10px] text-muted-foreground">{formatNaira(c.revenue)}</span>
                              </div>
                            ) : (
                              formatNaira(c.revenue)
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <EmptyState icon={Building2} title="No data" description="Client summary appears with active placements." />
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* ── Create / Edit Dialog ──────────────────────────────────────────── */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Placement' : 'New Placement'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="pf-employee">Employee</Label>
              <Select value={form.employee_id} onValueChange={(v) => setForm((f) => ({ ...f, employee_id: v }))}>
                <SelectTrigger id="pf-employee"><SelectValue placeholder="Select employee" /></SelectTrigger>
                <SelectContent>
                  {employees.map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pf-client">Client</Label>
              <Select value={form.client_id} onValueChange={(v) => setForm((f) => ({ ...f, client_id: v }))}>
                <SelectTrigger id="pf-client"><SelectValue placeholder="Select client" /></SelectTrigger>
                <SelectContent>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pf-cat">Placement Category</Label>
              <Select value={form.placement_category} onValueChange={(v) => setForm((f) => ({ ...f, placement_category: v as PlacementCategory }))}>
                <SelectTrigger id="pf-cat"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.entries(CATEGORY_LABELS) as [PlacementCategory, string][]).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pf-type">Payment Direction</Label>
              <Select value={form.placement_type} onValueChange={(v) => setForm((f) => ({ ...f, placement_type: v as PlacementType }))}>
                <SelectTrigger id="pf-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="kd_receives">{TYPE_LABELS.kd_receives}</SelectItem>
                  <SelectItem value="employee_receives">{TYPE_LABELS.employee_receives}</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                {form.placement_type === 'kd_receives'
                  ? 'KD receives payment from the client and pays the employee. Monthly payments are auto-verified.'
                  : 'The employee receives payment from the client and remits KD\'s commission. Monthly payments require manual verification.'}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="pf-rate-type">Rate Type</Label>
                <Select value={form.rate_type} onValueChange={(v) => setForm((f) => ({ ...f, rate_type: v as RateType }))}>
                  <SelectTrigger id="pf-rate-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.entries(RATE_TYPE_LABELS) as [RateType, string][]).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pf-billing-cycle">Billing Cycle</Label>
                <Select value={form.billing_cycle} onValueChange={(v) => setForm((f) => ({ ...f, billing_cycle: v as BillingCycle }))}>
                  <SelectTrigger id="pf-billing-cycle"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.entries(BILLING_CYCLE_LABELS) as [BillingCycle, string][]).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pf-pct">Commission %</Label>
              <div className="relative">
                <Input id="pf-pct" type="number" min="1" max="100" value={form.commission_pct} onChange={(e) => setForm((f) => ({ ...f, commission_pct: e.target.value }))} />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>
              </div>
            </div>

            {/* Dual-Currency Rate Input */}
            <div className="rounded-lg border border-border/50 bg-muted/30 p-3 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold flex items-center gap-1.5">
                  <ArrowRightLeft className="h-3.5 w-3.5" /> Client Rate
                </p>
                {currentFxRate && (
                  <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                    1 USD = {formatFxRate(currentFxRate)}
                  </Badge>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="pf-rate-usd" className="text-xs">USD ({RATE_TYPE_LABELS[form.rate_type].toLowerCase()})</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                    <Input
                      id="pf-rate-usd"
                      type="number"
                      min="0"
                      step="100"
                      className="pl-7"
                      placeholder="e.g. 3000"
                      value={form.client_rate_usd}
                      onChange={(e) => {
                        const usd = e.target.value;
                        setForm((f) => ({
                          ...f,
                          client_rate_usd: usd,
                          client_rate_ngn: usd && currentFxRate ? String(Number(usd) * currentFxRate) : f.client_rate_ngn,
                        }));
                      }}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="pf-rate-ngn" className="text-xs">NGN ({RATE_TYPE_LABELS[form.rate_type].toLowerCase()})</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">₦</span>
                    <Input
                      id="pf-rate-ngn"
                      type="number"
                      min="0"
                      step="1000"
                      className="pl-7"
                      placeholder={formNgnFromUsd ? formatNaira(formNgnFromUsd).replace('₦', '') : 'e.g. 500000'}
                      value={form.client_rate_usd && currentFxRate ? '' : form.client_rate_ngn}
                      disabled={!!(form.client_rate_usd && currentFxRate)}
                      onChange={(e) => setForm((f) => ({ ...f, client_rate_ngn: e.target.value }))}
                    />
                  </div>
                </div>
              </div>

              {form.client_rate_usd && currentFxRate && (
                <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <Zap className="h-3 w-3 text-primary" />
                  Auto-converted: {formatUsd(Number(form.client_rate_usd))} × {formatFxRate(currentFxRate)} = {formatNaira(Number(form.client_rate_usd) * currentFxRate)}
                </p>
              )}
              {!currentFxRate && (
                <p className="text-[11px] text-amber-600 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  No live FX rate available. Enter the NGN rate directly, or set up an FX rate first.
                </p>
              )}
            </div>

            {computedRate && (
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-1">
                <p className="text-xs font-medium text-primary">{RATE_TYPE_LABELS[form.rate_type]} Breakdown</p>
                {computedRate.hasUsd && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Client pays (USD)</span>
                    <span className="font-semibold">{formatUsd(computedRate.usd)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{computedRate.hasUsd ? 'Converted to NGN' : 'Client Rate (NGN)'}</span>
                  <span className="font-semibold">{formatNaira(computedRate.totalNgn)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">KD Commission ({form.commission_pct}%)</span>
                  <span className="font-semibold text-emerald-600">{formatNaira(computedRate.commission)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Employee Pay ({100 - Number(form.commission_pct)}%)</span>
                  <span className="font-semibold">{formatNaira(computedRate.employee)}</span>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="pf-start">Start Date</Label>
                <Input id="pf-start" type="date" value={form.start_date} onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pf-end">End Date (optional)</Label>
                <Input id="pf-end" type="date" value={form.end_date} onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pf-status">Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v as PlacementStatus }))}>
                <SelectTrigger id="pf-status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.entries(STATUS_LABELS) as [PlacementStatus, string][]).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pf-notes">Notes</Label>
              <Textarea id="pf-notes" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={3} placeholder="Additional details about this placement…" />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              {editing ? 'Save Changes' : 'Create Placement'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Payment Detail Dialog ─────────────────────────────────────────── */}
      <Dialog open={!!detailPlacement} onOpenChange={(open) => { if (!open) setDetailPlacement(null); }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Payment History — {detailPlacement?.employee_name}
            </DialogTitle>
          </DialogHeader>

          {detailPlacement && (
            <div className="space-y-4">
              <div className="rounded-lg border bg-muted/30 p-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs">Client</p>
                  <p className="font-medium">{detailPlacement.client_name}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Direction</p>
                  <p className="font-medium">{TYPE_SHORT[detailPlacement.placement_type]}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Commission</p>
                  <p className="font-medium">{detailPlacement.commission_pct}% — {formatNaira(detailPlacement.commission_ngn)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">{RATE_TYPE_LABELS[detailPlacement.rate_type || 'monthly']} Rate</p>
                  <p className="font-medium">
                    {detailPlacement.client_rate_usd != null && detailPlacement.client_rate_usd > 0
                      ? `${formatUsd(detailPlacement.client_rate_usd)} (${formatNaira(detailPlacement.client_rate_ngn)})`
                      : formatNaira(detailPlacement.client_rate_ngn)}
                    {detailPlacement.rate_type && detailPlacement.rate_type !== 'monthly' && (
                      <span className="text-muted-foreground text-xs">{RATE_SUFFIX[detailPlacement.rate_type]}</span>
                    )}
                  </p>
                </div>
              </div>

              {(detailPlacement.client_rate_usd != null && detailPlacement.client_rate_usd > 0) && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <ArrowRightLeft className="h-3.5 w-3.5" />
                  Current live FX: 1 USD = {formatFxRate(currentFxRate)}
                  <span className="text-muted-foreground/60">· Each payment locks its own rate at generation time</span>
                </div>
              )}

              <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground">
                  {payments.length} period{payments.length !== 1 ? 's' : ''}
                  {(() => {
                    const settled = payments.filter((pp) => pp.client_paid && pp.operator_paid).length;
                    const clientOnly = payments.filter((pp) => pp.client_paid && !pp.operator_paid).length;
                    const operatorOnly = payments.filter((pp) => !pp.client_paid && pp.operator_paid).length;
                    const unpaid = payments.filter((pp) => !pp.client_paid && !pp.operator_paid).length;
                    return (
                      <>
                        {settled > 0 && <> · <span className="text-emerald-600">{settled} settled</span></>}
                        {(clientOnly > 0 || operatorOnly > 0) && <> · <span className="text-amber-600">{clientOnly + operatorOnly} partial</span></>}
                        {unpaid > 0 && <> · <span className="text-red-600">{unpaid} unpaid</span></>}
                      </>
                    );
                  })()}
                </div>
                {isAdmin && (
                  <Button variant="outline" size="sm" onClick={generatePayments} disabled={generatingPayments}>
                    {generatingPayments ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <RotateCcw className="h-4 w-4 mr-1.5" />}
                    Generate Months
                  </Button>
                )}
              </div>

              {loadingPayments ? (
                <TableSkeleton />
              ) : payments.length === 0 ? (
                <EmptyState
                  icon={Calendar}
                  title="No payment records"
                  description="Click 'Generate Months' to create monthly payment rows for this placement's date range."
                />
              ) : (
                <>
                  <div className="hidden sm:block overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Period</TableHead>
                          <TableHead className="text-right">Gross</TableHead>
                          <TableHead className="text-right">Commission</TableHead>
                          <TableHead className="text-right">Operator Net</TableHead>
                          {detailPlacement?.rate_type === 'hourly' && <TableHead className="text-right">Hours</TableHead>}
                          {detailPlacement?.rate_type === 'daily' && <TableHead className="text-right">Days</TableHead>}
                          {detailPlacement?.client_rate_usd != null && detailPlacement.client_rate_usd > 0 && (
                            <TableHead className="text-right">FX Rate</TableHead>
                          )}
                          <TableHead className="text-center">Client Paid</TableHead>
                          <TableHead className="text-center">Operator Paid</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {payments.map((pp) => (
                          <TableRow key={pp.id}>
                            <TableCell className="font-medium">
                              {monthLabel(pp.month)}
                              {pp.period_start && pp.period_end && pp.period_start !== pp.month && (
                                <span className="block text-[10px] text-muted-foreground">
                                  {formatDate(pp.period_start)} – {formatDate(pp.period_end)}
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              {pp.gross_amount_usd != null && pp.gross_amount_usd > 0 ? (
                                <div>
                                  <span>{formatUsd(pp.gross_amount_usd)}</span>
                                  <span className="block text-[10px] text-muted-foreground">{formatNaira(pp.gross_amount_ngn)}</span>
                                </div>
                              ) : (
                                formatNaira(pp.gross_amount_ngn)
                              )}
                            </TableCell>
                            <TableCell className="text-right">{formatNaira(pp.commission_ngn)}</TableCell>
                            <TableCell className="text-right">{formatNaira(pp.net_employee_ngn)}</TableCell>
                            {detailPlacement?.rate_type === 'hourly' && (
                              <TableCell className="text-right">
                                {pp.hours_worked != null ? pp.hours_worked : <span className="text-muted-foreground text-xs">—</span>}
                              </TableCell>
                            )}
                            {detailPlacement?.rate_type === 'daily' && (
                              <TableCell className="text-right">
                                {pp.days_worked != null ? pp.days_worked : <span className="text-muted-foreground text-xs">—</span>}
                              </TableCell>
                            )}
                            {detailPlacement?.client_rate_usd != null && detailPlacement.client_rate_usd > 0 && (
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <span className="tabular-nums text-xs">{formatFxRate(pp.fx_rate_used)}</span>
                                  {isSuperAdmin && (
                                    <button
                                      className="text-muted-foreground hover:text-foreground"
                                      title="Edit FX rate"
                                      onClick={() => { setFxEditOpen(pp); setFxEditRate(String(pp.fx_rate_used ?? '')); setFxEditReason(''); }}
                                    >
                                      <Pencil className="h-3 w-3" />
                                    </button>
                                  )}
                                  {pp.fx_rate_edit_reason && (
                                    <span title={`Edited: ${pp.fx_rate_edit_reason}`} className="text-amber-500">
                                      <AlertTriangle className="h-3 w-3" />
                                    </span>
                                  )}
                                </div>
                              </TableCell>
                            )}
                            <TableCell className="text-center">
                              {pp.client_paid ? (
                                <button
                                  className="inline-flex items-center gap-1 text-xs text-emerald-600 hover:underline"
                                  onClick={() => isAdmin && toggleClientPaid(pp.id, false)}
                                  title={pp.client_paid_ref ? `Ref: ${pp.client_paid_ref}` : pp.client_paid_at ? `Paid ${formatDate(pp.client_paid_at)}` : 'Paid'}
                                >
                                  <CheckCircle2 className="h-3.5 w-3.5" /> Paid
                                </button>
                              ) : isAdmin ? (
                                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => toggleClientPaid(pp.id, true)}>
                                  Mark Paid
                                </Button>
                              ) : (
                                <span className="text-xs text-amber-600">Unpaid</span>
                              )}
                            </TableCell>
                            <TableCell className="text-center">
                              {pp.operator_paid ? (
                                <button
                                  className="inline-flex items-center gap-1 text-xs text-emerald-600 hover:underline"
                                  onClick={() => isAdmin && toggleOperatorPaid(pp.id, false)}
                                  title={pp.operator_paid_ref ? `Ref: ${pp.operator_paid_ref}` : pp.operator_paid_at ? `Paid ${formatDate(pp.operator_paid_at)}` : 'Paid'}
                                >
                                  <CheckCircle2 className="h-3.5 w-3.5" /> Paid
                                </button>
                              ) : isAdmin ? (
                                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => toggleOperatorPaid(pp.id, true)}>
                                  Mark Paid
                                </Button>
                              ) : (
                                <span className="text-xs text-amber-600">Unpaid</span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  <div className="sm:hidden space-y-2">
                    {payments.map((pp) => (
                      <MobileCard key={pp.id}>
                        <MobileCardHeader>
                          <MobileCardTitle>{monthLabel(pp.month)}</MobileCardTitle>
                          <MobileCardMeta>
                            {pp.client_paid && pp.operator_paid ? (
                              <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-600">Settled</Badge>
                            ) : pp.client_paid || pp.operator_paid ? (
                              <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-600">Partial</Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px] bg-red-500/10 text-red-600">Unpaid</Badge>
                            )}
                          </MobileCardMeta>
                        </MobileCardHeader>
                        <MobileCardRow label="Gross">
                          {pp.gross_amount_usd != null && pp.gross_amount_usd > 0
                            ? `${formatUsd(pp.gross_amount_usd)} (${formatNaira(pp.gross_amount_ngn)})`
                            : formatNaira(pp.gross_amount_ngn)}
                        </MobileCardRow>
                        <MobileCardRow label="Commission">{formatNaira(pp.commission_ngn)}</MobileCardRow>
                        <MobileCardRow label="Operator Net">{formatNaira(pp.net_employee_ngn)}</MobileCardRow>
                        {pp.hours_worked != null && <MobileCardRow label="Hours">{pp.hours_worked}</MobileCardRow>}
                        {pp.days_worked != null && <MobileCardRow label="Days">{pp.days_worked}</MobileCardRow>}
                        {pp.fx_rate_used != null && (
                          <MobileCardRow label="FX Rate">
                            <span className="tabular-nums">{formatFxRate(pp.fx_rate_used)}</span>
                            {pp.fx_rate_edit_reason && <span className="text-amber-500 ml-1" title={pp.fx_rate_edit_reason}>edited</span>}
                            {isSuperAdmin && (
                              <button
                                className="text-muted-foreground hover:text-foreground ml-1"
                                onClick={() => { setFxEditOpen(pp); setFxEditRate(String(pp.fx_rate_used ?? '')); setFxEditReason(''); }}
                              >
                                <Pencil className="h-3 w-3 inline" />
                              </button>
                            )}
                          </MobileCardRow>
                        )}
                        <MobileCardRow label="Client Paid">
                          {pp.client_paid
                            ? <span className="text-emerald-600">Yes{pp.client_paid_at ? ` — ${formatDate(pp.client_paid_at)}` : ''}</span>
                            : <span className="text-amber-600">No</span>}
                        </MobileCardRow>
                        <MobileCardRow label="Operator Paid">
                          {pp.operator_paid
                            ? <span className="text-emerald-600">Yes{pp.operator_paid_at ? ` — ${formatDate(pp.operator_paid_at)}` : ''}</span>
                            : <span className="text-amber-600">No</span>}
                        </MobileCardRow>
                        {isAdmin && (
                          <MobileCardFooter>
                            {!pp.client_paid && (
                              <Button size="sm" className="h-8 text-xs flex-1" onClick={() => toggleClientPaid(pp.id, true)}>
                                Client Paid
                              </Button>
                            )}
                            {!pp.operator_paid && (
                              <Button size="sm" variant="outline" className="h-8 text-xs flex-1" onClick={() => toggleOperatorPaid(pp.id, true)}>
                                Operator Paid
                              </Button>
                            )}
                          </MobileCardFooter>
                        )}
                      </MobileCard>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* FX Rate Edit Dialog (super_admin only) */}
      <Dialog open={!!fxEditOpen} onOpenChange={(open) => { if (!open) { setFxEditOpen(null); setFxEditRate(''); setFxEditReason(''); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-amber-500" />
              Edit Locked FX Rate
            </DialogTitle>
          </DialogHeader>
          {fxEditOpen && (
            <div className="space-y-4">
              <div className="rounded-lg border bg-muted/30 p-3 text-sm space-y-1">
                <p><span className="text-muted-foreground">Period:</span> {monthLabel(fxEditOpen.month)}</p>
                <p><span className="text-muted-foreground">Current rate:</span> {formatFxRate(fxEditOpen.fx_rate_used)}</p>
                <p><span className="text-muted-foreground">Gross (USD):</span> {formatUsd(fxEditOpen.gross_amount_usd)}</p>
                <p><span className="text-muted-foreground">Gross (NGN):</span> {formatNaira(fxEditOpen.gross_amount_ngn)}</p>
                {fxEditOpen.fx_rate_edit_reason && (
                  <p className="text-amber-600 text-xs">Previously edited: {fxEditOpen.fx_rate_edit_reason}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fx-edit-rate">New FX Rate (₦ per $1)</Label>
                <Input
                  id="fx-edit-rate"
                  inputMode="decimal"
                  placeholder="e.g. 1650.00"
                  value={fxEditRate}
                  onChange={(e) => setFxEditRate(e.target.value)}
                  className="tabular-nums"
                />
                {fxEditRate && parseFloat(fxEditRate) > 0 && fxEditOpen.gross_amount_usd != null && fxEditOpen.gross_amount_usd > 0 && (
                  <p className="text-xs text-muted-foreground">
                    New gross: {formatNaira(fxEditOpen.gross_amount_usd * parseFloat(fxEditRate))}
                    {fxEditOpen.fx_rate_used != null && (
                      <span className={parseFloat(fxEditRate) > fxEditOpen.fx_rate_used ? ' text-amber-600' : parseFloat(fxEditRate) < fxEditOpen.fx_rate_used ? ' text-emerald-600' : ''}>
                        {' '}({((parseFloat(fxEditRate) - fxEditOpen.fx_rate_used) / fxEditOpen.fx_rate_used * 100).toFixed(1)}% change)
                      </span>
                    )}
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fx-edit-reason">Reason for change (required)</Label>
                <Textarea
                  id="fx-edit-reason"
                  placeholder="e.g. Correcting rate to match actual transfer rate for this period"
                  value={fxEditReason}
                  onChange={(e) => setFxEditReason(e.target.value)}
                  rows={2}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setFxEditOpen(null); setFxEditRate(''); setFxEditReason(''); }}>
              Cancel
            </Button>
            <Button
              disabled={fxEditSaving || !fxEditRate || !fxEditReason.trim() || !(parseFloat(fxEditRate.replace(/,/g, '')) > 0)}
              onClick={() => {
                if (!fxEditOpen || !detailPlacement) return;
                editPaymentFxRate(
                  fxEditOpen.id,
                  parseFloat(fxEditRate.replace(/,/g, '')),
                  fxEditReason.trim(),
                  fxEditOpen.gross_amount_usd,
                  detailPlacement.commission_pct,
                );
              }}
            >
              {fxEditSaving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
              Save Rate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default Placements;
