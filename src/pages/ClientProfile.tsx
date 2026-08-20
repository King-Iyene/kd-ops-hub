import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Mail, Phone, Globe, MapPin, Save, Loader2, Trash2,
  Building2, CalendarDays, DollarSign, Users, TrendingUp, TrendingDown,
  Briefcase, CheckCircle2, Clock, AlertTriangle, BarChart3,
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  ResponsiveContainer, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { PageBreadcrumbs } from '@/components/ui-kit/PageBreadcrumbs';
import { logAudit } from '@/lib/audit';
import { MANAGER_ROLES, hasRole } from '@/lib/roles';
import { formatDate, formatNaira } from '@/lib/format';
import { safeHref } from '@/lib/safe-href';
import { StatCard } from '@/components/ui-kit/StatCard';
import { chartTheme, chartPalette, ChartGradients, GlassTooltip, axisTick, chartAnim, fmtNairaTick } from '@/components/ChartKit';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { EmptyState } from '@/components/ui-kit/EmptyState';
import { useToast } from '@/hooks/use-toast';
import { usePageTitle } from '@/hooks/usePageTitle';
import { cn } from '@/lib/utils';

type ClientStatus = 'active' | 'inactive' | 'prospect';

interface ClientData {
  id: string;
  name: string;
  industry: string | null;
  status: ClientStatus;
  contract_value_ngn: number | null;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  address: string | null;
  start_date: string | null;
  notes: string | null;
  created_at: string;
}

interface Placement {
  id: string;
  employee_id: string;
  client_rate_ngn: number;
  employee_rate_ngn: number;
  commission_ngn: number;
  commission_pct: number;
  placement_type: string;
  placement_category: string;
  status: string;
  start_date: string;
  end_date: string | null;
  profiles: { full_name: string; email: string; photo_url: string | null } | null;
}

interface PlacementPayment {
  id: string;
  placement_id: string;
  month: string;
  gross_amount_ngn: number;
  commission_ngn: number;
  net_employee_ngn: number;
  status: string;
  paid_at: string | null;
}

const STATUS_TONE: Record<ClientStatus, string> = {
  active: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-400',
  inactive: 'bg-muted text-muted-foreground',
  prospect: 'bg-blue-100 text-blue-800 dark:bg-blue-500/10 dark:text-blue-400',
};

const PLACEMENT_STATUS_BADGE: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-400',
  completed: 'bg-slate-100 text-slate-600 dark:bg-slate-500/10 dark:text-slate-400',
  suspended: 'bg-amber-100 text-amber-800 dark:bg-amber-500/10 dark:text-amber-400',
  pending: 'bg-blue-100 text-blue-800 dark:bg-blue-500/10 dark:text-blue-400',
};

const PAYMENT_STATUS_BADGE: Record<string, string> = {
  paid: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-400',
  pending: 'bg-amber-100 text-amber-800 dark:bg-amber-500/10 dark:text-amber-400',
  overdue: 'bg-rose-100 text-rose-800 dark:bg-rose-500/10 dark:text-rose-400',
  partial: 'bg-blue-100 text-blue-800 dark:bg-blue-500/10 dark:text-blue-400',
  waived: 'bg-slate-100 text-slate-600 dark:bg-slate-500/10 dark:text-slate-400',
};

const CATEGORY_LABELS: Record<string, string> = {
  security: 'Security', cleaning: 'Cleaning', logistics: 'Logistics',
  technical: 'Technical', administrative: 'Administrative',
  hospitality: 'Hospitality', maintenance: 'Maintenance', general: 'General',
};

const INDUSTRIES = [
  'Technology', 'Finance & Banking', 'Healthcare', 'Education',
  'Retail & E-commerce', 'Manufacturing', 'Construction', 'Agriculture',
  'Media & Entertainment', 'Logistics & Transport', 'Energy & Utilities',
  'Government & NGO', 'Real Estate', 'Food & Beverage', 'Other',
];

