import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Loader2,
  Plus,
  Download,
  FileText,
  TrendingUp,
  TrendingDown,
  Send,
  Banknote,
  Trash2,
  Info,
  X,
  Clock,
  ChevronRight,
  Users2,
  MoreHorizontal,
  Sparkles,
  ArrowRight,
  Pencil,
  Landmark,
  History,
  AlertCircle,
  AlertTriangle,
  UserMinus,
  UserCheck,
  Zap,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { PayslipPreviewDialog, type PayslipPreviewState } from '@/components/PayslipPreviewDialog';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ChartTooltip,
  ResponsiveContainer,
} from 'recharts';
import { ChartGradients, GlassTooltip } from '@/components/ChartKit';
import { axisTick, chartAnim, chartTheme } from '@/components/chart-kit-constants';
import { PayrollLifecycleRail } from '@/components/payroll/PayrollLifecycleRail';
import { realStepIndex } from '@/lib/payroll-run';
import { PayrollRunTimeline } from '@/components/payroll/PayrollRunTimeline';
import { assignPayslipFilenames, payslipZipFilename } from '@/lib/payslip-zip';
import { findPostApprovalAdjustments, type AdjustmentLike } from '@/lib/payroll-post-approval';
import { PayrollRosterPreview } from '@/components/payroll/PayrollRosterPreview';
import { formatNaira, formatNairaCompact, getTimezone } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { TableSkeleton } from '@/components/ui-kit/TableSkeleton';
import { EmptyState } from '@/components/ui-kit/EmptyState';
import { StatusBadge } from '@/components/ui-kit/StatusBadge';
import { InfoHint } from '@/components/ui-kit/InfoHint';
import { CompanyBadge } from '@/components/ui-kit/CompanySwitcher';
import type { Company } from '@/queries';
import { PENSION_EMPLOYER_RATE as EMPLOYER_PENSION_RATE } from '@/lib/tax';
import type { PayrollRun } from '@/lib/payroll-run';

interface PayrollRunsTabProps {
  runs: PayrollRun[];
  loading: boolean;
  latest: PayrollRun | undefined;
  trend: { label: string; burn: number }[];
  salaryErrors: string[];
  advanceQueue: any[];
  advanceBusy: string | null;
  bannerDismissed: boolean;
  highlightedRunId: string | null;
  working: boolean;
  canApprovePerm: boolean;
  canDisburse: boolean;
  canGeneratePayslipsPerm: boolean;
  runRefs: React.MutableRefObject<Map<string, HTMLElement | null>>;
  monthLabel: (period: string, periodType?: string) => string;
  setBannerDismissed: (v: boolean) => void;
  /** Starts a brand-new payroll run. Must go through the page's
      openNewDraft rather than flipping the dialog open directly: that
      resets the wizard form (otherwise a previously-edited draft's figures
      leak into the new run) and resolves which company the run belongs to
      when the page is filtered to "All companies". */
  onNewRun: () => void;
  submit: (run: PayrollRun) => void;
  editDraft: (run: PayrollRun) => void;
  deleteDraft: (run: PayrollRun) => void;
  recallToDraft: (run: PayrollRun) => void;
  setConfirmApproveRun: (run: PayrollRun | null) => void;
  preflightChecking: boolean;
  generatePayslips: (run: PayrollRun) => void;
  openDisburse: (run: PayrollRun) => void;
  doCancelSchedule: (run: PayrollRun) => void;
  payNowOverridingSchedule: (run: PayrollRun) => void;
  openEditSchedule: (run: PayrollRun) => void;
  setConfirmPaidRun: (run: PayrollRun | null) => void;
  openAdjustments: (run: PayrollRun) => void;
  exportRun: (run: PayrollRun) => void;
  exportBankFile: (run: PayrollRun) => void;
  printRun: (run: PayrollRun) => void;
  actOnAdvance: (id: string, action: 'approve' | 'reject' | 'paid') => void;
  isSelfApprovalBlocked: (run: PayrollRun) => boolean;
  confirmAndPay: (run: PayrollRun) => void;
  renameRun: (runId: string, name: string) => void;
  segments: { id: string; name: string }[];
  /** All companies, for labelling which company a run belongs to. */
  companies?: Company[];
  /** True when the page is showing more than one company's runs at once, so
      each row has to say whose payroll it is. The left accent stripe already
      encodes status, so company is shown as a labelled badge rather than a
      second colour — one stripe meaning two different things would be worse
      than no colour-coding at all, and a colour-only cue is unreadable to
      anyone who cannot distinguish the two brand colours. */
  showCompany?: boolean;
  initialOpenId?: string | null;
}

// An Autopilot-created shell: pay_schedules' cron drops a ₦0 draft on the
// cutoff date automatically, but never computes real figures on its own
// (schedule_auto_draft() deliberately stops short of that — see its
// migration comment — so a ₦0 payroll can never be approved unreviewed).
// A human still has to open it once to pull real salary data in.
function isUncomputedAutoDraft(run: PayrollRun): boolean {
  return run.status === 'draft' && !!run.is_auto_generated && run.total_burn_ngn === 0;
}

// Plain-English "what happens next" line, shown on every card and drawer so
// HR never has to infer the next step from a badge alone. Mirrors the
// pattern QuickBooks and Gusto use: the stage tells you where you are,
// this tells you what to do about it.
function nextActionCopy(run: PayrollRun, canApprove: boolean, canDisburse: boolean, selfApprovalBlocked: boolean): string {
  if (isUncomputedAutoDraft(run)) {
    return 'Autopilot created this on the cutoff date — open it to pull in real salary figures, then submit.';
  }
  switch (run.status) {
    case 'draft':
      return 'Review the numbers, then submit for approval.';
    case 'pending_approval':
      if (!canApprove) return 'Waiting on an approver to review this run.';
      return selfApprovalBlocked
        ? 'You drafted this run — another approver needs to approve it.'
        : 'Ready for your review — approve to lock it in and generate payslips.';
    case 'approved':
      if (run.scheduled_disburse_at) return 'Scheduled — salaries go out automatically at the scheduled time.';
      if (!canDisburse) return 'Approved — waiting on someone with disbursement rights to pay it out.';
      return 'Approved — disburse salaries, or record as paid if you already transferred manually.';
    case 'processing':
      return 'Disbursing now — this clears on its own within 15 minutes.';
    case 'paid':
      return 'Paid — nothing more to do here.';
    default:
      return '';
  }
}

const STATUS_ACCENT: Record<string, string> = {
  draft: 'bg-muted-foreground/50',
  pending_approval: 'bg-warning',
  approved: 'bg-success',
  processing: 'bg-success',
  paid: 'bg-primary',
};


