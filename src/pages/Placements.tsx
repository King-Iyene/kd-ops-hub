import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Briefcase, Plus, Search, Download, Pencil, Trash2, Loader2,
  ChevronDown, ChevronUp, Calendar, DollarSign, Users, CheckCircle2,
  Clock, AlertCircle, Eye, RotateCcw, Filter,
} from 'lucide-react';
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
import { PageHeader } from '@/components/ui-kit/PageHeader';
import { AuroraHero } from '@/components/AuroraHero';
import { StatCard } from '@/components/ui-kit/StatCard';
import { TableSkeleton } from '@/components/ui-kit/TableSkeleton';
import { EmptyState } from '@/components/ui-kit/EmptyState';
import { Pagination } from '@/components/ui-kit/Pagination';
import { MobileCard, MobileCardHeader, MobileCardTitle, MobileCardMeta, MobileCardRow, MobileCardFooter } from '@/components/ui-kit/MobileCard';
import { StatusBadge } from '@/components/ui-kit/StatusBadge';

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
  // joined
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
  security: 'Security',
  cleaning: 'Cleaning',
  logistics: 'Logistics',
  technical: 'Technical',
  administrative: 'Administrative',
  hospitality: 'Hospitality',
  maintenance: 'Maintenance',
  general: 'General',
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
  active: 'Active',
  completed: 'Completed',
  suspended: 'Suspended',
  pending: 'Pending',
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

// ── Component ────────────────────────────────────────────────────────────────

function Placements() {
  usePageTitle('Placements');
  const { profile } = useAuthStore();
  const { toast } = useToast();
  const isAdmin = hasRole(profile?.role, ['super_admin', 'admin']);

  // ── Data ──
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);

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

  useEffect(() => { fetchPlacements(); fetchLookups(); }, [fetchPlacements, fetchLookups]);

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
    const kdReceives = active.filter((p) => p.placement_type === 'kd_receives').length;
    const empReceives = active.filter((p) => p.placement_type === 'employee_receives').length;
    return { active: active.length, totalRevenue, totalPayout, kdReceives, empReceives, total: placements.length };
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
        // Auto-generate payment rows
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
    // Refresh
    const { data: fresh } = await supabase
      .from('placement_payments')
      .select('*')
      .eq('placement_id', detailPlacement.id)
      .order('month', { ascending: false });
    setPayments((fresh as PlacementPayment[]) || []);
    setGeneratingPayments(false);
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
    <div className="space-y-6">
      {/* Hero */}
      <AuroraHero className="p-5 sm:p-6" pattern="constellation">
        <PageHeader
          title="Placements"
          subtitle="Manage employee deployments at client sites"
          icon={Briefcase}
        >
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={filtered.length === 0}>
              <Download className="h-4 w-4 mr-1.5" /> Export
            </Button>
            {isAdmin && (
              <Button size="sm" onClick={openCreate}>
                <Plus className="h-4 w-4 mr-1.5" /> New Placement
              </Button>
            )}
          </div>
        </PageHeader>
      </AuroraHero>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard label="Active Placements" value={stats.active} icon={Users} />
        <StatCard label="Monthly Commission" value={formatNaira(stats.totalRevenue)} icon={DollarSign} />
        <StatCard label="Monthly Payouts" value={formatNaira(stats.totalPayout)} icon={Briefcase} />
        <StatCard label="KD Receives" value={stats.kdReceives} icon={CheckCircle2} />
        <StatCard label="Employee Receives" value={stats.empReceives} icon={Clock} />
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
            <SelectTrigger className="w-[130px] h-9 text-xs">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              {(Object.entries(STATUS_LABELS) as [PlacementStatus, string][]).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="w-[140px] h-9 text-xs">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {(Object.entries(CATEGORY_LABELS) as [PlacementCategory, string][]).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-[160px] h-9 text-xs hidden sm:flex">
              <SelectValue placeholder="Direction" />
            </SelectTrigger>
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

      {/* ── Create / Edit Dialog ──────────────────────────────────────────── */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Placement' : 'New Placement'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Employee */}
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

            {/* Client */}
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

            {/* Category */}
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

            {/* Payment Direction */}
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

            {/* Commission & Rate */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="pf-pct">Commission %</Label>
                <div className="relative">
                  <Input
                    id="pf-pct"
                    type="number"
                    min="1"
                    max="100"
                    value={form.commission_pct}
                    onChange={(e) => setForm((f) => ({ ...f, commission_pct: e.target.value }))}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pf-rate">Client Rate (monthly)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">₦</span>
                  <Input
                    id="pf-rate"
                    type="number"
                    min="0"
                    step="1000"
                    className="pl-7"
                    value={form.client_rate_ngn}
                    onChange={(e) => setForm((f) => ({ ...f, client_rate_ngn: e.target.value }))}
                  />
                </div>
              </div>
            </div>

            {/* Live calculation */}
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

            {/* Dates */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="pf-start">Start Date</Label>
                <Input
                  id="pf-start"
                  type="date"
                  value={form.start_date}
                  onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pf-end">End Date (optional)</Label>
                <Input
                  id="pf-end"
                  type="date"
                  value={form.end_date}
                  onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))}
                />
              </div>
            </div>

            {/* Status */}
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

            {/* Notes */}
            <div className="space-y-1.5">
              <Label htmlFor="pf-notes">Notes</Label>
              <Textarea
                id="pf-notes"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                rows={3}
                placeholder="Additional details about this placement…"
              />
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
              {/* Placement summary */}
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

              {/* Actions */}
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

              {/* Payments table */}
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
                  {/* Desktop */}
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
                            <TableCell className="font-medium">
                              {new Date(pp.month + 'T00:00:00').toLocaleDateString('en-NG', { year: 'numeric', month: 'short' })}
                            </TableCell>
                            <TableCell className="text-right">{formatNaira(pp.gross_amount_ngn)}</TableCell>
                            <TableCell className="text-right">{formatNaira(pp.commission_ngn)}</TableCell>
                            <TableCell className="text-right">{formatNaira(pp.net_employee_ngn)}</TableCell>
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
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 text-xs text-emerald-600"
                                    onClick={() => markPaymentStatus(pp.id, 'paid')}
                                  >
                                    <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Mark Paid
                                  </Button>
                                )}
                                {pp.status === 'paid' && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 text-xs text-amber-600"
                                    onClick={() => markPaymentStatus(pp.id, 'pending')}
                                  >
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
                  <div className="sm:hidden space-y-2">
                    {payments.map((pp) => (
                      <MobileCard key={pp.id}>
                        <MobileCardHeader>
                          <MobileCardTitle>
                            {new Date(pp.month + 'T00:00:00').toLocaleDateString('en-NG', { year: 'numeric', month: 'short' })}
                          </MobileCardTitle>
                          <MobileCardMeta>
                            <Badge variant="outline" className={`text-[10px] ${PAYMENT_STATUS_TONE[pp.status as PaymentStatus]}`}>
                              {pp.status}
                            </Badge>
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
