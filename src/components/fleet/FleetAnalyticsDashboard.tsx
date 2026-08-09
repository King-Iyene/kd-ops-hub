import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TableSkeleton } from '@/components/ui-kit/TableSkeleton';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip, ResponsiveContainer } from 'recharts';
import { ChartGradients, GlassTooltip, axisTick, chartAnim, chartTheme } from '@/components/ChartKit';
import { formatNaira } from '@/lib/format';
import { Fuel, TrendingUp, Gauge, Zap, AlertTriangle, BarChart2 } from 'lucide-react';
import type { VehicleSummary, FieldStaff } from '@/lib/fleet-utils';

interface VehicleStat {
  vehicle_id: string;
  name: string;
  plate_number: string;
  assigned_employee: string | null;
  month_spend: number;
  month_km: number | null;
  cost_per_km: number | null;
  budget_used_pct: number | null;
}

type AnalyticsRange = '8w' | '6m' | '12m';

export function KpiCard({
  label, icon, value, subtext, warn,
}: {
  label: string;
  icon: React.ReactNode;
  value: string | null;
  subtext?: string;
  warn?: boolean;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = cardRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${e.clientX - r.left}px`);
    el.style.setProperty('--my', `${e.clientY - r.top}px`);
  };
  return (
    <Card
      ref={cardRef}
      onMouseMove={handleMouseMove}
      className={`kd-holographic relative overflow-hidden ${warn ? 'border-red-300 dark:border-red-800' : ''}`}
    >
      <CardContent className="pt-4 pb-4">
        <div className="flex items-center gap-1.5 text-muted-foreground text-xs mb-1">
          {icon}
          <span>{label}</span>
        </div>
        {value === null ? (
          <div className="h-7 w-28 bg-muted animate-pulse rounded mt-1" />
        ) : (
          <div className={`kd-stat-number text-xl font-bold tracking-tight ${warn ? 'text-red-600' : ''}`}>{value}</div>
        )}
        {subtext && value !== null && (
          <div className="text-[11px] text-muted-foreground mt-0.5">{subtext}</div>
        )}
      </CardContent>
    </Card>
  );
}

function FleetAnalyticsDashboard({
  vehicles,
  staff,
  onNavigateToVehicles,
}: {
  vehicles: VehicleSummary[];
  staff: FieldStaff[];
  onNavigateToVehicles: () => void;
}) {
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [range, setRange] = useState<AnalyticsRange>('8w');
  const [monthSpend, setMonthSpend] = useState(0);
  const [weekSpend, setWeekSpend] = useState(0);
  const [monthKm, setMonthKm] = useState<number | null>(null);
  const [chartBars, setChartBars] = useState<{ label: string; spend: number }[]>([]);
  const [chartMode, setChartMode] = useState<'weekly' | 'monthly'>('weekly');
  const [vehicleStats, setVehicleStats] = useState<VehicleStat[]>([]);

  useEffect(() => {
    if (!vehicles.length) return;
    setAnalyticsLoading(true);

    (async () => {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

      // Monday of current week
      const monday = new Date(now);
      monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
      monday.setHours(0, 0, 0, 0);

      // Compute fetch window based on selected range
      const fetchSince = new Date(now);
      if (range === '8w')  fetchSince.setDate(now.getDate() - 7 * 8);
      if (range === '6m')  fetchSince.setMonth(now.getMonth() - 6);
      if (range === '12m') fetchSince.setMonth(now.getMonth() - 12);
      fetchSince.setHours(0, 0, 0, 0);

      const [reqRes, tripRes] = await Promise.all([
        supabase
          .from('fuel_requests')
          .select('amount_ngn, created_at, vehicle_id, driver_id')
          .in('status', ['approved', 'payment_sent', 'receipt_uploaded', 'completed'])
          .is('deleted_at', null)
          .gte('created_at', fetchSince.toISOString()),
        supabase
          .from('trip_logs')
          .select('vehicle_id, driver_id, km_driven, litres, is_anomaly, created_at')
          .gte('created_at', fetchSince.toISOString())
          .not('km_driven', 'is', null),
      ]);

      type ReqRow = { amount_ngn: number; created_at: string; vehicle_id: string | null; driver_id: string | null };
      type TripRow = { vehicle_id: string | null; driver_id: string | null; km_driven: number; litres: number | null; is_anomaly: boolean; created_at: string };

      const reqs = (reqRes.data || []) as ReqRow[];
      const trips = (tripRes.data || []) as TripRow[];

      const monthStartMs = monthStart.getTime();
      const mondayMs = monday.getTime();

      const monthReqs = reqs.filter((r) => new Date(r.created_at).getTime() >= monthStartMs);
      const weekReqs = reqs.filter((r) => new Date(r.created_at).getTime() >= mondayMs);
      const monthTrips = trips.filter((t) => new Date(t.created_at).getTime() >= monthStartMs);

      const mSpend = monthReqs.reduce((s, r) => s + (r.amount_ngn || 0), 0);
      const wSpend = weekReqs.reduce((s, r) => s + (r.amount_ngn || 0), 0);
      const totalKm = monthTrips.reduce((s, t) => s + (t.km_driven || 0), 0);

      // Build bars based on selected range
      const bars: { label: string; spend: number }[] = [];
      if (range === '8w') {
        for (let w = 7; w >= 0; w--) {
          const wStart = new Date(monday); wStart.setDate(monday.getDate() - w * 7);
          const wEnd   = new Date(wStart); wEnd.setDate(wStart.getDate() + 7);
          const sMs = wStart.getTime(), eMs = wEnd.getTime();
          bars.push({
            label: wStart.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' }),
            spend: reqs.filter((r) => { const d = new Date(r.created_at).getTime(); return d >= sMs && d < eMs; })
                       .reduce((s, r) => s + (r.amount_ngn || 0), 0),
          });
        }
        setChartMode('weekly');
      } else {
        const nMonths = range === '6m' ? 6 : 12;
        for (let m = nMonths - 1; m >= 0; m--) {
          const mStart = new Date(now.getFullYear(), now.getMonth() - m, 1);
          const mEnd   = new Date(now.getFullYear(), now.getMonth() - m + 1, 1);
          const sMs = mStart.getTime(), eMs = mEnd.getTime();
          bars.push({
            label: mStart.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }),
            spend: reqs.filter((r) => { const d = new Date(r.created_at).getTime(); return d >= sMs && d < eMs; })
                       .reduce((s, r) => s + (r.amount_ngn || 0), 0),
          });
        }
        setChartMode('monthly');
      }

      // Per-vehicle weekly spend for budget-used column
      const vWeekMap = new Map<string, number>();
      for (const r of weekReqs) {
        if (r.vehicle_id) vWeekMap.set(r.vehicle_id, (vWeekMap.get(r.vehicle_id) || 0) + r.amount_ngn);
      }

      // Vehicle comparison rows (always this-month basis, regardless of chart range)
      const vStats: VehicleStat[] = vehicles.map((v) => {
        const employee = staff.find((s) => s.id === v.assigned_driver_id);
        const mSpendV = monthReqs.filter((r) => r.vehicle_id === v.id).reduce((s, r) => s + r.amount_ngn, 0);
        const mKmV = monthTrips.filter((t) => t.vehicle_id === v.id).reduce((s, t) => s + (t.km_driven || 0), 0);
        const vWk = vWeekMap.get(v.id) || 0;
        return {
          vehicle_id: v.id,
          name: v.name,
          plate_number: v.plate_number,
          assigned_employee: employee?.full_name || null,
          month_spend: mSpendV,
          month_km: mKmV > 0 ? mKmV : null,
          cost_per_km: mSpendV > 0 && mKmV > 0 ? mSpendV / mKmV : null,
          budget_used_pct: v.weekly_budget_ngn > 0 ? (vWk / v.weekly_budget_ngn) * 100 : null,
        };
      }).sort((a, b) => b.month_spend - a.month_spend);

      setMonthSpend(mSpend);
      setWeekSpend(wSpend);
      setMonthKm(totalKm > 0 ? totalKm : null);
      setChartBars(bars);
      setVehicleStats(vStats);
      setAnalyticsLoading(false);
    })();
  }, [vehicles.length, staff.length, range]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalWeeklyBudget = vehicles.reduce((s, v) => s + v.weekly_budget_ngn, 0);
  const fleetUtilPct = totalWeeklyBudget > 0 ? Math.round((weekSpend / totalWeeklyBudget) * 100) : null;
  const avgCostPerKm = monthKm && monthSpend > 0 ? monthSpend / monthKm : null;

  return (
    <div className="space-y-4">
      {/* ── KPI cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          label="Fuel spend — this month"
          icon={<Fuel className="h-3.5 w-3.5" />}
          value={analyticsLoading ? null : formatNaira(monthSpend)}
        />
        <KpiCard
          label="Fuel spend — this week"
          icon={<TrendingUp className="h-3.5 w-3.5" />}
          value={analyticsLoading ? null : formatNaira(weekSpend)}
        />
        <KpiCard
          label="Avg cost / km (month)"
          icon={<Gauge className="h-3.5 w-3.5" />}
          value={analyticsLoading ? null : avgCostPerKm != null ? `${formatNaira(avgCostPerKm)}/km` : '—'}
          subtext={monthKm != null ? `${monthKm.toLocaleString()} km driven` : undefined}
        />
        <KpiCard
          label="Fleet budget used (week)"
          icon={<Zap className="h-3.5 w-3.5" />}
          value={analyticsLoading ? null : fleetUtilPct != null ? `${fleetUtilPct}%` : '—'}
          subtext={
            fleetUtilPct != null
              ? `${formatNaira(weekSpend)} of ${formatNaira(totalWeeklyBudget)}`
              : undefined
          }
          warn={fleetUtilPct != null && fleetUtilPct > 90}
        />
      </div>

      {/* ── Fuel spend bar chart ── */}
      <Card>
        <CardHeader className="pb-2 pt-4 flex-row items-center justify-between space-y-0">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <BarChart2 className="h-4 w-4 text-muted-foreground" />
            Fuel spend — {range === '8w' ? 'last 8 weeks' : range === '6m' ? 'last 6 months' : 'last 12 months'}
          </CardTitle>
          <div className="flex gap-1">
            {(['8w', '6m', '12m'] as AnalyticsRange[]).map((r) => (
              <Button
                key={r}
                size="sm"
                variant={range === r ? 'default' : 'outline'}
                className="h-7 px-2 text-xs"
                onClick={() => setRange(r)}
              >
                {r === '8w' ? '8W' : r === '6m' ? '6M' : '12M'}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {analyticsLoading ? (
            <div className="h-52 w-full bg-muted animate-pulse rounded" />
          ) : (
            <ResponsiveContainer width="100%" height={208}>
              <BarChart data={chartBars} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <ChartGradients />
                <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridLine} vertical={false} />
                <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} />
                <YAxis
                  tickFormatter={(v) => `₦${v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : `${(v / 1000).toFixed(0)}k`}`}
                  tick={axisTick}
                  axisLine={false}
                  tickLine={false}
                  width={56}
                />
                <ReTooltip
                  content={<GlassTooltip />}
                  formatter={(v: number) => [formatNaira(v), 'Spend']}
                  labelFormatter={(l) => `${chartMode === 'weekly' ? 'Week of' : 'Month of'} ${l}`}
                  cursor={{ fill: chartTheme.primary, fillOpacity: 0.06 }}
                />
                <Bar dataKey="spend" fill="url(#kd-grad-primary)" radius={[6, 6, 0, 0]} maxBarSize={48} {...chartAnim} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* ── Vehicle comparison table ── */}
      <Card>
        <CardHeader className="pb-2 pt-4">
          <CardTitle className="text-sm font-medium">Vehicle comparison — this month</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {analyticsLoading ? (
            <TableSkeleton />
          ) : (
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vehicle</TableHead>
                  <TableHead>Assigned Employee</TableHead>
                  <TableHead className="text-right">Month Spend</TableHead>
                  <TableHead className="text-right">Month Distance</TableHead>
                  <TableHead className="text-right">Cost / km</TableHead>
                  <TableHead className="text-right">Budget Used (week)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vehicleStats.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground text-sm py-8">
                      No vehicle activity recorded for this period.
                    </TableCell>
                  </TableRow>
                )}
                {vehicleStats.map((s) => {
                  const highCost = s.cost_per_km != null && s.cost_per_km > 50;
                  return (
                    <TableRow
                      key={s.vehicle_id}
                      className={`cursor-pointer kd-transition ${highCost ? 'bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/20 dark:hover:bg-amber-950/40' : ''}`}
                      onClick={onNavigateToVehicles}
                    >
                      <TableCell>
                        <div className="font-medium">{s.name}</div>
                        <div className="text-xs text-muted-foreground font-mono">{s.plate_number}</div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {s.assigned_employee ?? <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-right currency">
                        {s.month_spend > 0 ? formatNaira(s.month_spend) : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-right">
                        {s.month_km != null
                          ? `${s.month_km.toLocaleString()} km`
                          : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-right">
                        {s.cost_per_km != null ? (
                          <span className={highCost ? 'text-amber-600 font-semibold' : ''}>
                            {formatNaira(s.cost_per_km)}/km
                            {highCost && <AlertTriangle className="inline h-3 w-3 ml-1 -mt-0.5" />}
                          </span>
                        ) : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-right">
                        {s.budget_used_pct != null ? (
                          <span className={
                            s.budget_used_pct > 90 ? 'text-red-600 font-semibold' :
                            s.budget_used_pct > 70 ? 'text-amber-600' :
                            'text-green-600'
                          }>
                            {Math.round(s.budget_used_pct)}%
                          </span>
                        ) : <span className="text-muted-foreground">—</span>}
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

    </div>
  );
}

export const SERVICE_TYPES = [
  'Oil Change',
  'Tyre Rotation',
  'Brake Service',
  'Full Service',
  'Air Filter',
  'Transmission Service',
  'Custom',
];

export default FleetAnalyticsDashboard;
