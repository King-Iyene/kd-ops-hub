import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CreditCard,
  Receipt,
  Truck,
  Users,
  PiggyBank,
  Download,
  TrendingUp,
  Wallet,
  AlertTriangle,
  Library,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { supabase } from '@/lib/supabase';
import { formatNaira, formatNairaCompact, toIsoDate } from '@/lib/format';
import { toCsv, downloadCsv } from '@/lib/csv';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StatCard } from '@/components/ui-kit/StatCard';
import { PageHeader } from '@/components/ui-kit/PageHeader';
import { TableSkeleton } from '@/components/ui-kit/TableSkeleton';
import { ErrorState } from '@/components/ui-kit/ErrorState';

interface DateRange {
  start: string; // yyyy-mm-dd
  end: string;
}

const CHART_COLORS = ['#006994', '#00ECFF', '#D6AC50', '#22c55e', '#ef4444', '#a855f7', '#f59e0b'];

// Default range: start of this year → today.
const thisYearRange = (): DateRange => {
  const now = new Date();
  return {
    start: toIsoDate(new Date(now.getFullYear(), 0, 1)),
    end: toIsoDate(now),
  };
};

const Reports = () => {
  const [range, setRange] = useState<DateRange>(thisYearRange);
  const [tab, setTab] = useState('payments');

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        description="Finance and operations analytics across modules."
        actions={
          <div className="flex items-end gap-2 flex-wrap">
            <div className="space-y-1">
              <Label className="text-xs">From</Label>
              <Input
                type="date"
                value={range.start}
                onChange={(e) => setRange({ ...range, start: e.target.value })}
                className="w-[150px]"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">To</Label>
              <Input
                type="date"
                value={range.end}
                onChange={(e) => setRange({ ...range, end: e.target.value })}
                className="w-[150px]"
              />
            </div>
          </div>
        }
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="pnl"><TrendingUp className="mr-2 h-4 w-4" /> P&amp;L</TabsTrigger>
          <TabsTrigger value="cashflow"><Wallet className="mr-2 h-4 w-4" /> Cash flow</TabsTrigger>
          <TabsTrigger value="concentration"><AlertTriangle className="mr-2 h-4 w-4" /> Concentration</TabsTrigger>
          <TabsTrigger value="payments"><CreditCard className="mr-2 h-4 w-4" /> Payments</TabsTrigger>
          <TabsTrigger value="expenses"><Receipt className="mr-2 h-4 w-4" /> Expenses</TabsTrigger>
          <TabsTrigger value="fleet"><Truck className="mr-2 h-4 w-4" /> Fleet</TabsTrigger>
          <TabsTrigger value="contractors"><Users className="mr-2 h-4 w-4" /> Contractors</TabsTrigger>
          <TabsTrigger value="budgets"><PiggyBank className="mr-2 h-4 w-4" /> Budgets</TabsTrigger>
          <TabsTrigger value="reconciliation"><Library className="mr-2 h-4 w-4" /> Reconciliation</TabsTrigger>
        </TabsList>

        <TabsContent value="pnl" className="mt-4">
          <PnLReport range={range} />
        </TabsContent>
        <TabsContent value="cashflow" className="mt-4">
          <CashFlowReport range={range} />
        </TabsContent>
        <TabsContent value="concentration" className="mt-4">
          <ConcentrationRiskReport range={range} />
        </TabsContent>
        <TabsContent value="payments" className="mt-4">
          <PaymentReport range={range} />
        </TabsContent>
        <TabsContent value="expenses" className="mt-4">
          <ExpenseReport range={range} />
        </TabsContent>
        <TabsContent value="fleet" className="mt-4">
          <FleetReport range={range} />
        </TabsContent>
        <TabsContent value="contractors" className="mt-4">
          <ContractorReport range={range} />
        </TabsContent>
        <TabsContent value="budgets" className="mt-4">
          <BudgetReport range={range} />
        </TabsContent>
        <TabsContent value="reconciliation" className="mt-4">
          <ReconciliationReport />
        </TabsContent>
      </Tabs>
    </div>
  );
};

// -----------------------------------------------------------------------------
// Shared helpers
// -----------------------------------------------------------------------------

const monthKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

function useLoader<T>(fn: () => Promise<T>, deps: any[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fn();
      setData(result);
    } catch (err: any) {
      setError(err?.message || 'Failed to load report');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => {
    run();
  }, [run]);
  return { data, loading, error, reload: run };
}

// -----------------------------------------------------------------------------
// Payment Report
// -----------------------------------------------------------------------------