const ClientProfile = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { profile } = useAuthStore();
  usePageTitle('Client Profile');

  const [client, setClient] = useState<ClientData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Partial<ClientData>>({});
  const [noteText, setNoteText] = useState('');
  const [pendingDelete, setPendingDelete] = useState(false);
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [payments, setPayments] = useState<PlacementPayment[]>([]);

  const canManage = hasRole(profile?.role, MANAGER_ROLES);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('clients')
      .select('name, industry, status, contract_value_ngn, contact_person, email, phone, website, address, start_date, notes, created_at')
      .eq('id', id)
      .is('deleted_at', null)
      .single();
    if (error || !data) {
      const msg = error?.message || '';
      if (/schema cache|does not exist|public\.clients/i.test(msg)) {
        toast({
          title: 'Database not ready',
          description: 'The Clients table has not been deployed. Ask an admin to run "supabase db push".',
          variant: 'destructive',
        });
      } else {
        toast({ title: 'Client not found', variant: 'destructive' });
      }
      navigate('/clients');
      return;
    }
    setClient(data as ClientData);
    setForm(data as ClientData);

    const [placementsRes, paymentsRes] = await Promise.all([
      supabase
        .from('placements')
        .select('id, employee_id, client_rate_ngn, employee_rate_ngn, commission_ngn, commission_pct, placement_type, placement_category, status, start_date, end_date, profiles!employee_id(full_name, email, photo_url)')
        .eq('client_id', id)
        .order('start_date', { ascending: false }),
      supabase
        .from('placement_payments')
        .select('id, placement_id, month, gross_amount_ngn, commission_ngn, net_employee_ngn, status, paid_at')
        .in('placement_id', (await supabase.from('placements').select('id').eq('client_id', id)).data?.map((p: any) => p.id) || [])
        .order('month', { ascending: false }).limit(2000),
    ]);

    setPlacements((placementsRes.data as any[]) || []);
    setPayments((paymentsRes.data as PlacementPayment[]) || []);
    setLoading(false);
  }, [id, navigate, toast]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!id || !form.name?.trim()) return;
    setSaving(true);
    const { error } = await supabase.from('clients').update({
      name: form.name.trim(),
      industry: form.industry || null,
      status: form.status,
      contract_value_ngn: Number(form.contract_value_ngn) || 0,
      contact_person: form.contact_person?.trim() || null,
      email: form.email?.trim() || null,
      phone: form.phone?.trim() || null,
      website: form.website?.trim() || null,
      address: form.address?.trim() || null,
      start_date: form.start_date || null,
    }).eq('id', id);
    if (error) {
      toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
    } else {
      await logAudit('client_updated', `Client "${form.name}" updated`, profile);
      toast({ title: 'Client saved' });
      load();
    }
    setSaving(false);
  };

  const addNote = async () => {
    if (!id || !noteText.trim() || saving) return;
    setSaving(true);
    try {
      const stamp = new Date().toLocaleString('en-GB');
      const updated = `${form.notes || ''}\n\n[${stamp}] ${noteText.trim()}`.trim();
      await supabase.from('clients').update({ notes: updated }).eq('id', id);
      await logAudit('client_updated', `Note added to client "${client?.name}"`, profile);
      setForm((prev) => ({ ...prev, notes: updated }));
      setNoteText('');
      toast({ title: 'Note added' });
      load();
    } finally {
      setSaving(false);
    }
  };

  const deleteClient = async () => {
    if (!id) return;
    await supabase
      .from('clients')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);
    await logAudit('client_deleted', `Client "${client?.name}" deleted`, profile);
    toast({ title: 'Client removed' });
    navigate('/clients');
  };

  // ── Placement analytics ──
  const analytics = useMemo(() => {
    const activePlacements = placements.filter((p) => p.status === 'active');
    const totalMonthlyRevenue = activePlacements.reduce((s, p) => s + Number(p.client_rate_ngn || 0), 0);
    const totalMonthlyCommission = activePlacements.reduce((s, p) => s + Number(p.commission_ngn || 0), 0);
    const totalEmployeeCost = activePlacements.reduce((s, p) => s + Number(p.employee_rate_ngn || 0), 0);

    const paidPayments = payments.filter((p) => p.status === 'paid');
    const pendingPayments = payments.filter((p) => p.status === 'pending' || p.status === 'overdue');
    const totalCollected = paidPayments.reduce((s, p) => s + Number(p.gross_amount_ngn || 0), 0);
    const totalOutstanding = pendingPayments.reduce((s, p) => s + Number(p.gross_amount_ngn || 0), 0);
    const overdueCount = payments.filter((p) => p.status === 'overdue').length;

    const byCategory = Object.entries(
      activePlacements.reduce<Record<string, number>>((acc, p) => {
        const cat = p.placement_category || 'general';
        acc[cat] = (acc[cat] || 0) + 1;
        return acc;
      }, {})
    ).map(([name, count]) => ({
      name: CATEGORY_LABELS[name] || name,
      value: count,
    }));

    const monthlyRevenue: Record<string, { month: string; revenue: number; commission: number; collected: number }> = {};
    payments.forEach((p) => {
      const m = p.month?.slice(0, 7) || '';
      if (!m) return;
      if (!monthlyRevenue[m]) monthlyRevenue[m] = { month: m, revenue: 0, commission: 0, collected: 0 };
      monthlyRevenue[m].revenue += Number(p.gross_amount_ngn || 0);
      monthlyRevenue[m].commission += Number(p.commission_ngn || 0);
      if (p.status === 'paid') monthlyRevenue[m].collected += Number(p.gross_amount_ngn || 0);
    });
    const revenueByMonth = Object.values(monthlyRevenue)
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-12)
      .map((m) => ({
        ...m,
        label: new Date(m.month + '-01').toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }),
      }));

    const employeeEarnings = activePlacements.map((p) => ({
      name: (p.profiles as any)?.full_name || 'Unknown',
      rate: Number(p.employee_rate_ngn || 0),
      commission: Number(p.commission_ngn || 0),
      gross: Number(p.client_rate_ngn || 0),
      category: CATEGORY_LABELS[p.placement_category] || p.placement_category,
    })).sort((a, b) => b.gross - a.gross);

    return {
      activePlacements: activePlacements.length,
      totalPlacements: placements.length,
      totalMonthlyRevenue,
      totalMonthlyCommission,
      totalEmployeeCost,
      totalCollected,
      totalOutstanding,
      overdueCount,
      byCategory,
      revenueByMonth,
      employeeEarnings,
      collectionRate: totalCollected + totalOutstanding > 0
        ? Math.round((totalCollected / (totalCollected + totalOutstanding)) * 100) : 100,
    };
  }, [placements, payments]);

  if (loading || !client) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const patch = (p: Partial<ClientData>) => setForm((prev) => ({ ...prev, ...p }));

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <PageBreadcrumbs trail={[
        { label: 'Clients', href: '/clients' },
        { label: client.name },
      ]} />
      {/* Back + title */}
      <div className="flex items-center gap-4 flex-wrap">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Back to clients"
          onClick={() => navigate('/clients')}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold truncate">{client.name}</h1>
          <p className="text-muted-foreground text-sm">{client.industry || 'No industry set'}</p>
        </div>
        <Badge className={cn('capitalize', STATUS_TONE[client.status])}>
          {client.status}
        </Badge>
      </div>

      {/* Summary card */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-start gap-5 flex-wrap">
            <div className="h-16 w-16 rounded-full bg-primary flex items-center justify-center shrink-0 ring-4 ring-primary/10">
              <Building2 className="h-7 w-7 text-primary-foreground" />
            </div>
            <div className="flex-1 min-w-0 space-y-1">
              {client.contact_person && (
                <p className="text-sm font-medium">{client.contact_person}</p>
              )}
              {client.email && (
                <p className="text-sm flex items-center gap-2 text-muted-foreground">
                  <Mail className="h-3.5 w-3.5 shrink-0" /> {client.email}
                </p>
              )}
              {client.phone && (
                <p className="text-sm flex items-center gap-2 text-muted-foreground">
                  <Phone className="h-3.5 w-3.5 shrink-0" /> {client.phone}
                </p>
              )}
              {client.website && (
                <p className="text-sm flex items-center gap-2 text-muted-foreground">
                  <Globe className="h-3.5 w-3.5 shrink-0" />
                  {safeHref(client.website) ? (
                    <a href={safeHref(client.website)!} target="_blank" rel="noopener noreferrer" className="hover:underline truncate">
                      {client.website}
                    </a>
                  ) : (
                    <span className="truncate">{client.website}</span>
                  )}
                </p>
              )}
              {client.address && (
                <p className="text-sm flex items-center gap-2 text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5 shrink-0" /> {client.address}
                </p>
              )}
              {Number(client.contract_value_ngn || 0) > 0 && (
                <p className="text-sm flex items-center gap-2 text-muted-foreground">
                  <DollarSign className="h-3.5 w-3.5 shrink-0" />
                  Contract value:{' '}
                  <span className="font-medium text-foreground currency">
                    {formatNaira(client.contract_value_ngn)}
                  </span>
                </p>
              )}
              <p className="text-sm flex items-center gap-2 text-muted-foreground">
                <CalendarDays className="h-3.5 w-3.5 shrink-0" />
                Added {formatDate(client.created_at)}
                {client.start_date && ` · Contract from ${formatDate(client.start_date)}`}
              </p>
              {analytics.activePlacements > 0 && (
                <p className="text-sm flex items-center gap-2 text-primary font-medium">
                  <Users className="h-3.5 w-3.5 shrink-0" />
                  {analytics.activePlacements} active placement{analytics.activePlacements !== 1 ? 's' : ''}
                  {' · '}
                  {formatNaira(analytics.totalMonthlyRevenue)}/mo revenue
                </p>
              )}
            </div>
            {canManage && (
              <Button variant="destructive" size="sm" onClick={() => setPendingDelete(true)}>
                <Trash2 className="mr-2 h-4 w-4" /> Remove client
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue={placements.length > 0 ? 'placements' : 'details'}>
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="placements" className="gap-1.5">
            <Briefcase className="h-3.5 w-3.5" />
            Placements
            {analytics.activePlacements > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">{analytics.activePlacements}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="revenue" className="gap-1.5">
            <BarChart3 className="h-3.5 w-3.5" />
            Revenue
          </TabsTrigger>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
        </TabsList>

        {/* ── Placements tab ── */}
        <TabsContent value="placements" className="mt-4 space-y-4">
          {/* KPI cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard
              title="Active Placements"
              value={analytics.activePlacements}
              subtitle={`${analytics.totalPlacements} total`}
              icon={Users}
              tone="primary"
            />
            <StatCard
              title="Monthly Revenue"
              value={formatNaira(analytics.totalMonthlyRevenue)}
              subtitle="Gross from placements"
              icon={TrendingUp}
              tone="gold"
            />
            <StatCard
              title="KD Commission"
              value={formatNaira(analytics.totalMonthlyCommission)}
              subtitle={`${analytics.activePlacements > 0 ? Math.round(analytics.totalMonthlyCommission / analytics.totalMonthlyRevenue * 100) : 0}% avg rate`}
              icon={DollarSign}
              tone="success"
            />
            <StatCard
              title="Collection Rate"
              value={`${analytics.collectionRate}%`}
              subtitle={analytics.overdueCount > 0 ? `${analytics.overdueCount} overdue` : 'All current'}
              icon={analytics.overdueCount > 0 ? AlertTriangle : CheckCircle2}
              tone={analytics.overdueCount > 0 ? 'warning' : 'success'}
            />
          </div>

          {/* Employees placed at this client */}
          {placements.length === 0 ? (
            <EmptyState
              title="No placements yet"
              description="Create a placement from the Placements page to assign employees to this client."
              icon={Users}
            />
          ) : (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  Placed Employees
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Employee</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-right">Client Rate</TableHead>
                        <TableHead className="text-right">KD Commission</TableHead>
                        <TableHead className="text-right">Employee Pay</TableHead>
                        <TableHead>Period</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {placements.map((p) => (
                        <TableRow key={p.id} className="kd-transition cursor-pointer" onClick={() => navigate(`/employees/${p.employee_id}`)}>
                          <TableCell>
                            <div>
                              <p className="font-medium">{(p.profiles as any)?.full_name || 'Unknown'}</p>
                              <p className="text-xs text-muted-foreground">{(p.profiles as any)?.email || ''}</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs capitalize">
                              {CATEGORY_LABELS[p.placement_category] || p.placement_category}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground capitalize">
                            {p.placement_type === 'kd_receives' ? 'KD Receives' : 'Employee Receives'}
                          </TableCell>
                          <TableCell className="text-right font-medium tabular-nums">
                            {formatNaira(p.client_rate_ngn)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-emerald-600 dark:text-emerald-400">
                            {formatNaira(p.commission_ngn)}
                            <span className="text-xs text-muted-foreground ml-1">({Number(p.commission_pct || 0)}%)</span>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatNaira(p.employee_rate_ngn)}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {formatDate(p.start_date)}
                            {p.end_date ? ` — ${formatDate(p.end_date)}` : ' — ongoing'}
                          </TableCell>
                          <TableCell>
                            <Badge className={PLACEMENT_STATUS_BADGE[p.status] || ''} variant="secondary">
                              {p.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Category breakdown (pie) */}
          {analytics.byCategory.length > 1 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Placement Categories</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <defs><ChartGradients /></defs>
                    <Pie
                      data={analytics.byCategory}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={85}
                      dataKey="value"
                      nameKey="name"
                      paddingAngle={3}
                      {...chartAnim}
                    >
                      {analytics.byCategory.map((_, i) => (
                        <Cell key={i} fill={chartPalette[i % chartPalette.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<GlassTooltip />} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── Revenue Intelligence tab ── */}
        <TabsContent value="revenue" className="mt-4 space-y-4">
          {/* Revenue KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard
              title="Total Collected"
              value={formatNaira(analytics.totalCollected)}
              icon={CheckCircle2}
              tone="success"
            />
            <StatCard
              title="Outstanding"
              value={formatNaira(analytics.totalOutstanding)}
              icon={Clock}
              tone={analytics.totalOutstanding > 0 ? 'warning' : 'success'}
            />
            <StatCard
              title="Employee Cost"
              value={formatNaira(analytics.totalEmployeeCost)}
              subtitle="Monthly payout"
              tone="primary"
            />
            <StatCard
              title="Net Margin"
              value={analytics.totalMonthlyRevenue > 0
                ? `${Math.round((analytics.totalMonthlyCommission / analytics.totalMonthlyRevenue) * 100)}%`
                : '—'}
              subtitle={formatNaira(analytics.totalMonthlyCommission) + '/mo'}
              icon={TrendingUp}
              tone="gold"
            />
          </div>

          {/* Revenue by month area chart */}
          {analytics.revenueByMonth.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Revenue Trend</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={analytics.revenueByMonth}>
                    <defs><ChartGradients /></defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridLine} />
                    <XAxis dataKey="label" tick={axisTick} />
                    <YAxis
                      tick={axisTick}
                      tickFormatter={fmtNairaTick}
                    />
                    <Tooltip content={<GlassTooltip formatter={(v: number) => formatNaira(v)} />} />
                    <Legend />
                    <Area
                      type="monotone"
                      dataKey="revenue"
                      name="Gross Revenue"
                      stroke={chartTheme.primary}
                      fill="url(#kd-grad-primary)"
                      strokeWidth={2}
                      {...chartAnim}
                    />
                    <Area
                      type="monotone"
                      dataKey="commission"
                      name="KD Commission"
                      stroke={chartTheme.success}
                      fill="url(#kd-grad-success)"
                      strokeWidth={2}
                      {...chartAnim}
                    />
                    <Area
                      type="monotone"
                      dataKey="collected"
                      name="Collected"
                      stroke={chartTheme.cyan}
                      fill="url(#kd-grad-cyan)"
                      strokeWidth={2}
                      {...chartAnim}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Employee earnings breakdown */}
          {analytics.employeeEarnings.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Employee Earnings at this Client</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={Math.max(200, analytics.employeeEarnings.length * 42)}>
                  <BarChart data={analytics.employeeEarnings} layout="vertical" barSize={20}>
                    <defs><ChartGradients /></defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridLine} horizontal={false} />
                    <XAxis
                      type="number"
                      tick={axisTick}
                      tickFormatter={fmtNairaTick}
                    />
                    <YAxis type="category" dataKey="name" tick={axisTick} width={120} />
                    <Tooltip content={<GlassTooltip formatter={(v: number) => formatNaira(v)} />} />
                    <Legend />
                    <Bar dataKey="commission" name="KD Commission" fill={chartTheme.success} radius={[0, 4, 4, 0]} {...chartAnim} />
                    <Bar dataKey="rate" name="Employee Pay" fill={chartTheme.primary} radius={[0, 4, 4, 0]} {...chartAnim} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Recent payments table */}
          {payments.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Payment History</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Month</TableHead>
                        <TableHead className="text-right">Gross</TableHead>
                        <TableHead className="text-right">Commission</TableHead>
                        <TableHead className="text-right">Employee</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Paid At</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {payments.slice(0, 24).map((p) => (
                        <TableRow key={p.id}>
                          <TableCell className="font-medium">
                            {new Date(p.month + 'T00:00:00').toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{formatNaira(p.gross_amount_ngn)}</TableCell>
                          <TableCell className="text-right tabular-nums text-emerald-600 dark:text-emerald-400">{formatNaira(p.commission_ngn)}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatNaira(p.net_employee_ngn)}</TableCell>
                          <TableCell>
                            <Badge className={PAYMENT_STATUS_BADGE[p.status] || ''} variant="secondary">{p.status}</Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {p.paid_at ? formatDate(p.paid_at) : '—'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

          {payments.length === 0 && (
            <EmptyState
              title="No payment history"
              description="Revenue data appears once placements generate monthly payments."
              icon={BarChart3}
            />
          )}
        </TabsContent>

        {/* ── Details tab ── */}
        <TabsContent value="details" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Client details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="col-span-full space-y-1">
                  <Label>Client name *</Label>
                  <Input value={form.name || ''} onChange={(e) => patch({ name: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>Industry</Label>
                  <Select value={form.industry || ''} onValueChange={(v) => patch({ industry: v })}>
                    <SelectTrigger><SelectValue placeholder="Select industry" /></SelectTrigger>
                    <SelectContent>
                      {INDUSTRIES.map((i) => (
                        <SelectItem key={i} value={i}>{i}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Status</Label>
                  <Select value={form.status} onValueChange={(v) => patch({ status: v as ClientStatus })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="prospect">Prospect</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Contract value (₦)</Label>
                  <Input
                    type="number" min={0}
                    value={form.contract_value_ngn || ''}
                    onChange={(e) => patch({ contract_value_ngn: Number(e.target.value) })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Start date</Label>
                  <Input
                    type="date" min="2000-01-01" max="2099-12-31"
                    value={form.start_date || ''}
                    onChange={(e) => patch({ start_date: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Contact person</Label>
                  <Input value={form.contact_person || ''} onChange={(e) => patch({ contact_person: e.target.value })} placeholder="Name of main contact" />
                </div>
                <div className="space-y-1">
                  <Label>Email</Label>
                  <Input type="email" value={form.email || ''} onChange={(e) => patch({ email: e.target.value })} placeholder="contact@company.com" />
                </div>
                <div className="space-y-1">
                  <Label>Phone</Label>
                  <Input value={form.phone || ''} onChange={(e) => patch({ phone: e.target.value })} placeholder="+234 800 000 0000" />
                </div>
                <div className="col-span-full space-y-1">
                  <Label>Website</Label>
                  <Input value={form.website || ''} onChange={(e) => patch({ website: e.target.value })} placeholder="https://example.com" />
                </div>
                <div className="col-span-full space-y-1">
                  <Label>Address</Label>
                  <Input value={form.address || ''} onChange={(e) => patch({ address: e.target.value })} placeholder="Office address" />
                </div>
              </div>
            </CardContent>
          </Card>
          {canManage && (
            <div className="flex justify-end">
              <Button onClick={save} disabled={saving || !form.name?.trim()}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Save changes
              </Button>
            </div>
          )}
        </TabsContent>

        {/* ── Notes tab ── */}
        <TabsContent value="notes" className="mt-4 space-y-4">
          {canManage && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Add note</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Textarea
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  placeholder="Type a note about this client…"
                  rows={3}
                />
                <Button size="sm" onClick={addNote} disabled={!noteText.trim() || saving}>
                  Add note
                </Button>
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Notes history</CardTitle>
            </CardHeader>
            <CardContent>
              {form.notes
                ? <pre className="text-sm whitespace-pre-wrap font-sans">{form.notes}</pre>
                : <p className="text-sm text-muted-foreground">No notes yet.</p>}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Delete confirmation */}
      <AlertDialog open={pendingDelete} onOpenChange={setPendingDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove client?</AlertDialogTitle>
            <AlertDialogDescription>
              "{client.name}" will be hidden from all screens. The record is kept in the database
              and can be recovered by an admin if needed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={deleteClient}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ClientProfile;
