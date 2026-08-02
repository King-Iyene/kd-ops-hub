import { useEffect, useState } from 'react';
import { Printer, FileText, CheckCircle2, AlertTriangle, XCircle, MinusCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { formatNaira, formatNairaCompact, formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { fetchBoardReportData, type BoardReportData, type HighlightTone } from '@/lib/board-report';

const TONE_ICON: Record<HighlightTone, typeof CheckCircle2> = {
  positive: CheckCircle2,
  neutral: MinusCircle,
  warning: AlertTriangle,
  critical: XCircle,
};

const TONE_COLOR: Record<HighlightTone, string> = {
  positive: 'text-emerald-600 dark:text-emerald-400',
  neutral: 'text-muted-foreground',
  warning: 'text-amber-600 dark:text-amber-400',
  critical: 'text-destructive',
};

export default function BoardReportTab() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<BoardReportData | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        setReport(await fetchBoardReportData());
      } catch (err: any) {
        toast({ title: 'Could not build board report', description: err?.message, variant: 'destructive' });
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
          A single, board-ready summary of everything above — generate and print or save as PDF.
        </p>
        <Button size="sm" onClick={() => window.print()} disabled={!report}>
          <Printer className="h-4 w-4 mr-1.5" /> Print / Save as PDF
        </Button>
      </div>

      {!report && !loading ? (
        <p className="text-sm text-muted-foreground text-center py-10">Could not load report data.</p>
      ) : (
        <Card className="print:border-0 print:shadow-none">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" /> KDOps Board Report
            </CardTitle>
            {report && (
              <p className="text-xs text-muted-foreground">Generated {formatDate(report.generated_at.slice(0, 10))}</p>
            )}
          </CardHeader>
          <CardContent className="space-y-6">
            {/* ─── Executive summary ────────────────────────────────── */}
            {report && (
              <div>
                <h3 className="text-sm font-semibold mb-2">Executive summary</h3>
                <ul className="space-y-1.5">
                  {report.highlights.map((h, i) => {
                    const Icon = TONE_ICON[h.tone];
                    return (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <Icon className={cn('h-4 w-4 mt-0.5 shrink-0', TONE_COLOR[h.tone])} />
                        <span>{h.label}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {/* ─── Financial pulse ───────────────────────────────────── */}
            {report && (
              <div>
                <h3 className="text-sm font-semibold mb-2">Financial pulse</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <div><p className="text-xs text-muted-foreground">Cash on hand</p><p className="text-base font-semibold">{formatNaira(report.pulse.cash_on_hand_ngn)}</p></div>
                  <div><p className="text-xs text-muted-foreground">Net monthly burn</p><p className="text-base font-semibold">{formatNaira(report.pulse.net_monthly_burn_ngn)}</p></div>
                  <div><p className="text-xs text-muted-foreground">Runway</p><p className="text-base font-semibold">{report.pulse.runway_weeks == null ? '—' : `${report.pulse.runway_weeks.toFixed(1)}w`}</p></div>
                  <div><p className="text-xs text-muted-foreground">Headcount</p><p className="text-base font-semibold">{report.pulse.total_headcount}</p></div>
                  <div><p className="text-xs text-muted-foreground">Revenue / employee</p><p className="text-base font-semibold">{report.pulse.revenue_per_employee_ngn == null ? '—' : formatNairaCompact(report.pulse.revenue_per_employee_ngn)}</p></div>
                  <div><p className="text-xs text-muted-foreground">Payroll % of revenue</p><p className="text-base font-semibold">{report.pulse.payroll_pct_of_revenue == null ? '—' : `${report.pulse.payroll_pct_of_revenue.toFixed(0)}%`}</p></div>
                </div>
              </div>
            )}

            {/* ─── People cost by department ─────────────────────────── */}
            {report && report.departments.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold mb-2">People cost by department</h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Department</TableHead>
                      <TableHead className="text-right">Headcount</TableHead>
                      <TableHead className="text-right">Cost-to-company</TableHead>
                      <TableHead className="text-right">% of total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.departments.map((d) => (
                      <TableRow key={d.department_id ?? 'none'}>
                        <TableCell className="font-medium">{d.department_name}</TableCell>
                        <TableCell className="text-right">{d.headcount}</TableCell>
                        <TableCell className="text-right">{formatNaira(d.total_ctc_ngn)}</TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {totalCtc > 0 ? `${((d.total_ctc_ngn / totalCtc) * 100).toFixed(0)}%` : '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* ─── Payroll trend ──────────────────────────────────────── */}
            {recentTrend.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold mb-2">Payroll trend — last {recentTrend.length} runs</h3>
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
                        <TableCell>{t.period}</TableCell>
                        <TableCell className="text-right">{formatNaira(t.total_burn_ngn)}</TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {t.delta_pct == null ? '—' : `${t.delta_pct >= 0 ? '+' : ''}${t.delta_pct.toFixed(1)}%`}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* ─── Compliance status ──────────────────────────────────── */}
            {report && (
              <div>
                <h3 className="text-sm font-semibold mb-2">Compliance status</h3>
                {report.overdueCompliance.length === 0 ? (
                  <p className="text-sm text-muted-foreground">All filings up to date.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Filing</TableHead>
                        <TableHead>Period</TableHead>
                        <TableHead>Due</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {report.overdueCompliance.map((c) => (
                        <TableRow key={c.id}>
                          <TableCell className="uppercase">{c.kind}</TableCell>
                          <TableCell>{c.period}</TableCell>
                          <TableCell>{formatDate(c.due_date)}</TableCell>
                          <TableCell className="text-right">{c.amount_ngn == null ? '—' : formatNaira(c.amount_ngn)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            )}

            {/* ─── Talent snapshot ────────────────────────────────────── */}
            {report && (
              <div>
                <h3 className="text-sm font-semibold mb-2">Talent snapshot</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-3">
                  <div><p className="text-xs text-muted-foreground">Avg. employee cost / mo</p><p className="text-base font-semibold">{formatNaira(report.talentComparison.employee_avg_monthly_cost_ngn)}</p></div>
                  <div><p className="text-xs text-muted-foreground">Avg. contractor cost / mo</p><p className="text-base font-semibold">{formatNaira(report.talentComparison.contractor_avg_monthly_cost_ngn)}</p></div>
                  <div><p className="text-xs text-muted-foreground">Employee : contractor ratio</p><p className="text-base font-semibold">{report.talentComparison.employee_to_contractor_ratio == null ? '—' : `${report.talentComparison.employee_to_contractor_ratio.toFixed(2)}×`}</p></div>
                </div>
                {report.compBands.length > 0 && (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Department</TableHead>
                        <TableHead className="text-right">Min</TableHead>
                        <TableHead className="text-right">Median</TableHead>
                        <TableHead className="text-right">Max</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {report.compBands.map((b) => (
                        <TableRow key={b.department_id ?? 'none'}>
                          <TableCell className="font-medium">{b.department_name}</TableCell>
                          <TableCell className="text-right">{formatNaira(b.min_ngn)}</TableCell>
                          <TableCell className="text-right">{formatNaira(b.median_ngn)}</TableCell>
                          <TableCell className="text-right">{formatNaira(b.max_ngn)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
