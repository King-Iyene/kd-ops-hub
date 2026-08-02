import { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as ReTooltip, Cell, ReferenceLine,
} from 'recharts';
import { Scale, ArrowUpRight, ArrowDownRight, Banknote, Receipt, CreditCard, Users } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { formatNaira } from '@/lib/format';
import { cn } from '@/lib/utils';
import { fetchWorkingCapitalData, type WorkingCapitalResult, type WcBand } from '@/lib/working-capital';
import { GRID, AXIS_TICK, fmtCompact, ChartTooltip } from '@/lib/chart-theme';

const BAND_STYLE: Record<WcBand, { tone: string; label: string }> = {
  strong:   { tone: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30', label: 'Strong' },
  adequate: { tone: 'bg-blue-500/15 text-blue-700 border-blue-500/30',          label: 'Adequate' },
  tight:    { tone: 'bg-amber-500/15 text-amber-700 border-amber-500/30',       label: 'Tight' },
  negative: { tone: 'bg-destructive/15 text-destructive border-destructive/30',  label: 'Negative' },
};

const INFLOW_COLOR = '#1baf7a';
const OUTFLOW_COLOR = '#e34948';

function RatioGauge({ label, value, threshold, thresholdLabel }: {
  label: string;
  value: number | null;
  threshold: number;
  thresholdLabel: string;
}) {
  const display = value != null ? value.toFixed(2) : '—';
  const isHealthy = value != null && value >= threshold;
  const pct = value != null ? Math.min(100, (value / (threshold * 2)) * 100) : 0;

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className={cn(
          'text-2xl font-bold',
          value == null ? 'text-muted-foreground' :
          isHealthy ? 'text-emerald-600 dark:text-emerald-400' :
          'text-red-600 dark:text-red-400',
        )}>
          {display}×
        </span>
      </div>
      <div className="relative h-2 rounded-full bg-muted overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-700',
            isHealthy ? 'bg-emerald-500' : 'bg-red-500',
          )}
          style={{ width: `${pct}%` }}
        />
        <div
          className="absolute top-0 w-0.5 h-full bg-foreground/40"
          style={{ left: `${Math.min(100, (threshold / (threshold * 2)) * 100)}%` }}
        />
      </div>
      <p className="text-[10px] text-muted-foreground">Healthy: ≥ {thresholdLabel}</p>
    </div>
  );
}

