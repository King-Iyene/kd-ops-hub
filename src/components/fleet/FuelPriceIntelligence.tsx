import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Area, AreaChart,
} from 'recharts';
import { TrendingUp, TrendingDown, AlertTriangle, Fuel, Zap, Target } from 'lucide-react';
import { formatNaira } from '@/lib/format';
import { ChartGradients, GlassTooltip, axisTick, chartAnim, chartTheme } from '@/components/ChartKit';

interface StationWeekly {
  station: string;
  week: string;
  weekKey: string;
  avgPrice: number;
  litres: number;
  txCount: number;
}

interface PriceAlert {
  station: string;
  currentPrice: number;
  previousPrice: number;
  changePct: number;
  direction: 'up' | 'down';
}

interface StationRecommendation {
  station: string;
  avgPrice: number;
  reliability: number;
  savingsPotential: number;
  txCount: number;
  trend: 'stable' | 'rising' | 'falling';
}

function isoWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function isoWeekLabel(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const mon = d.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' });
  return mon;
}

export function FuelPriceIntelligence() {
  const [weeklyData, setWeeklyData] = useState<StationWeekly[]>([]);
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [recommendations, setRecommendations] = useState<StationRecommendation[]>([]);
  const [fleetAvgTrend, setFleetAvgTrend] = useState<{ week: string; price: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const now = new Date();
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setDate(now.getDate() - 180);

      const { data: fuelRows } = await supabase
        .from('fuel_requests')
        .select('fuel_station_name, receipt_amount_ngn, litres_filled, created_at')
        .in('status', ['approved', 'payment_sent', 'receipt_uploaded', 'completed'])
        .gt('litres_filled', 0)
        .gt('receipt_amount_ngn', 0)
        .gte('created_at', sixMonthsAgo.toISOString());

      type Row = {
        fuel_station_name: string | null;
        receipt_amount_ngn: number;
        litres_filled: number;
        created_at: string;
      };
      const rows = (fuelRows || []) as Row[];

      const byStationWeek = new Map<string, { amount: number; litres: number; count: number }>();
      const weekLabels = new Map<string, string>();

      for (const r of rows) {
        const name = r.fuel_station_name?.trim();
        if (!name) continue;
        const d = new Date(r.created_at);
        const wk = isoWeekKey(d);
        const key = `${name}::${wk}`;
        const existing = byStationWeek.get(key) || { amount: 0, litres: 0, count: 0 };
        existing.amount += r.receipt_amount_ngn;
        existing.litres += r.litres_filled;
        existing.count++;
        byStationWeek.set(key, existing);
        if (!weekLabels.has(wk)) weekLabels.set(wk, isoWeekLabel(d));
      }

      const weekly: StationWeekly[] = [];
      for (const [key, val] of byStationWeek) {
        const [station, weekKey] = key.split('::');
        weekly.push({
          station,
          week: weekLabels.get(weekKey) || weekKey,
          weekKey,
          avgPrice: val.amount / val.litres,
          litres: val.litres,
          txCount: val.count,
        });
      }
      weekly.sort((a, b) => a.weekKey.localeCompare(b.weekKey));
      setWeeklyData(weekly);

      // Fleet average price trend
      const fleetByWeek = new Map<string, { amount: number; litres: number }>();
      for (const r of rows) {
        const d = new Date(r.created_at);
        const wk = isoWeekKey(d);
        const existing = fleetByWeek.get(wk) || { amount: 0, litres: 0 };
        existing.amount += r.receipt_amount_ngn;
        existing.litres += r.litres_filled;
        fleetByWeek.set(wk, existing);
      }
      const fleetTrend = [...fleetByWeek.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([wk, v]) => ({
          week: weekLabels.get(wk) || wk,
          price: Math.round((v.amount / v.litres) * 100) / 100,
        }));
      setFleetAvgTrend(fleetTrend);

      // Price spike alerts — compare last 2 weeks per station
      const stationWeeks = new Map<string, { weekKey: string; price: number }[]>();
      for (const w of weekly) {
        const list = stationWeeks.get(w.station) || [];
        list.push({ weekKey: w.weekKey, price: w.avgPrice });
        stationWeeks.set(w.station, list);
      }

      const priceAlerts: PriceAlert[] = [];
      for (const [station, weeks] of stationWeeks) {
        if (weeks.length < 2) continue;
        const sorted = weeks.sort((a, b) => a.weekKey.localeCompare(b.weekKey));
        const prev = sorted[sorted.length - 2];
        const curr = sorted[sorted.length - 1];
        const changePct = ((curr.price - prev.price) / prev.price) * 100;
        if (Math.abs(changePct) >= 8) {
          priceAlerts.push({
            station,
            currentPrice: curr.price,
            previousPrice: prev.price,
            changePct: Math.round(changePct * 10) / 10,
            direction: changePct > 0 ? 'up' : 'down',
          });
        }
      }
      priceAlerts.sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct));
      setAlerts(priceAlerts);

      // Smart recommendations
      const stationStats = new Map<string, { totalAmount: number; totalLitres: number; count: number; prices: number[] }>();
      for (const r of rows) {
        const name = r.fuel_station_name?.trim();
        if (!name) continue;
        const existing = stationStats.get(name) || { totalAmount: 0, totalLitres: 0, count: 0, prices: [] };
        existing.totalAmount += r.receipt_amount_ngn;
        existing.totalLitres += r.litres_filled;
        existing.count++;
        existing.prices.push(r.receipt_amount_ngn / r.litres_filled);
        stationStats.set(name, existing);
      }

      const allStations = [...stationStats.entries()]
        .filter(([, v]) => v.count >= 3)
        .map(([name, v]) => {
          const avg = v.totalAmount / v.totalLitres;
          const variance = v.prices.reduce((s, p) => s + (p - avg) ** 2, 0) / v.prices.length;
          const cv = Math.sqrt(variance) / avg;
          const reliability = Math.max(0, Math.min(100, Math.round((1 - cv) * 100)));

          const weeks = stationWeeks.get(name) || [];
          const sorted = weeks.sort((a, b) => a.weekKey.localeCompare(b.weekKey));
          let trend: 'stable' | 'rising' | 'falling' = 'stable';
          if (sorted.length >= 3) {
            const half = Math.floor(sorted.length / 2);
            const earlyAvg = sorted.slice(0, half).reduce((s, w) => s + w.price, 0) / half;
            const lateAvg = sorted.slice(half).reduce((s, w) => s + w.price, 0) / (sorted.length - half);
            const change = (lateAvg - earlyAvg) / earlyAvg;
            if (change > 0.05) trend = 'rising';
            else if (change < -0.05) trend = 'falling';
          }

          return { station: name, avgPrice: avg, reliability, savingsPotential: 0, txCount: v.count, trend };
        })
        .sort((a, b) => a.avgPrice - b.avgPrice);

      if (allStations.length > 0) {
        const maxPrice = allStations[allStations.length - 1].avgPrice;
        const avgMonthlyLitres = rows.reduce((s, r) => s + r.litres_filled, 0) / 6;
        for (const s of allStations) {
          s.savingsPotential = Math.round((maxPrice - s.avgPrice) * avgMonthlyLitres);
        }
      }

      setRecommendations(allStations.slice(0, 5));
      setLoading(false);
    })();
  }, []);

  const topStations = useMemo(() => {
    const stations = new Set<string>();
    const sorted = [...weeklyData].sort((a, b) => b.txCount - a.txCount);
    for (const w of sorted) {
      stations.add(w.station);
      if (stations.size >= 4) break;
    }
    return stations;
  }, [weeklyData]);

  const chartData = useMemo(() => {
    const weekMap = new Map<string, Record<string, number>>();
    for (const w of weeklyData) {
      if (!topStations.has(w.station)) continue;
      const existing = weekMap.get(w.weekKey) || { week: w.week };
      existing[w.station] = Math.round(w.avgPrice * 100) / 100;
      weekMap.set(w.weekKey, existing);
    }
    return [...weekMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, v]) => v)
      .slice(-16);
  }, [weeklyData, topStations]);

  const STATION_COLORS = [chartTheme.primary, chartTheme.success, chartTheme.warning, chartTheme.violet];

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Zap className="h-4 w-4 text-muted-foreground" /> Fuel Price Intelligence
          </CardTitle>
        </CardHeader>
        <CardContent><div className="h-48 bg-muted animate-pulse rounded" /></CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Price Alerts */}
      {alerts.length > 0 && (
        <Card className="border-amber-200 dark:border-amber-800">
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Price Alerts
              <Badge variant="destructive" className="text-[10px]">{alerts.length} station{alerts.length > 1 ? 's' : ''}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {alerts.slice(0, 4).map((a) => (
              <div key={a.station} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  {a.direction === 'up' ? (
                    <TrendingUp className="h-3.5 w-3.5 text-red-500" />
                  ) : (
                    <TrendingDown className="h-3.5 w-3.5 text-green-500" />
                  )}
                  <span className="font-medium truncate max-w-[200px]">{a.station}</span>
                </div>
                <div className="flex items-center gap-2 tabular-nums">
                  <span className="text-muted-foreground">{formatNaira(Math.round(a.previousPrice))}</span>
                  <span className="text-muted-foreground">→</span>
                  <span className="font-medium">{formatNaira(Math.round(a.currentPrice))}/L</span>
                  <Badge
                    variant="secondary"
                    className={`text-[10px] ${
                      a.direction === 'up'
                        ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                        : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                    }`}
                  >
                    {a.direction === 'up' ? '+' : ''}{a.changePct}%
                  </Badge>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Fleet Average Price Trend */}
      {fleetAvgTrend.length > 2 && (
        <Card>
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Fuel className="h-4 w-4 text-muted-foreground" />
              Fleet Fuel Price Trend
              <Badge variant="secondary" className="text-[10px] font-normal">6 months</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={fleetAvgTrend} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                  <ChartGradients />
                  <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridLine} vertical={false} />
                  <XAxis dataKey="week" tick={axisTick} axisLine={{ stroke: chartTheme.gridLine }} tickLine={false} />
                  <YAxis
                    tick={axisTick}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v: number) => `₦${v}`}
                    width={56}
                    domain={['dataMin - 20', 'dataMax + 20']}
                  />
                  <Tooltip content={<GlassTooltip formatter={(v: number) => [`₦${v.toFixed(2)}/L`]} />} />
                  <Area
                    type="monotone"
                    dataKey="price"
                    name="Avg ₦/L"
                    stroke={chartTheme.primary}
                    strokeWidth={2}
                    fill="url(#kd-grad-primary)"
                    fillOpacity={1}
                    {...chartAnim}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Per-Station Price Tracking */}
      {chartData.length > 2 && topStations.size > 0 && (
        <Card>
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              Station Price History
              <Badge variant="secondary" className="text-[10px] font-normal">Top {topStations.size} stations</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                  <ChartGradients />
                  <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridLine} vertical={false} />
                  <XAxis dataKey="week" tick={axisTick} axisLine={{ stroke: chartTheme.gridLine }} tickLine={false} />
                  <YAxis
                    tick={axisTick}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v: number) => `₦${v}`}
                    width={56}
                    domain={['dataMin - 10', 'dataMax + 10']}
                  />
                  <Tooltip content={<GlassTooltip formatter={(v: number) => [`₦${v.toFixed(2)}/L`]} />} />
                  {[...topStations].map((name, i) => (
                    <Line
                      key={name}
                      type="monotone"
                      dataKey={name}
                      name={name}
                      stroke={STATION_COLORS[i % STATION_COLORS.length]}
                      strokeWidth={2}
                      dot={{ r: 2.5, strokeWidth: 0, fill: STATION_COLORS[i % STATION_COLORS.length] }}
                      activeDot={{ r: 4, strokeWidth: 2, stroke: '#fff' }}
                      connectNulls
                      {...chartAnim}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Smart Recommendations */}
      {recommendations.length > 0 && (
        <Card>
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Target className="h-4 w-4 text-muted-foreground" />
              Station Recommendations
              <Badge variant="secondary" className="text-[10px] font-normal">Based on price + consistency</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {recommendations.map((r, i) => (
              <div
                key={r.station}
                className={`flex items-center gap-3 rounded-md px-3 py-2 ${
                  i === 0
                    ? 'bg-green-50 dark:bg-green-950/20 ring-1 ring-green-200 dark:ring-green-800'
                    : 'bg-muted/50'
                }`}
              >
                <div className="flex-shrink-0 w-6 text-center">
                  {i === 0 ? (
                    <span className="text-base">⭐</span>
                  ) : (
                    <span className="text-xs text-muted-foreground font-medium">{i + 1}</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">{r.station}</span>
                    <Badge
                      variant="secondary"
                      className={`text-[10px] ${
                        r.trend === 'falling'
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                          : r.trend === 'rising'
                          ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                          : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                      }`}
                    >
                      {r.trend === 'falling' ? '↓ Falling' : r.trend === 'rising' ? '↑ Rising' : '— Stable'}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {r.txCount} transactions · {r.reliability}% price consistency
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-semibold tabular-nums">{formatNaira(Math.round(r.avgPrice))}/L</div>
                  {r.savingsPotential > 0 && (
                    <div className="text-[10px] text-green-600 dark:text-green-400 tabular-nums">
                      Save ~{formatNaira(r.savingsPotential)}/mo
                    </div>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
