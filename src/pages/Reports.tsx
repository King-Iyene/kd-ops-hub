import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CreditCard,
  Receipt,
  Truck,
  Users,
  PiggyBank,
  Download,
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
          <TabsTrigger value="payments"><CreditCard className="mr-2 h-4 w-4" /> Payments</TabsTrigger>
          <TabsTrigger value="expenses"><Receipt className="mr-2 h-4 w-4" /> Expenses</TabsTrigger>
          <TabsTrigger value="fleet"><Truck className="mr-2 h-4 w-4" /> Fleet</TabsTrigger>
          <TabsTrigger value="contractors"><Users className="mr-2 h-4 w-4" /> Contractors</TabsTrigger>
          <TabsTrigger value="budgets"><PiggyBank className="mr-2 h-4 w-4" /> Budgets</TabsTrigger>
        </TabsList>

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

export default Reports;
