import { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ReTooltip,
  ReferenceLine,
  LineChart,
  Line,
} from 'recharts';
import { Activity, AlertTriangle, Banknote, RefreshCw, TrendingDown, Wallet } from 'lucide-react';

import { PageHeader } from '@/components/ui-kit/PageHeader';
import { MobileCard, MobileCardHeader, MobileCardTitle, MobileCardMeta, MobileCardRow } from '@/components/ui-kit/MobileCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { usePageTitle } from '@/hooks/usePageTitle';
import { formatNaira } from '@/lib/format';
import { ChartGradients, GlassTooltip, chartTheme, axisTick } from '@/components/ChartKit';
import { cn } from '@/lib/utils';
import {
  bandForRunwayWeeks,
  fetchForecast,
  fetchSnapshotHistory,
  forecastChartData,
  takeSnapshot,
  topObligations,
  type CashSnapshot,
  type ForecastWeek,
  RUNWAY_CRITICAL_WEEKS,
  RUNWAY_WARNING_WEEKS,
} from '@/lib/cashflow';
import { supabase } from '@/lib/supabase';

const CATEGORY_LABEL: Record<string, string> = {
  recurring: 'Recurring transfer',
  batches: 'Scheduled batch',
  ewa: 'EWA settlement',
  external: 'External burn',
};