function PaymentReport({ range }: { range: DateRange }) {
  const { data, loading, error, reload } = useLoader(async () => {
    const { data, error } = await supabase
      .from('payment_batches')
      .select('*')
      .gte('payment_date', range.start)
      .lte('payment_date', range.end)
      .order('payment_date', { ascending: true });
    if (error) throw error;
    return data || [];
  }, [range.start, range.end]);

  const byMonth = useMemo(() => {
    if (!data) return [] as { month: string; amount: number; batches: number }[];
    const acc: Record<string, { amount: number; batches: number }> = {};
    for (const b of data as any[]) {
      const k = monthKey(new Date(b.payment_date));
      acc[k] = acc[k] || { amount: 0, batches: 0 };
      if (b.status === 'processed' || b.status === 'funded') {
        acc[k].amount += Number(b.total_amount || 0);
      }
      acc[k].batches += 1;
    }
    return Object.keys(acc)
      .sort()
      .map((k) => ({ month: k, amount: acc[k].amount, batches: acc[k].batches }));
  }, [data]);

  const byStatus = useMemo(() => {
    if (!data) return [] as { name: string; value: number }[];
    const acc: Record<string, number> = {};
    for (const b of data as any[]) {
      acc[b.status] = (acc[b.status] || 0) + 1;
    }
    return Object.entries(acc).map(([name, value]) => ({ name, value }));
  }, [data]);

  const totalDisbursed =
    data
      ?.filter((b: any) => ['processed', 'funded'].includes(b.status))
      .reduce((s: number, b: any) => s + Number(b.total_amount || 0), 0) || 0;
  const totalBatches = data?.length || 0;
  const totalBeneficiaries =
    data?.reduce((s: number, b: any) => s + Number(b.beneficiary_count || 0), 0) || 0;

  const exportCsv = () => {
    const header = ['name', 'payment_date', 'status', 'beneficiaries', 'total_amount_ngn'];
    const rows = (data || []).map((b: any) => [
      b.name,
      b.payment_date,
      b.status,
      b.beneficiary_count || 0,
      b.total_amount || 0,
    ]);
    downloadCsv(`kdops-payments-${range.start}_to_${range.end}.csv`, toCsv(header, rows));
  };

  if (loading) return <TableSkeleton rows={4} cols={3} />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard title="Total Disbursed" value={formatNaira(totalDisbursed)} icon={CreditCard} tone="primary" />
        <StatCard title="Batches" value={totalBatches} tone="success" />
        <StatCard title="Beneficiaries" value={totalBeneficiaries} tone="warning" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">Disbursed per Month</CardTitle>
            <Button variant="outline" size="sm" onClick={exportCsv}>
              <Download className="mr-2 h-4 w-4" /> Export CSV
            </Button>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={byMonth}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis tickFormatter={(v) => formatNairaCompact(v)} />
                <Tooltip formatter={(v: number) => formatNaira(v)} />
                <Bar dataKey="amount" fill="#006994" radius={[4, 4, 0, 0]} name="Disbursed" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">By Status</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={byStatus} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80}>
                  {byStatus.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Expense Report
// -----------------------------------------------------------------------------

function ExpenseReport({ range }: { range: DateRange }) {
  const { data, loading, error, reload } = useLoader(async () => {
    const { data, error } = await supabase
      .from('expenses')
      .select('*')
      .gte('date', range.start)
      .lte('date', range.end)
      .order('date', { ascending: true });
    if (error) throw error;
    return data || [];
  }, [range.start, range.end]);

  const byCategory = useMemo(() => {
    const acc: Record<string, number> = {};
    for (const e of (data as any[]) || []) {
      if (e.status !== 'approved') continue;
      acc[e.category] = (acc[e.category] || 0) + Number(e.amount_ngn || 0);
    }
    return Object.entries(acc).map(([name, value]) => ({ name, value }));
  }, [data]);

  const approvedTotal = byCategory.reduce((s, r) => s + r.value, 0);
  const submissions = data?.length || 0;
  const pending =
    (data as any[])?.filter((e) => e.status === 'pending').length || 0;

  const exportCsv = () => {
    const header = ['date', 'category', 'amount_ngn', 'status', 'description'];
    const rows = (data || []).map((e: any) => [
      e.date,
      e.category,
      e.amount_ngn || 0,
      e.status,
      e.description || '',
    ]);
    downloadCsv(`kdops-expenses-${range.start}_to_${range.end}.csv`, toCsv(header, rows));
  };

  if (loading) return <TableSkeleton rows={4} cols={3} />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard title="Approved Total" value={formatNaira(approvedTotal)} icon={Receipt} tone="primary" />
        <StatCard title="Submissions" value={submissions} tone="success" />
        <StatCard title="Pending" value={pending} tone="warning" />
      </div>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base">Approved Spend by Category</CardTitle>
          <Button variant="outline" size="sm" onClick={exportCsv}>
            <Download className="mr-2 h-4 w-4" /> Export CSV
          </Button>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={byCategory}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" tickFormatter={(v: string) => v.replace(/_/g, ' ')} />
              <YAxis tickFormatter={(v) => formatNairaCompact(v)} />
              <Tooltip formatter={(v: number) => formatNaira(v)} />
              <Bar dataKey="value" fill="#D6AC50" radius={[4, 4, 0, 0]} name="Spend" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Fleet Report
// -----------------------------------------------------------------------------

function FleetReport({ range }: { range: DateRange }) {
  const { data, loading, error, reload } = useLoader(async () => {
    const [fuel, trips] = await Promise.all([
      supabase
        .from('fuel_requests')
        .select('*')
        .gte('created_at', range.start)
        .lte('created_at', `${range.end}T23:59:59`),
      supabase
        .from('trip_logs')
        .select('*')
        .gte('date', range.start)
        .lte('date', range.end),
    ]);
    if (fuel.error) throw fuel.error;
    if (trips.error) throw trips.error;
    return { fuel: fuel.data || [], trips: trips.data || [] };
  }, [range.start, range.end]);

  const approvedFuel =
    (data?.fuel as any[])?.filter((f) => f.status === 'approved') || [];
  const fuelTotal = approvedFuel.reduce(
    (s, f) => s + Number(f.amount_ngn || 0),
    0,
  );
  const fuelLitres = approvedFuel.reduce(
    (s, f) => s + Number(f.litres_est || 0),
    0,
  );
  const tripsCount = data?.trips.length || 0;
  const kmDriven =
    (data?.trips as any[])?.reduce(
      (s, t) => s + Number(t.km_driven || 0),
      0,
    ) || 0;

  const fuelByMonth = useMemo(() => {
    const acc: Record<string, number> = {};
    for (const f of approvedFuel) {
      const k = monthKey(new Date(f.created_at));
      acc[k] = (acc[k] || 0) + Number(f.amount_ngn || 0);
    }
    return Object.keys(acc)
      .sort()
      .map((k) => ({ month: k, amount: acc[k] }));
  }, [approvedFuel]);

  const exportCsv = () => {
    const header = ['type', 'date', 'amount_ngn_or_km', 'detail', 'status'];
    const fuelRows = (data?.fuel || []).map((f: any) => [
      'fuel_request',
      f.created_at?.slice(0, 10),
      f.amount_ngn || 0,
      f.station_name || '',
      f.status,
    ]);
    const tripRows = (data?.trips || []).map((t: any) => [
      'trip_log',
      t.date,
      t.km_driven || 0,
      `${t.start_location} → ${t.end_location}`,
      'logged',
    ]);
    downloadCsv(
      `kdops-fleet-${range.start}_to_${range.end}.csv`,
      toCsv(header, [...fuelRows, ...tripRows]),
    );
  };

  if (loading) return <TableSkeleton rows={4} cols={3} />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <StatCard title="Approved Fuel Spend" value={formatNaira(fuelTotal)} icon={Truck} tone="primary" />
        <StatCard title="Approved Litres" value={fuelLitres.toFixed(0)} tone="warning" />
        <StatCard title="Trips Logged" value={tripsCount} tone="success" />
        <StatCard title="KM Driven" value={kmDriven.toLocaleString()} />
      </div>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base">Approved Fuel Spend per Month</CardTitle>
          <Button variant="outline" size="sm" onClick={exportCsv}>
            <Download className="mr-2 h-4 w-4" /> Export CSV
          </Button>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={fuelByMonth}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis tickFormatter={(v) => formatNairaCompact(v)} />
              <Tooltip formatter={(v: number) => formatNaira(v)} />
              <Line type="monotone" dataKey="amount" stroke="#006994" strokeWidth={2} dot />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Contractor Report
// -----------------------------------------------------------------------------

function ContractorReport({ range }: { range: DateRange }) {
  const { data, loading, error, reload } = useLoader(async () => {
    const [contractorsRes, itemsRes, batchesRes] = await Promise.all([
      supabase.from('contractors').select('id, full_name, status'),
      supabase
        .from('batch_items')
        .select('contractor_id, full_name, amount_ngn, batch_id, status'),
      supabase
        .from('payment_batches')
        .select('id, payment_date')
        .gte('payment_date', range.start)
        .lte('payment_date', range.end),
    ]);
    if (contractorsRes.error) throw contractorsRes.error;
    if (itemsRes.error) throw itemsRes.error;
    if (batchesRes.error) throw batchesRes.error;
    return {
      contractors: contractorsRes.data || [],
      items: itemsRes.data || [],
      batches: batchesRes.data || [],
    };
  }, [range.start, range.end]);

  const summary = useMemo(() => {
    if (!data) return [] as { name: string; total: number; items: number }[];
    const batchIds = new Set((data.batches as any[]).map((b: any) => b.id));
    const acc: Record<string, { name: string; total: number; items: number }> = {};
    for (const it of data.items as any[]) {
      if (!batchIds.has(it.batch_id)) continue;
      const key = it.contractor_id || it.full_name;
      const name = it.full_name || 'Unknown';
      if (!acc[key]) acc[key] = { name, total: 0, items: 0 };
      acc[key].total += Number(it.amount_ngn || 0);
      acc[key].items += 1;
    }
    return Object.values(acc).sort((a, b) => b.total - a.total);
  }, [data]);

  const top = summary.slice(0, 10);
  const totalContractors = data?.contractors.length || 0;
  const active =
    (data?.contractors as any[])?.filter((c) => c.status === 'active').length || 0;

  const exportCsv = () => {
    const header = ['contractor', 'total_ngn', 'line_items'];
    const rows = summary.map((s) => [s.name, s.total, s.items]);
    downloadCsv(
      `kdops-contractors-${range.start}_to_${range.end}.csv`,
      toCsv(header, rows),
    );
  };

  if (loading) return <TableSkeleton rows={4} cols={3} />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard title="Contractors" value={totalContractors} icon={Users} tone="primary" />
        <StatCard title="Active" value={active} tone="success" />
        <StatCard title="Paid (period)" value={summary.length} tone="warning" />
      </div>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base">Top Contractors by Spend</CardTitle>
          <Button variant="outline" size="sm" onClick={exportCsv}>
            <Download className="mr-2 h-4 w-4" /> Export CSV
          </Button>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={top} layout="vertical" margin={{ left: 90 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" tickFormatter={(v) => formatNairaCompact(v)} />
              <YAxis dataKey="name" type="category" width={80} />
              <Tooltip formatter={(v: number) => formatNaira(v)} />
              <Bar dataKey="total" fill="#006994" radius={[0, 4, 4, 0]} name="Total" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Budget Report
// -----------------------------------------------------------------------------

function BudgetReport({ range }: { range: DateRange }) {
  const { data, loading, error, reload } = useLoader(async () => {
    const [budgetsRes, expensesRes, batchesRes] = await Promise.all([
      supabase.from('budgets').select('*'),
      supabase.from('expenses').select('amount_ngn, date').eq('status', 'approved'),
      supabase
        .from('payment_batches')
        .select('total_amount, payment_date, status')
        .in('status', ['processed', 'funded']),
    ]);
    if (budgetsRes.error) throw budgetsRes.error;
    if (expensesRes.error) throw expensesRes.error;
    if (batchesRes.error) throw batchesRes.error;
    return {
      budgets: budgetsRes.data || [],
      expenses: expensesRes.data || [],
      batches: batchesRes.data || [],
    };
  }, [range.start, range.end]);

  const rows = useMemo(() => {
    if (!data) return [] as { name: string; planned: number; actual: number }[];
    const filterStart = new Date(range.start).getTime();
    const filterEnd = new Date(range.end).getTime() + 24 * 60 * 60 * 1000 - 1;
    return (data.budgets as any[])
      .filter((b) => {
        const s = new Date(b.period_start).getTime();
        const e = new Date(b.period_end).getTime();
        return e >= filterStart && s <= filterEnd;
      })
      .map((b) => {
        const s = Math.max(new Date(b.period_start).getTime(), filterStart);
        const e = Math.min(
          new Date(b.period_end).getTime() + 24 * 60 * 60 * 1000 - 1,
          filterEnd,
        );
        let actual = 0;
        for (const ex of data.expenses as any[]) {
          const t = new Date(ex.date).getTime();
          if (t >= s && t <= e) actual += Number(ex.amount_ngn || 0);
        }
        for (const bx of data.batches as any[]) {
          const t = new Date(bx.payment_date).getTime();
          if (t >= s && t <= e) actual += Number(bx.total_amount || 0);
        }
        return { name: b.name, planned: Number(b.total_amount_ngn || 0), actual };
      });
  }, [data, range]);

  const totalPlanned = rows.reduce((s, r) => s + r.planned, 0);
  const totalActual = rows.reduce((s, r) => s + r.actual, 0);

  const exportCsv = () => {
    const header = ['budget', 'planned_ngn', 'actual_ngn', 'utilisation_pct'];
    const csvRows = rows.map((r) => [
      r.name,
      r.planned,
      r.actual,
      r.planned > 0 ? ((r.actual / r.planned) * 100).toFixed(1) : '0.0',
    ]);
    downloadCsv(
      `kdops-budgets-${range.start}_to_${range.end}.csv`,
      toCsv(header, csvRows),
    );
  };

  if (loading) return <TableSkeleton rows={4} cols={3} />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard title="Planned" value={formatNaira(totalPlanned)} icon={PiggyBank} tone="primary" />
        <StatCard title="Actual" value={formatNaira(totalActual)} tone="warning" />
        <StatCard
          title="Utilisation"
          value={totalPlanned > 0 ? `${((totalActual / totalPlanned) * 100).toFixed(0)}%` : '—'}
          tone={totalActual > totalPlanned ? 'danger' : 'success'}
        />
      </div>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base">Planned vs Actual by Budget</CardTitle>
          <Button variant="outline" size="sm" onClick={exportCsv}>
            <Download className="mr-2 h-4 w-4" /> Export CSV
          </Button>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={rows}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis tickFormatter={(v) => formatNairaCompact(v)} />
              <Tooltip formatter={(v: number) => formatNaira(v)} />
              <Legend />
              <Bar dataKey="planned" fill="#00ECFF" name="Planned" radius={[4, 4, 0, 0]} />
              <Bar dataKey="actual" fill="#006994" name="Actual" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}

// -----------------------------------------------------------------------------
// P&L report
// -----------------------------------------------------------------------------

function PnLReport({ range }: { range: DateRange }) {
  const { data, loading, error, reload } = useLoader(async () => {
    const [batchesRes, expensesRes, contractorPaymentsRes] = await Promise.all([
      supabase
        .from('payment_batches')
        .select('total_amount, payment_date, status, name')
        .in('status', ['processed', 'funded'])
        .gte('payment_date', range.start)
        .lte('payment_date', range.end),
      supabase
        .from('expenses')
        .select('amount_ngn, date, status, category')
        .eq('status', 'approved')
        .gte('date', range.start)
        .lte('date', range.end),
      supabase
        .from('payment_batches')
        .select('total_amount, payment_date, status')
        .gte('payment_date', range.start)
        .lte('payment_date', range.end),
    ]);
    if (batchesRes.error) throw batchesRes.error;
    if (expensesRes.error) throw expensesRes.error;
    return {
      batches: batchesRes.data || [],
      expenses: expensesRes.data || [],
      allBatches: contractorPaymentsRes.data || [],
    };
  }, [range.start, range.end]);

  const monthly = useMemo(() => {
    if (!data) return [] as { month: string; revenue: number; costs: number; net: number }[];
    const acc: Record<string, { revenue: number; costs: number }> = {};
    // KDOps doesn't record revenue natively; we treat 'received' batches as
    // revenue and 'processed' batches + approved expenses as costs. If you
    // invert that to match your business later, update the mapping here.
    for (const b of data.batches as any[]) {
      const k = monthKey(new Date(b.payment_date));
      acc[k] = acc[k] || { revenue: 0, costs: 0 };
      acc[k].costs += Number(b.total_amount || 0);
    }
    for (const e of data.expenses as any[]) {
      const k = monthKey(new Date(e.date));
      acc[k] = acc[k] || { revenue: 0, costs: 0 };
      acc[k].costs += Number(e.amount_ngn || 0);
    }
    // Revenue heuristic: sum all batches irrespective of status — with no
    // explicit revenue table this is a conservative placeholder.
    for (const b of data.allBatches as any[]) {
      if (b.status === 'processed' || b.status === 'funded') continue;
      const k = monthKey(new Date(b.payment_date));
      acc[k] = acc[k] || { revenue: 0, costs: 0 };
      acc[k].revenue += Number(b.total_amount || 0);
    }
    return Object.keys(acc)
      .sort()
      .map((k) => ({
        month: k,
        revenue: acc[k].revenue,
        costs: acc[k].costs,
        net: acc[k].revenue - acc[k].costs,
      }));
  }, [data]);

  const totalRevenue = monthly.reduce((s, r) => s + r.revenue, 0);
  const totalCosts = monthly.reduce((s, r) => s + r.costs, 0);
  const net = totalRevenue - totalCosts;

  const exportCsv = () => {
    const header = ['month', 'revenue', 'costs', 'net'];
    const rows = monthly.map((m) => [m.month, m.revenue, m.costs, m.net]);
    downloadCsv(`kdops-pnl-${range.start}_to_${range.end}.csv`, toCsv(header, rows));
  };

  if (loading) return <TableSkeleton rows={4} cols={3} />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard title="Revenue (proxy)" value={formatNaira(totalRevenue)} icon={TrendingUp} tone="success" />
        <StatCard title="Costs" value={formatNaira(totalCosts)} icon={Receipt} tone="warning" />
        <StatCard
          title="Net"
          value={formatNaira(net)}
          icon={TrendingUp}
          tone={net >= 0 ? 'success' : 'danger'}
        />
      </div>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base">Revenue vs Costs — per month</CardTitle>
          <Button variant="outline" size="sm" onClick={exportCsv}>
            <Download className="mr-2 h-4 w-4" /> Export CSV
          </Button>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={monthly}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis tickFormatter={(v) => formatNairaCompact(v)} />
              <Tooltip formatter={(v: number) => formatNaira(v)} />
              <Legend />
              <Bar dataKey="revenue" fill="#22c55e" name="Revenue" radius={[4, 4, 0, 0]} />
              <Bar dataKey="costs" fill="#ef4444" name="Costs" radius={[4, 4, 0, 0]} />
              <Line type="monotone" dataKey="net" stroke="#006994" strokeWidth={2} dot name="Net" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Cash Flow Forecast report
// -----------------------------------------------------------------------------

function CashFlowReport({ range: _range }: { range: DateRange }) {
  const { data, loading, error, reload } = useLoader(async () => {
    const today = new Date();
    const future = new Date();
    future.setDate(future.getDate() + 90);
    const [batchRes, subRes, settingsRes] = await Promise.all([
      supabase
        .from('payment_batches')
        .select('total_amount, payment_date, scheduled_date, status, name')
        .in('status', ['approved', 'funded', 'pending_approval'])
        .gte('payment_date', toIsoDate(today))
        .lte('payment_date', toIsoDate(future)),
      supabase
        .from('subscriptions')
        .select('name, amount_ngn, next_renewal_date, billing_cycle, status')
        .eq('status', 'active')
        .gte('next_renewal_date', toIsoDate(today))
        .lte('next_renewal_date', toIsoDate(future)),
      supabase
        .from('company_settings')
        .select('cash_on_hand_ngn')
        .eq('id', '00000000-0000-0000-0000-000000000001')
        .maybeSingle(),
    ]);
    if (batchRes.error) throw batchRes.error;
    if (subRes.error) throw subRes.error;
    return {
      batches: batchRes.data || [],
      subs: subRes.data || [],
      cashOnHand: Number((settingsRes.data as any)?.cash_on_hand_ngn || 0),
    };
  }, []);

  const buckets = useMemo(() => {
    if (!data) return { b30: 0, b60: 0, b90: 0 };
    const today = Date.now();
    const day = 24 * 60 * 60 * 1000;
    let b30 = 0;
    let b60 = 0;
    let b90 = 0;
    for (const b of data.batches as any[]) {
      const t = new Date(b.payment_date).getTime();
      const days = Math.ceil((t - today) / day);
      const amt = Number(b.total_amount || 0);
      if (days <= 30) b30 += amt;
      else if (days <= 60) b60 += amt;
      else if (days <= 90) b90 += amt;
    }
    for (const s of data.subs as any[]) {
      const t = new Date(s.next_renewal_date).getTime();
      const days = Math.ceil((t - today) / day);
      const amt = Number(s.amount_ngn || 0);
      if (days <= 30) b30 += amt;
      else if (days <= 60) b60 += amt;
      else if (days <= 90) b90 += amt;
    }
    return { b30, b60, b90 };
  }, [data]);

  const totalOutflow = buckets.b30 + buckets.b60 + buckets.b90;
  const runway =
    data && totalOutflow > 0
      ? (data.cashOnHand / (totalOutflow / 3)).toFixed(1)
      : '—';

  if (loading) return <TableSkeleton rows={4} cols={3} />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <StatCard title="Next 30 days" value={formatNaira(buckets.b30)} icon={Wallet} tone="primary" />
        <StatCard title="31–60 days" value={formatNaira(buckets.b60)} icon={Wallet} tone="warning" />
        <StatCard title="61–90 days" value={formatNaira(buckets.b90)} icon={Wallet} tone="warning" />
        <StatCard
          title="Runway (months)"
          value={runway}
          subtitle={`Cash on hand: ${formatNaira((data as any)?.cashOnHand || 0)}`}
          icon={TrendingUp}
          tone={runway !== '—' && Number(runway) < 3 ? 'danger' : 'success'}
        />
      </div>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Projected outflows</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart
              data={[
                { bucket: 'Next 30 days', amount: buckets.b30 },
                { bucket: '31-60 days', amount: buckets.b60 },
                { bucket: '61-90 days', amount: buckets.b90 },
              ]}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="bucket" />
              <YAxis tickFormatter={(v) => formatNairaCompact(v)} />
              <Tooltip formatter={(v: number) => formatNaira(v)} />
              <Bar dataKey="amount" fill="#006994" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">
        Runway uses the average of the three months as a steady-state assumption.
        Update Cash on Hand in <strong>Settings → Company</strong> for an
        accurate view.
      </p>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Contractor concentration risk
// -----------------------------------------------------------------------------

function ConcentrationRiskReport({ range }: { range: DateRange }) {
  const { data, loading, error, reload } = useLoader(async () => {
    const [batchesRes, itemsRes] = await Promise.all([
      supabase
        .from('payment_batches')
        .select('id, payment_date, status')
        .in('status', ['processed', 'funded'])
        .gte('payment_date', range.start)
        .lte('payment_date', range.end),
      supabase.from('batch_items').select('contractor_id, full_name, amount_ngn, batch_id'),
    ]);
    if (batchesRes.error) throw batchesRes.error;
    if (itemsRes.error) throw itemsRes.error;
    return { batches: batchesRes.data || [], items: itemsRes.data || [] };
  }, [range.start, range.end]);

  const rows = useMemo(() => {
    if (!data) return [] as { name: string; total: number; share: number }[];
    const batchIds = new Set((data.batches as any[]).map((b) => b.id));
    const acc: Record<string, { name: string; total: number }> = {};
    let overall = 0;
    for (const it of data.items as any[]) {
      if (!batchIds.has(it.batch_id)) continue;
      const key = it.contractor_id || it.full_name;
      if (!acc[key]) acc[key] = { name: it.full_name || 'Unknown', total: 0 };
      const amt = Number(it.amount_ngn || 0);
      acc[key].total += amt;
      overall += amt;
    }
    return Object.values(acc)
      .map((r) => ({ ...r, share: overall > 0 ? r.total / overall : 0 }))
      .sort((a, b) => b.total - a.total);
  }, [data]);

  const flagged = rows.filter((r) => r.share >= 0.2);

  if (loading) return <TableSkeleton rows={4} cols={3} />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard title="Contractors paid" value={rows.length} icon={Users} tone="primary" />
        <StatCard title="Concentration flags" value={flagged.length} icon={AlertTriangle} tone={flagged.length > 0 ? 'danger' : 'success'} subtitle=">20% of monthly payments" />
        <StatCard title="Top contractor share" value={rows[0] ? `${(rows[0].share * 100).toFixed(1)}%` : '—'} icon={TrendingUp} />
      </div>

      {flagged.length > 0 && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-destructive flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" /> Concentration risk detected
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {flagged.map((r) => (
              <p key={r.name} className="text-sm">
                <span className="font-semibold">{r.name}</span> — {(r.share * 100).toFixed(1)}% of total ({formatNaira(r.total)})
              </p>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Top contractor distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={rows.slice(0, 8)}
                dataKey="total"
                nameKey="name"
                innerRadius={60}
                outerRadius={110}
              >
                {rows.slice(0, 8).map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v: number) => formatNaira(v)} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Bank reconciliation helper
// -----------------------------------------------------------------------------

function ReconciliationReport() {
  const [loading, setLoading] = useState(false);
  const [entries, setEntries] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const [bankName, setBankName] = useState('Access Bank');
  const [statementId, setStatementId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!statementId) return;
    setLoading(true);
    const { data } = await supabase
      .from('statement_entries')
      .select('*')
      .eq('statement_id', statementId)
      .order('entry_date', { ascending: false });
    setEntries(data || []);
    setLoading(false);
  }, [statementId]);

  useEffect(() => {
    load();
  }, [load]);

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const text = await file.text();
      // Very simple CSV parse — expect the common Nigerian bank export format:
      // date,description,amount,reference[,dr_cr]
      const lines = text.split(/\r?\n/).filter(Boolean);
      const headers = lines
        .shift()!
        .split(',')
        .map((h) => h.trim().toLowerCase());
      const idx = (key: string) => headers.findIndex((h) => h.includes(key));
      const dateIdx = idx('date');
      const descIdx = idx('description') >= 0 ? idx('description') : idx('narration');
      const amtIdx = idx('amount');
      const refIdx = idx('reference') >= 0 ? idx('reference') : idx('ref');
      const crIdx = idx('credit');
      const drIdx = idx('debit');

      // Create the statement row + upload the original file.
      const path = `${Date.now()}-${file.name.replace(/[^a-z0-9.]+/gi, '_')}`;
      await supabase.storage.from('bank-statements').upload(path, file, {
        upsert: false,
        contentType: 'text/csv',
      });
      const { data: stmt, error: stmtErr } = await supabase
        .from('bank_statements')
        .insert({
          bank_name: bankName,
          storage_path: path,
        })
        .select()
        .single();
      if (stmtErr) throw stmtErr;
      setStatementId((stmt as any).id);

      // Auto-match against processed payment batches and approved expenses
      // by rounded amount + narration reference if present.
      const [{ data: batchItems }, { data: expenses }] = await Promise.all([
        supabase
          .from('batch_items')
          .select('id, full_name, amount_ngn, paystack_reference'),
        supabase
          .from('expenses')
          .select('id, description, amount_ngn, date, status')
          .eq('status', 'approved'),
      ]);
      const byAmount = new Map<number, { type: string; id: string }>();
      for (const it of batchItems || []) {
        byAmount.set(Number((it as any).amount_ngn || 0), {
          type: 'batch',
          id: (it as any).id,
        });
      }
      for (const ex of expenses || []) {
        const amt = Number((ex as any).amount_ngn || 0);
        if (!byAmount.has(amt))
          byAmount.set(amt, { type: 'expense', id: (ex as any).id });
      }

      const entryRows = lines.map((line) => {
        const cols = line.split(',');
        const date = cols[dateIdx]?.trim() || '';
        const description = descIdx >= 0 ? cols[descIdx]?.trim() : '';
        const rawAmt = amtIdx >= 0 ? cols[amtIdx] : crIdx >= 0 ? cols[crIdx] : '';
        const amount = parseFloat((rawAmt || '0').replace(/[,₦\s]/g, '')) || 0;
        const reference = refIdx >= 0 ? cols[refIdx]?.trim() : null;
        const direction =
          crIdx >= 0 && parseFloat(cols[crIdx] || '0') > 0
            ? 'credit'
            : drIdx >= 0 && parseFloat(cols[drIdx] || '0') > 0
            ? 'debit'
            : amount < 0
            ? 'debit'
            : 'credit';
        const m = byAmount.get(Math.abs(amount));
        return {
          statement_id: (stmt as any).id,
          entry_date: date,
          description,
          amount_ngn: Math.abs(amount),
          reference,
          direction,
          matched_type: m?.type || null,
          matched_id: m?.id || null,
          matched_at: m ? new Date().toISOString() : null,
        };
      });
      if (entryRows.length > 0) {
        await supabase.from('statement_entries').insert(entryRows);
      }
      load();
    } catch (err: any) {
      setError(err?.message || 'Could not parse statement');
    } finally {
      setUploading(false);
    }
  };

  const exportReconciled = () => {
    const header = ['date', 'description', 'amount_ngn', 'direction', 'matched_type', 'matched_id', 'reference'];
    const rows = entries.map((e) => [
      e.entry_date,
      e.description,
      e.amount_ngn,
      e.direction,
      e.matched_type || 'unmatched',
      e.matched_id || '',
      e.reference || '',
    ]);
    downloadCsv(`kdops-reconciliation-${toIsoDate(new Date())}.csv`, toCsv(header, rows));
  };

  const matched = entries.filter((e) => e.matched_type);
  const unmatched = entries.filter((e) => !e.matched_type);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Upload bank statement</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-end gap-3 flex-wrap">
            <div className="space-y-1">
              <Label className="text-xs">Bank</Label>
              <Input
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                className="w-[180px]"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">CSV file</Label>
              <Input
                type="file"
                accept=".csv,text/csv"
                onChange={onUpload}
                disabled={uploading}
              />
            </div>
            {entries.length > 0 && (
              <Button variant="outline" onClick={exportReconciled}>
                <Download className="mr-2 h-4 w-4" /> Export reconciled CSV
              </Button>
            )}
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <p className="text-xs text-muted-foreground">
            Expected headers: <code>date, description, amount, reference</code> —
            compatible with standard Access Bank / GTBank exports. KDOps
            auto-matches each entry to a payment batch item or approved expense
            by amount.
          </p>
        </CardContent>
      </Card>

      {entries.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base text-success">
                Matched ({matched.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-[400px] overflow-auto">
                {matched.length === 0 ? (
                  <p className="p-4 text-sm text-muted-foreground">
                    Nothing matched yet — review unmatched entries on the right.
                  </p>
                ) : (
                  <ul className="divide-y">
                    {matched.map((e) => (
                      <li key={e.id} className="p-3 text-sm">
                        <div className="flex justify-between">
                          <span>{e.description || '—'}</span>
                          <span className="currency font-medium">
                            {formatNaira(e.amount_ngn)}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {e.entry_date} · matched to {e.matched_type}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className={unmatched.length > 0 ? 'border-warning/40' : ''}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base text-warning">
                Needs review ({unmatched.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-[400px] overflow-auto">
                {unmatched.length === 0 ? (
                  <p className="p-4 text-sm text-muted-foreground">
                    Nothing to review. 🎉
                  </p>
                ) : (
                  <ul className="divide-y">
                    {unmatched.map((e) => (
                      <li key={e.id} className="p-3 text-sm">
                        <div className="flex justify-between">
                          <span>{e.description || '—'}</span>
                          <span className="currency font-medium">
                            {formatNaira(e.amount_ngn)}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {e.entry_date} · no automatic match
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {loading && <TableSkeleton rows={4} cols={3} />}
    </div>
  );
}

export default Reports;