export const PayrollRunsTab = ({
  runs,
  loading,
  latest,
  trend,
  salaryErrors,
  advanceQueue,
  advanceBusy,
  bannerDismissed,
  highlightedRunId,
  working,
  canApprovePerm,
  canDisburse,
  canGeneratePayslipsPerm,
  runRefs,
  monthLabel,
  setBannerDismissed,
  onNewRun,
  submit,
  editDraft,
  deleteDraft,
  recallToDraft,
  setConfirmApproveRun,
  preflightChecking,
  generatePayslips,
  openDisburse,
  doCancelSchedule,
  payNowOverridingSchedule,
  openEditSchedule,
  setConfirmPaidRun,
  openAdjustments,
  exportRun,
  exportBankFile,
  printRun,
  actOnAdvance,
  isSelfApprovalBlocked,
  confirmAndPay,
  renameRun,
  segments,
  companies,
  showCompany,
  initialOpenId,
}: PayrollRunsTabProps) => {
  const [openId, setOpenId] = useState<string | null>(initialOpenId ?? null);
  useEffect(() => { if (initialOpenId) setOpenId(initialOpenId); }, [initialOpenId]);
  const openRun = runs.find((r) => r.id === openId) ?? null;

  // Pay-group filter chips — derived from whichever segments actually
  // appear on real runs, so this never needs separate upkeep as segments
  // are added/renamed. "All" always shows every run regardless of segment.
  const [segmentFilter, setSegmentFilter] = useState<string>('__all__');
  const segmentFilterOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of runs) counts.set(r.payroll_segment_id || '__unfiltered__', (counts.get(r.payroll_segment_id || '__unfiltered__') ?? 0) + 1);
    return Array.from(counts.entries())
      .map(([id, count]) => ({
        id,
        name: id === '__unfiltered__' ? 'All staff' : segments.find((s) => s.id === id)?.name ?? 'Custom segment',
        count,
      }))
      .sort((a, b) => b.count - a.count);
  }, [runs, segments]);
  const visibleRuns = segmentFilter === '__all__' ? runs : runs.filter((r) => (r.payroll_segment_id || '__unfiltered__') === segmentFilter);

  const autoPayDrafts = useMemo(
    () => runs.filter((r) => isUncomputedAutoDraft(r) && r.pay_schedule_id),
    [runs],
  );

  interface AutoPayInfo {
    run: PayrollRun;
    scheduleName: string;
    payGroups: { id: string; name: string }[];
    employeeCount: number;
  }
  const [autoPayRuns, setAutoPayRuns] = useState<AutoPayInfo[]>([]);
  const [autoPayDismissed, setAutoPayDismissed] = useState<Set<string>>(new Set());
  const [autoPayBusy, setAutoPayBusy] = useState<string | null>(null);

  useEffect(() => {
    if (autoPayDrafts.length === 0) { setAutoPayRuns([]); return; }
    const scheduleIds = [...new Set(autoPayDrafts.map((r) => r.pay_schedule_id!))];
    (async () => {
      const { data: schedules } = await supabase
        .from('pay_schedules')
        .select('id, name, auto_pay')
        .in('id', scheduleIds);
      const autoPayScheduleIds = new Set(
        ((schedules || []) as { id: string; name: string; auto_pay: boolean }[])
          .filter((s) => s.auto_pay)
          .map((s) => s.id),
      );
      const scheduleNameMap = new Map(
        ((schedules || []) as { id: string; name: string }[]).map((s) => [s.id, s.name]),
      );
      const eligibleRuns = autoPayDrafts.filter((r) => autoPayScheduleIds.has(r.pay_schedule_id!));
      if (eligibleRuns.length === 0) { setAutoPayRuns([]); return; }

      const { data: groups } = await supabase
        .from('pay_groups')
        .select('id, name, pay_schedule_id')
        .in('pay_schedule_id', [...autoPayScheduleIds])
        .eq('is_active', true);
      const { data: profiles } = await supabase
        .from('profiles')
        .select('pay_group_id')
        .eq('status', 'active')
        .neq('role', 'driver');
      const countByGroup = new Map<string, number>();
      for (const p of (profiles || []) as { pay_group_id: string | null }[]) {
        if (p.pay_group_id) countByGroup.set(p.pay_group_id, (countByGroup.get(p.pay_group_id) ?? 0) + 1);
      }
      const groupsBySchedule = new Map<string, { id: string; name: string }[]>();
      for (const g of (groups || []) as { id: string; name: string; pay_schedule_id: string }[]) {
        const list = groupsBySchedule.get(g.pay_schedule_id) ?? [];
        list.push({ id: g.id, name: g.name });
        groupsBySchedule.set(g.pay_schedule_id, list);
      }

      setAutoPayRuns(eligibleRuns.map((run) => {
        const pg = groupsBySchedule.get(run.pay_schedule_id!) ?? [];
        const empCount = pg.reduce((s, g) => s + (countByGroup.get(g.id) ?? 0), 0);
        return {
          run,
          scheduleName: scheduleNameMap.get(run.pay_schedule_id!) ?? 'Schedule',
          payGroups: pg,
          employeeCount: empCount,
        };
      }));
    })();
  }, [autoPayDrafts]);

  const pendingAutoPay = autoPayRuns.filter((a) => !autoPayDismissed.has(a.run.id));

  return (
    <div className="space-y-3 sm:space-y-6">

      {!bannerDismissed && (
        <div className="flex items-center gap-2.5 rounded-lg border border-border/60 bg-card px-3.5 py-2 text-xs text-muted-foreground">
          <Info className="h-3.5 w-3.5 shrink-0 text-primary" />
          <span className="flex-1">
            Everything below — PAYE, pension, NHF — is computed automatically. Approve a run to generate payslips; money still moves separately via Payments.
          </span>
          <InfoHint size={13}>
            Payroll runs calculate monthly people costs: gross salaries, PAYE tax, pension contributions, and NHF deductions, all computed for you the moment you draft a run. KDOps records payroll figures — salary transfers must be initiated separately via the Payments module.
            <br /><br />
            <strong>PAYE regime:</strong> the "NTA 2025" bands in <code>src/lib/tax.ts</code> (0% to ₦800k, then 15% / 18% / 21% / 23% / 25% in successive slices, with rent relief) match the Nigeria Tax Act 2025, in force since 1 Jan 2026 — cross-checked against KPMG, Baker Tilly, and SafeguardGlobal (Aug 2026). Worth a final sign-off from your accountant of record before high-stakes filings.
          </InfoHint>
          <button
            onClick={() => {
              setBannerDismissed(true);
              localStorage.setItem('kdops_payroll_banner_dismissed', 'true');
            }}
            className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Dismiss"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Auto-pay verification panel — appears when the schedule cron has
          created shell drafts for schedules that have auto_pay enabled.
          The admin confirms once; the system computes, approves and
          schedules disbursement in one click. */}
      {pendingAutoPay.length > 0 && (
        <div className="space-y-3 kd-animate-slide-up">
          {pendingAutoPay.map(({ run, scheduleName, payGroups, employeeCount }) => (
            <div
              key={run.id}
              className="relative overflow-hidden rounded-xl border border-emerald-500/30 bg-emerald-500/[0.04] dark:bg-emerald-500/[0.06]"
            >
              <div className="px-5 py-5 sm:px-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                        <Zap className="h-4 w-4" />
                      </span>
                      <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">Auto-pay ready</span>
                    </div>
                    <p className="font-bold text-sm tracking-tight">
                      {monthLabel(run.period, run.period_type)} — {scheduleName}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {employeeCount} employee{employeeCount !== 1 ? 's' : ''} across{' '}
                      {payGroups.map((g) => g.name).join(', ') || 'linked pay groups'}
                    </p>
                    <div className="flex items-center gap-1.5 mt-3">
                      {['Compute', 'Submit', 'Approve', 'Disburse'].map((step, i) => (
                        <span key={step} className="flex items-center gap-1.5">
                          {i > 0 && <ChevronRight className="h-3 w-3 text-emerald-500/40" />}
                          <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-3xs font-semibold text-emerald-700 dark:text-emerald-300">
                            {step}
                          </span>
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setAutoPayDismissed((s) => new Set([...s, run.id]))}
                      disabled={working || autoPayBusy === run.id}
                    >
                      Hold
                    </Button>
                    <Button
                      size="sm"
                      className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm gap-1.5"
                      disabled={working || autoPayBusy === run.id}
                      onClick={async () => {
                        setAutoPayBusy(run.id);
                        await confirmAndPay(run);
                        setAutoPayBusy(null);
                      }}
                    >
                      {autoPayBusy === run.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Zap className="h-3.5 w-3.5" />
                      )}
                      Confirm & Pay
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Stat tiles — the numbers that matter land before any list does.
          Icon-badge card treatment per the Payroll Worldclass Redesign
          canvas (https://claude.ai/code/artifact/f500eacf-f096-4d56-8d8e-c182f9bc6b0b). */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {
            label: 'Net pay to disburse',
            value: latest ? formatNaira(latest.total_employee_ngn - latest.paye_ngn - latest.pension_ngn - latest.nhf_ngn) : '—',
            sub: latest ? monthLabel(latest.period, latest.period_type) : 'Run payroll to get started',
            icon: Banknote,
            iconBg: 'bg-blue-50 dark:bg-blue-950/40', iconFg: 'text-blue-700 dark:text-blue-300',
          },
          {
            label: 'PAYE (est.)',
            value: latest ? formatNaira(latest.paye_ngn) : '—',
            sub: 'Due 10th next month',
            icon: Landmark,
            iconBg: 'bg-amber-50 dark:bg-amber-950/40', iconFg: 'text-amber-700 dark:text-amber-300',
          },
          {
            label: 'Active employees',
            value: latest?.employee_count ?? '—',
            sub: latest ? `Pension ${formatNaira(latest.pension_ngn)}` : 'No runs yet',
            icon: Users2,
            iconBg: 'bg-violet-50 dark:bg-violet-950/40', iconFg: 'text-violet-700 dark:text-violet-300',
          },
          {
            label: 'Needs your attention',
            value: runs.filter((r) => r.status === 'draft' || r.status === 'pending_approval').length,
            sub: 'Draft or pending approval',
            icon: AlertCircle,
            iconBg: 'bg-red-50 dark:bg-red-950/40', iconFg: 'text-red-700 dark:text-red-300',
          },
        ].map(({ label, value, sub, icon: Icon, iconBg, iconFg }, i) => (
          <div key={label} className={cn(
            'rounded-xl border border-border/50 bg-card px-4 py-4 group',
            'hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300',
            'kd-animate-scale-in',
            i > 0 && `kd-stagger-${i}`,
          )}>
            <span className={cn(
              'flex h-8 w-8 items-center justify-center rounded-xl mb-3 ring-1 ring-black/[0.04] dark:ring-white/[0.06]',
              'group-hover:scale-110 transition-transform duration-300',
              iconBg, iconFg,
            )}>
              <Icon className="h-4 w-4" />
            </span>
            <p className="kd-display text-xl font-black tabular-nums tracking-tighter text-foreground leading-none truncate">
              {value}
            </p>
            <p className="mt-2 text-2xs text-muted-foreground font-semibold truncate uppercase tracking-wider">{label}</p>
            <p className="mt-0.5 text-2xs text-muted-foreground/60 tabular-nums truncate">{sub}</p>
          </div>
        ))}
      </div>

      {/* Featured rail — the current/latest run's lifecycle, front and
          center, instead of buried inside a drawer you have to open first.
          Dark gradient hero per the Payroll Worldclass Redesign canvas
          (https://claude.ai/code/artifact/f500eacf-f096-4d56-8d8e-c182f9bc6b0b) —
          a deliberate, explicitly-approved departure from this file's
          previous flat-card convention. */}
      {latest && (
        <div
          className="relative overflow-hidden rounded-xl px-5 py-6 sm:px-7 sm:py-7 text-white shadow-2xl shadow-primary/20 ring-1 ring-white/[0.08] kd-animate-slide-up"
          style={{ background: 'linear-gradient(155deg, hsl(220,100%,12%), hsl(220,100%,18%) 60%, hsl(220,90%,22%))' }}
        >
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_70%_-20%,hsl(220,100%,40%,0.12),transparent_70%)]" />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_0%_100%,hsl(220,90%,30%,0.08),transparent_50%)]" />
          <div className="relative">
            <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
              <div>
                <p className="text-2xs font-bold text-white/40 uppercase tracking-[0.15em]">
                  {monthLabel(latest.period, latest.period_type)}
                </p>
                <p className="kd-display text-3xl sm:text-4xl font-black tabular-nums mt-2 tracking-tighter bg-gradient-to-r from-white via-white to-blue-200 bg-clip-text text-transparent">
                  {formatNaira(latest.total_employee_ngn - latest.paye_ngn - latest.pension_ngn - latest.nhf_ngn)}
                </p>
                <p className="text-xs text-white/45 mt-1 font-medium tracking-wide">Net pay to disburse · {latest.employee_count ?? 0} employees</p>
              </div>
              <StatusBadge status={latest.status} />
            </div>
            <PayrollLifecycleRail status={latest.status} variant="dark" />
            <p className="mt-5 text-xs text-white/60 border-t border-white/[0.08] pt-4 font-medium">
              {nextActionCopy(latest, canApprovePerm, canDisburse, isSelfApprovalBlocked(latest))}
            </p>
          </div>
        </div>
      )}

      {/* Same hero card, empty-state variant — the card previously just
          vanished with nothing in its place whenever no run existed yet
          (e.g. right after the last one is deleted), which read as if the
          redesign hadn't shipped at all. */}
      {!latest && (
        <div
          className="relative overflow-hidden rounded-xl px-5 py-6 sm:px-7 sm:py-7 text-white shadow-2xl shadow-primary/20 ring-1 ring-white/[0.08] kd-animate-slide-up"
          style={{ background: 'linear-gradient(155deg, hsl(220,100%,12%), hsl(220,100%,18%) 60%, hsl(220,90%,22%))' }}
        >
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_70%_-20%,hsl(220,100%,40%,0.12),transparent_70%)]" />
          <div className="relative flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-2xs font-bold text-white/40 uppercase tracking-[0.15em]">No payroll runs yet</p>
              <p className="kd-display text-xl font-black mt-2 tracking-tight">Draft your first run to see it here</p>
              <p className="text-xs text-white/45 mt-2 font-medium">PAYE, pension and NHF get computed the moment you draft.</p>
            </div>
            <Button onClick={onNewRun} className="bg-white text-[hsl(220,100%,12%)] hover:bg-white/90 shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200 shrink-0 font-semibold">
              <Plus className="mr-1.5 h-4 w-4" /> New payroll run
            </Button>
          </div>
        </div>
      )}

      {trend.length >= 2 && (
        <div className="rounded-xl border border-border/50 bg-card px-5 py-4 kd-animate-fade-in kd-stagger-3">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-bold text-muted-foreground tracking-tight">Burn trend — last 6 months</p>
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary/5">
              <TrendingUp className="h-3.5 w-3.5 text-primary/50" />
            </span>
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={trend} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
              <ChartGradients />
              <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridLine} vertical={false} />
              <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={(v) => formatNairaCompact(v)} tick={axisTick} axisLine={false} tickLine={false} width={48} />
              <ChartTooltip
                content={<GlassTooltip />}
                formatter={(v: number) => formatNaira(v)}
                cursor={{ fill: chartTheme.primary, fillOpacity: 0.06 }}
              />
              <Bar dataKey="burn" fill="url(#kd-grad-primary)" name="Total burn" radius={[8, 8, 0, 0]} {...chartAnim} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {salaryErrors.length > 0 && (
        <Alert variant="destructive">
          <AlertTitle>Salary Configuration Required</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-4 mt-2 space-y-0.5">
              {salaryErrors.map((err, i) => (
                <li key={i} className="text-sm">{err}</li>
              ))}
            </ul>
            <p className="mt-2 text-sm">
              Configure salaries in <span className="font-medium">Employee Management</span> before generating payroll.
            </p>
          </AlertDescription>
        </Alert>
      )}

      {advanceQueue.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-xs-plus font-semibold tracking-tight">Salary advance requests</h2>
          <div className="rounded-lg border border-border/60 bg-card divide-y">
            {advanceQueue.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-3 p-3 flex-wrap">
                <div className="min-w-0">
                  <p className="font-medium truncate">
                    {a.name} · <span className="currency tabular-nums">{formatNaira(Number(a.amount_ngn))}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Over {a.repayment_months} month{a.repayment_months === 1 ? '' : 's'}
                    {a.reason ? ` · ${a.reason}` : ''} · {monthLabel(a.created_at.slice(0, 7))}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {a.status === 'pending' ? (
                    <>
                      <Button size="sm" variant="outline" disabled={advanceBusy === a.id} onClick={() => actOnAdvance(a.id, 'approve')}>
                        {advanceBusy === a.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Approve'}
                      </Button>
                      <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive hover:bg-destructive/10" disabled={advanceBusy === a.id} onClick={() => actOnAdvance(a.id, 'reject')}>
                        Reject
                      </Button>
                    </>
                  ) : (
                    <>
                      <Badge variant="outline" className="bg-info/10 text-info border-info/30">Approved · pending payout</Badge>
                      <Button size="sm" variant="outline" disabled={advanceBusy === a.id} onClick={() => actOnAdvance(a.id, 'paid')}>
                        {advanceBusy === a.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Mark paid'}
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Run list — one card per run. Click anywhere to open the full
          detail drawer instead of hunting through a row of a dozen
          buttons for the right action. */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs-plus font-semibold tracking-tight">Payroll runs</h2>
          {runs.length > 0 && (
            <Button size="sm" onClick={onNewRun} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" /> New run
            </Button>
          )}
        </div>

        {segmentFilterOptions.length > 1 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setSegmentFilter('__all__')}
              className={cn(
                'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold kd-transition',
                segmentFilter === '__all__' ? 'border-primary bg-primary/10 text-primary' : 'border-border/60 text-muted-foreground hover:border-primary/40',
              )}
            >
              All pay groups
              <span className={cn('rounded-full px-1.5 text-3xs', segmentFilter === '__all__' ? 'bg-primary/15' : 'bg-muted')}>{runs.length}</span>
            </button>
            {segmentFilterOptions.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setSegmentFilter(opt.id)}
                className={cn(
                  'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold kd-transition',
                  segmentFilter === opt.id ? 'border-primary bg-primary/10 text-primary' : 'border-border/60 text-muted-foreground hover:border-primary/40',
                )}
              >
                {opt.name}
                <span className={cn('rounded-full px-1.5 text-3xs', segmentFilter === opt.id ? 'bg-primary/15' : 'bg-muted')}>{opt.count}</span>
              </button>
            ))}
          </div>
        )}

        <div className="rounded-lg border border-border/60 bg-card overflow-hidden">
          {loading ? (
            <div className="p-3"><TableSkeleton rows={5} cols={7} /></div>
          ) : runs.length === 0 ? (
            <EmptyState
              illustration="coin"
              title="No payroll runs yet"
              description="Create a payroll run to calculate monthly salary costs and generate payslips — PAYE, pension and NHF are computed for you automatically."
              action={
                <Button onClick={onNewRun}>
                  <Plus className="mr-2 h-4 w-4" /> Create Payroll Run
                </Button>
              }
            />
          ) : visibleRuns.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">No runs for this pay group yet.</div>
          ) : (
            <div className="divide-y divide-border/40" data-testid="payroll-runs-list">
              {visibleRuns.map((r, idx) => {
                const prev = visibleRuns[idx + 1];
                const curNet = r.total_employee_ngn - r.paye_ngn - r.pension_ngn - r.nhf_ngn;
                const prevNet = prev ? prev.total_employee_ngn - prev.paye_ngn - prev.pension_ngn - prev.nhf_ngn : 0;
                const momPct = prev && prevNet > 0
                  ? ((curNet - prevNet) / prevNet) * 100
                  : null;
                const isHighlighted = highlightedRunId === r.id;
                const needsAttention = r.status === 'draft' || (r.status === 'pending_approval' && canApprovePerm && !isSelfApprovalBlocked(r));
                return (
                  <button
                    key={r.id}
                    ref={(el) => { if (el) runRefs.current.set(r.id, el as unknown as HTMLElement); }}
                    type="button"
                    onClick={() => setOpenId(r.id)}
                    className={cn(
                      'relative flex w-full items-center gap-3 px-4 py-3.5 text-left transition-all duration-200 hover:bg-muted/40 group/run',
                      isHighlighted && 'bg-primary/10 ring-2 ring-primary/40 ring-inset',
                    )}
                  >
                    <span className={cn('absolute inset-y-1.5 left-0 w-[3px] rounded-r-full transition-all', STATUS_ACCENT[r.status] ?? 'bg-muted-foreground/40')} />
                    <div className="min-w-0 flex-1 pl-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-sm tracking-tight">{r.custom_name || monthLabel(r.period, r.period_type)}</span>
                        {r.custom_name && (
                          <span className="text-2xs text-muted-foreground">{monthLabel(r.period, r.period_type)}</span>
                        )}
                        {showCompany && (
                          <CompanyBadge company={companies?.find((c) => c.id === r.company_id)} />
                        )}
                        <StatusBadge status={r.status} />
                        {isUncomputedAutoDraft(r) && (
                          <Badge variant="outline" className="gap-1 text-3xs border-purple-300 text-purple-700 bg-purple-50 dark:bg-purple-950/30 dark:text-purple-300 dark:border-purple-700">
                            <Sparkles className="h-3 w-3" /> Autopilot
                          </Badge>
                        )}
                        {r.status === 'approved' && r.scheduled_disburse_at && (
                          <Badge variant="outline" className="gap-1 text-3xs border-blue-300 text-blue-700 bg-blue-50 dark:bg-blue-950/30 dark:text-blue-300 dark:border-blue-700">
                            <Clock className="h-3 w-3" />
                            {new Date(r.scheduled_disburse_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: getTimezone() })}
                          </Badge>
                        )}
                        {r.last_disbursement_error && (
                          <Badge variant="outline" className="gap-1 text-3xs border-destructive/50 text-destructive bg-destructive/10">
                            <AlertCircle className="h-3 w-3" /> Last disbursement attempt failed
                          </Badge>
                        )}
                      </div>
                      <p className="mt-0.5 text-2xs text-muted-foreground truncate">
                        {nextActionCopy(r, canApprovePerm, canDisburse, isSelfApprovalBlocked(r))}
                      </p>
                      {r.last_disbursement_error && (
                        <p className="mt-0.5 text-2xs text-destructive">
                          {r.last_disbursement_attempted_at && (
                            <>Attempted {new Date(r.last_disbursement_attempted_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: getTimezone() })} — </>
                          )}
                          {r.last_disbursement_error}. Nothing will retry automatically — verify the batch before disbursing again.
                        </p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-extrabold currency tabular-nums tracking-tighter">{formatNaira(r.total_employee_ngn - r.paye_ngn - r.pension_ngn - r.nhf_ngn)}</p>
                      <p className="text-2xs text-muted-foreground tabular-nums mt-0.5">
                        {r.employee_count ?? '—'} employee{r.employee_count === 1 ? '' : 's'}
                        {momPct !== null && (
                          <span
                            className={cn('ml-1.5 inline-flex items-center gap-0.5 font-semibold', momPct >= 0 ? 'text-success' : 'text-destructive')}
                            title={`${momPct >= 0 ? '+' : ''}${momPct.toFixed(1)}% vs prior run`}
                          >
                            {momPct >= 0 ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
                            {Math.abs(momPct) > 999 ? '999+' : Math.abs(momPct).toFixed(1)}%
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="hidden sm:flex shrink-0 gap-1" aria-hidden="true" title={`Stage ${Math.max(realStepIndex(r.status), 0) + 1} of 4`}>
                      {Array.from({ length: 4 }, (_, i) => (
                        <span
                          key={i}
                          className={cn('h-1.5 w-4 rounded-full transition-all duration-300', i <= realStepIndex(r.status) ? 'bg-primary shadow-sm shadow-primary/30' : 'bg-border/40')}
                        />
                      ))}
                    </div>
                    {needsAttention && (
                      <span className="relative h-2.5 w-2.5 shrink-0" role="status" aria-label="Needs your attention">
                        <span className="absolute inset-0 rounded-full bg-primary animate-ping opacity-30" />
                        <span className="absolute inset-0 rounded-full bg-primary shadow-sm shadow-primary/40" />
                      </span>
                    )}
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/40 group-hover/run:text-muted-foreground group-hover/run:translate-x-0.5 transition-all" />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <RunDetailDrawer
        run={openRun}
        onClose={() => setOpenId(null)}
        segments={segments}
        working={working}
        canApprovePerm={canApprovePerm}
        canDisburse={canDisburse}
        canGeneratePayslipsPerm={canGeneratePayslipsPerm}
        monthLabel={monthLabel}
        preflightChecking={preflightChecking}
        isSelfApprovalBlocked={isSelfApprovalBlocked}
        submit={submit}
        editDraft={editDraft}
        deleteDraft={deleteDraft}
        recallToDraft={recallToDraft}
        setConfirmApproveRun={setConfirmApproveRun}
        generatePayslips={generatePayslips}
        openDisburse={openDisburse}
        doCancelSchedule={doCancelSchedule}
        payNowOverridingSchedule={payNowOverridingSchedule}
        openEditSchedule={openEditSchedule}
        setConfirmPaidRun={setConfirmPaidRun}
        openAdjustments={openAdjustments}
        exportRun={exportRun}
        exportBankFile={exportBankFile}
        printRun={printRun}
        onRename={renameRun}
      />
    </div>
  );
};

// Per-employee payslip list for a run — lets Finance click into exactly what
// each person was (or will be) paid, the same rendered document an employee
// sees on their own Payroll tab, instead of only seeing run-level totals.
/**
 * Warns when a run's figures were changed after it was approved.
 *
 * Per-employee adjustments feed payslip generation, and payslips are what
 * disbursement pays — so an adjustment added after approval means the amount
 * about to leave the account is not the amount that was signed off. Nothing
 * prevents that (the adjustments table checks the caller's role and nothing
 * else), so the least this screen can do is say it out loud, next to the
 * button that sends the money.
 */
function PostApprovalChangesNotice({ run }: { run: PayrollRun }) {
  const [adjustments, setAdjustments] = useState<AdjustmentLike[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setAdjustments(null);
    if (!run.approved_at) return;   // nothing to compare against
    (supabase as any)
      .from('payslip_adjustments')
      .select('id, created_at, amount_ngn, kind, description')
      .eq('payroll_run_id', run.id)
      .then(({ data }: { data: AdjustmentLike[] | null }) => {
        if (!cancelled) setAdjustments(data ?? []);
      });
    return () => { cancelled = true; };
  }, [run.id, run.approved_at]);

  const changes = adjustments ? findPostApprovalAdjustments(adjustments, run.approved_at) : null;
  if (!changes || changes.adjustments.length === 0) return null;

  const n = changes.adjustments.length;
  return (
    <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3.5 py-3">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
      <div className="text-xs">
        <p className="font-semibold text-foreground">
          {n} adjustment{n === 1 ? ' was' : 's were'} added after this run was approved
        </p>
        <p className="mt-0.5 text-muted-foreground">
          Worth {formatNaira(changes.totalNgn)} in total. Adjustments change what payslips —
          and therefore disbursement — pay out, so the amount leaving the account no longer
          matches the total that was approved. Re-check before disbursing.
        </p>
      </div>
    </div>
  );
}

function RunPayslipsSection({
  runId,
  period,
  refreshKey,
  runStatus,
}: {
  runId: string;
  /** Used to name the downloaded archive, e.g. payslips-2026-11.zip. */
  period?: string | null;
  refreshKey?: string | null;
  runStatus?: string;
}) {
  const { toast } = useToast();
  const [payslips, setPayslips] = useState<any[] | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [preview, setPreview] = useState<PayslipPreviewState | null>(null);
  const [zipProgress, setZipProgress] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const canExclude = runStatus === 'approved';

  useEffect(() => {
    let cancelled = false;
    setPayslips(null);
    supabase
      .from('payslips')
      .select('id, employee_id, employee_name, net_ngn, gross_ngn, storage_path, excluded')
      .eq('payroll_run_id', runId)
      .order('employee_name', { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          toast({ title: 'Could not load payslips', description: error.message, variant: 'destructive' });
        }
        setPayslips((data as any[]) || []);
      });
    return () => { cancelled = true; };
  }, [runId, refreshKey, toast]);

  const toggleExclude = async (slip: any) => {
    const newVal = !slip.excluded;
    setTogglingId(slip.id);
    const { error } = await supabase
      .from('payslips')
      .update({ excluded: newVal })
      .eq('id', slip.id);
    setTogglingId(null);
    if (error) {
      toast({ title: 'Could not update', description: error.message, variant: 'destructive' });
      return;
    }
    setPayslips((prev) =>
      prev?.map((s) => (s.id === slip.id ? { ...s, excluded: newVal } : s)) ?? null
    );
    toast({
      title: newVal ? 'Employee excluded' : 'Employee included',
      description: `${slip.employee_name} will ${newVal ? 'not' : ''} be paid when you disburse.`,
    });
  };

  const viewPayslip = async (slip: any) => {
    if (!slip.storage_path) {
      toast({ title: 'No payslip document on file', description: `${slip.employee_name} has no generated payslip to view.`, variant: 'destructive' });
      return;
    }
    setOpeningId(slip.id);
    try {
      const { data, error } = await supabase.storage.from('payslips').download(slip.storage_path);
      if (error) {
        toast({ title: 'Could not open payslip', description: error.message, variant: 'destructive' });
        return;
      }
      const html = await data.text();
      // Renders in-page rather than window.open()'ing a new tab — a real
      // user hit exactly this: some browsers only honor window.open() while
      // the click's user-gesture window is still active, which can expire
      // during the storage download, and even with the popup opened
      // synchronously first, a browser/site permission set to block pop-ups
      // still kills it, leaving the viewer stuck needing to change a browser
      // setting just to see a payslip. An in-page dialog has no such
      // dependency at all.
      setPreview({ title: `${slip.employee_name} — payslip`, html, filename: `payslip-${slip.employee_name}` });
    } finally {
      setOpeningId(null);
    }
  };

  /**
   * Bundle every stored payslip in this run into one ZIP.
   *
   * Downloads are sequential on purpose: a run can hold 30+ payslips, and
   * firing that many simultaneous Storage requests is how you get throttled
   * halfway through and hand someone a half-empty archive. Partial failures
   * are reported rather than swallowed — an HR person needs to know that 2
   * of 23 payslips are missing from the file they just downloaded, because
   * the two employees involved will certainly notice.
   */
  const downloadAll = async () => {
    if (!payslips?.length) return;

    const withDocs = payslips.filter((s) => s.storage_path);
    const missingDoc = payslips.length - withDocs.length;

    if (withDocs.length === 0) {
      toast({
        title: 'Nothing to download yet',
        description: 'No payslip documents have been generated for this run.',
        variant: 'destructive',
      });
      return;
    }

    setZipProgress('Preparing…');
    try {
      const { default: JSZip } = await import('jszip');
      const zip = new JSZip();
      const named = assignPayslipFilenames(withDocs);
      const failed: string[] = [];

      for (let i = 0; i < named.length; i++) {
        const { entry, filename } = named[i];
        setZipProgress(`${i + 1} of ${named.length}…`);
        const { data, error } = await supabase.storage
          .from('payslips')
          .download(entry.storage_path as string);
        if (error || !data) {
          failed.push((entry.employee_name as string) || 'Unnamed employee');
          continue;
        }
        zip.file(filename, await data.text());
      }

      if (failed.length === named.length) {
        toast({
          title: 'Download failed',
          description: 'None of the payslip documents could be retrieved. Check your connection and try again.',
          variant: 'destructive',
        });
        return;
      }

      const blob = await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 },
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = payslipZipFilename(period);
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 60_000);

      const included = named.length - failed.length;
      const caveats = [
        failed.length > 0 && `${failed.length} could not be retrieved (${failed.slice(0, 3).join(', ')}${failed.length > 3 ? '…' : ''})`,
        missingDoc > 0 && `${missingDoc} ${missingDoc === 1 ? 'has' : 'have'} no payslip generated yet`,
      ].filter(Boolean) as string[];

      toast({
        title: `Downloaded ${included} payslip${included === 1 ? '' : 's'}`,
        description: caveats.length ? caveats.join(' · ') : undefined,
        variant: caveats.length ? 'destructive' : undefined,
      });
    } catch (err) {
      toast({
        title: 'Could not build the ZIP file',
        description: err instanceof Error ? err.message : 'Unexpected error while packaging payslips.',
        variant: 'destructive',
      });
    } finally {
      setZipProgress(null);
    }
  };

  if (payslips === null) {
    return (
      <div>
        <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-2">
          <FileText className="h-3.5 w-3.5" /> Payslips
        </div>
        <div className="text-xs text-muted-foreground">Loading…</div>
      </div>
    );
  }
  if (payslips.length === 0) return null;

  const activeSlips = payslips.filter((s) => !s.excluded);
  const excludedSlips = payslips.filter((s) => s.excluded);
  const activeNet = activeSlips.reduce((sum, s) => sum + Number(s.net_ngn || 0), 0);

  return (
    <div>
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
          <FileText className="h-3.5 w-3.5" /> Payslips ({payslips.length})
        </div>
        <button
          type="button"
          onClick={downloadAll}
          disabled={zipProgress !== null}
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-md px-2.5 py-1 text-2xs font-semibold text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
        >
          {zipProgress ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
          {zipProgress ?? 'Download all'}
        </button>
      </div>

      {canExclude && excludedSlips.length > 0 && (
        <div className="mb-2 flex items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2">
          <UserMinus className="h-4 w-4 shrink-0 text-amber-500" />
          <div className="flex-1 text-xs">
            <span className="font-semibold text-amber-600 dark:text-amber-400">{excludedSlips.length} excluded</span>
            <span className="text-muted-foreground"> — will not be paid on disbursement. </span>
            <span className="font-medium tabular-nums">{formatNaira(activeNet)}</span>
            <span className="text-muted-foreground"> to disburse to {activeSlips.length} {activeSlips.length === 1 ? 'employee' : 'employees'}.</span>
          </div>
        </div>
      )}

      <div className="rounded-md border border-border/60 divide-y divide-border/50">
        {payslips.map((slip) => (
          <div
            key={slip.id}
            className={cn(
              'flex items-center gap-2 px-2.5 py-2 text-sm transition-colors',
              slip.excluded && 'opacity-50'
            )}
          >
            {canExclude && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); toggleExclude(slip); }}
                disabled={togglingId === slip.id}
                title={slip.excluded ? 'Include in disbursement' : 'Exclude from disbursement'}
                className={cn(
                  'shrink-0 flex items-center justify-center h-7 w-7 rounded-md border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  slip.excluded
                    ? 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20'
                    : 'border-border/60 text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                )}
              >
                {togglingId === slip.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : slip.excluded ? (
                  <UserMinus className="h-3.5 w-3.5" />
                ) : (
                  <UserCheck className="h-3.5 w-3.5" />
                )}
              </button>
            )}
            <button
              type="button"
              onClick={() => viewPayslip(slip)}
              disabled={openingId === slip.id}
              className="flex-1 flex items-center justify-between gap-2 text-left hover:bg-muted/40 rounded px-1 py-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors disabled:opacity-60"
            >
              <span className={cn('font-medium truncate', slip.excluded && 'line-through')}>{slip.employee_name}</span>
              <span className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
                <span className={cn('tabular-nums', slip.excluded ? 'text-muted-foreground line-through' : 'text-foreground')}>{formatNaira(slip.net_ngn)}</span>
                {openingId === slip.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <ChevronRight className="h-3 w-3" />}
              </span>
            </button>
          </div>
        ))}
      </div>
      <PayslipPreviewDialog slip={preview} onClose={() => setPreview(null)} />
    </div>
  );
}

function RunDetailDrawer({
  run,
  onClose,
  segments,
  working,
  canApprovePerm,
  canDisburse,
  canGeneratePayslipsPerm,
  monthLabel,
  preflightChecking,
  isSelfApprovalBlocked,
  submit,
  editDraft,
  deleteDraft,
  recallToDraft,
  setConfirmApproveRun,
  generatePayslips,
  openDisburse,
  doCancelSchedule,
  payNowOverridingSchedule,
  openEditSchedule,
  setConfirmPaidRun,
  openAdjustments,
  exportRun,
  exportBankFile,
  printRun,
  onRename,
}: {
  run: PayrollRun | null;
  onClose: () => void;
  segments: { id: string; name: string }[];
  working: boolean;
  canApprovePerm: boolean;
  canDisburse: boolean;
  canGeneratePayslipsPerm: boolean;
  monthLabel: (period: string, periodType?: string) => string;
  preflightChecking: boolean;
  isSelfApprovalBlocked: (run: PayrollRun) => boolean;
  submit: (run: PayrollRun) => void;
  editDraft: (run: PayrollRun) => void;
  deleteDraft: (run: PayrollRun) => void;
  recallToDraft: (run: PayrollRun) => void;
  setConfirmApproveRun: (run: PayrollRun | null) => void;
  generatePayslips: (run: PayrollRun) => void;
  openDisburse: (run: PayrollRun) => void;
  doCancelSchedule: (run: PayrollRun) => void;
  payNowOverridingSchedule: (run: PayrollRun) => void;
  openEditSchedule: (run: PayrollRun) => void;
  setConfirmPaidRun: (run: PayrollRun | null) => void;
  openAdjustments: (run: PayrollRun) => void;
  exportRun: (run: PayrollRun) => void;
  exportBankFile: (run: PayrollRun) => void;
  printRun: (run: PayrollRun) => void;
  onRename: (runId: string, name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  if (!run) return null;
  const r = run;
  const segmentName = r.payroll_segment_id
    ? segments.find((s) => s.id === r.payroll_segment_id)?.name ?? 'Custom segment'
    : 'All active staff';
  const bonusTotal = (r.bonuses_json || []).reduce((s, b) => s + Number(b.amount || 0), 0);
  const netPay = r.total_employee_ngn - r.paye_ngn - r.pension_ngn - r.nhf_ngn;
  const selfBlocked = isSelfApprovalBlocked(r);

  return (
    <Sheet open onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
        <SheetHeader className="px-5 pt-5 pb-4 space-y-3 text-left border-b border-border/40 bg-muted/30">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              {editing ? (
                <div className="flex items-center gap-1.5">
                  <input
                    autoFocus
                    className="flex-1 min-w-0 rounded-md border border-border bg-background px-2 py-1 text-base font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        onRename(r.id, draft.trim());
                        setEditing(false);
                      } else if (e.key === 'Escape') {
                        setEditing(false);
                      }
                    }}
                    placeholder={monthLabel(r.period, r.period_type)}
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 shrink-0"
                    onClick={() => {
                      onRename(r.id, draft.trim());
                      setEditing(false);
                    }}
                  >
                    <Check className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 shrink-0"
                    onClick={() => setEditing(false)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : (
                <SheetTitle className="flex items-center gap-1.5 group/title">
                  <span className="truncate">{r.custom_name || monthLabel(r.period, r.period_type)}</span>
                  <button
                    type="button"
                    onClick={() => { setDraft(r.custom_name || ''); setEditing(true); }}
                    className="shrink-0 opacity-0 group-hover/title:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
                    aria-label="Rename run"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                </SheetTitle>
              )}
              {r.custom_name && !editing && (
                <p className="text-2xs text-muted-foreground mt-0.5">{monthLabel(r.period, r.period_type)}</p>
              )}
              <p className="text-2xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mt-2">Net pay to disburse</p>
              <p className="text-xl font-extrabold tabular-nums tracking-tight">{formatNaira(netPay)}</p>
              <p className="text-2xs text-muted-foreground mt-0.5">Total company cost: {formatNaira(r.total_burn_ngn)} — see Money ledger</p>
            </div>
            <StatusBadge status={r.status} />
          </div>
          <PayrollLifecycleRail status={r.status} size="lg" className="pt-1" />
          <p className="text-xs text-muted-foreground">
            {nextActionCopy(r, canApprovePerm, canDisburse, selfBlocked)}
          </p>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          {r.last_disbursement_error && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3.5 py-3 mb-5">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-destructive" />
              <div className="text-xs text-destructive">
                <p className="font-semibold">Last disbursement attempt needs attention</p>
                <p className="mt-0.5">
                  {r.last_disbursement_attempted_at && (
                    <>Attempted {new Date(r.last_disbursement_attempted_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: getTimezone() })}: </>
                  )}
                  {r.last_disbursement_error}
                </p>
                <p className="mt-0.5 text-2xs text-destructive/80">
                  This does not retry automatically. If a transfer count is mentioned above, money may have
                  already moved — check the payment batch before disbursing again. Otherwise, fix the issue
                  then disburse or reschedule manually.
                </p>
              </div>
            </div>
          )}
          <PostApprovalChangesNotice run={r} />

          {/* --- WHO GETS PAID --- */}
          <div className="pb-6">
            <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2.5 flex items-center gap-2">
              <Users2 className="h-3.5 w-3.5" /> Who gets paid
            </div>
            <div className="text-sm font-semibold">{segmentName}</div>
            <div className="text-xs text-muted-foreground mt-1 mb-2">{r.employee_count ?? 0} employees in this run</div>
            <PayrollRosterPreview payrollSegmentId={r.payroll_segment_id} companyId={r.company_id} />
          </div>

          {/* --- PAYSLIPS --- */}
          <div className="border-t border-border/30 pt-6 pb-6">
            <RunPayslipsSection runId={r.id} period={r.period} refreshKey={r.updated_at} runStatus={r.status} />
          </div>

          {/* --- BONUSES & ADJUSTMENTS --- */}
          <div className="border-t border-border/30 pt-6 pb-6">
            <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2.5">Bonuses &amp; adjustments</div>
            {bonusTotal > 0 ? (
              <div className="text-sm"><span className="font-medium">Company-wide:</span> {formatNaira(bonusTotal)}</div>
            ) : (
              <div className="text-sm text-muted-foreground">No company-wide bonus on this run</div>
            )}
            {r.status !== 'paid' && canGeneratePayslipsPerm && (
              <button onClick={() => openAdjustments(r)} className="text-xs font-semibold text-primary mt-2 inline-flex items-center gap-1 hover:underline">
                <Plus className="h-3 w-3" /> Add bonus or per-employee adjustment
              </button>
            )}
          </div>

          {/* --- MONEY LEDGER --- */}
          <div className="border-t border-border/30 pt-6 pb-6">
            <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2.5">Money ledger</div>
            <div className="rounded-lg border border-border/60 overflow-hidden text-sm">
              <div className="flex justify-between px-3 py-2.5"><span>Gross pay</span><span className="font-semibold tabular-nums">{formatNaira(r.total_employee_ngn)}</span></div>
              <div className="flex justify-between px-3 py-2 text-xs text-muted-foreground border-t border-border/40">
                <div className="flex flex-col"><span>PAYE (tax)</span><span className="text-2xs text-muted-foreground/60">deducted from employee</span></div>
                <span className="tabular-nums">− {formatNaira(r.paye_ngn)}</span>
              </div>
              <div className="flex justify-between px-3 py-2 text-xs text-muted-foreground border-t border-border/40">
                <div className="flex flex-col"><span>Pension — employee (8%)</span><span className="text-2xs text-muted-foreground/60">deducted from employee</span></div>
                <span className="tabular-nums">− {formatNaira(r.pension_ngn)}</span>
              </div>
              <div className="flex justify-between px-3 py-2 text-xs text-muted-foreground border-t border-border/40">
                <div className="flex flex-col"><span>NHF</span><span className="text-2xs text-muted-foreground/60">deducted from employee</span></div>
                <span className="tabular-nums">− {formatNaira(r.nhf_ngn)}</span>
              </div>
              <div className="flex justify-between items-center px-3 py-2.5 font-semibold bg-emerald-500/10 border-t border-border/40">
                <div className="flex flex-col">
                  <span className="text-emerald-700 dark:text-emerald-400">Net pay to disburse</span>
                  <span className="text-2xs font-normal text-muted-foreground">This is what employees receive</span>
                </div>
                <span className="tabular-nums text-emerald-700 dark:text-emerald-400">{formatNaira(netPay)}</span>
              </div>
              <div className="border-t border-border/40">
                <div className="px-3 py-1.5 text-2xs text-muted-foreground/60 uppercase tracking-wider font-semibold">
                  Employer-side costs (for your records only)
                </div>
                <div className="flex justify-between px-3 py-1.5 text-xs text-muted-foreground">
                  <span>Pension — employer (10%)</span>
                  <span className="tabular-nums">{formatNaira(r.employer_pension_ngn ?? (r.total_employee_ngn * EMPLOYER_PENSION_RATE))}</span>
                </div>
              </div>
              <div className="flex justify-between items-center px-3 py-2.5 font-semibold bg-primary/10 border-t border-border/40">
                <div className="flex flex-col">
                  <span>Total company cost</span>
                  <span className="text-2xs font-normal text-muted-foreground">Net pay + employer pension</span>
                </div>
                <span className="tabular-nums text-primary">{formatNaira(r.total_burn_ngn)}</span>
              </div>
            </div>
          </div>

          {(r.status === 'approved' || r.status === 'processing' || r.status === 'paid') && (
            <div className="border-t border-border/30 pt-6 pb-6">
              <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2.5 flex items-center gap-2">
                <Landmark className="h-3.5 w-3.5" /> Statutory deadlines once paid
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-lg border border-border/60 bg-muted/20 px-3.5 py-3">
                {[
                  { label: 'PAYE', due: '10th of next month', authority: 'FIRS / State IRS' },
                  { label: 'Pension', due: '7 working days of payday', authority: 'PFA / PenCom' },
                  { label: 'NHF', due: '7 days of month end', authority: 'Federal Mortgage Bank' },
                ].map((d) => (
                  <div key={d.label} className="text-xs">
                    <p className="font-semibold text-foreground">{d.label}</p>
                    <p className="text-muted-foreground mt-0.5">{d.due}</p>
                    <p className="text-muted-foreground/70 mt-0.5">{d.authority}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* --- HISTORY --- */}
          <div className="border-t border-border/30 pt-6">
            <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2.5 flex items-center gap-2">
              <History className="h-3.5 w-3.5" /> History
            </div>
            <PayrollRunTimeline run={r} />
            {(r.status === 'approved' || r.status === 'processing' || r.status === 'paid') && !r.approved_by && (
              <p className="mt-2.5 text-2xs text-muted-foreground">
                Approver not recorded on this run.
              </p>
            )}
          </div>
        </div>

        {/* Sticky action bar — one clear primary action for the run's
            current stage, everything else tucked behind a menu. */}
        <div className="border-t border-border/60 bg-card px-5 py-3.5 flex items-center gap-2">
          <div className="flex-1 flex items-center gap-2 flex-wrap">
            {r.status === 'draft' && (
              <Button
                className="gap-1.5"
                variant={isUncomputedAutoDraft(r) ? 'default' : undefined}
                onClick={() => (isUncomputedAutoDraft(r) ? editDraft(r) : submit(r))}
                disabled={preflightChecking}
              >
                {preflightChecking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : isUncomputedAutoDraft(r) ? <Sparkles className="h-3.5 w-3.5" /> : <ArrowRight className="h-3.5 w-3.5" />}
                {isUncomputedAutoDraft(r) ? 'Compute figures' : 'Submit for approval'}
              </Button>
            )}
            {r.status === 'pending_approval' && canApprovePerm && (
              <Button
                className="gap-1.5"
                onClick={() => setConfirmApproveRun(r)}
                disabled={selfBlocked}
                title={selfBlocked ? 'You drafted this run — another approver must review it' : undefined}
              >
                <Check className="h-3.5 w-3.5" /> Approve
              </Button>
            )}
            {r.status === 'approved' && canDisburse && !r.scheduled_disburse_at && (
              <Button className="gap-1.5" onClick={() => openDisburse(r)} disabled={working}>
                {working ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                Disburse salaries
              </Button>
            )}
            {r.status === 'approved' && canDisburse && r.scheduled_disburse_at && (
              <>
                <Button className="gap-1.5" onClick={() => payNowOverridingSchedule(r)} disabled={working}>
                  {working ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  Pay now
                </Button>
                <Button variant="outline" size="icon" className="shrink-0" aria-label="Edit scheduled time" onClick={() => openEditSchedule(r)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button variant="outline" size="icon" className="shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10" aria-label="Cancel schedule" onClick={() => doCancelSchedule(r)}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </>
            )}
            {r.status === 'approved' && canGeneratePayslipsPerm && (
              <Button variant="outline" className="gap-1.5" onClick={() => generatePayslips(r)} disabled={working}>
                {working && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Generate payslips
              </Button>
            )}
            {r.status === 'processing' && (
              <span className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Disbursing — clears automatically if interrupted
              </span>
            )}
            {r.status === 'paid' && (
              <span className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5 text-success" /> Fully paid
              </span>
            )}
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="ghost" aria-label="More actions">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {r.status === 'draft' && !isUncomputedAutoDraft(r) && (
                <DropdownMenuItem onClick={() => editDraft(r)}>Edit draft</DropdownMenuItem>
              )}
              {r.status === 'pending_approval' && canApprovePerm && (
                <DropdownMenuItem onClick={() => recallToDraft(r)}>Recall to draft</DropdownMenuItem>
              )}
              {r.status === 'approved' && canApprovePerm && (
                <DropdownMenuItem onClick={() => recallToDraft(r)}>Recall to draft</DropdownMenuItem>
              )}
              {r.status === 'approved' && (
                <DropdownMenuItem onClick={() => setConfirmPaidRun(r)}>Record as manually paid</DropdownMenuItem>
              )}
              {r.status === 'approved' && (
                <DropdownMenuItem onClick={() => exportBankFile(r)}>
                  <Banknote className="mr-2 h-3.5 w-3.5" /> Download bank file
                </DropdownMenuItem>
              )}
              {r.status !== 'paid' && canGeneratePayslipsPerm && (
                <DropdownMenuItem onClick={() => openAdjustments(r)}>
                  <Plus className="mr-2 h-3.5 w-3.5" /> Add adjustment
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => exportRun(r)}>
                <Download className="mr-2 h-3.5 w-3.5" /> Export CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => printRun(r)}>
                <FileText className="mr-2 h-3.5 w-3.5" /> Print summary
              </DropdownMenuItem>
              {r.status === 'draft' && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => deleteDraft(r)} className="text-destructive focus:text-destructive">
                    <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete draft
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </SheetContent>
    </Sheet>
  );
}
