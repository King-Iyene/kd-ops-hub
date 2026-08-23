import { useMemo, useState } from 'react';
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
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ChartTooltip,
  ResponsiveContainer,
} from 'recharts';
import { ChartGradients, GlassTooltip, axisTick, chartAnim, chartTheme } from '@/components/ChartKit';
import { PayrollLifecycleRail, realStepIndex } from '@/components/payroll/PayrollLifecycleRail';
import { PayrollRosterPreview } from '@/components/payroll/PayrollRosterPreview';
import { formatNaira, formatNairaCompact } from '@/lib/format';
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
import { PENSION_EMPLOYER_RATE as EMPLOYER_PENSION_RATE } from '@/lib/tax';

interface PayrollRun {
  id: string;
  period: string;
  period_type?: 'monthly' | 'quarterly' | 'annual';
  employee_count?: number;
  total_contractor_ngn: number;
  total_employee_ngn: number;
  total_expenses_ngn: number;
  paye_ngn: number;
  pension_ngn: number;
  nhf_ngn: number;
  total_burn_ngn: number;
  employer_pension_ngn?: number | null;
  bonuses_json?: { type: string; amount: number }[] | null;
  allowances_json?: { housing_pct: number; transport_per_emp: number; meal_per_emp: number; total: number } | null;
  status: 'draft' | 'pending_approval' | 'approved' | 'processing' | 'paid';
  created_at: string;
  created_by: string | null;
  approved_by: string | null;
  payroll_segment_id?: string | null;
  scheduled_disburse_at?: string | null;
  is_auto_generated?: boolean;
}

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
  setDialog: (v: boolean) => void;
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
  segments: { id: string; name: string }[];
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
  pending_approval: 'bg-amber-500',
  approved: 'bg-emerald-500',
  processing: 'bg-emerald-500',
  paid: 'bg-blue-500',
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
  setDialog,
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
  segments,
}: PayrollRunsTabProps) => {
  const [openId, setOpenId] = useState<string | null>(null);
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

  return (
    <div className="space-y-6">

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

      {/* Stat tiles — the numbers that matter land before any list does. */}
      <div className="rounded-lg border border-border/70 bg-card grid grid-cols-2 sm:grid-cols-4 sm:divide-x divide-border/70 divide-y sm:divide-y-0 overflow-hidden">
        {[
          {
            label: 'Latest total burn',
            value: latest ? formatNaira(latest.total_burn_ngn) : '—',
            sub: latest ? monthLabel(latest.period, latest.period_type) : 'Run payroll to get started',
          },
          {
            label: 'PAYE (est.)',
            value: latest ? formatNaira(latest.paye_ngn) : '—',
            sub: 'Due 10th next month',
          },
          {
            label: 'Active employees',
            value: latest?.employee_count ?? '—',
            sub: latest ? `Pension ${formatNaira(latest.pension_ngn)}` : 'No runs yet',
          },
          {
            label: 'Needs your attention',
            value: runs.filter((r) => r.status === 'draft' || r.status === 'pending_approval').length,
            sub: 'Draft or pending approval',
          },
        ].map(({ label, value, sub }) => (
          <div key={label} className="kd-holographic relative px-4 py-3.5 kd-transition">
            <div className="relative z-[2]">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
              <p className="mt-1.5 text-[19px] font-semibold tabular-nums tracking-tight text-foreground leading-none font-mono truncate">
                {value}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground/80 tabular-nums truncate">{sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Featured rail — the current/latest run's lifecycle, front and
          center, instead of buried inside a drawer you have to open first.
          Mirrors the Payroll Overhaul mockup's top-of-page rail card. */}
      {latest && (
        <div className="rounded-lg border border-border/70 bg-card px-4 py-4 sm:px-5 sm:py-4.5">
          <div className="flex flex-wrap items-start justify-between gap-2 mb-3.5">
            <div>
              <p className="text-sm font-semibold">{monthLabel(latest.period, latest.period_type)} Payroll</p>
              <p className="text-xs text-muted-foreground mt-0.5 tabular-nums">
                {formatNaira(latest.total_burn_ngn)} · {latest.employee_count ?? 0} employees
              </p>
            </div>
            <StatusBadge status={latest.status} />
          </div>
          <PayrollLifecycleRail status={latest.status} />
          <p className="mt-3.5 text-xs text-muted-foreground border-t border-border/50 pt-3">
            {nextActionCopy(latest, canApprovePerm, canDisburse, isSelfApprovalBlocked(latest))}
          </p>
        </div>
      )}

      {trend.length >= 2 && (
        <div className="rounded-lg border border-border/70 bg-card px-4 py-3.5">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs font-semibold text-muted-foreground">Burn trend — last 6 months</p>
            <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
          <ResponsiveContainer width="100%" height={140}>
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
              <Bar dataKey="burn" fill="url(#kd-grad-primary)" name="Total burn" radius={[6, 6, 0, 0]} {...chartAnim} />
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
          <h2 className="text-[13px] font-semibold tracking-tight">Salary advance requests</h2>
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
          <h2 className="text-[13px] font-semibold tracking-tight">Payroll runs</h2>
          {runs.length > 0 && (
            <Button size="sm" onClick={() => setDialog(true)} className="gap-1.5">
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
              <span className={cn('rounded-full px-1.5 text-[10px]', segmentFilter === '__all__' ? 'bg-primary/15' : 'bg-muted')}>{runs.length}</span>
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
                <span className={cn('rounded-full px-1.5 text-[10px]', segmentFilter === opt.id ? 'bg-primary/15' : 'bg-muted')}>{opt.count}</span>
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
                <Button onClick={() => setDialog(true)}>
                  <Plus className="mr-2 h-4 w-4" /> Create Payroll Run
                </Button>
              }
            />
          ) : visibleRuns.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">No runs for this pay group yet.</div>
          ) : (
            <div className="divide-y divide-border/60" data-testid="payroll-runs-list">
              {visibleRuns.map((r, idx) => {
                const prev = visibleRuns[idx + 1];
                const momPct = prev && prev.total_burn_ngn > 0
                  ? ((r.total_burn_ngn - prev.total_burn_ngn) / prev.total_burn_ngn) * 100
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
                      'relative flex w-full items-center gap-3 px-4 py-3.5 text-left kd-transition hover:bg-muted/30',
                      isHighlighted && 'bg-primary/10 ring-2 ring-primary/40 ring-inset',
                    )}
                  >
                    <span className={cn('absolute inset-y-0 left-0 w-1', STATUS_ACCENT[r.status] ?? 'bg-muted-foreground/40')} />
                    <div className="min-w-0 flex-1 pl-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-sm">{monthLabel(r.period, r.period_type)}</span>
                        <StatusBadge status={r.status} />
                        {isUncomputedAutoDraft(r) && (
                          <Badge variant="outline" className="gap-1 text-[10px] border-purple-300 text-purple-700 bg-purple-50 dark:bg-purple-950/30 dark:text-purple-300 dark:border-purple-700">
                            <Sparkles className="h-3 w-3" /> Autopilot
                          </Badge>
                        )}
                        {r.status === 'approved' && r.scheduled_disburse_at && (
                          <Badge variant="outline" className="gap-1 text-[10px] border-blue-300 text-blue-700 bg-blue-50 dark:bg-blue-950/30 dark:text-blue-300 dark:border-blue-700">
                            <Clock className="h-3 w-3" />
                            {new Date(r.scheduled_disburse_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
                          </Badge>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground truncate">
                        {nextActionCopy(r, canApprovePerm, canDisburse, isSelfApprovalBlocked(r))}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold currency tabular-nums">{formatNaira(r.total_burn_ngn)}</p>
                      <p className="text-[11px] text-muted-foreground tabular-nums">
                        {r.employee_count ?? '—'} employee{r.employee_count === 1 ? '' : 's'}
                        {momPct !== null && (
                          <span className={cn('ml-1.5 inline-flex items-center gap-0.5', momPct >= 0 ? 'text-success' : 'text-destructive')}>
                            {momPct >= 0 ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
                            {Math.abs(momPct).toFixed(1)}%
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="hidden sm:flex shrink-0 gap-0.5" aria-hidden="true" title={`Stage ${Math.max(realStepIndex(r.status), 0) + 1} of 4`}>
                      {Array.from({ length: 4 }, (_, i) => (
                        <span
                          key={i}
                          className={cn('h-1 w-4 rounded-full', i <= realStepIndex(r.status) ? 'bg-primary' : 'bg-border')}
                        />
                      ))}
                    </div>
                    {needsAttention && (
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-label="Needs your attention" />
                    )}
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60" />
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
      />
    </div>
  );
};

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
}) {
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
        <SheetHeader className="px-5 pt-5 pb-3 space-y-3 text-left">
          <div className="flex items-center gap-2">
            <SheetTitle>{monthLabel(r.period, r.period_type)}</SheetTitle>
            <StatusBadge status={r.status} />
          </div>
          <PayrollLifecycleRail status={r.status} />
          <p className="text-xs text-muted-foreground">
            {nextActionCopy(r, canApprovePerm, canDisburse, selfBlocked)}
          </p>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          <div>
            <div className="text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground mb-1.5 flex items-center gap-1.5">
              <Users2 className="h-3 w-3" /> Who gets paid
            </div>
            <div className="text-sm font-medium">{segmentName}</div>
            <div className="text-xs text-muted-foreground mt-0.5 mb-1.5">{r.employee_count ?? 0} employees in this run</div>
            <PayrollRosterPreview payrollSegmentId={r.payroll_segment_id} />
          </div>

          <div>
            <div className="text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground mb-1.5">Bonuses &amp; adjustments</div>
            {bonusTotal > 0 ? (
              <div className="text-sm"><span className="font-medium">Company-wide:</span> {formatNaira(bonusTotal)}</div>
            ) : (
              <div className="text-sm text-muted-foreground">No company-wide bonus on this run</div>
            )}
            {r.status !== 'paid' && canGeneratePayslipsPerm && (
              <button onClick={() => openAdjustments(r)} className="text-xs font-semibold text-primary mt-1 inline-flex items-center gap-1">
                <Plus className="h-3 w-3" /> Add bonus or per-employee adjustment
              </button>
            )}
          </div>

          <div>
            <div className="text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground mb-1.5">Money ledger</div>
            <div className="rounded-md border border-border/60 overflow-hidden text-sm">
              <div className="flex justify-between px-2.5 py-1.5"><span>Gross pay</span><span className="tabular-nums">{formatNaira(r.total_employee_ngn)}</span></div>
              <div className="flex justify-between px-2.5 py-1.5 text-xs text-muted-foreground border-t border-border/50"><span>PAYE (tax)</span><span className="tabular-nums">− {formatNaira(r.paye_ngn)}</span></div>
              <div className="flex justify-between px-2.5 py-1.5 text-xs text-muted-foreground border-t border-border/50"><span>Pension (employee)</span><span className="tabular-nums">− {formatNaira(r.pension_ngn)}</span></div>
              <div className="flex justify-between px-2.5 py-1.5 text-xs text-muted-foreground border-t border-border/50"><span>NHF</span><span className="tabular-nums">− {formatNaira(r.nhf_ngn)}</span></div>
              <div className="flex justify-between px-2.5 py-1.5 font-semibold bg-muted/40 border-t border-border/50"><span>Net pay to disburse</span><span className="tabular-nums">{formatNaira(netPay)}</span></div>
            </div>
            {(r.total_contractor_ngn > 0 || r.total_expenses_ngn > 0) && (
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {r.total_contractor_ngn > 0 && <span>Contractors: <span className="tabular-nums text-foreground">{formatNaira(r.total_contractor_ngn)}</span></span>}
                {r.total_expenses_ngn > 0 && <span>Expenses: <span className="tabular-nums text-foreground">{formatNaira(r.total_expenses_ngn)}</span></span>}
              </div>
            )}
            <p className="text-[11px] text-muted-foreground mt-1.5">
              Employer cost on top of gross (employer pension): {formatNaira(r.employer_pension_ngn ?? (r.total_employee_ngn * EMPLOYER_PENSION_RATE))}
            </p>
          </div>

          {(r.status === 'approved' || r.status === 'processing' || r.status === 'paid') && (
            <div>
              <div className="text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground mb-1.5 flex items-center gap-1.5">
                <Landmark className="h-3 w-3" /> Statutory deadlines once paid
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 rounded-md border border-border/60 bg-muted/20 px-3 py-2.5">
                {[
                  { label: 'PAYE', due: '10th of next month', authority: 'FIRS / State IRS' },
                  { label: 'Pension', due: '7 working days of payday', authority: 'PFA / PenCom' },
                  { label: 'NHF', due: '7 days of month end', authority: 'Federal Mortgage Bank' },
                ].map((d) => (
                  <div key={d.label} className="text-xs">
                    <p className="font-semibold text-foreground">{d.label}</p>
                    <p className="text-muted-foreground">{d.due}</p>
                    <p className="text-muted-foreground/70">{d.authority}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground mb-1.5 flex items-center gap-1.5">
              <History className="h-3 w-3" /> Activity
            </div>
            <div className="space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Created</span>
                <span className="tabular-nums">{new Date(r.created_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</span>
              </div>
              {(r.status === 'approved' || r.status === 'processing' || r.status === 'paid') && r.approved_by && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Approved</span>
                  <span className="text-foreground">Yes</span>
                </div>
              )}
            </div>
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
