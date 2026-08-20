import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldAlert, CalendarClock, Siren, AlertTriangle, Save, ArrowRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { formatNaira, formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { errorMessage } from '@/lib/db-errors';
import {
  fetchComplianceExposure,
  fetchSmartPaymentSchedule,
  loadPenaltyRules,
  savePenaltyRules,
  type ComplianceExposureRow,
  type PaymentScheduleRecommendation,
  type PenaltyRule,
} from '@/lib/financial-autopilot';
import { countOpenAnomalies } from '@/lib/anomalies';

const COMPLIANCE_KIND_LABEL: Record<string, string> = {
  paye: 'PAYE', pension: 'Pension', vat: 'VAT', wht: 'WHT',
  tcc: 'TCC', cac: 'CAC', itf: 'ITF', nsitf: 'NSITF', nhf: 'NHF',
};

const ACTION_TONE: Record<string, string> = {
  release: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
  review: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30',
  hold: 'bg-destructive/15 text-destructive border-destructive/30',
};

export default function AutopilotTab() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [rules, setRules] = useState<Record<string, PenaltyRule>>({});
  const [exposure, setExposure] = useState<ComplianceExposureRow[]>([]);
  const [schedule, setSchedule] = useState<PaymentScheduleRecommendation[]>([]);
  const [openAnomalyCounts, setOpenAnomalyCounts] = useState({ total: 0, critical: 0, high: 0 });

  const load = async (currentRules: Record<string, PenaltyRule>) => {
    setLoading(true);
    try {
      const [exposureRes, scheduleRes, anomalyRes] = await Promise.all([
        fetchComplianceExposure(currentRules),
        fetchSmartPaymentSchedule(13),
        countOpenAnomalies(),
      ]);
      setExposure(exposureRes);
      setSchedule(scheduleRes);
      setOpenAnomalyCounts(anomalyRes);
    } catch (err: unknown) {
      toast({ title: 'Could not load Autopilot data', description: errorMessage(err), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const stored = loadPenaltyRules();
    setRules(stored);
    load(stored);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalExposure = exposure.reduce((s, r) => s + r.estimated_penalty_ngn, 0);

  const kindsPresent = useMemo(() => Array.from(new Set(exposure.map((r) => r.kind))), [exposure]);

  const updateRule = (kind: string, field: keyof PenaltyRule, value: string) => {
    const num = Math.max(0, Number(value) || 0);
    setRules((prev) => ({
      ...prev,
      [kind]: { flat_filing_penalty_ngn: 0, pct_per_month: 0, ...prev[kind], [field]: num },
    }));
  };

  const saveRules = async () => {
    savePenaltyRules(rules);
    toast({ title: 'Penalty assumptions saved' });
    await load(rules);
  };

  return (
    <div className="space-y-6">
      {/* ─── Compliance penalty exposure ────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-destructive" /> Compliance penalty exposure
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Estimated penalty for staying overdue, based on rates <span className="font-medium text-foreground">you enter below</span> —
            statutory penalty rates vary by regulator and change over time, so nothing here is pre-filled.
            Confirm current rates with FIRS, PenCom, LIRS or your tax advisor before relying on these figures.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {kindsPresent.length === 0 && !loading ? (
            <p className="text-sm text-muted-foreground text-center py-8">No overdue filings — nothing to model.</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Filing type</TableHead>
                      <TableHead className="text-right">Flat filing penalty (₦)</TableHead>
                      <TableHead className="text-right">% of amount / month</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {kindsPresent.map((kind) => (
                      <TableRow key={kind}>
                        <TableCell className="font-medium">{COMPLIANCE_KIND_LABEL[kind] ?? kind.toUpperCase()}</TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number" min={0} className="h-8 w-32 ml-auto text-right"
                            value={rules[kind]?.flat_filing_penalty_ngn ?? 0}
                            onChange={(e) => updateRule(kind, 'flat_filing_penalty_ngn', e.target.value)}
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number" min={0} step={0.1} className="h-8 w-24 ml-auto text-right"
                            value={rules[kind]?.pct_per_month ?? 0}
                            onChange={(e) => updateRule(kind, 'pct_per_month', e.target.value)}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <Button size="sm" onClick={saveRules}><Save className="h-4 w-4 mr-1.5" /> Save assumptions & recalculate</Button>

              <div className="rounded-lg border bg-muted/30 p-4">
                <p className="text-sm">
                  Total modeled exposure: <span className="font-semibold currency">{formatNaira(totalExposure)}</span>
                </p>
              </div>

              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Filing</TableHead>
                      <TableHead>Period</TableHead>
                      <TableHead className="text-right">Days overdue</TableHead>
                      <TableHead className="text-right">Amount owed</TableHead>
                      <TableHead className="text-right">Est. penalty</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {exposure.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{COMPLIANCE_KIND_LABEL[r.kind] ?? r.kind.toUpperCase()}</TableCell>
                        <TableCell className="text-muted-foreground">{r.period}</TableCell>
                        <TableCell className="text-right">{r.days_overdue}</TableCell>
                        <TableCell className="text-right currency">{r.amount_ngn == null ? '—' : formatNaira(r.amount_ngn)}</TableCell>
                        <TableCell className="text-right font-medium currency">
                          {!r.rule_configured ? (
                            <span className="text-muted-foreground text-xs">Not configured</span>
                          ) : (
                            formatNaira(r.estimated_penalty_ngn)
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ─── Smart payment scheduling ────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-primary" /> Smart payment scheduling
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Pending payment batches mapped onto the 13-week cash forecast — a release/review/hold call before you approve, not after.
          </p>
        </CardHeader>
        <CardContent>
          {schedule.length === 0 && !loading ? (
            <p className="text-sm text-muted-foreground text-center py-10">No pending payment batches to schedule.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Batch</TableHead>
                    <TableHead>Scheduled</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Signal</TableHead>
                    <TableHead>Note</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {schedule.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.label}</TableCell>
                      <TableCell className="text-muted-foreground">{formatDate(s.scheduled_date)}</TableCell>
                      <TableCell className="text-right currency">{formatNaira(s.amount_ngn)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn('text-[10px] capitalize', ACTION_TONE[s.action])}>{s.action}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[280px]">{s.note}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── Expense anomaly detection ──────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Siren className="h-4 w-4 text-amber-600" /> Expense anomaly detection
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Runs nightly: outlier spend vs category average, possible duplicate claims, and stale backdated claims.
          </p>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className={cn('h-5 w-5', openAnomalyCounts.critical > 0 ? 'text-destructive' : 'text-muted-foreground')} />
              <div>
                <p className="text-sm font-medium">{openAnomalyCounts.total} open anomal{openAnomalyCounts.total === 1 ? 'y' : 'ies'} across all modules</p>
                <p className="text-xs text-muted-foreground">
                  {openAnomalyCounts.critical} critical · {openAnomalyCounts.high} high severity
                </p>
              </div>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link to="/anomalies">
                Open Anomalies queue <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
