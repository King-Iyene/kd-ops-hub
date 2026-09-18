import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Wallet, Users2, CalendarClock, Layers, BarChart3 } from 'lucide-react';
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from 'recharts';
import { ChartGradients, GlassTooltip, axisTick, chartTheme, chartAnim } from '@/components/ChartKit';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { formatNaira, formatNairaCompact, daysUntil } from '@/lib/format';
import { displayName } from '@/lib/name';
import { PayrollLifecycleRail, realStepIndex } from '@/components/payroll/PayrollLifecycleRail';
import { ALL_COMPANIES } from '@/components/ui-kit/CompanySwitcher';
import { InfoHint } from '@/components/ui-kit/InfoHint';
import { cn } from '@/lib/utils';

interface PayrollRunLite {
  id: string;
  period: string;
  employee_count?: number;
  total_burn_ngn: number;
  status: 'draft' | 'pending_approval' | 'approved' | 'processing' | 'paid';
}

interface WhoGetsPaidRow {
  id: string;
  name: string;
  photo_url: string | null;
  role: string | null;
  job_title: string | null;
  amount: number;
}

/**
 * Dashboard landing view for the Payroll module — a hero summary of the most
 * recent non-paid run (or the latest run overall if everything's settled),
 * key stat tiles, a burn-history trend, and a "who gets paid" preview.
 * Every figure here is read from the same `payroll_runs`/`profiles` tables
 * the Runs tab already uses — nothing is fabricated.
 */
