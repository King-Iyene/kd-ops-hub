import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Wallet, Users2, CalendarClock, Layers, BarChart3, AlertTriangle, CheckCircle2, Clock, FileText } from 'lucide-react';
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
import { cn, initials } from '@/lib/utils';

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
      const [groupsRes, schedulesRes, roster, headcountRes] = await Promise.all([
        isAllCompanies ? groupsQuery : groupsQuery.eq('company_id', selectedCompanyId),
        supabase.from('pay_schedules').select('id').eq('is_active', true).order('created_at', { ascending: true }),
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

      // Next pay date — earliest upcoming date across all active schedules,
      // via the same next_pay_dates RPC the Setup tab's banner already uses.
      const schedules = (schedulesRes.data || []) as { id: string }[];
      const payDateResults = await Promise.all(
        schedules.map((s) =>
          supabase.rpc('next_pay_dates', { p_schedule_id: s.id, p_count: 1 })
            .then(({ data }) => (data as { pay_date: string }[] | null)?.[0] ?? null)
            .catch(() => null),
        ),
      );
      let earliest: Date | null = null;
      for (const row of payDateResults) {
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

      if (!cancelled) setLoadingExtras(false);
    })();
    return () => { cancelled = true; };
  }, [selectedCompanyId, companyPayGroupIds, isAllCompanies]);

  const firstName = profile?.full_name?.split(' ')?.[0] || 'there';
  const greetingHour = new Date().getHours();
  const greeting = greetingHour < 12 ? 'Good morning' : greetingHour < 18 ? 'Good afternoon' : 'Good evening';

  const heroStep = heroRun ? realStepIndex(heroRun.status) : -1;

  const runsThisYear = runs.filter((r) => r.period.startsWith(String(new Date().getFullYear()))).length;

  const attentionCount = useMemo(
    () => runs.filter((r) => r.status === 'draft' || r.status === 'pending_approval').length,
    [runs],
  );

  return (
    <div className="space-y-5 sm:space-y-7">
      {/* ── Greeting + quick status ─────────────────────────────── */}
      <div className="flex flex-wrap items-end justify-between gap-3 kd-animate-fade-in">
        <div>
          <h2 className="text-xl font-bold tracking-tight">{greeting}, {firstName}</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Here's where payroll stands right now.</p>
        </div>
        {attentionCount > 0 ? (
          <div className="flex items-center gap-2 rounded-full border border-warning/30 bg-warning/10 px-3.5 py-1.5 text-xs font-semibold text-warning shadow-sm shadow-warning/10 kd-animate-scale-in">
            <AlertTriangle className="h-3.5 w-3.5" />
            {attentionCount} item{attentionCount !== 1 ? 's' : ''} need{attentionCount === 1 ? 's' : ''} attention
          </div>
        ) : runs.length > 0 ? (
          <div className="flex items-center gap-2 rounded-full border border-success/30 bg-success/10 px-3.5 py-1.5 text-xs font-semibold text-success shadow-sm shadow-success/10 kd-animate-scale-in">
            <CheckCircle2 className="h-3.5 w-3.5" />
            All clear
          </div>
        ) : null}
      </div>

      {/* ── Hero + KPIs ───────────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-12 kd-animate-slide-up">
        {/* Hero run summary — takes 8 of 12 cols */}
        <Card className="lg:col-span-8 overflow-hidden border-0 bg-gradient-to-br from-[hsl(220,90%,14%)] via-[hsl(220,95%,10%)] to-[hsl(220,90%,7%)] text-white shadow-2xl shadow-primary/20 ring-1 ring-white/[0.08] relative group">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_70%_-20%,hsl(186,100%,40%,0.12),transparent_70%)] pointer-events-none" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_0%_100%,hsl(220,90%,30%,0.08),transparent_50%)] pointer-events-none" />
          <CardContent className="p-5 sm:p-7 space-y-5 sm:space-y-6 relative">
            {heroRun ? (
              <>
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <p className="text-2xs uppercase tracking-[0.15em] text-white/40 font-bold">
                      {heroRun.status === 'draft' ? 'Draft run' : monthLabel(heroRun.period)}
                    </p>
                    <p className="text-3xl sm:text-4xl md:text-5xl font-black mt-2 tabular-nums tracking-tighter bg-gradient-to-r from-white via-white to-cyan-200 bg-clip-text text-transparent drop-shadow-[0_0_24px_rgba(0,200,255,0.15)]">
                      {formatNairaCompact(heroRun.total_burn_ngn)}
                    </p>
                    <p className="text-xs text-white/45 mt-2 font-medium tracking-wide">
                      {heroRun.employee_count ?? '—'} employee{heroRun.employee_count === 1 ? '' : 's'} · {monthLabel(heroRun.period)}
                    </p>
                  </div>
                  {heroRun.status !== 'paid' && (
                    <Button
                      size="sm"
                      className="bg-white text-[#00283d] hover:bg-white/90 shadow-lg shadow-black/25 hover:shadow-xl hover:shadow-black/30 transition-all duration-200 hover:-translate-y-0.5 font-semibold"
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
              <div className="flex flex-col items-start gap-3 py-6">
                <p className="text-sm text-white/60 font-medium">No payroll runs yet.</p>
                <Button size="sm" className="bg-white text-[#00283d] hover:bg-white/90 shadow-lg hover:shadow-xl transition-all duration-200 hover:-translate-y-0.5" onClick={onNewDraft}>
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
            stagger={1}
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
            stagger={2}
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
            stagger={3}
          />
          <StatTile
            icon={<Layers className="h-4 w-4" />}
            label="Pay groups"
            value={payGroupCount != null ? String(payGroupCount) : '—'}
            stagger={4}
          />
        </div>
      </div>

      {/* ── Attention items (Deel-style pre-approval flags) ───── */}
      {attentionCount > 0 && (
        <Card className="border-warning/20 bg-warning/[0.03] shadow-sm shadow-warning/5 kd-animate-slide-up kd-stagger-2 overflow-hidden relative">
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-warning to-warning/20" />
          <CardContent className="p-4 pl-5 space-y-2.5">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-warning/10">
                <AlertTriangle className="h-3.5 w-3.5 text-warning" />
              </span>
              <p className="text-sm font-bold tracking-tight">Needs your attention</p>
            </div>
            {runs.filter((r) => r.status === 'draft').map((r) => (
              <button key={r.id} type="button" onClick={() => onOpenRun(r.id)} className="flex w-full items-center gap-3 rounded-xl border border-border/30 bg-card/80 px-4 py-3 text-left hover:bg-muted/50 hover:border-border/50 hover:shadow-sm transition-all duration-200 group/item">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-muted-foreground/10 group-hover/item:bg-muted-foreground/15 transition-colors">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold">{monthLabel(r.period)} draft</p>
                  <p className="text-2xs text-muted-foreground">Review the numbers and submit for approval</p>
                </div>
                <p className="text-sm font-extrabold tabular-nums shrink-0 tracking-tight">{formatNairaCompact(r.total_burn_ngn)}</p>
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0 group-hover/item:translate-x-0.5 transition-transform" />
              </button>
            ))}
            {runs.filter((r) => r.status === 'pending_approval').map((r) => (
              <button key={r.id} type="button" onClick={() => onOpenRun(r.id)} className="flex w-full items-center gap-3 rounded-xl border border-border/30 bg-card/80 px-4 py-3 text-left hover:bg-muted/50 hover:border-border/50 hover:shadow-sm transition-all duration-200 group/item">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-warning/10 group-hover/item:bg-warning/15 transition-colors">
                  <Clock className="h-4 w-4 text-warning" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold">{monthLabel(r.period)} awaiting approval</p>
                  <p className="text-2xs text-muted-foreground">Ready for review — approve to lock it in</p>
                </div>
                <p className="text-sm font-extrabold tabular-nums shrink-0 tracking-tight">{formatNairaCompact(r.total_burn_ngn)}</p>
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0 group-hover/item:translate-x-0.5 transition-transform" />
              </button>
            ))}
          </CardContent>
        </Card>
      )}

      {/* ── Trend + Roster ────────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-12 kd-animate-slide-up kd-stagger-3">
        {/* Burn history — 8 cols */}
        <Card className="lg:col-span-8 overflow-hidden">
          <CardContent className="p-5 sm:p-6">
            <div className="flex items-start justify-between gap-3 mb-5">
              <div>
                <p className="text-sm font-bold tracking-tight flex items-center gap-1.5">
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
              <div className="text-right shrink-0">
                <p className="text-2xl font-black tabular-nums tracking-tighter leading-none">
                  {trend.length > 0 ? formatNairaCompact(trendTotal) : '—'}
                </p>
                <p className="text-2xs text-muted-foreground font-medium mt-1 tabular-nums">
                  {runsThisYear} run{runsThisYear !== 1 ? 's' : ''} this year
                </p>
              </div>
            </div>
            {trend.length >= 2 ? (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={trend} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
                  <ChartGradients />
                  <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} />
                  <Tooltip content={<GlassTooltip formatter={(v: number) => formatNaira(v)} />} />
                  <Bar dataKey="burn" fill="url(#kd-grad-primary)" radius={[8, 8, 0, 0]} {...chartAnim} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/50 mb-3">
                  <BarChart3 className="h-7 w-7 text-muted-foreground/30" />
                </div>
                <p className="text-sm font-medium text-muted-foreground/70">No trend data yet</p>
                <p className="text-2xs text-muted-foreground/50 mt-1">Run two or more payrolls to see a trend.</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Who gets paid — 4 cols */}
        <Card className="lg:col-span-4">
          <CardContent className="p-5 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-bold tracking-tight">Who gets paid</p>
              <a
                className="text-2xs text-primary/70 hover:text-primary inline-flex items-center gap-0.5 transition-colors font-semibold no-underline"
                href="/employees"
                onClick={(e) => { e.preventDefault(); navigate('/employees'); }}
              >
                View all <ArrowRight className="h-3 w-3" />
              </a>
            </div>
            <div className="space-y-1">
              {whoGetsPaid.length === 0 && (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/50 mb-2">
                    <Users2 className="h-6 w-6 text-muted-foreground/30" />
                  </div>
                  <p className="text-xs text-muted-foreground/60 font-medium">No salaried employees found.</p>
                </div>
              )}
              {whoGetsPaid.map((p, i) => (
                <div key={p.id} className={cn(
                  'flex items-center gap-3 py-2.5 -mx-2 px-2 rounded-xl hover:bg-muted/50 transition-all duration-200 cursor-default group/row',
                  'kd-animate-fade-in',
                  i > 0 && `kd-stagger-${Math.min(i, 5)}`,
                )}>
                  <Avatar className="h-8 w-8 shrink-0 ring-2 ring-background shadow-sm">
                    {p.photo_url && <AvatarImage src={p.photo_url} alt={p.name} />}
                    <AvatarFallback className="text-3xs font-bold bg-primary/10 text-primary">
                      {initials(p.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold truncate leading-tight">{p.name}</p>
                    <p className="text-2xs text-muted-foreground truncate capitalize leading-tight mt-0.5">{p.job_title || p.role?.replace(/_/g, ' ') || '—'}</p>
                  </div>
                  <p className="text-xs font-bold tabular-nums shrink-0 tracking-tight">{formatNairaCompact(p.amount)}</p>
                </div>
              ))}
            </div>
            {whoGetsPaid.length > 0 && headcount != null && headcount > whoGetsPaid.length && (
              <p className="text-2xs text-muted-foreground/60 text-center pt-3 border-t border-border/30 mt-3 font-medium">
                + {headcount - whoGetsPaid.length} more employee{headcount - whoGetsPaid.length !== 1 ? 's' : ''}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}


const TILE_TONE: Record<string, { iconBg: string; iconColor: string; accent: string }> = {
  default:  { iconBg: 'bg-muted',        iconColor: 'text-muted-foreground', accent: 'from-border' },
  primary:  { iconBg: 'bg-primary/10',    iconColor: 'text-primary', accent: 'from-primary' },
  success:  { iconBg: 'bg-success/10',    iconColor: 'text-success', accent: 'from-success' },
  info:     { iconBg: 'bg-sky-50 dark:bg-sky-900/25', iconColor: 'text-sky-600 dark:text-sky-400', accent: 'from-sky-500' },
};

function StatTile({
  icon, label, value, hint, tone = 'default', stagger = 0,
}: { icon: React.ReactNode; label: string; value: string; hint?: string; tone?: keyof typeof TILE_TONE; stagger?: number }) {
  const t = TILE_TONE[tone] || TILE_TONE.default;
  return (
    <Card className={cn(
      'h-full group relative overflow-hidden',
      'hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300',
      'kd-animate-scale-in',
      stagger && `kd-stagger-${stagger}`,
    )}>
      <div className={cn('absolute left-0 top-0 bottom-0 w-[3px] bg-gradient-to-b to-transparent', t.accent)} />
      <CardContent className="p-4 pl-5 flex items-start gap-3">
        <span className={cn(
          'flex h-9 w-9 items-center justify-center rounded-xl shrink-0 ring-1 ring-black/[0.04] dark:ring-white/[0.06]',
          'group-hover:scale-110 transition-transform duration-300',
          t.iconBg, t.iconColor,
        )}>
          {icon}
        </span>
        <div className="min-w-0">
          <p className="text-2xs text-muted-foreground font-medium leading-tight uppercase tracking-wider">{label}</p>
          <p className="text-lg font-extrabold tabular-nums leading-none mt-1.5 tracking-tight">{value}</p>
          {hint && <p className="text-2xs text-muted-foreground mt-1 font-medium">{hint}</p>}
        </div>
      </CardContent>
    </Card>
  );
}
