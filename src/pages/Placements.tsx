import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Briefcase, Plus, Search, Download, Pencil, Trash2, Loader2,
  Calendar, DollarSign, Users, CheckCircle2, Clock, AlertCircle,
  Eye, RotateCcw, TrendingUp, Building2, BarChart3, PieChart as PieIcon,
  AlertTriangle, ArrowUpRight, Percent,
} from 'lucide-react';
import {
  BarChart, Bar, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
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

interface Placement {
  id: string;
  employee_id: string;
  client_id: string;
  placement_type: PlacementType;
  commission_pct: number;
  placement_category: PlacementCategory;
  client_rate_ngn: number;
  employee_rate_ngn: number;
  commission_ngn: number;
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
  commission_ngn: number;
  net_employee_ngn: number;
  status: PaymentStatus;
  auto_verified: boolean;
  paid_at: string | null;
  verified_by: string | null;
  verified_at: string | null;
  notes: string | null;
  created_at: string;
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

// ── Component ────────────────────────────────────────────────────────────────

function Placements() {
  usePageTitle('Placements');
  const { profile } = useAuthStore();
  const { toast } = useToast();
  const isAdmin = hasRole(profile?.role, ['super_admin', 'admin']);

  const [activeTab, setActiveTab] = useState('overview');

  // ── Data ──
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [allPayments, setAllPayments] = useState<(PlacementPayment & { employee_name?: string; client_name?: string; placement_type?: PlacementType })[]>([]);
  const [loadingAllPayments, setLoadingAllPayments] = useState(false);

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

  // ── Fetch ──
  const fetchPlacements = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('placements')
      .select(`
        *,
        profiles!placements_employee_id_fkey ( full_name ),
        clients!placements_client_id_fkey ( name )
      `)
      .order('created_at', { ascending: false });

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
        *,
        placements!inner (
          employee_id, client_id, placement_type,
          profiles!placements_employee_id_fkey ( full_name ),
          clients!placements_client_id_fkey ( name )
        )
      `)
      .order('month', { ascending: false });

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

  useEffect(() => { fetchPlacements(); fetchLookups(); fetchAllPayments(); }, [fetchPlacements, fetchLookups, fetchAllPayments]);

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
    const kdReceives = active.filter((p) => p.placement_type === 'kd_receives').length;
    const empReceives = active.filter((p) => p.placement_type === 'employee_receives').length;
    const avgCommission = active.length > 0 ? active.reduce((s, p) => s + p.commission_pct, 0) / active.length : 0;

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

    return {
      active: active.length, total: placements.length, totalRevenue, totalPayout, totalGross,
      kdReceives, empReceives, avgCommission, totalCollected, totalOutstanding,
      collectionRate, paidCount: paidPayments.length, pendingCount: pendingPayments.length,
      overdueCount: overduePayments.length, expiringPlacements,
    };
  }, [placements, allPayments]);

  // ── Chart data ──
  const chartData = useMemo(() => {
    // Revenue by month (last 12 months)
    const monthMap = new Map<string, { month: string; commission: number; payout: number; gross: number; paid: number; pending: number }>();
    allPayments.forEach((pp) => {
      const m = pp.month.slice(0, 7);
      const existing = monthMap.get(m) || { month: m, commission: 0, payout: 0, gross: 0, paid: 0, pending: 0 };
      existing.commission += pp.commission_ngn;
      existing.payout += pp.net_employee_ngn;
      existing.gross += pp.gross_amount_ngn;
      if (pp.status === 'paid') existing.paid += 1;
      else existing.pending += 1;
      monthMap.set(m, existing);
    });
    const revenueByMonth = Array.from(monthMap.values())
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-12)
      .map((d) => ({ ...d, label: shortMonth(d.month + '-01') }));

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
    const clientMap = new Map<string, { name: string; revenue: number; count: number }>();
    placements.filter((p) => p.status === 'active').forEach((p) => {
      const existing = clientMap.get(p.client_id) || { name: p.client_name || 'Unknown', revenue: 0, count: 0 };
      existing.revenue += p.commission_ngn ?? 0;
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

    return { revenueByMonth, byCategory, byClient, topEarners, directionSplit, paymentDist };
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
      client_rate_ngn: String(p.client_rate_ngn),
      start_date: p.start_date,
      end_date: p.end_date ?? '',
      status: p.status,
      notes: p.notes ?? '',
    });
    setShowForm(true);
  }

  async function handleSubmit() {
    if (!form.employee_id || !form.client_id || !form.client_rate_ngn || !form.start_date) {
      toast({ title: 'Missing fields', description: 'Employee, client, rate, and start date are required.', variant: 'destructive' });
      return;
    }
    const pct = Number(form.commission_pct);
    if (isNaN(pct) || pct <= 0 || pct > 100) {
      toast({ title: 'Invalid commission', description: 'Commission must be between 1 and 100.', variant: 'destructive' });
      return;
    }
    const rate = Number(form.client_rate_ngn);
    if (isNaN(rate) || rate < 0) {
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
      client_rate_ngn: rate,
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
      .select('*')
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
      .select('*')
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

  // ── Export ──
  function exportCsv() {
    const rows = filtered.map((p) => ({
      Employee: p.employee_name,
      Client: p.client_name,
      Category: CATEGORY_LABELS[p.placement_category],
      'Payment Direction': TYPE_SHORT[p.placement_type],
      'Commission %': p.commission_pct,
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
      'Gross (NGN)': pp.gross_amount_ngn,
      'Commission (NGN)': pp.commission_ngn,
      'Employee Net (NGN)': pp.net_employee_ngn,
      Status: pp.status,
      'Auto Verified': pp.auto_verified ? 'Yes' : 'No',
      'Paid At': pp.paid_at ? formatDate(pp.paid_at) : '',
    }));
    downloadCsv(toCsv(rows), 'placement-payments-export.csv');
    toast({ title: 'Exported', description: `${rows.length} payment records exported.` });
  }

  // ── Computed ──
  const computedRate = useMemo(() => {
    const rate = Number(form.client_rate_ngn);
    const pct = Number(form.commission_pct);
    if (isNaN(rate) || isNaN(pct) || rate <= 0) return null;
    return {
      commission: rate * (pct / 100),
      employee: rate * (1 - pct / 100),
    };
  }, [form.client_rate_ngn, form.commission_pct]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Hero */}
      <AuroraHero className="p-5 sm:p-6" pattern="constellation">
        <PageHeader
          title="Placements"
          description="Track employee deployments, commissions, and payment collections"
          icon={Briefcase}
          actions={
            <div className="flex items-center gap-2">
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
            <StatCard title="Monthly Revenue" value={formatNaira(stats.totalGross)} icon={DollarSign} tone="gold" subtitle="Gross client billing" />
            <StatCard title="KD Commission" value={formatNaira(stats.totalRevenue)} icon={TrendingUp} tone="success" subtitle={`Avg ${stats.avgCommission.toFixed(0)}% rate`} />
            <StatCard title="Employee Payouts" value={formatNaira(stats.totalPayout)} icon={Briefcase} tone="primary" subtitle="Monthly total" />
            <StatCard title="Collected" value={formatNaira(stats.totalCollected)} icon={CheckCircle2} tone="success" subtitle={`${stats.collectionRate.toFixed(0)}% rate`} onClick={() => setActiveTab('payments')} />
            <StatCard title="Outstanding" value={formatNaira(stats.totalOutstanding)} icon={Clock} tone={stats.totalOutstanding > 0 ? 'warning' : 'default'} subtitle={`${stats.pendingCount} pending`} onClick={() => setActiveTab('payments')} />
          </div>

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
                          <TableCell className="text-right">{formatNaira(p.client_rate_ngn)}</TableCell>
                          <TableCell className="text-right">{formatNaira(p.employee_rate_ngn)}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {formatDate(p.start_date)} — {p.end_date ? formatDate(p.end_date) : 'Ongoing'}
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={p.status} />
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Button variant="ghost" size="icon" onClick={() => openPayments(p)} title="View payments">
                                <Eye className="h-4 w-4" />
                              </Button>
                              {isAdmin && (
                                <>
                                  <Button variant="ghost" size="icon" onClick={() => openEdit(p)} title="Edit">
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  <Button variant="ghost" size="icon" onClick={() => handleDelete(p)} title="Delete">
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
                      <MobileCardRow label="Client Rate">{formatNaira(p.client_rate_ngn)}/mo</MobileCardRow>
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
                        <TableHead className="text-right">Employee Net</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Verified</TableHead>
                        {isAdmin && <TableHead className="text-right">Action</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paymentPagination.slice.map((pp) => (
                        <TableRow key={pp.id}>
                          <TableCell className="font-medium">{monthLabel(pp.month)}</TableCell>
                          <TableCell>{pp.employee_name}</TableCell>
                          <TableCell>{pp.client_name}</TableCell>
                          <TableCell className="text-xs">{pp.placement_type ? TYPE_SHORT[pp.placement_type] : '—'}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatNaira(pp.gross_amount_ngn)}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatNaira(pp.commission_ngn)}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatNaira(pp.net_employee_ngn)}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={PAYMENT_STATUS_TONE[pp.status as PaymentStatus]}>
                              {pp.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {pp.auto_verified ? (
                              <span className="text-emerald-600 flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Auto</span>
                            ) : pp.verified_at ? (
                              <span className="text-emerald-600">{formatDate(pp.verified_at)}</span>
                            ) : (
                              <span className="text-amber-600 flex items-center gap-1"><AlertCircle className="h-3 w-3" /> Unverified</span>
                            )}
                          </TableCell>
                          {isAdmin && (
                            <TableCell className="text-right">
                              {pp.status !== 'paid' && (
                                <Button variant="ghost" size="sm" className="h-7 text-xs text-emerald-600" onClick={() => markPaymentStatus(pp.id, 'paid')}>
                                  <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Mark Paid
                                </Button>
                              )}
                              {pp.status === 'paid' && (
                                <Button variant="ghost" size="sm" className="h-7 text-xs text-amber-600" onClick={() => markPaymentStatus(pp.id, 'pending')}>
                                  Revert
                                </Button>
                              )}
                            </TableCell>
                          )}
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
                      <MobileCardRow label="Gross">{formatNaira(pp.gross_amount_ngn)}</MobileCardRow>
                      <MobileCardRow label="Commission">{formatNaira(pp.commission_ngn)}</MobileCardRow>
                      <MobileCardRow label="Employee Net">{formatNaira(pp.net_employee_ngn)}</MobileCardRow>
                      <MobileCardRow label="Verified">
                        {pp.auto_verified ? 'Auto-verified' : pp.verified_at ? formatDate(pp.verified_at) : 'Unverified'}
                      </MobileCardRow>
                      {isAdmin && pp.status !== 'paid' && (
                        <MobileCardFooter>
                          <Button size="sm" className="h-8 text-xs" onClick={() => markPaymentStatus(pp.id, 'paid')}>
                            <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Mark Paid
                          </Button>
                        </MobileCardFooter>
                      )}
                      {isAdmin && pp.status === 'paid' && (
                        <MobileCardFooter>
                          <Button variant="ghost" size="sm" className="h-8 text-xs text-amber-600" onClick={() => markPaymentStatus(pp.id, 'pending')}>
                            Revert to Pending
                          </Button>
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
                          <TableCell className="text-right font-semibold tabular-nums">{formatNaira(c.revenue)}</TableCell>
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
                <Label htmlFor="pf-pct">Commission %</Label>
                <div className="relative">
                  <Input id="pf-pct" type="number" min="1" max="100" value={form.commission_pct} onChange={(e) => setForm((f) => ({ ...f, commission_pct: e.target.value }))} />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pf-rate">Client Rate (monthly)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">₦</span>
                  <Input id="pf-rate" type="number" min="0" step="1000" className="pl-7" value={form.client_rate_ngn} onChange={(e) => setForm((f) => ({ ...f, client_rate_ngn: e.target.value }))} />
                </div>
              </div>
            </div>

            {computedRate && (
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-1">
                <p className="text-xs font-medium text-primary">Monthly Breakdown</p>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">KD Commission ({form.commission_pct}%)</span>
                  <span className="font-semibold">{formatNaira(computedRate.commission)}</span>
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
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
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
                  <p className="text-muted-foreground text-xs">Monthly Rate</p>
                  <p className="font-medium">{formatNaira(detailPlacement.client_rate_ngn)}</p>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground">
                  {payments.length} payment record{payments.length !== 1 ? 's' : ''}
                  {payments.filter((pp) => pp.status === 'paid').length > 0 && (
                    <> · <span className="text-emerald-600">{payments.filter((pp) => pp.status === 'paid').length} paid</span></>
                  )}
                  {payments.filter((pp) => pp.status === 'pending').length > 0 && (
                    <> · <span className="text-amber-600">{payments.filter((pp) => pp.status === 'pending').length} pending</span></>
                  )}
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
                          <TableHead>Month</TableHead>
                          <TableHead className="text-right">Gross</TableHead>
                          <TableHead className="text-right">Commission</TableHead>
                          <TableHead className="text-right">Employee Net</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Verified</TableHead>
                          {isAdmin && <TableHead className="text-right">Action</TableHead>}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {payments.map((pp) => (
                          <TableRow key={pp.id}>
                            <TableCell className="font-medium">{monthLabel(pp.month)}</TableCell>
                            <TableCell className="text-right">{formatNaira(pp.gross_amount_ngn)}</TableCell>
                            <TableCell className="text-right">{formatNaira(pp.commission_ngn)}</TableCell>
                            <TableCell className="text-right">{formatNaira(pp.net_employee_ngn)}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className={PAYMENT_STATUS_TONE[pp.status as PaymentStatus]}>{pp.status}</Badge>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {pp.auto_verified ? (
                                <span className="text-emerald-600 flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Auto</span>
                              ) : pp.verified_at ? (
                                <span className="text-emerald-600">{formatDate(pp.verified_at)}</span>
                              ) : (
                                <span className="text-amber-600 flex items-center gap-1"><AlertCircle className="h-3 w-3" /> Unverified</span>
                              )}
                            </TableCell>
                            {isAdmin && (
                              <TableCell className="text-right">
                                {pp.status !== 'paid' && (
                                  <Button variant="ghost" size="sm" className="h-7 text-xs text-emerald-600" onClick={() => markPaymentStatus(pp.id, 'paid')}>
                                    <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Mark Paid
                                  </Button>
                                )}
                                {pp.status === 'paid' && (
                                  <Button variant="ghost" size="sm" className="h-7 text-xs text-amber-600" onClick={() => markPaymentStatus(pp.id, 'pending')}>
                                    Revert
                                  </Button>
                                )}
                              </TableCell>
                            )}
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
                            <Badge variant="outline" className={`text-[10px] ${PAYMENT_STATUS_TONE[pp.status as PaymentStatus]}`}>{pp.status}</Badge>
                          </MobileCardMeta>
                        </MobileCardHeader>
                        <MobileCardRow label="Gross">{formatNaira(pp.gross_amount_ngn)}</MobileCardRow>
                        <MobileCardRow label="Commission">{formatNaira(pp.commission_ngn)}</MobileCardRow>
                        <MobileCardRow label="Employee Net">{formatNaira(pp.net_employee_ngn)}</MobileCardRow>
                        <MobileCardRow label="Verified">
                          {pp.auto_verified ? 'Auto-verified' : pp.verified_at ? formatDate(pp.verified_at) : 'Unverified'}
                        </MobileCardRow>
                        {isAdmin && pp.status !== 'paid' && (
                          <MobileCardFooter>
                            <Button size="sm" className="h-8 text-xs" onClick={() => markPaymentStatus(pp.id, 'paid')}>
                              <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Mark Paid
                            </Button>
                          </MobileCardFooter>
                        )}
                        {isAdmin && pp.status === 'paid' && (
                          <MobileCardFooter>
                            <Button variant="ghost" size="sm" className="h-8 text-xs text-amber-600" onClick={() => markPaymentStatus(pp.id, 'pending')}>
                              Revert to Pending
                            </Button>
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
    </div>
  );
}

export default Placements;