const BAND_TONE: Record<string, { tone: string; label: string }> = {
  critical: { tone: 'bg-destructive/15 text-destructive border-destructive/30', label: 'Critical' },
  warning:  { tone: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30',       label: 'Warning'  },
  caution:  { tone: 'bg-amber-300/20 text-amber-700 dark:text-amber-400 border-amber-400/30',        label: 'Caution'  },
  healthy:  { tone: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',  label: 'Healthy'  },
  unknown:  { tone: 'bg-muted text-muted-foreground border-border',              label: 'Unknown'  },
};

export default function CashFlow() {
  usePageTitle('Cash Flow');
  const { toast } = useToast();
  const [forecast, setForecast] = useState<ForecastWeek[]>([]);
  const [history, setHistory] = useState<CashSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cashOnHand, setCashOnHand] = useState<number>(0);
  const [externalBurn, setExternalBurn] = useState<number>(0);
  const [revenue, setRevenue] = useState<number>(0);

  const load = async () => {
    setLoading(true);
    try {
      const [f, h, settings] = await Promise.all([
        fetchForecast(12),
        fetchSnapshotHistory(90),
        supabase
          .from('company_settings')
          .select('cash_on_hand_ngn, external_monthly_burn_ngn, monthly_revenue_estimate_ngn')
          .eq('id', '00000000-0000-0000-0000-000000000001')
          .maybeSingle(),
      ]);
      setForecast(f);
      setHistory(h);
      const s = settings.data as any;
      setCashOnHand(Number(s?.cash_on_hand_ngn || 0));
      setExternalBurn(Number(s?.external_monthly_burn_ngn || 0));
      setRevenue(Number(s?.monthly_revenue_estimate_ngn || 0));
    } catch (err: any) {
      toast({ title: 'Could not load cash flow', description: err?.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleRefreshSnapshot = async () => {
    setRefreshing(true);
    try {
      await takeSnapshot();
      toast({ title: 'Snapshot taken', description: 'Today\'s balance has been recorded.' });
      await load();
    } catch (err: any) {
      toast({ title: 'Snapshot failed', description: err?.message, variant: 'destructive' });
    } finally {
      setRefreshing(false);
    }
  };

  // ─── Derived ────────────────────────────────────────────────────────────

  const firstWeek = forecast[0];
  const runwayWeeks = firstWeek?.runway_weeks_remaining ?? null;
  const band = bandForRunwayWeeks(runwayWeeks);
  const bandStyle = BAND_TONE[band];

  const chartData = useMemo(() => forecastChartData(forecast), [forecast]);

  const trendData = useMemo(
    () =>
      history.map((s) => ({
        label: s.taken_on.slice(5),
        balance: Number(s.cash_on_hand_ngn),
      })),
    [history],
  );

  const topObs = useMemo(() => topObligations(forecast, 10), [forecast]);

  const totalProjectedOutflow = forecast.reduce(
    (sum, w) => sum + w.projected_outflows_ngn, 0,
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cash Flow"
        description="Forward-looking runway forecast based on recurring schedules, scheduled batches and EWA settlements."
        icon={Activity}
        actions={
          <Button onClick={handleRefreshSnapshot} disabled={refreshing} size="sm" variant="outline">
            <RefreshCw className={cn('h-4 w-4 mr-2', refreshing && 'animate-spin')} />
            Take snapshot now
          </Button>
        }
      />

      {/* ─── KPI row ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Wallet className="h-4 w-4 text-primary" /> Cash on hand
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold currency">{formatNaira(cashOnHand)}</p>
            <p className="text-xs text-muted-foreground mt-1">From Settings → Company</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-amber-600" /> Net monthly burn
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold currency">
              {formatNaira(Math.max(0, externalBurn - revenue))}
            </p>
            <p className="text-xs text-muted-foreground mt-1">External − revenue (from Settings)</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" /> Runway (weeks)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-2">
              <p className="text-2xl font-bold">
                {runwayWeeks === null ? '—' : runwayWeeks.toFixed(1)}
              </p>
              <Badge variant="outline" className={cn('mb-1', bandStyle.tone)}>
                {bandStyle.label}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Critical &lt; {RUNWAY_CRITICAL_WEEKS}w · Warning &lt; {RUNWAY_WARNING_WEEKS}w
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Banknote className="h-4 w-4 text-primary" /> 12-week obligations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold currency">{formatNaira(totalProjectedOutflow)}</p>
            <p className="text-xs text-muted-foreground mt-1">Sum of all upcoming outflows</p>
          </CardContent>
        </Card>
      </div>

      {/* ─── Forward forecast chart ────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">12-week balance projection</CardTitle>
        </CardHeader>
        <CardContent className="h-[280px]">
          {chartData.length === 0 && !loading ? (
            <p className="text-sm text-muted-foreground text-center py-12">
              No forecast data yet. Set cash on hand in Settings → Company and try again.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                <ChartGradients />
                <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridLine} vertical={false} />
                <XAxis dataKey="label" tick={axisTick} axisLine={{ stroke: chartTheme.gridLine }} tickLine={false} />
                <YAxis tick={axisTick} axisLine={false} tickLine={false} tickFormatter={(v: number) => `₦${(v / 1_000_000).toFixed(1)}M`} />
                <ReTooltip
                  content={
                    <GlassTooltip
                      formatter={(value: number) => formatNaira(value)}
                      labelFormatter={(l: string) => `Week of ${l}`}
                    />
                  }
                  cursor={{ stroke: chartTheme.primary, strokeOpacity: 0.3 }}
                />
                <ReferenceLine y={0} stroke={chartTheme.danger} strokeDasharray="3 3" />
                <Area
                  type="monotone"
                  dataKey="balance"
                  name="Projected balance"
                  stroke={chartTheme.primary}
                  fill="url(#kd-grad-primary)"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* ─── 90-day balance trend ──────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">90-day balance trend</CardTitle>
        </CardHeader>
        <CardContent className="h-[220px]">
          {trendData.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-12">
              No snapshots yet. The first snapshot is taken automatically each morning at 07:15 Lagos time, or click "Take snapshot now".
            </p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridLine} vertical={false} />
                <XAxis dataKey="label" tick={axisTick} axisLine={{ stroke: chartTheme.gridLine }} tickLine={false} />
                <YAxis tick={axisTick} axisLine={false} tickLine={false} tickFormatter={(v: number) => `₦${(v / 1_000_000).toFixed(1)}M`} />
                <ReTooltip
                  content={
                    <GlassTooltip
                      formatter={(value: number) => formatNaira(value)}
                      labelFormatter={(l: string) => `On ${l}`}
                    />
                  }
                  cursor={{ stroke: chartTheme.primary, strokeOpacity: 0.3 }}
                />
                <Line type="monotone" dataKey="balance" stroke={chartTheme.primary} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* ─── Top upcoming obligations ───────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Top upcoming obligations (next 12 weeks)</CardTitle>
        </CardHeader>
        <CardContent>
          {topObs.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No specific upcoming obligations detected. Forecast is based purely on the external burn estimate.
            </p>
          ) : (
            <>
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Week</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {topObs.map((o, i) => (
                      <TableRow key={i}>
                        <TableCell>{o.week_start}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{CATEGORY_LABEL[o.category] ?? o.category}</Badge>
                        </TableCell>
                        <TableCell className="text-right font-medium currency">{formatNaira(o.amount_ngn)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="md:hidden space-y-2">
                {topObs.map((o, i) => (
                  <MobileCard key={i}>
                    <MobileCardHeader>
                      <MobileCardTitle>{o.week_start}</MobileCardTitle>
                      <MobileCardMeta className="currency">{formatNaira(o.amount_ngn)}</MobileCardMeta>
                    </MobileCardHeader>
                    <MobileCardRow label="Category">
                      <Badge variant="outline">{CATEGORY_LABEL[o.category] ?? o.category}</Badge>
                    </MobileCardRow>
                  </MobileCard>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
