import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip,
  ResponsiveContainer, ReferenceLine, Cell,
} from 'recharts';
import { Calculator, TrendingUp, TrendingDown, AlertTriangle, Info } from 'lucide-react';
import { formatNaira } from '@/lib/format';
import { ChartGradients, GlassTooltip, axisTick, chartTheme } from '@/components/ChartKit';

interface MonthData {
  month: string;
  monthKey: string;
  fuel: number;
  maintenance: number;
  total: number;
  isForecast?: boolean;
}

function monthLabel(d: Date): string {
  return d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function linearForecast(values: number[], periods: number): number[] {
  const n = values.length;
  if (n < 2) return Array(periods).fill(values[0] || 0);

  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += values[i];
    sumXY += i * values[i];
    sumX2 += i * i;
  }
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  return Array.from({ length: periods }, (_, i) =>
    Math.max(0, Math.round(intercept + slope * (n + i)))
  );
}

export function FleetBudgetForecaster() {
  const [data, setData] = useState<MonthData[]>([]);
  const [loading, setLoading] = useState(true);
  const [avgMonthly, setAvgMonthly] = useState(0);

  useEffect(() => {
    (async () => {
      const now = new Date();
      const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, 1);
      const since = sixMonthsAgo.toISOString();

      const [fuelRes, maintRes] = await Promise.all([
        supabase
          .from('fuel_requests')
          .select('receipt_amount_ngn, amount_ngn, created_at')
          .in('status', ['approved', 'payment_sent', 'receipt_uploaded', 'completed'])
          .gte('created_at', since),
        supabase
          .from('vehicle_maintenance')
          .select('cost_ngn, service_date')
          .gte('service_date', since.slice(0, 10)),
      ]);

      type FuelRow = { receipt_amount_ngn: number | null; amount_ngn: number; created_at: string };
      type MaintRow = { cost_ngn: number | null; service_date: string };

      const fuelRows = (fuelRes.data || []) as FuelRow[];
      const maintRows = (maintRes.data || []) as MaintRow[];

      const monthFuel = new Map<string, number>();
      const monthMaint = new Map<string, number>();
      const monthLabels = new Map<string, string>();

      for (const r of fuelRows) {
        const d = new Date(r.created_at);
        const mk = monthKey(d);
        const amount = r.receipt_amount_ngn || r.amount_ngn || 0;
        monthFuel.set(mk, (monthFuel.get(mk) || 0) + amount);
        if (!monthLabels.has(mk)) monthLabels.set(mk, monthLabel(d));
      }

      for (const r of maintRows) {
        if (!r.cost_ngn || !r.service_date) continue;
        const d = new Date(r.service_date);
        const mk = monthKey(d);
        monthMaint.set(mk, (monthMaint.get(mk) || 0) + r.cost_ngn);
        if (!monthLabels.has(mk)) monthLabels.set(mk, monthLabel(d));
      }

      const allMonths = [...new Set([...monthFuel.keys(), ...monthMaint.keys()])].sort();
      const historical: MonthData[] = allMonths.map((mk) => ({
        month: monthLabels.get(mk) || mk,
        monthKey: mk,
        fuel: monthFuel.get(mk) || 0,
        maintenance: monthMaint.get(mk) || 0,
        total: (monthFuel.get(mk) || 0) + (monthMaint.get(mk) || 0),
      }));

      const fuelValues = historical.map((h) => h.fuel);
      const maintValues = historical.map((h) => h.maintenance);
      const forecastFuel = linearForecast(fuelValues, 2);
      const forecastMaint = linearForecast(maintValues, 2);

      const forecasted: MonthData[] = [];
      for (let i = 0; i < 2; i++) {
        const fd = new Date(now.getFullYear(), now.getMonth() + 1 + i, 1);
        forecasted.push({
          month: monthLabel(fd),
          monthKey: monthKey(fd),
          fuel: forecastFuel[i],
          maintenance: forecastMaint[i],
          total: forecastFuel[i] + forecastMaint[i],
          isForecast: true,
        });
      }

      const combined = [...historical, ...forecasted];
      setData(combined);
      const totalHistorical = historical.reduce((s, h) => s + h.total, 0);
      setAvgMonthly(historical.length > 0 ? Math.round(totalHistorical / historical.length) : 0);
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Calculator className="h-4 w-4 text-muted-foreground" /> Budget Forecast
          </CardTitle>
        </CardHeader>
        <CardContent><div className="h-48 bg-muted animate-pulse rounded" /></CardContent>
      </Card>
    );
  }

  const forecast = data.filter((d) => d.isForecast);
  const historical = data.filter((d) => !d.isForecast);
  const nextMonth = forecast[0];
  const lastMonth = historical[historical.length - 1];
  const changeFromLast = lastMonth && nextMonth
    ? Math.round(((nextMonth.total - lastMonth.total) / (lastMonth.total || 1)) * 100)
    : 0;

  return (
    <Card>
      <CardHeader className="pb-2 pt-4">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Calculator className="h-4 w-4 text-muted-foreground" />
          Fleet Budget Forecast
          <Badge variant="secondary" className="text-[10px] font-normal">
            6-month history + 2-month projection
          </Badge>
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
            </TooltipTrigger>
            <TooltipContent side="right" className="text-xs max-w-[220px]">
              Forecast uses linear trend from fuel and maintenance spend history. Dashed bars are projections.
            </TooltipContent>
          </Tooltip>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Summary KPIs */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="rounded-lg bg-muted/50 px-3 py-2">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Avg Monthly</div>
            <div className="text-sm font-semibold tabular-nums">{formatNaira(avgMonthly)}</div>
          </div>
          {nextMonth && (
            <div className="rounded-lg bg-muted/50 px-3 py-2">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Next Month</div>
              <div className="text-sm font-semibold tabular-nums flex items-center gap-1">
                {formatNaira(nextMonth.total)}
                {changeFromLast !== 0 && (
                  <span className={`text-[10px] ${changeFromLast > 0 ? 'text-red-500' : 'text-green-500'}`}>
                    {changeFromLast > 0 ? '+' : ''}{changeFromLast}%
                  </span>
                )}
              </div>
            </div>
          )}
          {nextMonth && (
            <div className="rounded-lg bg-muted/50 px-3 py-2">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Fuel / Maint</div>
              <div className="text-xs tabular-nums mt-0.5">
                <span className="font-medium">{formatNaira(nextMonth.fuel)}</span>
                <span className="text-muted-foreground"> / </span>
                <span className="font-medium">{formatNaira(nextMonth.maintenance)}</span>
              </div>
            </div>
          )}
        </div>

        {data.length > 0 && (
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <ChartGradients />
                <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridLine} vertical={false} />
                <XAxis dataKey="month" tick={axisTick} axisLine={{ stroke: chartTheme.gridLine }} tickLine={false} />
                <YAxis
                  tick={axisTick}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) => v >= 1_000_000 ? `₦${(v / 1_000_000).toFixed(1)}M` : `₦${(v / 1_000).toFixed(0)}K`}
                  width={60}
                />
                <ReTooltip
                  content={
                    <GlassTooltip
                      formatter={(v: number, name: string) => [
                        formatNaira(v),
                        name === 'fuel' ? 'Fuel' : name === 'maintenance' ? 'Maintenance' : name,
                      ]}
                    />
                  }
                  cursor={{ fill: chartTheme.primary, fillOpacity: 0.06 }}
                />
                {avgMonthly > 0 && (
                  <ReferenceLine
                    y={avgMonthly}
                    stroke={chartTheme.warning}
                    strokeDasharray="6 4"
                    label={{
                      value: `Avg ${formatNaira(avgMonthly)}`,
                      position: 'insideTopRight',
                      fill: chartTheme.warning,
                      fontSize: 10,
                    }}
                  />
                )}
                <Bar dataKey="fuel" stackId="cost" name="fuel" radius={[0, 0, 0, 0]}>
                  {data.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={chartTheme.primary}
                      fillOpacity={entry.isForecast ? 0.4 : 0.85}
                      strokeDasharray={entry.isForecast ? '4 2' : undefined}
                      stroke={entry.isForecast ? chartTheme.primary : undefined}
                      strokeWidth={entry.isForecast ? 1.5 : 0}
                    />
                  ))}
                </Bar>
                <Bar dataKey="maintenance" stackId="cost" name="maintenance" radius={[3, 3, 0, 0]}>
                  {data.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={chartTheme.warning}
                      fillOpacity={entry.isForecast ? 0.4 : 0.85}
                      strokeDasharray={entry.isForecast ? '4 2' : undefined}
                      stroke={entry.isForecast ? chartTheme.warning : undefined}
                      strokeWidth={entry.isForecast ? 1.5 : 0}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
