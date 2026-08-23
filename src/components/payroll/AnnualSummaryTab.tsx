import { useEffect, useMemo, useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ChartTooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { ChartGradients, GlassTooltip, axisTick, chartAnim, chartTheme } from '@/components/ChartKit';
import { formatNaira, formatNairaCompact } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TrendingUp, TrendingDown, Landmark } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { PENSION_EMPLOYER_RATE, NSITF_RATE } from '@/lib/tax';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface BurnExplainer {
  latest: { period: string; total_burn_ngn: number };
  prev: { period: string; total_burn_ngn: number };
  deltaNgn: number;
  deltaPct: number;
  bonusDeltaNgn: number;
  headcountDelta: number;
  residualNgn: number;
}

interface AnnualSummaryTabProps {
  summaryYear: number;
  setSummaryYear: (y: number) => void;
  availableYears: number[];
  annualSummary: {
    byMonth: {
      label: string;
      gross: number;
      paye: number;
      pension: number;
      nhf: number;
      contractors: number;
      burn: number;
      headcount: number;
      status: string;
    }[];
    totals: {
      gross: number;
      paye: number;
      pension: number;
      nhf: number;
      contractors: number;
      burn: number;
    };
  };
  burnExplainer?: BurnExplainer | null;
  departments?: { id: string; name: string }[];
  bySegment: { id: string; name: string; burn: number; headcount: number }[];
  reportGranularity: 'monthly' | 'quarterly' | 'yearly' | 'all-time';
  setReportGranularity: (g: 'monthly' | 'quarterly' | 'yearly' | 'all-time') => void;
  trendSeries: { label: string; burn: number }[];
}

const GRANULARITY_LABELS: Record<AnnualSummaryTabProps['reportGranularity'], string> = {
  monthly: 'Month to month',
  quarterly: 'Quarter to quarter',
  yearly: 'Year to year',
  'all-time': 'All-time total',
};

