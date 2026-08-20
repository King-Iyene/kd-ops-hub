import { useEffect, useState } from 'react';
import { Printer, CheckCircle2, AlertTriangle, XCircle, MinusCircle, TrendingUp, TrendingDown } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { formatNaira, formatNairaCompact, formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { fetchBoardReportData, type BoardReportData, type HighlightTone } from '@/lib/board-report';
import { fmtCompact } from '@/lib/chart-theme';
import { errorMessage } from '@/lib/db-errors';

const TONE_ICON: Record<HighlightTone, typeof CheckCircle2> = {
  positive: CheckCircle2,
  neutral: MinusCircle,
  warning: AlertTriangle,
  critical: XCircle,
};

const TONE_STYLE: Record<HighlightTone, { bg: string; border: string; icon: string }> = {
  positive: { bg: 'bg-emerald-500/[0.06]', border: 'border-emerald-500/20', icon: 'text-emerald-600 dark:text-emerald-400' },
  neutral:  { bg: 'bg-muted/50',           border: 'border-border',         icon: 'text-muted-foreground' },
  warning:  { bg: 'bg-amber-500/[0.06]',   border: 'border-amber-500/20',   icon: 'text-amber-600 dark:text-amber-400' },
  critical: { bg: 'bg-red-500/[0.06]',     border: 'border-red-500/20',     icon: 'text-red-600 dark:text-red-400' },
};

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{children}</h3>
      <div className="flex-1 h-px bg-border" />
    </div>
  );
}

function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-[11px] text-muted-foreground mb-1">{label}</p>
      <p className="text-xl font-bold leading-tight">{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground mt-1">{sub}</p>}
    </div>
  );
}

