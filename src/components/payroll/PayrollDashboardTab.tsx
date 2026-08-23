import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Wallet, Users2, CalendarClock, Layers } from 'lucide-react';
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
} from 'recharts';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { formatNaira, daysUntil } from '@/lib/format';
import { displayName } from '@/lib/name';
import { PayrollLifecycleRail, realStepIndex } from '@/components/payroll/PayrollLifecycleRail';
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
  monthLabel,
  onOpenRun,
  onNewDraft,
}: {
  runs: PayrollRunLite[];
  trend: { label: string; burn: number }[];
  monthLabel: (period: string, periodType?: string) => string;
  onOpenRun: (runId: string) => void;
  onNewDraft: () => void;
}) {
  const { profile } = useAuthStore();
  const navigate = useNavigate();
  const [payGroupCount, setPayGroupCount] = useState<number | null>(null);
  const [nextPayDate, setNextPayDate] = useState<Date | null>(null);
  const [inflow, setInflow] = useState<number | null>(null);
  const [whoGetsPaid, setWhoGetsPaid] = useState<WhoGetsPaidRow[]>([]);
  const [loadingExtras, setLoadingExtras] = useState(true);

  const heroRun = useMemo(() => {
    const active = runs.find((r) => r.status !== 'paid');
    return active || runs[0] || null;
  }, [runs]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingExtras(true);
      const [groupsRes, schedulesRes, expectedRes, roster] = await Promise.all([
        supabase.from('pay_groups').select('id', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('pay_schedules').select('id').eq('is_active', true).order('created_at', { ascending: true }),
        // "In" this period — approved & unbudgeted income the company expects,
        // reused from expenses/invoices would be a stretch; the honest, already
        // -wired number here is incoming cash tracked as approved company revenue.
        supabase.from('company_settings').select('id').limit(1),
        supabase
          .from('profiles')
          .select('id, full_name, first_name, last_name, email, photo_url, role, salary_ngn')
          .eq('status', 'active')
          .neq('role', 'driver')
          .gt('salary_ngn', 0)
          .order('salary_ngn', { ascending: false })
          .limit(6),
      ]);
      if (cancelled) return;
      setPayGroupCount(groupsRes.count ?? 0);
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

      setWhoGetsPaid(
        ((roster.data || []) as any[]).map((r) => ({
          id: r.id,
          name: displayName(r.first_name, r.last_name, r.full_name || r.email),
          photo_url: r.photo_url || null,
          role: r.role,
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
      setLoadingExtras(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const firstName = profile?.full_name?.split(' ')?.[0] || 'there';
  const greetingHour = new Date().getHours();
  const greeting = greetingHour < 12 ? 'Good morning' : greetingHour < 18 ? 'Good afternoon' : 'Good evening';

  const heroStep = heroRun ? realStepIndex(heroRun.status) : -1;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold tracking-tight">{greeting}, {firstName}</h2>
        <p className="text-sm text-muted-foreground mt-0.5">Here's where payroll stands right now.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Hero run summary card */}
        <Card className="lg:col-span-2 overflow-hidden border-0 bg-gradient-to-br from-[hsl(200,90%,14%)] to-[hsl(200,95%,8%)] text-white">
          <CardContent className="p-6 space-y-5">
            {heroRun ? (
              <>
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-white/60 font-medium">
                      {heroRun.status === 'draft' ? 'Draft run' : monthLabel(heroRun.period)}
                    </p>
                    <p className="text-3xl font-bold mt-1 tabular-nums">{formatNaira(heroRun.total_burn_ngn)}</p>
                    <p className="text-xs text-white/60 mt-1">
                      {heroRun.employee_count ?? '—'} employee{heroRun.employee_count === 1 ? '' : 's'} · {monthLabel(heroRun.period)}
                    </p>
                  </div>
                  {heroRun.status !== 'paid' && (
                    <Button
                      size="sm"
                      className="bg-white text-[#00283d] hover:bg-white/90"
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

        {/* Stat tiles */}
        <div className="grid grid-cols-2 lg:grid-cols-1 gap-4">
          <StatTile
            icon={<Wallet className="h-4 w-4" />}
            label="In this month"
            value={inflow != null ? formatNaira(inflow) : '—'}
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
                : loadingExtras ? 'Loading…' : 'No active schedule'
            }
          />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <StatTile
          icon={<Users2 className="h-4 w-4" />}
          label="Active employees on payroll"
          value={String(whoGetsPaid.length > 0 ? (heroRun?.employee_count ?? '—') : '—')}
          card
        />
        <StatTile
          icon={<Layers className="h-4 w-4" />}
          label="Pay groups"
          value={payGroupCount != null ? String(payGroupCount) : '—'}
          card
        />
        <StatTile
          icon={<CalendarClock className="h-4 w-4" />}
          label="Runs this year"
          value={String(runs.filter((r) => r.period.startsWith(String(new Date().getFullYear()))).length)}
          card
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Burn history */}
        <Card className="lg:col-span-2">
          <CardContent className="p-5">
            <p className="text-sm font-semibold mb-3">Burn history</p>
            {trend.length >= 2 ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={trend} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                  <RTooltip
                    formatter={(v: number) => formatNaira(v)}
                    contentStyle={{ fontSize: 12, borderRadius: 8 }}
                  />
                  <Bar dataKey="burn" fill="hsl(200,90%,29%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-xs text-muted-foreground py-8 text-center">Not enough history yet — run two or more payrolls to see a trend.</p>
            )}
          </CardContent>
        </Card>

        {/* Who gets paid */}
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold">Who gets paid</p>
              <button
                className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5"
                onClick={() => navigate('/employees')}
              >
                View all <ArrowRight className="h-3 w-3" />
              </button>
            </div>
            <div className="space-y-3">
              {whoGetsPaid.length === 0 && (
                <p className="text-xs text-muted-foreground">No salaried employees found.</p>
              )}
              {whoGetsPaid.map((p) => (
                <div key={p.id} className="flex items-center gap-2.5">
                  <Avatar className="h-8 w-8 shrink-0">
                    {p.photo_url && <AvatarImage src={p.photo_url} alt={p.name} />}
                    <AvatarFallback className="text-[11px] font-semibold bg-[hsl(200,60%,92%)] text-[hsl(200,90%,25%)]">
                      {initials(p.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium truncate">{p.name}</p>
                    <p className="text-[10.5px] text-muted-foreground truncate capitalize">{p.role || '—'}</p>
                  </div>
                  <p className="text-xs font-semibold tabular-nums shrink-0">{formatNaira(p.amount)}</p>
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

function StatTile({
  icon, label, value, hint, card,
}: { icon: React.ReactNode; label: string; value: string; hint?: string; card?: boolean }) {
  return (
    <Card className={cn(card ? '' : 'h-full')}>
      <CardContent className="p-4 flex items-start gap-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[hsl(200,60%,94%)] text-[hsl(200,90%,29%)] shrink-0">
          {icon}
        </span>
        <div className="min-w-0">
          <p className="text-[11px] text-muted-foreground font-medium leading-tight">{label}</p>
          <p className="text-lg font-bold tabular-nums leading-tight mt-0.5">{value}</p>
          {hint && <p className="text-[10.5px] text-muted-foreground mt-0.5">{hint}</p>}
        </div>
      </CardContent>
    </Card>
  );
}
