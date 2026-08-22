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
} from 'lucide-react';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { TableSkeleton } from '@/components/ui-kit/TableSkeleton';
import { EmptyState } from '@/components/ui-kit/EmptyState';
import { StatusBadge } from '@/components/ui-kit/StatusBadge';
import {
  MobileCard,
  MobileCardHeader,
  MobileCardTitle,
  MobileCardRow,
  MobileCardFooter,
} from '@/components/ui-kit/MobileCard';
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
  approve: (run: PayrollRun) => void;
  recallToDraft: (run: PayrollRun) => void;
  generatePayslips: (run: PayrollRun) => void;
  openDisburse: (run: PayrollRun) => void;
  doCancelSchedule: (run: PayrollRun) => void;
  setConfirmPaidRun: (run: PayrollRun | null) => void;
  openAdjustments: (run: PayrollRun) => void;
  exportRun: (run: PayrollRun) => void;
  exportBankFile: (run: PayrollRun) => void;
  printRun: (run: PayrollRun) => void;
  actOnAdvance: (id: string, action: 'approve' | 'reject' | 'paid') => void;
  isSelfApprovalBlocked: (run: PayrollRun) => boolean;
}

// Compact 4-step progress indicator (Draft -> Submitted -> Approved -> Paid)
// shown alongside the status badge. The badge names the exact DB status;
// this answers the question the audit found the badge alone couldn't:
// "how far along is this, and what's the very next thing that has to
// happen." 'processing' collapses into the Approved step with a spinner
// rather than adding a 5th dot, since it's a transient lock, not a state
// HR ever needs to act on directly.
const RUN_STEPS = ['Draft', 'Submitted', 'Approved', 'Paid'] as const;

function runStepIndex(status: string): number {
  if (status === 'draft') return 0;
  if (status === 'pending_approval') return 1;
  if (status === 'approved' || status === 'processing') return 2;
  if (status === 'paid') return 3;
  return -1; // rejected/cancelled/unknown — no stepper, badge alone is enough
}

