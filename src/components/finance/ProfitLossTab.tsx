import { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip as ReTooltip, Legend, Cell,
  AreaChart, Area, ReferenceLine,
} from 'recharts';
import { SERIES, GRID, AXIS_TICK, fmtMillions, ChartTooltip } from '@/lib/chart-theme';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { formatNaira, formatNairaCompact } from '@/lib/format';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { Receipt, TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight } from 'lucide-react';

interface MonthlyRow {
  month: string;
  revenue: number;
  payroll: number;
  subscriptions: number;
  expenses: number;
  transfers: number;
  other: number;
  totalCost: number;
  netIncome: number;
  margin: number;
}

const MONTHS_BACK_OPTIONS = [
  { value: '6', label: '6 months' },
  { value: '12', label: '12 months' },
  { value: '18', label: '18 months' },
];

export default function ProfitLossTab() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [monthsBack, setMonthsBack] = useState('12');
  const [rows, setRows] = useState<MonthlyRow[]>([]);
  const [monthlyRevenue, setMonthlyRevenue] = useState(0);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const n = Number(monthsBack);
        const cutoff = new Date();
        cutoff.setMonth(cutoff.getMonth() - n);
        const cutoffStr = cutoff.toISOString().slice(0, 10);

        const [settingsRes, payrollRes, subsRes, expensesRes, transfersRes] = await Promise.all([
          supabase
            .from('company_settings')
            .select('monthly_revenue_estimate_ngn')
            .eq('id', '00000000-0000-0000-0000-000000000001')
            .maybeSingle(),
          supabase
            .from('payroll_runs' as any)
            .select('run_month, total_net_pay')
            .gte('run_month', cutoffStr)
            .order('run_month'),
          supabase
            .from('subscriptions' as any)
            .select('billing_period, amount_ngn, next_billing_date, status')
            .in('status', ['active', 'trial']),
          supabase
            .from('expenses' as any)
            .select('amount, created_at, status')
            .gte('created_at', cutoffStr)
            .in('status', ['approved', 'reimbursed']),
          supabase
            .from('payment_batches' as any)
            .select('total_amount, created_at, status')
            .gte('created_at', cutoffStr)
            .in('status', ['completed', 'processing']),
        ]);

        const rev = (settingsRes.data as any)?.monthly_revenue_estimate_ngn ?? 0;
        setMonthlyRevenue(rev);

        const monthMap = new Map<string, MonthlyRow>();
        for (let i = 0; i < n; i++) {
          const d = new Date();
          d.setMonth(d.getMonth() - (n - 1 - i));
          const key = d.toISOString().slice(0, 7);
          const label = d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
          monthMap.set(key, {
            month: label,
            revenue: rev,
            payroll: 0,
            subscriptions: 0,
            expenses: 0,
            transfers: 0,
            other: 0,
            totalCost: 0,
            netIncome: 0,
            margin: 0,
          });
        }

        for (const pr of (payrollRes.data ?? []) as any[]) {
          const key = String(pr.run_month).slice(0, 7);
          const row = monthMap.get(key);
          if (row) row.payroll += Number(pr.total_net_pay ?? 0);
        }

        const monthlySubs = ((subsRes.data ?? []) as any[]).reduce((sum: number, s: any) => {
          const amt = Number(s.amount_ngn ?? 0);
          return sum + (s.billing_period === 'yearly' ? amt / 12 : s.billing_period === 'quarterly' ? amt / 3 : amt);
        }, 0);
        for (const row of monthMap.values()) {
          row.subscriptions = monthlySubs;
        }

        for (const exp of (expensesRes.data ?? []) as any[]) {
          const key = String(exp.created_at).slice(0, 7);
          const row = monthMap.get(key);
          if (row) row.expenses += Number(exp.amount ?? 0);
        }

        for (const tx of (transfersRes.data ?? []) as any[]) {
          const key = String(tx.created_at).slice(0, 7);
          const row = monthMap.get(key);
          if (row) row.transfers += Number(tx.total_amount ?? 0);
        }

        for (const row of monthMap.values()) {
          row.totalCost = row.payroll + row.subscriptions + row.expenses + row.transfers + row.other;
          row.netIncome = row.revenue - row.totalCost;
          row.margin = row.revenue > 0 ? (row.netIncome / row.revenue) * 100 : 0;
        }

        setRows(Array.from(monthMap.values()));
      } catch (err: any) {
        toast({ title: 'Could not load P&L data', description: err?.message, variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthsBack]);

  const totals = useMemo(() => {
    const t = { revenue: 0, payroll: 0, subscriptions: 0, expenses: 0, transfers: 0, other: 0, totalCost: 0, netIncome: 0 };
    for (const r of rows) {
      t.revenue += r.revenue;
      t.payroll += r.payroll;
      t.subscriptions += r.subscriptions;
      t.expenses += r.expenses;
      t.transfers += r.transfers;
      t.other += r.other;
      t.totalCost += r.totalCost;
      t.netIncome += r.netIncome;
    }
    return t;
  }, [rows]);

  const avgMargin = totals.revenue > 0 ? (totals.netIncome / totals.revenue) * 100 : 0;

  const chartData = useMemo(() => rows.map(r => ({
    month: r.month,
    revenue: r.revenue,
    costs: -r.totalCost,
    net: r.netIncome,
  })), [rows]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
        Loading P&amp;L…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI strip */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <TrendingUp className="h-3 w-3" /> Total Revenue
            </p>
            <p className="text-lg font-bold">{formatNairaCompact(totals.revenue)}</p>
            <p className="text-[10px] text-muted-foreground">{rows.length} months</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <TrendingDown className="h-3 w-3" /> Total Costs
            </p>
            <p className="text-lg font-bold text-destructive">{formatNairaCompact(totals.totalCost)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Net Income</p>
            <p className={cn('text-lg font-bold', totals.netIncome >= 0 ? 'text-emerald-600' : 'text-destructive')}>
              {formatNairaCompact(totals.netIncome)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Avg. Margin</p>
            <p className={cn('text-lg font-bold', avgMargin >= 0 ? 'text-emerald-600' : 'text-destructive')}>
              {avgMargin.toFixed(1)}%
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Net income trend chart */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <Receipt className="h-4 w-4 text-primary" />
              Revenue vs. Costs
            </CardTitle>
            <Select value={monthsBack} onValueChange={setMonthsBack}>
              <SelectTrigger className="w-[120px] h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MONTHS_BACK_OPTIONS.map(o => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} stackOffset="sign">
                <CartesianGrid {...GRID} />
                <XAxis dataKey="month" {...AXIS_TICK} />
                <YAxis {...AXIS_TICK} tickFormatter={fmtMillions} />
                <ReTooltip content={<ChartTooltip formatter={(v: number) => formatNaira(Math.abs(v))} />} />
                <Legend />
                <ReferenceLine y={0} stroke="var(--border)" />
                <Bar name="Revenue" dataKey="revenue" fill={SERIES[0]} radius={[3, 3, 0, 0]} />
                <Bar name="Costs" dataKey="costs" fill={SERIES[4] ?? '#dc2626'} radius={[0, 0, 3, 3]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Margin trend */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Net Income Trend</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="netGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={SERIES[0]} stopOpacity={0.15} />
                    <stop offset="100%" stopColor={SERIES[0]} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid {...GRID} />
                <XAxis dataKey="month" {...AXIS_TICK} />
                <YAxis {...AXIS_TICK} tickFormatter={fmtMillions} />
                <ReTooltip content={<ChartTooltip formatter={(v: number) => formatNaira(v)} />} />
                <ReferenceLine y={0} stroke="var(--border)" strokeDasharray="4 2" />
                <Area name="Net income" type="monotone" dataKey="net" stroke={SERIES[0]} strokeWidth={2} fill="url(#netGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* P&L table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Profit &amp; Loss Statement</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[140px]">Line Item</TableHead>
                {rows.map(r => (
                  <TableHead key={r.month} className="text-right min-w-[90px]">{r.month}</TableHead>
                ))}
                <TableHead className="text-right min-w-[100px] font-bold">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {/* Revenue */}
              <TableRow className="font-medium bg-emerald-50/50 dark:bg-emerald-950/20">
                <TableCell className="flex items-center gap-1.5">
                  <ArrowUpRight className="h-3 w-3 text-emerald-600" /> Revenue
                </TableCell>
                {rows.map(r => (
                  <TableCell key={r.month} className="text-right">{formatNairaCompact(r.revenue)}</TableCell>
                ))}
                <TableCell className="text-right font-bold">{formatNairaCompact(totals.revenue)}</TableCell>
              </TableRow>

              {/* Cost lines */}
              <TableRow>
                <TableCell className="pl-6 text-muted-foreground">Payroll</TableCell>
                {rows.map(r => (
                  <TableCell key={r.month} className="text-right text-sm">{formatNairaCompact(r.payroll)}</TableCell>
                ))}
                <TableCell className="text-right font-medium">{formatNairaCompact(totals.payroll)}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="pl-6 text-muted-foreground">Subscriptions</TableCell>
                {rows.map(r => (
                  <TableCell key={r.month} className="text-right text-sm">{formatNairaCompact(r.subscriptions)}</TableCell>
                ))}
                <TableCell className="text-right font-medium">{formatNairaCompact(totals.subscriptions)}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="pl-6 text-muted-foreground">Expenses</TableCell>
                {rows.map(r => (
                  <TableCell key={r.month} className="text-right text-sm">{formatNairaCompact(r.expenses)}</TableCell>
                ))}
                <TableCell className="text-right font-medium">{formatNairaCompact(totals.expenses)}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="pl-6 text-muted-foreground">Transfers</TableCell>
                {rows.map(r => (
                  <TableCell key={r.month} className="text-right text-sm">{formatNairaCompact(r.transfers)}</TableCell>
                ))}
                <TableCell className="text-right font-medium">{formatNairaCompact(totals.transfers)}</TableCell>
              </TableRow>

              {/* Total costs */}
              <TableRow className="font-medium border-t-2">
                <TableCell className="flex items-center gap-1.5">
                  <ArrowDownRight className="h-3 w-3 text-destructive" /> Total Costs
                </TableCell>
                {rows.map(r => (
                  <TableCell key={r.month} className="text-right text-destructive">{formatNairaCompact(r.totalCost)}</TableCell>
                ))}
                <TableCell className="text-right font-bold text-destructive">{formatNairaCompact(totals.totalCost)}</TableCell>
              </TableRow>

              {/* Net income */}
              <TableRow className="font-bold border-t-2 bg-muted/30">
                <TableCell>Net Income</TableCell>
                {rows.map(r => (
                  <TableCell key={r.month} className={cn('text-right', r.netIncome >= 0 ? 'text-emerald-600' : 'text-destructive')}>
                    {formatNairaCompact(r.netIncome)}
                  </TableCell>
                ))}
                <TableCell className={cn('text-right', totals.netIncome >= 0 ? 'text-emerald-600' : 'text-destructive')}>
                  {formatNairaCompact(totals.netIncome)}
                </TableCell>
              </TableRow>

              {/* Margin */}
              <TableRow>
                <TableCell className="text-muted-foreground">Margin</TableCell>
                {rows.map(r => (
                  <TableCell key={r.month} className={cn('text-right text-xs', r.margin >= 0 ? 'text-emerald-600' : 'text-destructive')}>
                    {r.margin.toFixed(1)}%
                  </TableCell>
                ))}
                <TableCell className={cn('text-right text-xs font-medium', avgMargin >= 0 ? 'text-emerald-600' : 'text-destructive')}>
                  {avgMargin.toFixed(1)}%
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <p className="text-[10px] text-muted-foreground text-center">
        Revenue uses the monthly estimate from Company Settings. For accurate P&amp;L, update revenue monthly or connect an invoicing integration.
      </p>
    </div>
  );
}