// Plain-language read of the month-over-month burn delta — attributes it to
// company-wide bonuses vs. everything else (headcount, PAYE/pension drift,
// allowance changes) instead of leaving HR to guess why the number moved.
function BurnExplainerCard({ explainer }: { explainer: BurnExplainer }) {
  const { latest, prev, deltaNgn, deltaPct, bonusDeltaNgn, headcountDelta, residualNgn } = explainer;
  const up = deltaNgn >= 0;
  const withoutBonusPct = prev.total_burn_ngn > 0 ? (residualNgn / prev.total_burn_ngn) * 100 : 0;

  const parts: string[] = [];
  if (Math.abs(bonusDeltaNgn) >= 1000) {
    parts.push(`${bonusDeltaNgn >= 0 ? '+' : ''}${formatNaira(bonusDeltaNgn)} from company-wide bonuses`);
  }
  if (headcountDelta !== 0) {
    parts.push(`${headcountDelta > 0 ? '+' : ''}${headcountDelta} employee${Math.abs(headcountDelta) === 1 ? '' : 's'} on payroll`);
  }
  if (Math.abs(residualNgn) >= 1000 && Math.abs(bonusDeltaNgn) >= 1000) {
    parts.push(`the rest (${formatNaira(Math.abs(residualNgn))}) from statutory and allowance drift`);
  }

  return (
    <Card className="border-primary/20 bg-gradient-to-br from-primary/[0.04] to-transparent">
      <CardContent className="pt-5 pb-5">
        <div className="flex items-start gap-3">
          <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${up ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300'}`}>
            {up ? <TrendingUp className="h-4.5 w-4.5" /> : <TrendingDown className="h-4.5 w-4.5" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">
              {latest.period} is {Math.abs(deltaPct).toFixed(1)}% {up ? 'above' : 'below'} {prev.period}
              {parts.length > 0 ? ' — here\'s why' : ''}
            </p>
            {parts.length > 0 && (
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                {parts.join(' · ')}.
                {Math.abs(bonusDeltaNgn) >= 1000 && (
                  <> Without the bonus line, burn would be {withoutBonusPct >= 0 ? '+' : ''}{withoutBonusPct.toFixed(1)}% vs {prev.period}.</>
                )}
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface DeptEmployee {
  department_id: string | null;
  salary_ngn: number;
  pension_enabled: boolean | null;
}

// What-if raise simulator — real employee salary data grouped by department,
// so HR sees the full loaded cost of a raise (gross + employer pension +
// NSITF) before committing, not just the headline salary bump.
function RaiseSimulator({ departments }: { departments: { id: string; name: string }[] }) {
  const [employees, setEmployees] = useState<DeptEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [deptId, setDeptId] = useState<string>('all');
  const [raisePct, setRaisePct] = useState(10);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('profiles')
        .select('department_id, salary_ngn, pension_enabled')
        .eq('status', 'active')
        .neq('role', 'driver')
        .gt('salary_ngn', 0);
      setEmployees((data as DeptEmployee[]) || []);
      setLoading(false);
    })();
  }, []);

  const scoped = useMemo(
    () => (deptId === 'all' ? employees : employees.filter((e) => e.department_id === deptId)),
    [employees, deptId],
  );

  const impact = useMemo(() => {
    const currentGross = scoped.reduce((s, e) => s + Number(e.salary_ngn || 0), 0);
    const raiseNgn = currentGross * (raisePct / 100);
    const employerPensionNgn = scoped.reduce(
      (s, e) => s + (e.pension_enabled !== false ? Number(e.salary_ngn || 0) * (raisePct / 100) * PENSION_EMPLOYER_RATE : 0), 0,
    );
    const nsitfNgn = raiseNgn * NSITF_RATE;
    const statutoryNgn = employerPensionNgn + nsitfNgn;
    return {
      headcount: scoped.length,
      raiseMonthlyNgn: raiseNgn,
      raiseAnnualNgn: raiseNgn * 12,
      statutoryAnnualNgn: statutoryNgn * 12,
      totalAnnualNgn: (raiseNgn + statutoryNgn) * 12,
    };
  }, [scoped, raisePct]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <CardTitle className="text-base">What-if: raise simulator</CardTitle>
          <Badge variant="outline" className="text-[9.5px] uppercase tracking-wide">New</Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          Full loaded cost of a raise — gross, plus employer pension and NSITF, not just the headline number.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Department</label>
            <Select value={deptId} onValueChange={setDeptId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All departments</SelectItem>
                {departments.map((d) => (
                  <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Raise — {raisePct}%</label>
            <Slider
              value={[raisePct]}
              onValueChange={([v]) => setRaisePct(v)}
              min={1}
              max={50}
              step={1}
              className="mt-2.5"
            />
          </div>
        </div>

        {loading ? (
          <p className="text-xs text-muted-foreground">Loading employee salaries…</p>
        ) : impact.headcount === 0 ? (
          <p className="text-xs text-muted-foreground">No salaried employees in this scope.</p>
        ) : (
          <div className="rounded-lg bg-muted/50 px-4 py-3 flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-[11px] text-muted-foreground font-medium">Annual cost of this raise</p>
              <p className="text-lg font-extrabold currency mt-0.5">{formatNaira(impact.totalAnnualNgn)}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">across {impact.headcount} employee{impact.headcount === 1 ? '' : 's'}</p>
            </div>
            <div className="text-right">
              <p className="text-[11px] text-muted-foreground font-medium">incl. employer pension + NSITF</p>
              <p className="text-sm font-bold text-warning mt-0.5 currency">+{formatNaira(impact.statutoryAnnualNgn)} statutory</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Only dates verifiably fixed by statute/regulator are computed as actual
// due-date countdowns (PAYE's 10th-of-next-month; ITF's annual 1 April
// return). Pension's "7 working days of payday" and NSITF's "monthly"
// have no single fixed calendar day — inventing one would be a fabricated
// deadline, so those rows show cadence/authority only, matching the
// static STATUTORY_DEADLINES shown at draft-review time in PayrollDialogs.
function nextMonthlyDueDate(day: number): Date {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), day);
  return d < now ? new Date(now.getFullYear(), now.getMonth() + 1, day) : d;
}
function nextAnnualDueDate(monthIndex: number, day: number): Date {
  const now = new Date();
  const d = new Date(now.getFullYear(), monthIndex, day);
  return d < now ? new Date(now.getFullYear() + 1, monthIndex, day) : d;
}
function daysUntil(d: Date): number {
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const target = new Date(d); target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - now.getTime()) / 86_400_000);
}

function StatutoryRemittanceCalendar() {
  const paye = nextMonthlyDueDate(10);
  const itf = nextAnnualDueDate(3, 1); // 1 April
  const computed = [
    { name: 'PAYE', sub: 'FIRS / State IRS', date: paye },
    { name: 'ITF', sub: '1% of annual payroll · annual return', date: itf },
  ];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Landmark className="h-4 w-4" /> Statutory remittance calendar
        </CardTitle>
      </CardHeader>
      <CardContent className="divide-y divide-border/60 pt-0">
        {computed.map((r) => {
          const days = daysUntil(r.date);
          return (
            <div key={r.name} className="flex items-center justify-between py-2.5">
              <div>
                <p className="text-sm font-medium">{r.name}</p>
                <p className="text-[11px] text-muted-foreground">{r.sub}</p>
              </div>
              <span className={cn('text-xs font-bold tabular-nums', days <= 7 ? 'text-warning' : 'text-foreground')}>
                {r.date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
              </span>
            </div>
          );
        })}
        <div className="flex items-center justify-between py-2.5">
          <div>
            <p className="text-sm font-medium">Pension</p>
            <p className="text-[11px] text-muted-foreground">PenCom · within 7 working days of each payday</p>
          </div>
          <span className="text-xs text-muted-foreground">Per run</span>
        </div>
        <div className="flex items-center justify-between py-2.5">
          <div>
            <p className="text-sm font-medium">NSITF</p>
            <p className="text-[11px] text-muted-foreground">1% employer · monthly, employer-borne</p>
          </div>
          <span className="text-xs text-muted-foreground">Monthly</span>
        </div>
        <div className="flex items-center justify-between py-2.5">
          <div>
            <p className="text-sm font-medium">NHF</p>
            <p className="text-[11px] text-muted-foreground">Opt-in only — see Payroll → Setup</p>
          </div>
          <span className="text-xs text-muted-foreground">—</span>
        </div>
      </CardContent>
    </Card>
  );
}

const SEGMENT_ICON_COLOURS = [
  'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
  'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
  'bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300',
  'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
];

function SegmentIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <circle cx="9" cy="8" r="3.2" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><circle cx="17.5" cy="9" r="2.6" /><path d="M15.5 13.2a5 5 0 0 1 6 4.8" />
    </svg>
  );
}

export const AnnualSummaryTab = ({ summaryYear, setSummaryYear, availableYears, annualSummary, burnExplainer, departments = [], bySegment, reportGranularity, setReportGranularity, trendSeries }: AnnualSummaryTabProps) => {
  return (
    <>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <h2 className="text-lg font-semibold">Payroll Summary — {summaryYear}</h2>
            <div className="flex gap-2">
              {availableYears.map((y) => (
                <Button
                  key={y}
                  size="sm"
                  variant={y === summaryYear ? 'default' : 'outline'}
                  onClick={() => setSummaryYear(y)}
                >
                  {y}
                </Button>
              ))}
            </div>
          </div>

          {bySegment.length > 1 && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {bySegment.map((s, i) => (
                <Card key={s.id}>
                  <CardContent className="pt-4 pb-4">
                    <span className={cn('flex h-7 w-7 items-center justify-center rounded-lg mb-2.5', SEGMENT_ICON_COLOURS[i % SEGMENT_ICON_COLOURS.length])}>
                      <SegmentIcon />
                    </span>
                    <p className="kd-display text-lg font-extrabold currency">{formatNaira(s.burn)}</p>
                    <p className="text-xs font-semibold mt-1 truncate">{s.name}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {s.headcount} employee{s.headcount === 1 ? '' : 's'} paid across {summaryYear}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {burnExplainer && <BurnExplainerCard explainer={burnExplainer} />}

          <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-4">
            {/* Always render the card — a prior version hid it entirely
                whenever the selected year (or, later, every granularity)
                had zero non-draft burn, which meant a brand-new account
                with nothing approved yet saw no chart, no selector, and no
                explanation why. Each granularity branch below now owns its
                own empty state instead. */}
            <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <CardTitle className="text-base">
                      {reportGranularity === 'monthly' ? `Month-by-month breakdown — ${summaryYear}` : GRANULARITY_LABELS[reportGranularity]}
                    </CardTitle>
                    <Select value={reportGranularity} onValueChange={(v) => setReportGranularity(v as AnnualSummaryTabProps['reportGranularity'])}>
                      <SelectTrigger className="h-8 w-[168px] text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="monthly">Month to month</SelectItem>
                        <SelectItem value="quarterly">Quarter to quarter</SelectItem>
                        <SelectItem value="yearly">Year to year</SelectItem>
                        <SelectItem value="all-time">All-time total</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardHeader>
                <CardContent>
                  {reportGranularity === 'monthly' && annualSummary.totals.burn === 0 ? (
                    <p className="text-sm text-muted-foreground py-8 text-center">
                      No non-draft runs in {summaryYear} yet — approve a run to see it here.
                    </p>
                  ) : reportGranularity === 'monthly' ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={annualSummary.byMonth} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                        <ChartGradients />
                        <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridLine} vertical={false} />
                        <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} />
                        <YAxis tickFormatter={(v) => formatNairaCompact(v)} tick={axisTick} axisLine={false} tickLine={false} />
                        <ChartTooltip
                          content={<GlassTooltip />}
                          formatter={(v: number) => formatNaira(v)}
                          cursor={{ fill: chartTheme.primary, fillOpacity: 0.06 }}
                        />
                        <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                        <Bar dataKey="gross" fill="url(#kd-grad-primary)" name="Gross salary" stackId="a" radius={[0, 0, 0, 0]} {...chartAnim} />
                        <Bar dataKey="contractors" fill={chartTheme.secondary} name="Contractors" stackId="a" radius={[4, 4, 0, 0]} {...chartAnim} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : trendSeries.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-8 text-center">No non-draft runs yet.</p>
                  ) : reportGranularity === 'all-time' ? (
                    <div className="flex flex-col items-center justify-center py-10">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Total burn, all time</p>
                      <p className="text-4xl font-extrabold currency mt-2">{formatNaira(trendSeries[0].burn)}</p>
                      <p className="text-xs text-muted-foreground mt-2">Across every non-draft payroll run on record</p>
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={trendSeries} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                        <ChartGradients />
                        <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridLine} vertical={false} />
                        <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} />
                        <YAxis tickFormatter={(v) => formatNairaCompact(v)} tick={axisTick} axisLine={false} tickLine={false} />
                        <ChartTooltip
                          content={<GlassTooltip />}
                          formatter={(v: number) => formatNaira(v)}
                          cursor={{ fill: chartTheme.primary, fillOpacity: 0.06 }}
                        />
                        <Bar dataKey="burn" fill="url(#kd-grad-primary)" name="Total burn" radius={[4, 4, 0, 0]} {...chartAnim} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            <StatutoryRemittanceCalendar />
          </div>

          <Card>
            <CardContent className="pt-6">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Month</TableHead>
                      <TableHead className="text-right">Headcount</TableHead>
                      <TableHead className="text-right">Gross salary</TableHead>
                      <TableHead className="text-right">PAYE</TableHead>
                      <TableHead className="text-right">Pension</TableHead>
                      <TableHead className="text-right">NHF</TableHead>
                      <TableHead className="text-right">Contractors</TableHead>
                      <TableHead className="text-right">Total burn</TableHead>
                      <TableHead className="text-center">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {annualSummary.byMonth.map((m) => (
                      <TableRow key={m.label} className={m.status === 'none' ? 'opacity-40' : ''}>
                        <TableCell className="font-medium">{m.label}</TableCell>
                        <TableCell className="text-right tabular-nums">{m.headcount || '—'}</TableCell>
                        <TableCell className="text-right tabular-nums currency">{m.gross > 0 ? formatNaira(m.gross) : '—'}</TableCell>
                        <TableCell className="text-right tabular-nums currency">{m.paye > 0 ? formatNaira(m.paye) : '—'}</TableCell>
                        <TableCell className="text-right tabular-nums currency">{m.pension > 0 ? formatNaira(m.pension) : '—'}</TableCell>
                        <TableCell className="text-right tabular-nums currency">{m.nhf > 0 ? formatNaira(m.nhf) : '—'}</TableCell>
                        <TableCell className="text-right tabular-nums currency">{m.contractors > 0 ? formatNaira(m.contractors) : '—'}</TableCell>
                        <TableCell className="text-right tabular-nums currency font-semibold">{m.burn > 0 ? formatNaira(m.burn) : '—'}</TableCell>
                        <TableCell className="text-center">
                          {m.status === 'paid' && <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 text-[10px]">Paid</Badge>}
                          {m.status === 'pending' && <Badge variant="outline" className="text-[10px]">Pending</Badge>}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="font-bold border-t-2 bg-muted/30">
                      <TableCell>Total ({summaryYear})</TableCell>
                      <TableCell className="text-right">—</TableCell>
                      <TableCell className="text-right tabular-nums currency">{formatNaira(annualSummary.totals.gross)}</TableCell>
                      <TableCell className="text-right tabular-nums currency">{formatNaira(annualSummary.totals.paye)}</TableCell>
                      <TableCell className="text-right tabular-nums currency">{formatNaira(annualSummary.totals.pension)}</TableCell>
                      <TableCell className="text-right tabular-nums currency">{formatNaira(annualSummary.totals.nhf)}</TableCell>
                      <TableCell className="text-right tabular-nums currency">{formatNaira(annualSummary.totals.contractors)}</TableCell>
                      <TableCell className="text-right tabular-nums currency">{formatNaira(annualSummary.totals.burn)}</TableCell>
                      <TableCell />
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <RaiseSimulator departments={departments} />
    </>
  );
};