function RunStepper({ status }: { status: string }) {
  const current = runStepIndex(status);
  if (current < 0) return null;
  return (
    <div className="flex items-center gap-1 w-full max-w-[168px]" aria-label={`Run progress: ${RUN_STEPS[current]}`}>
      {RUN_STEPS.map((label, i) => (
        <div key={label} className="flex items-center flex-1 last:flex-none">
          <div
            className={cn(
              'h-1.5 w-1.5 rounded-full shrink-0',
              i < current ? 'bg-success' : i === current ? 'bg-primary' : 'bg-muted-foreground/25',
              i === current && status === 'processing' && 'animate-pulse',
            )}
            title={label}
          />
          {i < RUN_STEPS.length - 1 && (
            <div className={cn('h-px flex-1 mx-1', i < current ? 'bg-success/50' : 'bg-muted-foreground/15')} />
          )}
        </div>
      ))}
    </div>
  );
}

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
  approve,
  recallToDraft,
  generatePayslips,
  openDisburse,
  doCancelSchedule,
  setConfirmPaidRun,
  openAdjustments,
  exportRun,
  exportBankFile,
  printRun,
  actOnAdvance,
  isSelfApprovalBlocked,
}: PayrollRunsTabProps) => {
  return (
    <div className="space-y-6">

      {!bannerDismissed && (
        <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/40 px-4 py-3 text-sm text-blue-800 dark:text-blue-200">
          <Info className="h-4 w-4 shrink-0 mt-0.5 text-blue-500" />
          <p className="flex-1 leading-relaxed">
            Payroll runs calculate monthly people costs: gross salaries, PAYE tax, pension contributions, and NHF deductions. Approve a run to generate payslips. Note: KDOps records payroll figures — salary transfers must be initiated separately via the Payments module.
          </p>
          <button
            onClick={() => {
              setBannerDismissed(true);
              localStorage.setItem('kdops_payroll_banner_dismissed', 'true');
            }}
            className="shrink-0 text-blue-500 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Standing compliance note — NOT dismissible. Cross-checked against the
          Nigeria Tax Act 2025 (KPMG, Baker Tilly, SafeguardGlobal — Aug 2026)
          and matches the current law. Revisit only if FIRS guidance changes,
          or once Phase 4 lands an editable tax table so this isn't a
          hardcoded constant. */}
      {(
        <div className="flex items-start gap-3 rounded-lg border border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/40 px-4 py-3 text-sm text-emerald-900 dark:text-emerald-200">
          <Check className="h-4 w-4 shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
          <p className="flex-1 leading-relaxed">
            <span className="font-medium">PAYE regime confirmed:</span> the "NTA 2025" bands in <code className="text-xs">src/lib/tax.ts</code> (0% to ₦800k, then 15% / 18% / 21% / 23% / 25% in successive slices, with rent relief) match the Nigeria Tax Act 2025, in force since 1 Jan 2026 — cross-checked against KPMG, Baker Tilly, and SafeguardGlobal (Aug 2026). Worth a final sign-off from your accountant of record before high-stakes filings, but this is not a guess.
          </p>
        </div>
      )}

      {/* Summary strip — pure Mercury: hairline 4-cell, mono ₦
          values, ToD holographic hover. */}
      <div className="rounded-lg border border-border/70 bg-card grid grid-cols-2 sm:grid-cols-4 sm:divide-x divide-border/70 divide-y sm:divide-y-0 overflow-hidden">
        {[
          {
            label: 'Latest total burn',
            value: latest ? formatNaira(latest.total_burn_ngn) : '—',
            sub: latest ? monthLabel(latest.period, latest.period_type) : 'Draft your first run',
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
            label: 'Approved runs',
            value: runs.filter((r) => r.status === 'approved' || r.status === 'paid').length,
            sub: 'This year',
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

      {trend.length > 0 && (
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-base">Burn trend — last 6 months</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={trend} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
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
                <Bar dataKey="burn" fill="url(#kd-grad-primary)" name="Total burn" radius={[6, 6, 0, 0]} {...chartAnim} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
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

      <div className="space-y-3">
        <h2 className="text-[13px] font-semibold tracking-tight">Payroll runs</h2>
        <div className="rounded-lg border border-border/60 bg-card overflow-hidden">
          {loading ? (
            <div className="p-3"><TableSkeleton rows={5} cols={7} /></div>
          ) : runs.length === 0 ? (
            <EmptyState
              illustration="coin"
              title="No payroll runs yet"
              description="Create a payroll run to calculate monthly salary costs and generate payslips."
              action={
                <Button onClick={() => setDialog(true)}>
                  <Plus className="mr-2 h-4 w-4" /> Create Payroll Run
                </Button>
              }
            />
          ) : (
            <>
            <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Period</TableHead>
                  <TableHead className="text-right">Employees</TableHead>
                  <TableHead className="text-right">Contractor</TableHead>
                  <TableHead className="text-right">Expenses</TableHead>
                  <TableHead className="text-right">PAYE</TableHead>
                  <TableHead className="text-right">Pension (emp)</TableHead>
                  <TableHead className="text-right">Pension (er)</TableHead>
                  <TableHead className="text-right">Total burn</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((r, idx) => {
                  const prev = runs[idx + 1];
                  const momPct = prev && prev.total_burn_ngn > 0
                    ? ((r.total_burn_ngn - prev.total_burn_ngn) / prev.total_burn_ngn) * 100
                    : null;
                  const isHighlighted = highlightedRunId === r.id;
                  return (
                  <TableRow
                    key={r.id}
                    ref={(el) => { if (el) runRefs.current.set(r.id, el); }}
                    className={cn(
                      'kd-transition',
                      isHighlighted && 'bg-primary/10 ring-2 ring-primary/40 ring-inset',
                    )}
                  >
                    <TableCell className="font-medium">{monthLabel(r.period, r.period_type)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {r.employee_count ?? '—'}
                    </TableCell>
                    <TableCell className="text-right currency">
                      {formatNaira(r.total_contractor_ngn)}
                    </TableCell>
                    <TableCell className="text-right currency">
                      {formatNaira(r.total_expenses_ngn)}
                    </TableCell>
                    <TableCell className="text-right currency">
                      {formatNaira(r.paye_ngn)}
                    </TableCell>
                    <TableCell className="text-right currency">
                      {formatNaira(r.pension_ngn)}
                    </TableCell>
                    <TableCell className="text-right currency">
                      {formatNaira(r.employer_pension_ngn ?? (r.total_employee_ngn * EMPLOYER_PENSION_RATE))}
                    </TableCell>
                    <TableCell className="text-right currency font-semibold">
                      <div className="flex items-center justify-end gap-1">
                        {formatNaira(r.total_burn_ngn)}
                        {momPct !== null && (
                          <span className={`text-xs font-normal inline-flex items-center gap-0.5 ${momPct >= 0 ? 'text-success' : 'text-destructive'}`}>
                            {momPct >= 0
                              ? <TrendingUp className="h-3 w-3" />
                              : <TrendingDown className="h-3 w-3" />}
                            {Math.abs(momPct).toFixed(1)}%
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1.5 items-start">
                        <StatusBadge status={r.status} />
                        {r.status === 'approved' && r.scheduled_disburse_at && (
                          <Badge variant="outline" className="gap-1 text-[10px] border-blue-300 text-blue-700 bg-blue-50 dark:bg-blue-950/30 dark:text-blue-300 dark:border-blue-700">
                            <Clock className="h-3 w-3" />
                            {new Date(r.scheduled_disburse_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
                          </Badge>
                        )}
                        <RunStepper status={r.status} />
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1 flex-wrap">
                        {r.status === 'draft' && (
                          <>
                            <Button size="sm" variant="outline" onClick={() => editDraft(r)}>
                              Edit
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => submit(r)}>
                              Submit
                            </Button>
                            {/* Delete is draft-only — once a run is in
                                pending_approval / approved / paid the
                                audit trail must stay intact. Operators
                                use Recall on a pending run to send it
                                back to draft, then delete. */}
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => deleteDraft(r)}
                              className="text-destructive hover:text-destructive hover:bg-destructive/10"
                              title="Delete this draft"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                        {r.status === 'pending_approval' && canApprovePerm && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => approve(r)}
                              disabled={isSelfApprovalBlocked(r)}
                              title={isSelfApprovalBlocked(r) ? 'You drafted this run — another approver must review it' : undefined}
                            >
                              Approve
                            </Button>
                            {/* Recall sends a pending run back to draft so
                                the originator (or an admin) can edit it
                                before re-submitting. Approved / paid runs
                                can't be recalled — that would corrupt
                                the audit trail. */}
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => recallToDraft(r)}
                              title="Recall to draft for editing"
                            >
                              Recall
                            </Button>
                          </>
                        )}
                        {r.status === 'approved' && (
                          <>
                            {canGeneratePayslipsPerm && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => generatePayslips(r)}
                                disabled={working}
                                title="Generate payslips for every active employee"
                              >
                                {working && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                                Generate payslips
                              </Button>
                            )}
                            {canDisburse && !r.scheduled_disburse_at && (
                              <Button
                                size="sm"
                                onClick={() => openDisburse(r)}
                                disabled={working}
                                title="Disburse net salaries now or schedule for later"
                              >
                                {working
                                  ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                                  : <Send className="mr-2 h-3.5 w-3.5" />}
                                Disburse salaries
                              </Button>
                            )}
                            {canDisburse && r.scheduled_disburse_at && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                onClick={() => doCancelSchedule(r)}
                                title="Cancel the scheduled disbursement"
                              >
                                <X className="mr-1.5 h-3.5 w-3.5" /> Cancel schedule
                              </Button>
                            )}
                            <Button size="sm" variant="outline" onClick={() => setConfirmPaidRun(r)}>
                              Record as Manually Paid
                            </Button>
                          </>
                        )}
                        {r.status === 'processing' && (
                          <span className="text-xs text-muted-foreground inline-flex items-center gap-1.5" title="A disbursement is in progress, or the browser closed mid-run — this clears on its own within 15 minutes and the run returns to Approved for a retry.">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Disbursing — clears automatically if interrupted
                          </span>
                        )}
                        {r.status !== 'paid' && canGeneratePayslipsPerm && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => openAdjustments(r)}
                            title="Add per-employee bonus, overtime, allowance or one-off deduction"
                          >
                            <Plus className="mr-1 h-3.5 w-3.5" /> Adjust
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => exportRun(r)}>
                          <Download className="h-4 w-4" />
                        </Button>
                        {r.status === 'approved' && (
                          <Button size="sm" variant="ghost" onClick={() => exportBankFile(r)} title="Download bank payment file">
                            <Banknote className="h-4 w-4" />
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => printRun(r)}>
                          <FileText className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            </div>

            {/* Mobile payroll runs — thumb-friendly card list */}
            <div className="md:hidden p-3 space-y-2">
              {runs.map((r, idx) => {
                const prev = runs[idx + 1];
                const momPct = prev && prev.total_burn_ngn > 0
                  ? ((r.total_burn_ngn - prev.total_burn_ngn) / prev.total_burn_ngn) * 100
                  : null;
                const accent =
                  r.status === 'draft' ? 'bg-muted-foreground'
                  : r.status === 'pending_approval' ? 'bg-amber-500'
                  : r.status === 'approved' ? 'bg-emerald-500'
                  : r.status === 'paid' ? 'bg-blue-500'
                  : 'bg-muted-foreground';
                const isHighlighted = highlightedRunId === r.id;
                return (
                  <div
                    key={r.id}
                    ref={(el) => { if (el) runRefs.current.set(r.id, el); }}
                    className={cn(isHighlighted && 'rounded-lg ring-2 ring-primary/40')}
                  >
                  <MobileCard accentClassName={accent}>
                    <MobileCardHeader>
                      <div className="min-w-0 flex-1">
                        <MobileCardTitle>{monthLabel(r.period, r.period_type)}</MobileCardTitle>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {r.employee_count ?? 0} employee{r.employee_count === 1 ? '' : 's'}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-base font-bold currency leading-tight">{formatNaira(r.total_burn_ngn)}</p>
                        {momPct !== null && (
                          <span className={`text-[10px] font-medium inline-flex items-center gap-0.5 ${momPct >= 0 ? 'text-success' : 'text-destructive'}`}>
                            {momPct >= 0 ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
                            {Math.abs(momPct).toFixed(1)}%
                          </span>
                        )}
                      </div>
                    </MobileCardHeader>

                    <MobileCardRow label="Status">
                      <div className="flex flex-col items-end gap-1.5">
                        <span className="inline-flex items-center gap-1.5 flex-wrap justify-end">
                          <StatusBadge status={r.status} />
                          {r.status === 'approved' && r.scheduled_disburse_at && (
                            <Badge variant="outline" className="gap-1 text-[10px] border-blue-300 text-blue-700 bg-blue-50 dark:bg-blue-950/30 dark:text-blue-300 dark:border-blue-700">
                              <Clock className="h-3 w-3" />
                              {new Date(r.scheduled_disburse_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
                            </Badge>
                          )}
                        </span>
                        <RunStepper status={r.status} />
                      </div>
                    </MobileCardRow>
                    <MobileCardRow label="Contractor" className="currency">{formatNaira(r.total_contractor_ngn)}</MobileCardRow>
                    <MobileCardRow label="Expenses" className="currency">{formatNaira(r.total_expenses_ngn)}</MobileCardRow>
                    <MobileCardRow label="PAYE" className="currency">{formatNaira(r.paye_ngn)}</MobileCardRow>
                    <MobileCardRow label="Pension (emp)" className="currency">{formatNaira(r.pension_ngn)}</MobileCardRow>
                    <MobileCardRow label="Pension (er)" className="currency">{formatNaira(r.employer_pension_ngn ?? (r.total_employee_ngn * EMPLOYER_PENSION_RATE))}</MobileCardRow>

                    <MobileCardFooter className="flex-wrap">
                      {r.status === 'draft' && (
                        <>
                          <Button size="sm" variant="outline" className="h-9" onClick={() => editDraft(r)}>
                            Edit
                          </Button>
                          <Button size="sm" variant="outline" className="h-9" onClick={() => submit(r)}>
                            Submit
                          </Button>
                        </>
                      )}
                      {r.status === 'pending_approval' && canApprovePerm && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-9 bg-success/10 text-success border-success/40 hover:bg-success/20"
                          onClick={() => approve(r)}
                          disabled={isSelfApprovalBlocked(r)}
                          title={isSelfApprovalBlocked(r) ? 'You drafted this run — another approver must review it' : undefined}
                        >
                          <Check className="h-4 w-4 mr-1.5" /> Approve
                        </Button>
                      )}
                      {r.status === 'approved' && canGeneratePayslipsPerm && (
                        <Button size="sm" variant="outline" className="h-9" onClick={() => generatePayslips(r)} disabled={working}>
                          {working && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                          Payslips
                        </Button>
                      )}
                      {r.status === 'approved' && canDisburse && !r.scheduled_disburse_at && (
                        <Button size="sm" className="h-9" onClick={() => openDisburse(r)} disabled={working}>
                          {working ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1.5 h-3.5 w-3.5" />}
                          Disburse
                        </Button>
                      )}
                      {r.status === 'approved' && canDisburse && r.scheduled_disburse_at && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-9 text-destructive border-destructive/40 hover:bg-destructive/10"
                          onClick={() => doCancelSchedule(r)}
                        >
                          <X className="h-4 w-4 mr-1.5" /> Cancel schedule
                        </Button>
                      )}
                      {r.status === 'approved' && (
                        <Button size="sm" variant="outline" className="h-9" onClick={() => setConfirmPaidRun(r)}>
                          Manually Paid
                        </Button>
                      )}
                      {r.status === 'processing' && (
                        <span className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Disbursing — clears automatically if interrupted
                        </span>
                      )}
                      <Button size="sm" variant="ghost" className="h-9 ml-auto" onClick={() => exportRun(r)}>
                        <Download className="h-4 w-4" />
                      </Button>
                      {r.status === 'approved' && (
                        <Button size="sm" variant="ghost" className="h-9" onClick={() => exportBankFile(r)} title="Download bank payment file">
                          <Banknote className="h-4 w-4" />
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" className="h-9" onClick={() => printRun(r)}>
                        <FileText className="h-4 w-4" />
                      </Button>
                    </MobileCardFooter>
                  </MobileCard>
                  </div>
                );
              })}
            </div>
            </>
          )}
        </div>
      </div>

    </div>
  );
};
