import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { formatNaira, formatDate } from '@/lib/format';
import { PageHeader } from '@/components/ui-kit/PageHeader';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { AlertTriangle, ArrowRight, Banknote, Clock, HandCoins, LayoutPanelTop, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

interface HubStats {
  latestRun: { period: string; total_burn_ngn: number; status: string; scheduled_disburse_at: string | null } | null;
  ewaPendingCount: number;
  ewaPendingNgn: number;
  advancePendingCount: number;
  advancePendingNgn: number;
  staffLoanActiveCount: number;
  staffLoanActiveOutstandingNgn: number;
  staffLoanPendingCount: number;
  complianceFiledCount: number;
  complianceTotalCount: number;
  complianceOutstanding: string[];
}

const EMPTY_STATS: HubStats = {
  latestRun: null,
  ewaPendingCount: 0,
  ewaPendingNgn: 0,
  advancePendingCount: 0,
  advancePendingNgn: 0,
  staffLoanActiveCount: 0,
  staffLoanActiveOutstandingNgn: 0,
  staffLoanPendingCount: 0,
  complianceFiledCount: 0,
  complianceTotalCount: 0,
  complianceOutstanding: [],
};

const PAYROLL_COMPLIANCE_KINDS = ['paye', 'pension', 'nhf', 'nsitf'];

export default function PayHub() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<HubStats>(EMPTY_STATS);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [runRes, ewaRes, advRes, loanActiveRes, loanPendingRes] = await Promise.all([
      supabase
        .from('payroll_runs')
        .select('period, total_burn_ngn, status, scheduled_disburse_at')
        .order('period', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('ewa_requests')
        .select('amount_ngn')
        .eq('status', 'pending'),
      supabase
        .from('advance_requests')
        .select('amount_ngn')
        .in('status', ['pending', 'approved']),
      supabase
        .from('staff_loans')
        .select('outstanding_ngn')
        .eq('status', 'active'),
      supabase
        .from('staff_loans')
        .select('id', { count: 'exact', head: true })
        .in('status', ['pending', 'approved']),
    ]);

    let complianceFiledCount = 0;
    let complianceTotalCount = 0;
    let complianceOutstanding: string[] = [];
    const latestRun = runRes.data as HubStats['latestRun'];
    if (latestRun?.period) {
      const { data: filings } = await supabase
        .from('compliance_filings')
        .select('kind, status')
        .eq('period', latestRun.period)
        .in('kind', PAYROLL_COMPLIANCE_KINDS);
      const rows = filings || [];
      complianceTotalCount = rows.length;
      complianceFiledCount = rows.filter((r: any) => r.status === 'filed').length;
      complianceOutstanding = rows.filter((r: any) => r.status !== 'filed').map((r: any) => r.kind.toUpperCase());
    }

    setStats({
      latestRun,
      ewaPendingCount: ewaRes.data?.length || 0,
      ewaPendingNgn: (ewaRes.data || []).reduce((s: number, r: any) => s + Number(r.amount_ngn || 0), 0),
      advancePendingCount: advRes.data?.length || 0,
      advancePendingNgn: (advRes.data || []).reduce((s: number, r: any) => s + Number(r.amount_ngn || 0), 0),
      staffLoanActiveCount: loanActiveRes.data?.length || 0,
      staffLoanActiveOutstandingNgn: (loanActiveRes.data || []).reduce((s: number, r: any) => s + Number(r.outstanding_ngn || 0), 0),
      staffLoanPendingCount: loanPendingRes.count || 0,
      complianceFiledCount,
      complianceTotalCount,
      complianceOutstanding,
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const totalMoneyOut =
    (stats.latestRun?.total_burn_ngn || 0) + stats.ewaPendingNgn + stats.advancePendingNgn;

  // Every active staff loan is at risk of this: Payroll's run generation never
  // reads staff_loans at all, so "Payroll Deduction" as a repayment type is
  // currently just a label — nothing deducts it automatically. Surface it here
  // rather than let it surprise finance the first time a loan actually needs it.
  const hasUnwiredLoanRisk = stats.staffLoanActiveCount > 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pay Hub"
        icon={LayoutPanelTop}
        description="Salary, earned wage access, staff loans and the statutory filings they trigger — one view across pages that live in three different menus."
      />

      <Card className="p-6 bg-gradient-to-br from-primary to-[hsl(200,90%,20%)] text-primary-foreground border-0">
        <div className="flex flex-wrap items-center gap-8">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wide opacity-75">Money out this period, across every channel</div>
            <div className="text-3xl font-extrabold tracking-tight mt-1.5 currency">
              {loading ? '—' : formatNaira(totalMoneyOut)}
            </div>
          </div>
          <div className="flex-1 flex gap-0 border-l border-white/20 pl-6 flex-wrap">
            <div className="flex-1 min-w-[90px] text-center">
              <div className="font-bold currency">{formatNaira(stats.latestRun?.total_burn_ngn || 0)}</div>
              <div className="text-[10.5px] opacity-75 mt-0.5">Salary ({stats.latestRun?.period ? formatDate(`${stats.latestRun.period}-01`) : '—'})</div>
            </div>
            <div className="flex-1 min-w-[90px] text-center">
              <div className="font-bold currency">{formatNaira(stats.ewaPendingNgn)}</div>
              <div className="text-[10.5px] opacity-75 mt-0.5">EWA pending</div>
            </div>
            <div className="flex-1 min-w-[90px] text-center">
              <div className="font-bold currency">{formatNaira(stats.advancePendingNgn)}</div>
              <div className="text-[10.5px] opacity-75 mt-0.5">Advances pending</div>
            </div>
            <div className="flex-1 min-w-[90px] text-center">
              <div className="font-bold currency">{formatNaira(stats.staffLoanActiveOutstandingNgn)}</div>
              <div className="text-[10.5px] opacity-75 mt-0.5">Staff loans outstanding</div>
            </div>
          </div>
        </div>
      </Card>

      {hasUnwiredLoanRisk && (
        <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-5 py-4">
          <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="text-sm font-bold text-destructive">
              {stats.staffLoanActiveCount} active staff loan{stats.staffLoanActiveCount === 1 ? '' : 's'} — repayments aren't deducted from payroll automatically
            </div>
            <div className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Payroll doesn't read Staff Loans when it calculates a run, so "Payroll Deduction" as a repayment type only works if someone remembers to record it by hand on the Staff Loans page every period.
            </div>
            <Button size="sm" variant="outline" className="mt-2.5 border-destructive/40 text-destructive hover:bg-destructive/10" onClick={() => navigate('/staff-loans')}>
              Review staff loans
            </Button>
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <HubCard
          icon={Banknote}
          iconClass="bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300"
          title="Payroll runs"
          value={stats.latestRun ? formatNaira(stats.latestRun.total_burn_ngn) : '—'}
          detail={
            stats.latestRun?.scheduled_disburse_at
              ? `Auto-pays ${formatDate(stats.latestRun.scheduled_disburse_at)}`
              : stats.latestRun
                ? `Latest run — ${stats.latestRun.status.replace('_', ' ')}`
                : 'No runs yet'
          }
          detailTone={stats.latestRun?.scheduled_disburse_at ? 'warning' : 'muted'}
          onClick={() => navigate('/payroll')}
        />
        <HubCard
          icon={Clock}
          iconClass="bg-cyan-50 text-cyan-700 dark:bg-cyan-950/30 dark:text-cyan-300"
          title="Earned wage access"
          value={`${stats.ewaPendingCount} pending`}
          detail={stats.ewaPendingCount > 0 ? `${formatNaira(stats.ewaPendingNgn)} requested` : 'Nothing waiting'}
          detailTone="muted"
          onClick={() => navigate('/ewa')}
        />
        <HubCard
          icon={HandCoins}
          iconClass="bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300"
          title="Staff loans"
          value={`${stats.staffLoanActiveCount} active`}
          detail={stats.staffLoanPendingCount > 0 ? `${stats.staffLoanPendingCount} pending approval` : 'None pending'}
          detailTone={stats.staffLoanPendingCount > 0 ? 'warning' : 'muted'}
          onClick={() => navigate('/staff-loans')}
        />
        <HubCard
          icon={ShieldCheck}
          iconClass="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300"
          title="Compliance"
          value={stats.complianceTotalCount > 0 ? `${stats.complianceFiledCount} of ${stats.complianceTotalCount} filed` : 'No filings yet'}
          detail={stats.complianceOutstanding.length > 0 ? `${stats.complianceOutstanding.join(', ')} outstanding` : 'All filed'}
          detailTone={stats.complianceOutstanding.length > 0 ? 'warning' : 'muted'}
          onClick={() => navigate('/compliance')}
        />
      </div>

      <div className="rounded-lg border border-dashed border-border bg-card px-5 py-4 text-xs text-muted-foreground leading-relaxed">
        <strong className="text-foreground">Why this page exists:</strong> Payroll, EWA, Staff Loans and Compliance are separate pages with no links between them today — approving payroll silently triggers compliance filings with no way back to the run, and there's nowhere that shows total money moving out across all four at once. This hub doesn't replace any of them — it's a landing point that shows the whole picture.
      </div>
    </div>
  );
}

function HubCard({
  icon: Icon,
  iconClass,
  title,
  value,
  detail,
  detailTone,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  iconClass: string;
  title: string;
  value: string;
  detail: string;
  detailTone: 'warning' | 'muted';
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="text-left rounded-xl border border-border bg-card p-4 shadow-sm hover:shadow-md hover:border-primary/30 kd-transition flex flex-col gap-2.5"
    >
      <div className="flex items-center gap-2.5">
        <div className={cn('h-8 w-8 rounded-lg flex items-center justify-center shrink-0', iconClass)}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="text-sm font-bold">{title}</div>
      </div>
      <div className="text-lg font-extrabold currency">{value}</div>
      <div className={cn('text-xs font-medium', detailTone === 'warning' ? 'text-warning' : 'text-muted-foreground')}>{detail}</div>
      <div className="text-xs font-bold text-primary mt-auto flex items-center gap-1">
        Open <ArrowRight className="h-3 w-3" />
      </div>
    </button>
  );
}
