import { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ReTooltip,
} from 'recharts';
import { Gauge, Wallet, TrendingDown, Users, AlertTriangle, ShieldAlert, CalendarClock, PiggyBank, LayoutGrid, Calculator, CalendarRange, Users2, Bot } from 'lucide-react';

import { PageHeader } from '@/components/ui-kit/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { usePageTitle } from '@/hooks/usePageTitle';
import { formatNaira, formatNairaCompact, formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import CostIntelligenceTab from '@/components/finance/CostIntelligenceTab';
import CashTimingTab from '@/components/finance/CashTimingTab';
import TalentCostTab from '@/components/finance/TalentCostTab';
import AutopilotTab from '@/components/finance/AutopilotTab';
import {
  fetchFinancialPulse,
  fetchDepartmentCostBreakdown,
  fetchPayrollTrend,
  fetchOverdueCompliance,
  fetchUpcomingRenewals,
  fetchCurrentBudgetUtilization,
  type FinancialPulse,
  type DepartmentCostRow,
  type PayrollTrendPoint,
  type ComplianceAlert,
  type UpcomingRenewal,
  type BudgetUtilization,
} from '@/lib/cfo-dashboard';
import { RUNWAY_CRITICAL_WEEKS, RUNWAY_WARNING_WEEKS } from '@/lib/cashflow';

const RUNWAY_BAND_TONE: Record<string, { tone: string; label: string }> = {
  critical: { tone: 'bg-destructive/15 text-destructive border-destructive/30', label: 'Critical' },
  warning:  { tone: 'bg-amber-500/15 text-amber-700 border-amber-500/30',       label: 'Warning'  },
  caution:  { tone: 'bg-amber-300/20 text-amber-700 border-amber-400/30',        label: 'Caution'  },
  healthy:  { tone: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30',  label: 'Healthy'  },
  unknown:  { tone: 'bg-muted text-muted-foreground border-border',              label: 'Unknown'  },
};

const COMPLIANCE_KIND_LABEL: Record<string, string> = {
  paye: 'PAYE', pension: 'Pension', vat: 'VAT', wht: 'WHT',
  tcc: 'TCC', cac: 'CAC', itf: 'ITF', nsitf: 'NSITF', nhf: 'NHF',
};

export default function FinanceDashboard() {
  usePageTitle('Finance');
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [pulse, setPulse] = useState<FinancialPulse | null>(null);
  const [departments, setDepartments] = useState<DepartmentCostRow[]>([]);
  const [trend, setTrend] = useState<PayrollTrendPoint[]>([]);
  const [overdueCompliance, setOverdueCompliance] = useState<ComplianceAlert[]>([]);
  const [renewals, setRenewals] = useState<UpcomingRenewal[]>([]);
  const [budgets, setBudgets] = useState<BudgetUtilization[]>([]);

  const load = async () => {
    setLoading(true);
    try {
      const [pulseRes, deptRes, trendRes, complianceRes, renewalsRes, budgetsRes] = await Promise.all([
        fetchFinancialPulse(),
        fetchDepartmentCostBreakdown(),
        fetchPayrollTrend(12),
        fetchOverdueCompliance(),
        fetchUpcomingRenewals(30),
        fetchCurrentBudgetUtilization(),
      ]);
      setPulse(pulseRes);
      setDepartments(deptRes);
      setTrend(trendRes);
      setOverdueCompliance(complianceRes);
      setRenewals(renewalsRes);
      setBudgets(budgetsRes);
    } catch (err: any) {
      toast({ title: 'Could not load Finance dashboard', description: err?.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const bandStyle = pulse ? RUNWAY_BAND_TONE[pulse.runway_band] : RUNWAY_BAND_TONE.unknown;

  const deptChartData = useMemo(
    () => departments.map((d) => ({
      name: d.department_name,
      gross: Math.round(d.total_gross_ngn),
      employerPension: Math.round(d.total_employer_pension_ngn),
      nsitf: Math.round(d.total_nsitf_ngn),
    })),
    [departments],
  );

  const trendChartData = useMemo(
    () => trend.map((t) => ({
      label: t.period.slice(2), // "26-08"
      burn: Math.round(t.total_burn_ngn),
    })),
    [trend],
  );

  const totalCtc = useMemo(
    () => departments.reduce((s, d) => s + d.total_ctc_ngn, 0),
    [departments],
  );

  const latestTrend = trend.length > 0 ? trend[trend.length - 1] : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Finance"
        description="The board-level view — people cost, cash runway, compliance and upcoming obligations in one place. Airtable stays your granular base; this is the summary."
        icon={Gauge}
      />

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview" className="gap-1.5"><LayoutGrid className="h-3.5 w-3.5" /> Overview</TabsTrigger>
          <TabsTrigger value="cost-intelligence" className="gap-1.5"><Calculator className="h-3.5 w-3.5" /> Cost Intelligence</TabsTrigger>
          <TabsTrigger value="cash-timing" className="gap-1.5"><CalendarRange className="h-3.5 w-3.5" /> Cash Timing</TabsTrigger>
          <TabsTrigger value="talent-cost" className="gap-1.5"><Users2 className="h-3.5 w-3.5" /> Talent Cost</TabsTrigger>
          <TabsTrigger value="autopilot" className="gap-1.5"><Bot className="h-3.5 w-3.5" /> Autopilot</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6 mt-0">

      {/* ─── Financial pulse ────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Wallet className="h-4 w-4 text-primary" /> Cash on hand
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatNaira(pulse?.cash_on_hand_ngn ?? 0)}</p>
            {pulse?.cash_is_stale && (
              <p className="text-xs text-amber-600 mt-1">Not updated in over 7 days</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-amber-600" /> Net monthly burn
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatNaira(pulse?.net_monthly_burn_ngn ?? 0)}</p>
            <p className="text-xs text-muted-foreground mt-1">External burn − revenue estimate</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" /> Runway
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-2">
              <p className="text-2xl font-bold">
                {pulse?.runway_weeks == null ? '—' : `${pulse.runway_weeks.toFixed(1)}w`}
              </p>
              <Badge variant="outline" className={cn('mb-1', bandStyle.tone)}>{bandStyle.label}</Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Critical &lt; {RUNWAY_CRITICAL_WEEKS}w · Warning &lt; {RUNWAY_WARNING_WEEKS}w
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" /> Headcount
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{pulse?.total_headcount ?? 0}</p>
            <p className="text-xs text-muted-foreground mt-1">Active, salaried, excl. drivers</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <PiggyBank className="h-4 w-4 text-primary" /> Revenue / employee
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {pulse?.revenue_per_employee_ngn == null ? '—' : formatNairaCompact(pulse.revenue_per_employee_ngn)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Monthly revenue estimate ÷ headcount</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Gauge className="h-4 w-4 text-primary" /> Payroll % of revenue
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {pulse?.payroll_pct_of_revenue == null ? '—' : `${pulse.payroll_pct_of_revenue.toFixed(0)}%`}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Latest approved payroll run</p>
          </CardContent>
        </Card>
      </div>

      {/* ─── People cost by department ─────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">People cost by department</CardTitle>
          <p className="text-xs text-muted-foreground">
            Total cost-to-company: {formatNaira(totalCtc)} (gross salary + employer pension 10% + NSITF 1%)
          </p>
        </CardHeader>
        <CardContent>
          {departments.length === 0 && !loading ? (
            <p className="text-sm text-muted-foreground text-center py-12">
              No salaried employees found yet.
            </p>
          ) : (
            <>
              <div className="h-[260px] mb-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={deptChartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" fontSize={11} />
                    <YAxis fontSize={11} tickFormatter={(v: number) => `₦${(v / 1_000_000).toFixed(1)}M`} />
                    <ReTooltip formatter={(v: number) => formatNaira(v)} />
                    <Bar dataKey="gross" stackId="a" name="Gross salary" fill="hsl(var(--primary))" />
                    <Bar dataKey="employerPension" stackId="a" name="Employer pension" fill="hsl(var(--primary) / 0.6)" />
                    <Bar dataKey="nsitf" stackId="a" name="NSITF" fill="hsl(var(--primary) / 0.35)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Department</TableHead>
                      <TableHead className="text-right">Headcount</TableHead>
                      <TableHead className="text-right">Gross salary</TableHead>
                      <TableHead className="text-right">Cost-to-company</TableHead>
                      <TableHead className="text-right">% of total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {departments.map((d) => (
                      <TableRow key={d.department_id ?? 'none'}>
                        <TableCell className="font-medium">{d.department_name}</TableCell>
                        <TableCell className="text-right">{d.headcount}</TableCell>
                        <TableCell className="text-right">{formatNaira(d.total_gross_ngn)}</TableCell>
                        <TableCell className="text-right font-medium">{formatNaira(d.total_ctc_ngn)}</TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {totalCtc > 0 ? `${((d.total_ctc_ngn / totalCtc) * 100).toFixed(0)}%` : '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ─── Payroll trend ──────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Payroll cost trend</CardTitle>
          {latestTrend?.delta_ngn != null && (
            <p className="text-xs text-muted-foreground">
              {latestTrend.delta_ngn >= 0 ? '+' : ''}{formatNaira(latestTrend.delta_ngn)}
              {latestTrend.delta_pct != null && ` (${latestTrend.delta_pct >= 0 ? '+' : ''}${latestTrend.delta_pct.toFixed(1)}%)`} vs previous run
            </p>
          )}
        </CardHeader>
        <CardContent className="h-[220px]">
          {trendChartData.length === 0 && !loading ? (
            <p className="text-sm text-muted-foreground text-center py-12">
              No approved payroll runs yet.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendChartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" fontSize={11} />
                <YAxis fontSize={11} tickFormatter={(v: number) => `₦${(v / 1_000_000).toFixed(1)}M`} />
                <ReTooltip formatter={(v: number) => formatNaira(v)} labelFormatter={(l: string) => `Period ${l}`} />
                <Line type="monotone" dataKey="burn" name="Total payroll burn" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* ─── Upcoming obligations & compliance ─────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-destructive" /> Overdue compliance filings
            </CardTitle>
          </CardHeader>
          <CardContent>
            {overdueCompliance.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">Nothing overdue.</p>
            ) : (
              <div className="space-y-2">
                {overdueCompliance.map((c) => (
                  <div key={c.id} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
                    <div>
                      <p className="text-sm font-medium">
                        {COMPLIANCE_KIND_LABEL[c.kind] ?? c.kind.toUpperCase()} — {c.period}
                      </p>
                      <p className="text-xs text-muted-foreground">Due {formatDate(c.due_date)}</p>
                    </div>
                    <div className="text-right">
                      {c.amount_ngn != null && <p className="text-sm font-medium">{formatNaira(c.amount_ngn)}</p>}
                      <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30">
                        {c.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-primary" /> Renewals — next 30 days
            </CardTitle>
          </CardHeader>
          <CardContent>
            {renewals.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">No subscriptions renewing soon.</p>
            ) : (
              <div className="space-y-2">
                {renewals.map((r) => (
                  <div key={r.id} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
                    <div>
                      <p className="text-sm font-medium">{r.name}</p>
                      <p className="text-xs text-muted-foreground">Renews {formatDate(r.next_renewal_date)}</p>
                    </div>
                    <p className="text-sm font-medium">{formatNaira(r.amount_ngn)}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ─── Budget utilization ─────────────────────────────────────── */}
      {budgets.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <PiggyBank className="h-4 w-4 text-primary" /> Current budget utilization
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {budgets.map((b) => (
              <div key={b.budget_id} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{b.name}</span>
                  <span className="text-muted-foreground">
                    {formatNaira(b.actual_ngn)} / {formatNaira(b.planned_ngn)}
                    {b.utilization_pct != null && ` (${b.utilization_pct.toFixed(0)}%)`}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-full kd-transition',
                      (b.utilization_pct ?? 0) > 100 ? 'bg-destructive' : 'bg-primary',
                    )}
                    style={{ width: `${Math.min(100, b.utilization_pct ?? 0)}%` }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

        </TabsContent>

        <TabsContent value="cost-intelligence" className="mt-0">
          <CostIntelligenceTab />
        </TabsContent>

        <TabsContent value="cash-timing" className="mt-0">
          <CashTimingTab />
        </TabsContent>

        <TabsContent value="talent-cost" className="mt-0">
          <TalentCostTab />
        </TabsContent>

        <TabsContent value="autopilot" className="mt-0">
          <AutopilotTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
