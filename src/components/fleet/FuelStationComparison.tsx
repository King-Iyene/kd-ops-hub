import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { Fuel, TrendingUp } from 'lucide-react';
import { formatNaira } from '@/lib/format';
import { ChartGradients, GlassTooltip, axisTick, chartAnim, chartTheme } from '@/components/ChartKit';

interface StationRow {
  name: string;
  avgPricePerLitre: number;
  totalLitres: number;
  transactions: number;
  savingsVsMax: number;
}

interface WeekPoint {
  week: string;
  costPerKm: number;
}

function isoWeekLabel(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `W${weekNo}`;
}

function isoWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

export function FuelStationComparison() {
  const [stations, setStations] = useState<StationRow[]>([]);
  const [weeklyData, setWeeklyData] = useState<WeekPoint[]>([]);
  const [fleetAvg, setFleetAvg] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const now = new Date();
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(now.getDate() - 90);
      const twelveWeeksAgo = new Date();
      twelveWeeksAgo.setDate(now.getDate() - 84);

      const since90 = ninetyDaysAgo.toISOString();
      const since12w = twelveWeeksAgo.toISOString();

      const [fuelRes, tripRes] = await Promise.all([
        supabase
          .from('fuel_requests')
          .select('fuel_station_name, receipt_amount_ngn, litres_filled, created_at')
          .in('status', ['approved', 'payment_sent', 'receipt_uploaded', 'completed'])
          .gt('litres_filled', 0)
          .gt('receipt_amount_ngn', 0)
          .gte('created_at', since90),
        supabase
          .from('trip_logs')
          .select('km_driven, created_at')
          .gte('created_at', since12w)
          .gt('km_driven', 0),
      ]);

      type FuelRow = {
        fuel_station_name: string | null;
        receipt_amount_ngn: number;
        litres_filled: number;
        created_at: string;
      };
      type TripRow = { km_driven: number; created_at: string };

      const fuelRows = (fuelRes.data || []) as FuelRow[];
      const tripRows = (tripRes.data || []) as TripRow[];

      const stationMap = new Map<string, { totalAmount: number; totalLitres: number; count: number }>();
      for (const r of fuelRows) {
        const name = r.fuel_station_name?.trim();
        if (!name) continue;
        const existing = stationMap.get(name) || { totalAmount: 0, totalLitres: 0, count: 0 };
        existing.totalAmount += r.receipt_amount_ngn;
        existing.totalLitres += r.litres_filled;
        existing.count++;
        stationMap.set(name, existing);
      }

      const filtered = [...stationMap.entries()]
        .filter(([, v]) => v.count >= 2)
        .map(([name, v]) => ({
          name,
          avgPricePerLitre: v.totalAmount / v.totalLitres,
          totalLitres: Math.round(v.totalLitres),
          transactions: v.count,
          savingsVsMax: 0,
        }))
        .sort((a, b) => a.avgPricePerLitre - b.avgPricePerLitre);

      if (filtered.length > 0) {
        const maxPrice = filtered[filtered.length - 1].avgPricePerLitre;
        for (const s of filtered) {
          s.savingsVsMax = (maxPrice - s.avgPricePerLitre) * s.totalLitres;
        }
      }

      setStations(filtered);

      const weekFuel = new Map<string, number>();
      const weekKm = new Map<string, number>();
      const weekLabels = new Map<string, string>();

      for (const r of fuelRows) {
        const d = new Date(r.created_at);
        if (d < twelveWeeksAgo) continue;
        const key = isoWeekKey(d);
        weekFuel.set(key, (weekFuel.get(key) || 0) + r.receipt_amount_ngn);
        if (!weekLabels.has(key)) weekLabels.set(key, isoWeekLabel(d));
      }

      for (const t of tripRows) {
        const d = new Date(t.created_at);
        const key = isoWeekKey(d);
        weekKm.set(key, (weekKm.get(key) || 0) + t.km_driven);
        if (!weekLabels.has(key)) weekLabels.set(key, isoWeekLabel(d));
      }

      const allWeeks = [...new Set([...weekFuel.keys(), ...weekKm.keys()])].sort();
      const points: WeekPoint[] = [];
      let totalSpend = 0;
      let totalKm = 0;

      for (const key of allWeeks) {
        const spend = weekFuel.get(key) || 0;
        const km = weekKm.get(key) || 0;
        totalSpend += spend;
        totalKm += km;
        if (km > 0) {
          points.push({
            week: weekLabels.get(key) || key,
            costPerKm: Math.round((spend / km) * 100) / 100,
          });
        }
      }

      setWeeklyData(points);
      setFleetAvg(totalKm > 0 ? Math.round((totalSpend / totalKm) * 100) / 100 : 0);
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Fuel className="h-4 w-4 text-muted-foreground" /> Station Price Comparison
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="h-8 bg-muted animate-pulse rounded" />
              <div className="h-6 bg-muted animate-pulse rounded" />
              <div className="h-6 bg-muted animate-pulse rounded" />
              <div className="h-6 bg-muted animate-pulse rounded" />
              <div className="h-6 bg-muted animate-pulse rounded w-3/4" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-muted-foreground" /> Cost per KM Trend
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64 bg-muted animate-pulse rounded" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2 pt-4">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Fuel className="h-4 w-4 text-muted-foreground" />
            Station Price Comparison
            <Badge variant="secondary" className="text-[10px] font-normal">Last 90 days</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {stations.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No station data with 2+ transactions in the last 90 days.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Station Name</TableHead>
                    <TableHead className="text-right">Avg ₦/L</TableHead>
                    <TableHead className="text-right">Total Litres</TableHead>
                    <TableHead className="text-right">Transactions</TableHead>
                    <TableHead className="text-right">Savings vs Most Expensive</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stations.map((s, i) => {
                    const isCheapest = i === 0;
                    const isMostExpensive = i === stations.length - 1 && stations.length > 1;
                    let rowClass = '';
                    if (isCheapest) rowClass = 'bg-green-50 dark:bg-green-950/30';
                    if (isMostExpensive) rowClass = 'bg-red-50 dark:bg-red-950/30';
                    return (
                      <TableRow key={s.name} className={rowClass}>
                        <TableCell className="font-medium">
                          <span className="flex items-center gap-2">
                            {s.name}
                            {isCheapest && (
                              <Badge className="text-[10px] bg-green-600 hover:bg-green-700 text-white">
                                Cheapest
                              </Badge>
                            )}
                            {isMostExpensive && (
                              <Badge className="text-[10px] bg-red-600 hover:bg-red-700 text-white">
                                Most Expensive
                              </Badge>
                            )}
                          </span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatNaira(Math.round(s.avgPricePerLitre * 100) / 100)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {s.totalLitres.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {s.transactions}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {s.savingsVsMax > 0 ? formatNaira(Math.round(s.savingsVsMax)) : '—'}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2 pt-4">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
            Cost per KM Trend
            <Badge variant="secondary" className="text-[10px] font-normal">Last 12 weeks</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {weeklyData.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No cost/km data available for the last 12 weeks.
            </p>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={weeklyData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                  <ChartGradients />
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke={chartTheme.gridLine}
                    vertical={false}
                  />
                  <XAxis
                    dataKey="week"
                    tick={axisTick}
                    axisLine={{ stroke: chartTheme.gridLine }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={axisTick}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v: number) => `₦${v}`}
                    width={56}
                  />
                  <Tooltip
                    content={
                      <GlassTooltip
                        formatter={(value: number) => [`₦${value.toFixed(2)}/km`]}
                      />
                    }
                  />
                  {fleetAvg > 0 && (
                    <ReferenceLine
                      y={fleetAvg}
                      stroke={chartTheme.warning}
                      strokeDasharray="6 4"
                      label={{
                        value: `Avg ₦${fleetAvg.toFixed(2)}/km`,
                        position: 'insideTopRight',
                        fill: chartTheme.warning,
                        fontSize: 11,
                      }}
                    />
                  )}
                  <Line
                    type="monotone"
                    dataKey="costPerKm"
                    name="Cost/km"
                    stroke={chartTheme.primary}
                    strokeWidth={2}
                    dot={{ r: 3, fill: chartTheme.primary, strokeWidth: 0 }}
                    activeDot={{ r: 5, fill: chartTheme.primary, strokeWidth: 2, stroke: '#fff' }}
                    fill="url(#kd-grad-primary)"
                    fillOpacity={1}
                    {...chartAnim}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