export default function BoardReportTab() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<BoardReportData | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        setReport(await fetchBoardReportData());
      } catch (err: unknown) {
        toast({ title: 'Could not build board report', description: errorMessage(err), variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalCtc = report ? report.departments.reduce((s, d) => s + d.total_ctc_ngn, 0) : 0;
  const recentTrend = report ? report.trend.slice(-6) : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between print:hidden">
        <p className="text-sm text-muted-foreground">
          A single, board-ready summary — generate and print or save as PDF.
        </p>
        <Button size="sm" onClick={() => window.print()} disabled={!report}>
          <Printer className="h-4 w-4 mr-1.5" /> Print / Save as PDF
        </Button>
      </div>

      {!report && !loading ? (
        <p className="text-sm text-muted-foreground text-center py-10">Could not load report data.</p>
      ) : report ? (
        <Card className="print:border-0 print:shadow-none overflow-hidden">
          {/* ─── Report header ──────────────────────────────────────── */}
          <div className="border-b bg-muted/30 px-6 py-5 sm:px-8">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-bold tracking-tight">KDOps Financial Report</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Generated {formatDate(report.generated_at.slice(0, 10))}
                </p>
              </div>
              <Badge variant="outline" className="text-[10px] font-medium">
                Board ready
              </Badge>
            </div>
          </div>

          <div className="px-6 py-6 sm:px-8 space-y-8">

            {/* ─── Executive summary ───────────────────────────────── */}
            <section>
              <SectionHeading>Executive Summary</SectionHeading>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {report.highlights.map((h, i) => {
                  const Icon = TONE_ICON[h.tone];
                  const style = TONE_STYLE[h.tone];
                  return (
                    <div key={i} className={cn('flex items-start gap-3 rounded-lg border p-3', style.bg, style.border)}>
                      <Icon className={cn('h-4 w-4 mt-0.5 shrink-0', style.icon)} />
                      <span className="text-sm leading-snug">{h.label}</span>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* ─── Financial snapshot ───────────────────────────────── */}
            <section>
              <SectionHeading>Financial Snapshot</SectionHeading>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <StatTile
                  label="Cash on hand"
                  value={formatNairaCompact(report.pulse.cash_on_hand_ngn)}
                />
                <StatTile
                  label="Net monthly burn"
                  value={formatNairaCompact(report.pulse.net_monthly_burn_ngn)}
                />
                <StatTile
                  label="Runway"
                  value={report.pulse.runway_weeks == null ? '—' : `${report.pulse.runway_weeks.toFixed(1)} weeks`}
                  sub={report.pulse.runway_weeks != null && report.pulse.runway_weeks < 12 ? 'Below 12-week caution threshold' : undefined}
                />
                <StatTile
                  label="Headcount"
                  value={String(report.pulse.total_headcount)}
                  sub="Active, salaried, excl. drivers"
                />
                <StatTile
                  label="Revenue / employee"
                  value={report.pulse.revenue_per_employee_ngn == null ? '—' : formatNairaCompact(report.pulse.revenue_per_employee_ngn)}
                  sub="Monthly"
                />
                <StatTile
                  label="Payroll % of revenue"
                  value={report.pulse.payroll_pct_of_revenue == null ? '—' : `${report.pulse.payroll_pct_of_revenue.toFixed(0)}%`}
                  sub="Latest approved run"
                />
              </div>
            </section>

            {/* ─── Cost structure ───────────────────────────────────── */}
            {report.departments.length > 0 && (
              <section>
                <SectionHeading>Cost Structure by Department</SectionHeading>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Department</TableHead>
                        <TableHead className="text-right">Headcount</TableHead>
                        <TableHead className="text-right">Cost-to-company</TableHead>
                        <TableHead className="text-right w-[140px]">Share</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {report.departments.map((d) => {
                        const pct = totalCtc > 0 ? (d.total_ctc_ngn / totalCtc) * 100 : 0;
                        return (
                          <TableRow key={d.department_id ?? 'none'}>
                            <TableCell className="font-medium">{d.department_name}</TableCell>
                            <TableCell className="text-right tabular-nums">{d.headcount}</TableCell>
                            <TableCell className="text-right tabular-nums">{formatNaira(d.total_ctc_ngn)}</TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-2">
                                <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                                  <div
                                    className="h-full rounded-full bg-primary"
                                    style={{ width: `${Math.min(100, pct)}%` }}
                                  />
                                </div>
                                <span className="text-muted-foreground text-xs tabular-nums w-10 text-right">
                                  {pct.toFixed(0)}%
                                </span>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
                <p className="text-[11px] text-muted-foreground mt-2">
                  Total cost-to-company: {formatNaira(totalCtc)} (gross + employer pension 10% + NSITF 1%)
                </p>
              </section>
            )}

            {/* ─── Payroll trend ────────────────────────────────────── */}
            {recentTrend.length > 0 && (
              <section>
                <SectionHeading>Payroll Trend — Last {recentTrend.length} Runs</SectionHeading>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Period</TableHead>
                        <TableHead className="text-right">Total burn</TableHead>
                        <TableHead className="text-right">Change</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {recentTrend.map((t) => (
                        <TableRow key={t.period}>
                          <TableCell className="tabular-nums">{t.period}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatNaira(t.total_burn_ngn)}</TableCell>
                          <TableCell className="text-right">
                            {t.delta_pct == null ? (
                              <span className="text-muted-foreground">—</span>
                            ) : (
                              <span className={cn(
                                'inline-flex items-center gap-1 text-xs font-medium',
                                t.delta_pct > 0 ? 'text-red-600 dark:text-red-400' : t.delta_pct < 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground',
                              )}>
                                {t.delta_pct > 0 ? <TrendingUp className="h-3 w-3" /> : t.delta_pct < 0 ? <TrendingDown className="h-3 w-3" /> : null}
                                <span className="tabular-nums">{t.delta_pct >= 0 ? '+' : ''}{t.delta_pct.toFixed(1)}%</span>
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </section>
            )}

            {/* ─── Compliance status ───────────────────────────────── */}
            <section>
              <SectionHeading>Compliance Status</SectionHeading>
              {report.overdueCompliance.length === 0 ? (
                <div className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.06] p-3">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span className="text-sm">All statutory filings are up to date.</span>
                </div>
              ) : (
                <div className="space-y-2">
                  {report.overdueCompliance.map((c) => (
                    <div key={c.id} className="flex items-center justify-between gap-3 rounded-lg border border-red-500/20 bg-red-500/[0.06] p-3">
                      <div className="flex items-center gap-2">
                        <XCircle className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0" />
                        <div>
                          <p className="text-sm font-medium">{c.kind.toUpperCase()} — {c.period}</p>
                          <p className="text-[11px] text-muted-foreground">Due {formatDate(c.due_date)}</p>
                        </div>
                      </div>
                      {c.amount_ngn != null && (
                        <span className="text-sm font-semibold tabular-nums">{formatNaira(c.amount_ngn)}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* ─── Talent snapshot ──────────────────────────────────── */}
            <section>
              <SectionHeading>Talent Snapshot</SectionHeading>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
                <StatTile
                  label="Avg. employee cost / mo"
                  value={formatNairaCompact(report.talentComparison.employee_avg_monthly_cost_ngn)}
                  sub={`${report.talentComparison.employee_count} employees`}
                />
                <StatTile
                  label="Avg. contractor cost / mo"
                  value={formatNairaCompact(report.talentComparison.contractor_avg_monthly_cost_ngn)}
                  sub={`${report.talentComparison.contractor_count} contractors`}
                />
                <StatTile
                  label="Employee : contractor ratio"
                  value={report.talentComparison.employee_to_contractor_ratio == null ? '—' : `${report.talentComparison.employee_to_contractor_ratio.toFixed(2)}×`}
                />
              </div>

              {report.compBands.length > 0 && (
                <div className="overflow-x-auto">
                  <p className="text-xs text-muted-foreground mb-2">Compensation bands by department</p>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Department</TableHead>
                        <TableHead className="text-right">Min</TableHead>
                        <TableHead className="text-right">Median</TableHead>
                        <TableHead className="text-right">Max</TableHead>
                        <TableHead className="text-right w-[120px]">Range</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {report.compBands.map((b) => {
                        const maxAll = Math.max(...report.compBands.map((x) => x.max_ngn), 1);
                        return (
                          <TableRow key={b.department_id ?? 'none'}>
                            <TableCell className="font-medium">{b.department_name}</TableCell>
                            <TableCell className="text-right tabular-nums">{fmtCompact(b.min_ngn)}</TableCell>
                            <TableCell className="text-right font-medium tabular-nums">{fmtCompact(b.median_ngn)}</TableCell>
                            <TableCell className="text-right tabular-nums">{fmtCompact(b.max_ngn)}</TableCell>
                            <TableCell className="text-right">
                              <div className="relative h-1.5 rounded-full bg-muted overflow-hidden w-full">
                                <div
                                  className="absolute h-full rounded-full bg-primary/30"
                                  style={{
                                    left: `${(b.min_ngn / maxAll) * 100}%`,
                                    width: `${((b.max_ngn - b.min_ngn) / maxAll) * 100}%`,
                                  }}
                                />
                                <div
                                  className="absolute h-full w-1 rounded-full bg-primary"
                                  style={{ left: `${(b.median_ngn / maxAll) * 100}%` }}
                                />
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </section>

            {/* ─── Footer ──────────────────────────────────────────── */}
            <div className="border-t pt-4 flex items-center justify-between">
              <p className="text-[10px] text-muted-foreground">
                KDOps Financial Report — Confidential
              </p>
              <p className="text-[10px] text-muted-foreground">
                {formatDate(report.generated_at.slice(0, 10))}
              </p>
            </div>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