export function PayrollDashboardTab({
  runs,
  trend,
  selectedCompanyId,
  companyPayGroupIds,
  monthLabel,
  onOpenRun,
  onNewDraft,
}: {
  runs: PayrollRunLite[];
  trend: { label: string; burn: number }[];
  /** Which company's pay groups to scope "Pay groups" and "Who gets paid" to. */
  selectedCompanyId?: string;
  companyPayGroupIds: string[];
  monthLabel: (period: string, periodType?: string) => string;
  onOpenRun: (runId: string) => void;
  onNewDraft: () => void;
}) {
  const { profile } = useAuthStore();
  const navigate = useNavigate();
  const isAllCompanies = selectedCompanyId === ALL_COMPANIES;
  const [payGroupCount, setPayGroupCount] = useState<number | null>(null);
  const [nextPayDate, setNextPayDate] = useState<Date | null>(null);
  const [inflow, setInflow] = useState<number | null>(null);
  const [whoGetsPaid, setWhoGetsPaid] = useState<WhoGetsPaidRow[]>([]);
  // Everyone who would be paid in scope, not the hero run's count: the tile
  // is labelled "On payroll" and a run's count is a different number the
  // moment a group is excluded or a second run exists.
  const [headcount, setHeadcount] = useState<number | null>(null);
  const [loadingExtras, setLoadingExtras] = useState(true);

  // Total across whatever window `trend` covers, plus a label that names the
  // window rather than asserting a period it might not be.
  const trendTotal = useMemo(
    () => trend.reduce((sum, t) => sum + (Number(t.burn) || 0), 0),
    [trend],
  );
  const trendTotalLabel = useMemo(() => {
    if (trend.length === 0) return 'Nothing paid out yet';
    if (trend.length === 1) return `Total for ${trend[0].label}`;
    return `Total, ${trend[0].label} to ${trend[trend.length - 1].label}`;
  }, [trend]);

  const heroRun = useMemo(() => {
    const active = runs.find((r) => r.status !== 'paid');
    return active || runs[0] || null;
  }, [runs]);

  const paidThisMonth = useMemo(() => {
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    return runs
      .filter((r) => r.status === 'paid' && r.period.startsWith(thisMonth))
      .reduce((sum, r) => sum + (r.total_burn_ngn || 0), 0);
  }, [runs]);

  useEffect(() => {
    let cancelled = false;
    setPayGroupCount(null);
    setNextPayDate(null);
    setWhoGetsPaid([]);
    setHeadcount(null);
    if (!selectedCompanyId) return;
    (async () => {
      setLoadingExtras(true);
      const safePayGroupIds = companyPayGroupIds.length > 0 ? companyPayGroupIds : ['00000000-0000-0000-0000-000000000000'];
      // In "All companies" mode selectedCompanyId is a sentinel, not a uuid —
      // counting groups must not filter by it (Postgres would reject the
      // comparison outright and the tile would silently render blank).
      const groupsQuery = supabase
        .from('pay_groups')
        .select('id', { count: 'exact', head: true })
        .eq('is_active', true);
      const headcountQuery = supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'active')
        .neq('role', 'driver')
        .gt('salary_ngn', 0)
        .in('pay_group_id', safePayGroupIds);
      const [groupsRes, schedulesRes, expectedRes, roster, headcountRes] = await Promise.all([
        isAllCompanies ? groupsQuery : groupsQuery.eq('company_id', selectedCompanyId),
        supabase.from('pay_schedules').select('id').eq('is_active', true).order('created_at', { ascending: true }),
        // "In" this period — approved & unbudgeted income the company expects,
        // reused from expenses/invoices would be a stretch; the honest, already
        // -wired number here is incoming cash tracked as approved company revenue.
        supabase.from('company_settings').select('id').limit(1),
        supabase
          .from('profiles')
          .select('id, full_name, first_name, last_name, email, photo_url, role, job_title, salary_ngn, pay_group_id')
          .eq('status', 'active')
          .neq('role', 'driver')
          .gt('salary_ngn', 0)
          .in('pay_group_id', safePayGroupIds)
          .order('salary_ngn', { ascending: false })
          .limit(6),
        headcountQuery,
      ]);
      if (cancelled) return;
      setPayGroupCount(groupsRes.count ?? 0);
      setHeadcount(headcountRes.count ?? 0);
      void expectedRes;

      // Next pay date — earliest upcoming date across all active schedules,
      // via the same next_pay_dates RPC the Setup tab's banner already uses.
      const schedules = (schedulesRes.data || []) as { id: string }[];
      let earliest: Date | null = null;
      for (const s of schedules) {
        const { data } = await supabase.rpc('next_pay_dates', { p_schedule_id: s.id, p_count: 1 });
        const row = (data as { pay_date: string }[] | null)?.[0];
        if (row) {
          const d = new Date(row.pay_date);
          if (!earliest || d < earliest) earliest = d;
        }
      }
      if (!cancelled) setNextPayDate(earliest);

      if (cancelled) return;
      setWhoGetsPaid(
        ((roster.data || []) as any[]).map((r) => ({
          id: r.id,
          name: displayName(r.first_name, r.last_name, r.full_name || r.email),
          photo_url: r.photo_url || null,
          role: r.role,
          job_title: r.job_title || null,
          amount: Number(r.salary_ngn || 0),
        })),
      );

      // "In" tile — this month's recorded revenue (finance's revenue_entries
      // ledger, the same table the Finance dashboard reads from).
      const now = new Date();
      const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const { data: incomeRows, error: incomeErr } = await supabase
        .from('revenue_entries')
        .select('amount_ngn')
        .eq('month', currentMonth);
      if (!incomeErr) {
        setInflow((incomeRows || []).reduce((s: number, r: any) => s + Number(r.amount_ngn || 0), 0));
      } else {
        setInflow(null);
      }
      if (!cancelled) setLoadingExtras(false);
    })();
    return () => { cancelled = true; };
  }, [selectedCompanyId, companyPayGroupIds, isAllCompanies]);

  const firstName = profile?.full_name?.split(' ')?.[0] || 'there';
  const greetingHour = new Date().getHours();
  const greeting = greetingHour < 12 ? 'Good morning' : greetingHour < 18 ? 'Good afternoon' : 'Good evening';

  const heroStep = heroRun ? realStepIndex(heroRun.status) : -1;

  const runsThisYear = runs.filter((r) => r.period.startsWith(String(new Date().getFullYear()))).length;

  return (
    <div className="space-y-3 sm:space-y-6">
      {/* ── Greeting ──────────────────────────────────────────────── */}
      <div>
        <h2 className="text-xl font-bold tracking-tight">{greeting}, {firstName}</h2>
        <p className="text-sm text-muted-foreground mt-0.5">Here's where payroll stands right now.</p>
      </div>

      {/* ── Hero + KPIs ───────────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-12">
        {/* Hero run summary — takes 8 of 12 cols */}
        <Card className="lg:col-span-8 overflow-hidden border-0 bg-gradient-to-br from-[hsl(200,90%,14%)] via-[hsl(200,95%,10%)] to-[hsl(205,90%,7%)] text-white">
          <CardContent className="p-4 sm:p-6 space-y-4 sm:space-y-5">
            {heroRun ? (
              <>
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <p className="text-2xs uppercase tracking-[0.1em] text-white/50 font-semibold">
                      {heroRun.status === 'draft' ? 'Draft run' : monthLabel(heroRun.period)}
                    </p>
                    <p className="text-2xl sm:text-3xl md:text-4xl font-extrabold mt-1.5 tabular-nums tracking-tight">{formatNairaCompact(heroRun.total_burn_ngn)}</p>
                    <p className="text-xs text-white/50 mt-1.5 font-medium">
                      {heroRun.employee_count ?? '—'} employee{heroRun.employee_count === 1 ? '' : 's'} · {monthLabel(heroRun.period)}
                    </p>
                  </div>
                  {heroRun.status !== 'paid' && (
                    <Button
                      size="sm"
                      className="bg-white text-[#00283d] hover:bg-white/90 shadow-lg shadow-black/20"
                      onClick={() => onOpenRun(heroRun.id)}
                    >
                      Review &amp; approve <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
                {heroStep >= 0 && (
                  <PayrollLifecycleRail status={heroRun.status} variant="dark" className="pt-1" />
                )}
              </>
            ) : (
              <div className="flex flex-col items-start gap-3 py-4">
                <p className="text-sm text-white/70">No payroll runs yet.</p>
                <Button size="sm" className="bg-white text-[#00283d] hover:bg-white/90" onClick={onNewDraft}>
                  Start a payroll run
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right KPI column — 4 of 12 cols, 2×2 grid */}
        <div className="lg:col-span-4 grid grid-cols-2 gap-3">
          <StatTile
            icon={<Wallet className="h-4 w-4" />}
            label="Paid this month"
            value={formatNairaCompact(paidThisMonth)}
            tone="primary"
          />
          <StatTile
            icon={<CalendarClock className="h-4 w-4" />}
            label="Next pay date"
            value={
              nextPayDate
                ? nextPayDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
                : '—'
            }
            hint={
              nextPayDate
                ? `${Math.max(0, daysUntil(nextPayDate) ?? 0)} day${Math.abs(daysUntil(nextPayDate) ?? 0) === 1 ? '' : 's'} away`
                : loadingExtras ? 'Loading…' : 'No schedule'
            }
            tone="info"
          />
          <StatTile
            icon={<Users2 className="h-4 w-4" />}
            label="On payroll"
            value={headcount != null ? String(headcount) : '—'}
            hint={
              headcount == null
                ? (loadingExtras ? 'Loading…' : undefined)
                : isAllCompanies ? 'Across every company' : 'In this company'
            }
            tone="success"
          />
          <StatTile
            icon={<Layers className="h-4 w-4" />}
            label="Pay groups"
            value={payGroupCount != null ? String(payGroupCount) : '—'}
          />
        </div>
      </div>

      {/* ── Trend + Roster ────────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-12">
        {/* Burn history — 8 cols */}
        <Card className="lg:col-span-8">
          <CardContent className="p-5">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <p className="text-sm font-semibold flex items-center gap-1.5">
                  Burn history
                  <InfoHint>
                    What payroll has actually cost, month by month. Each bar is
                    the total that left the account for that month&rsquo;s runs
                    &mdash; gross pay plus the employer&rsquo;s own
                    contributions, not just what landed in people&rsquo;s
                    accounts.
                  </InfoHint>
                </p>
                <p className="text-2xs text-muted-foreground font-medium mt-0.5">
                  {trendTotalLabel}
                </p>
              </div>
              {/* The brief asks for the total to be stated outright rather than
                  left to be read off the bars: "what has payroll cost us" is
                  the question the chart is opened to answer, and a column of
                  bars answers it only approximately. */}
              <div className="text-right shrink-0">
                <p className="text-xl font-extrabold tabular-nums tracking-tight leading-none">
                  {trend.length > 0 ? formatNairaCompact(trendTotal) : '—'}
                </p>
                <p className="text-2xs text-muted-foreground font-medium mt-1 tabular-nums">
                  {runsThisYear} run{runsThisYear !== 1 ? 's' : ''} this year
                </p>
              </div>
            </div>
            {trend.length >= 2 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={trend} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
                  <ChartGradients />
                  <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} />
                  <Tooltip content={<GlassTooltip formatter={(v: number) => formatNaira(v)} />} />
                  <Bar dataKey="burn" fill="url(#kd-grad-primary)" radius={[6, 6, 0, 0]} {...chartAnim} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <BarChart3 className="h-8 w-8 text-muted-foreground/30 mb-2" />
                <p className="text-xs text-muted-foreground">Run two or more payrolls to see a trend.</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Who gets paid — 4 cols */}
        <Card className="lg:col-span-4">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-semibold">Who gets paid</p>
              <a
                className="text-2xs text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5 kd-transition font-medium no-underline"
                href="/employees"
                onClick={(e) => { e.preventDefault(); navigate('/employees'); }}
              >
                View all <ArrowRight className="h-3 w-3" />
              </a>
            </div>
            <div className="space-y-2.5">
              {whoGetsPaid.length === 0 && (
                <p className="text-xs text-muted-foreground py-4 text-center">No salaried employees found.</p>
              )}
              {whoGetsPaid.map((p) => (
                <div key={p.id} className="flex items-center gap-2.5 py-1 -mx-1.5 px-1.5 rounded-lg hover:bg-muted/50 kd-transition">
                  <Avatar className="h-7 w-7 shrink-0">
                    {p.photo_url && <AvatarImage src={p.photo_url} alt={p.name} />}
                    <AvatarFallback className="text-3xs font-semibold bg-primary/10 text-primary">
                      {initials(p.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium truncate leading-tight">{p.name}</p>
                    <p className="text-2xs text-muted-foreground truncate capitalize leading-tight">{p.job_title || p.role?.replace(/_/g, ' ') || '—'}</p>
                  </div>
                  <p className="text-xs font-semibold tabular-nums shrink-0 tracking-tight">{formatNairaCompact(p.amount)}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const TILE_TONE: Record<string, { iconBg: string; iconColor: string }> = {
  default:  { iconBg: 'bg-muted',        iconColor: 'text-muted-foreground' },
  primary:  { iconBg: 'bg-primary/10',    iconColor: 'text-primary' },
  success:  { iconBg: 'bg-success/10/25', iconColor: 'text-success' },
  info:     { iconBg: 'bg-sky-50 dark:bg-sky-900/25', iconColor: 'text-sky-600 dark:text-sky-400' },
};

function StatTile({
  icon, label, value, hint, tone = 'default',
}: { icon: React.ReactNode; label: string; value: string; hint?: string; tone?: keyof typeof TILE_TONE }) {
  const t = TILE_TONE[tone] || TILE_TONE.default;
  return (
    <Card className="h-full">
      <CardContent className="p-4 flex items-start gap-3">
        <span className={cn('flex h-8 w-8 items-center justify-center rounded-xl shrink-0', t.iconBg, t.iconColor)}>
          {icon}
        </span>
        <div className="min-w-0">
          <p className="text-2xs text-muted-foreground font-medium leading-tight">{label}</p>
          <p className="text-lg font-bold tabular-nums leading-none mt-1">{value}</p>
          {hint && <p className="text-2xs text-muted-foreground mt-1">{hint}</p>}
        </div>
      </CardContent>
    </Card>
  );
}