export default function WorkingCapitalTab() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<WorkingCapitalResult | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        setData(await fetchWorkingCapitalData());
      } catch (err: any) {
        toast({ title: 'Could not load working capital data', description: err?.message, variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const waterfallData = useMemo(() => {
    if (!data) return [];
    return data.waterfall.map((w) => ({
      label: w.label,
      inflows: w.inflows_ngn,
      outflows: -w.outflows_ngn,
      net: w.net_ngn,
      running: w.running_wc_ngn,
    }));
  }, [data]);

  const band = data ? BAND_STYLE[data.band] : null;
  const snap = data?.snapshot;

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Working capital = current assets − current liabilities. It measures the company's short-term financial cushion — can you cover obligations due within the next month?
      </p>

      {!data && !loading ? (
        <p className="text-sm text-muted-foreground text-center py-10">Could not load working capital data.</p>
      ) : data && snap ? (
        <>
          {/* ─── Working capital headline ─────────────────────────── */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Scale className="h-4 w-4 text-primary" /> Working Capital Position
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col sm:flex-row items-center gap-6 py-4">
                <div className="text-center sm:text-left">
                  <p className="text-xs text-muted-foreground mb-1">Net working capital</p>
                  <p className={cn(
                    'text-3xl font-bold',
                    snap.working_capital_ngn >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400',
                  )}>
                    {formatNaira(snap.working_capital_ngn)}
                  </p>
                  {band && (
                    <Badge variant="outline" className={cn('mt-1', band.tone)}>{band.label}</Badge>
                  )}
                </div>
                <div className="flex-1 grid grid-cols-2 gap-4">
                  <RatioGauge label="Current ratio" value={snap.current_ratio} threshold={1.5} thresholdLabel="1.5×" />
                  <RatioGauge label="Quick ratio" value={snap.quick_ratio} threshold={1.0} thresholdLabel="1.0×" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ─── Asset/liability breakdown ────────────────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <ArrowUpRight className="h-4 w-4" style={{ color: INFLOW_COLOR }} /> Current Assets
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Banknote className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">Cash on hand</span>
                  </div>
                  <span className="text-sm font-semibold tabular-nums">{formatNaira(snap.cash_on_hand_ngn)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Receipt className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">Accounts receivable</span>
                  </div>
                  <span className="text-sm font-semibold tabular-nums">{formatNaira(snap.accounts_receivable_ngn)}</span>
                </div>
                <div className="border-t pt-2 flex items-center justify-between">
                  <span className="text-sm font-semibold">Total current assets</span>
                  <span className="text-sm font-bold tabular-nums" style={{ color: INFLOW_COLOR }}>{formatNaira(snap.current_assets_ngn)}</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <ArrowDownRight className="h-4 w-4" style={{ color: OUTFLOW_COLOR }} /> Current Liabilities
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CreditCard className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">Accounts payable</span>
                  </div>
                  <span className="text-sm font-semibold tabular-nums">{formatNaira(snap.accounts_payable_ngn)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">Upcoming payroll</span>
                  </div>
                  <span className="text-sm font-semibold tabular-nums">{formatNaira(snap.upcoming_payroll_ngn)}</span>
                </div>
                <div className="border-t pt-2 flex items-center justify-between">
                  <span className="text-sm font-semibold">Total current liabilities</span>
                  <span className="text-sm font-bold tabular-nums" style={{ color: OUTFLOW_COLOR }}>{formatNaira(snap.current_liabilities_ngn)}</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ─── 4-week waterfall ──────────────────────────────────── */}
          {waterfallData.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Working capital forecast — next 4 weeks</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Based on outstanding invoice due dates (inflows) and approved payables + payroll (outflows).
                </p>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-x-4 gap-y-1 mb-3">
                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span className="w-3 h-2 rounded-[2px]" style={{ background: INFLOW_COLOR }} />
                    Inflows
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span className="w-3 h-2 rounded-[2px]" style={{ background: OUTFLOW_COLOR }} />
                    Outflows
                  </div>
                </div>
                <div className="h-[240px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={waterfallData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }} barSize={18}>
                      <CartesianGrid {...GRID} />
                      <XAxis dataKey="label" {...AXIS_TICK} />
                      <YAxis {...AXIS_TICK} tickFormatter={(v: number) => fmtCompact(v)} />
                      <ReTooltip content={<ChartTooltip valueFormatter={(v) => formatNaira(Math.abs(v))} />} />
                      <ReferenceLine y={0} stroke="currentColor" strokeWidth={1} strokeOpacity={0.2} />
                      <Bar dataKey="inflows" name="Inflows" radius={[4, 4, 0, 0]}>
                        {waterfallData.map((_, i) => (
                          <Cell key={`in-${i}`} fill={INFLOW_COLOR} />
                        ))}
                      </Bar>
                      <Bar dataKey="outflows" name="Outflows" radius={[0, 0, 4, 4]}>
                        {waterfallData.map((_, i) => (
                          <Cell key={`out-${i}`} fill={OUTFLOW_COLOR} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-3 grid grid-cols-4 gap-2 text-center">
                  {data.waterfall.map((w) => (
                    <div key={w.label}>
                      <p className="text-[10px] text-muted-foreground">{w.label}</p>
                      <p className={cn(
                        'text-xs font-semibold tabular-nums',
                        w.running_wc_ngn >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400',
                      )}>
                        {fmtCompact(w.running_wc_ngn)}
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* ─── Interpretation ────────────────────────────────────── */}
          <Card>
            <CardContent className="pt-6">
              <div className="text-sm space-y-2">
                <p className="font-semibold">Reading the ratios</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-muted-foreground">
                  <div>
                    <p className="font-medium text-foreground mb-0.5">Current ratio</p>
                    <p>Current assets / current liabilities. Measures overall short-term solvency. Below 1.0 means liabilities exceed assets — a warning sign. Above 1.5 is healthy for most Nigerian SMEs.</p>
                  </div>
                  <div>
                    <p className="font-medium text-foreground mb-0.5">Quick ratio</p>
                    <p>Same as current ratio but only includes liquid assets (cash + receivables, no inventory). For service companies like KDOps, the quick ratio equals the current ratio since there's no inventory.</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
