import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Award, TrendingUp, TrendingDown, Minus, Flame, Star, Zap } from 'lucide-react';
import { formatNaira } from '@/lib/format';

interface DriverPerf {
  driver_id: string;
  name: string;
  composite_score: number;
  safety_score: number;
  efficiency_score: number;
  cost_score: number;
  trip_count: number;
  total_km: number;
  fuel_efficiency: number | null;
  total_fuel_spend: number;
  speeding_events: number;
  hard_braking_events: number;
  rank_change: number | null;
  streak_weeks: number;
  badges: string[];
}

function computeScores(
  trips: { driver_id: string; km_driven: number | null; litres: number | null }[],
  events: Map<string, { speeding: number; hard_braking: number }>,
  fuelSpend: Map<string, number>,
  profiles: { id: string; full_name: string }[],
): DriverPerf[] {
  const driverTrips = new Map<string, { count: number; km: number; litres: number }>();
  for (const t of trips) {
    if (!t.driver_id) continue;
    const existing = driverTrips.get(t.driver_id) || { count: 0, km: 0, litres: 0 };
    existing.count++;
    existing.km += t.km_driven || 0;
    existing.litres += t.litres || 0;
    driverTrips.set(t.driver_id, existing);
  }

  const efficiencies: number[] = [];
  const costPerKms: number[] = [];

  const raw = profiles
    .filter((p) => driverTrips.has(p.id) || fuelSpend.has(p.id))
    .map((p) => {
      const t = driverTrips.get(p.id) || { count: 0, km: 0, litres: 0 };
      const ev = events.get(p.id) || { speeding: 0, hard_braking: 0 };
      const spend = fuelSpend.get(p.id) || 0;
      const eff = t.km > 0 && t.litres > 0 ? t.km / t.litres : null;
      const costPerKm = t.km > 0 && spend > 0 ? spend / t.km : null;

      if (eff) efficiencies.push(eff);
      if (costPerKm) costPerKms.push(costPerKm);

      let safety = 100;
      const per100km = t.km > 0 ? 100 / t.km : 0;
      safety -= ev.speeding * 5 * per100km;
      safety -= ev.hard_braking * 3 * per100km;
      safety = Math.max(0, Math.min(100, Math.round(safety)));

      return {
        driver_id: p.id,
        name: p.full_name || 'Unknown',
        safety_score: safety,
        efficiency_score: 0,
        cost_score: 0,
        composite_score: 0,
        trip_count: t.count,
        total_km: Math.round(t.km),
        fuel_efficiency: eff ? Math.round(eff * 10) / 10 : null,
        total_fuel_spend: spend,
        speeding_events: ev.speeding,
        hard_braking_events: ev.hard_braking,
        rank_change: null as number | null,
        streak_weeks: 0,
        badges: [] as string[],
        _eff: eff,
        _costPerKm: costPerKm,
      };
    });

  if (efficiencies.length > 0) {
    efficiencies.sort((a, b) => a - b);
    const maxEff = efficiencies[efficiencies.length - 1];
    const minEff = efficiencies[0];
    const effRange = maxEff - minEff || 1;

    costPerKms.sort((a, b) => a - b);
    const maxCost = costPerKms.length > 0 ? costPerKms[costPerKms.length - 1] : 1;
    const minCost = costPerKms.length > 0 ? costPerKms[0] : 0;
    const costRange = maxCost - minCost || 1;

    for (const d of raw) {
      d.efficiency_score = d._eff
        ? Math.round(((d._eff - minEff) / effRange) * 100)
        : 50;
      d.cost_score = d._costPerKm
        ? Math.round((1 - (d._costPerKm - minCost) / costRange) * 100)
        : 50;
      d.composite_score = Math.round(
        d.safety_score * 0.4 +
        d.efficiency_score * 0.35 +
        d.cost_score * 0.25
      );
    }
  }

  raw.sort((a, b) => b.composite_score - a.composite_score);

  for (const d of raw) {
    if (d.composite_score >= 90) d.badges.push('top-performer');
    if (d.safety_score === 100 && d.trip_count >= 5) d.badges.push('zero-incidents');
    if (d._eff && d._eff >= 10) d.badges.push('fuel-efficient');
    if (d.trip_count >= 20) d.badges.push('road-warrior');
  }

  return raw.map(({ _eff, _costPerKm, ...d }) => d);
}

const BADGE_CONFIG: Record<string, { label: string; icon: string; color: string }> = {
  'top-performer': { label: 'Top Performer', icon: '🏆', color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400' },
  'zero-incidents': { label: 'Zero Incidents', icon: '🛡️', color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
  'fuel-efficient': { label: 'Fuel Efficient', icon: '⛽', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' },
  'road-warrior': { label: 'Road Warrior', icon: '🛣️', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400' },
};

export function DriverLeaderboard() {
  const [drivers, setDrivers] = useState<DriverPerf[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const since = thirtyDaysAgo.toISOString();

      const [tripsRes, eventsRes, fuelRes, profilesRes] = await Promise.all([
        supabase
          .from('trip_logs')
          .select('driver_id, km_driven, litres')
          .gte('created_at', since)
          .not('driver_id', 'is', null),
        supabase
          .from('trip_events')
          .select('trip_id, event_type')
          .gte('recorded_at', since),
        supabase
          .from('fuel_requests')
          .select('driver_id, amount_ngn')
          .in('status', ['approved', 'payment_sent', 'receipt_uploaded', 'completed'])
          .gte('created_at', since)
          .not('driver_id', 'is', null),
        supabase
          .from('profiles_directory')
          .select('id, full_name')
          .in('role', ['field_staff', 'driver', 'operations'])
          .eq('status', 'active'),
      ]);

      type Trip = { driver_id: string; km_driven: number | null; litres: number | null };
      type Event = { trip_id: string; event_type: string };
      type FuelRow = { driver_id: string; amount_ngn: number };
      type Profile = { id: string; full_name: string };

      const trips = (tripsRes.data || []) as Trip[];
      const eventRows = (eventsRes.data || []) as Event[];
      const fuelRows = (fuelRes.data || []) as FuelRow[];
      const profiles = (profilesRes.data || []) as Profile[];

      const eventTripIds = [...new Set(eventRows.map((e) => e.trip_id))];
      const tripIdToDriver = new Map<string, string>();
      if (eventTripIds.length > 0) {
        const { data: tripDrivers } = await supabase
          .from('trip_logs')
          .select('id, driver_id')
          .in('id', eventTripIds.slice(0, 500));
        for (const td of (tripDrivers || []) as { id: string; driver_id: string }[]) {
          tripIdToDriver.set(td.id, td.driver_id);
        }
      }

      const driverEvents = new Map<string, { speeding: number; hard_braking: number }>();
      for (const e of eventRows) {
        const driverId = tripIdToDriver.get(e.trip_id);
        if (!driverId) continue;
        const existing = driverEvents.get(driverId) || { speeding: 0, hard_braking: 0 };
        if (e.event_type === 'speeding') existing.speeding++;
        if (e.event_type === 'hard_braking') existing.hard_braking++;
        driverEvents.set(driverId, existing);
      }

      const driverFuel = new Map<string, number>();
      for (const f of fuelRows) {
        driverFuel.set(f.driver_id, (driverFuel.get(f.driver_id) || 0) + f.amount_ngn);
      }

      const scores = computeScores(trips, driverEvents, driverFuel, profiles);
      setDrivers(scores);
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Award className="h-4 w-4 text-muted-foreground" /> Driver Leaderboard
          </CardTitle>
        </CardHeader>
        <CardContent><div className="h-48 bg-muted animate-pulse rounded" /></CardContent>
      </Card>
    );
  }

  if (drivers.length === 0) return null;

  const topDrivers = drivers.slice(0, 10);
  const maxScore = topDrivers[0]?.composite_score || 100;

  return (
    <Card>
      <CardHeader className="pb-2 pt-4">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Award className="h-4 w-4 text-muted-foreground" />
          Driver Leaderboard
          <Badge variant="secondary" className="text-[10px] font-normal">Last 30 days</Badge>
          <span className="ml-auto text-[10px] text-muted-foreground font-normal">
            40% Safety · 35% Efficiency · 25% Cost
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {topDrivers.map((d, i) => (
          <div
            key={d.driver_id}
            className={`flex items-center gap-3 rounded-md px-3 py-2 transition-colors ${
              i === 0 ? 'bg-amber-50 dark:bg-amber-950/20 ring-1 ring-amber-200 dark:ring-amber-800' :
              i === 1 ? 'bg-slate-50 dark:bg-slate-900/30' :
              i === 2 ? 'bg-orange-50/50 dark:bg-orange-950/10' :
              'hover:bg-muted/50'
            }`}
          >
            <div className="w-6 text-center shrink-0">
              {i === 0 ? (
                <span className="text-lg">🥇</span>
              ) : i === 1 ? (
                <span className="text-lg">🥈</span>
              ) : i === 2 ? (
                <span className="text-lg">🥉</span>
              ) : (
                <span className="text-xs text-muted-foreground font-medium">{i + 1}</span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-medium truncate">{d.name}</span>
                <span className="text-xs font-bold tabular-nums text-foreground">
                  {d.composite_score}
                </span>
                {d.badges.length > 0 && (
                  <div className="flex gap-1">
                    {d.badges.slice(0, 2).map((b) => {
                      const cfg = BADGE_CONFIG[b];
                      if (!cfg) return null;
                      return (
                        <Tooltip key={b}>
                          <TooltipTrigger asChild>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${cfg.color}`}>
                              {cfg.icon}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="text-xs">{cfg.label}</TooltipContent>
                        </Tooltip>
                      );
                    })}
                  </div>
                )}
              </div>
              <div className="flex gap-1.5">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-green-500 transition-all"
                        style={{ width: `${d.safety_score}%` }}
                      />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">Safety: {d.safety_score}</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-blue-500 transition-all"
                        style={{ width: `${d.efficiency_score}%` }}
                      />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">Efficiency: {d.efficiency_score}</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-violet-500 transition-all"
                        style={{ width: `${d.cost_score}%` }}
                      />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">Cost: {d.cost_score}</TooltipContent>
                </Tooltip>
              </div>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="text-right shrink-0 min-w-[60px]">
                  <div className="text-xs text-muted-foreground tabular-nums">
                    {d.total_km.toLocaleString()} km
                  </div>
                  <div className="text-[10px] text-muted-foreground tabular-nums">
                    {d.fuel_efficiency != null ? `${d.fuel_efficiency} km/L` : '—'}
                  </div>
                </div>
              </TooltipTrigger>
              <TooltipContent side="left" className="text-xs space-y-1">
                <p className="font-medium">{d.name}</p>
                <p>{d.trip_count} trips · {d.total_km.toLocaleString()} km</p>
                <p>Safety: {d.safety_score} · Efficiency: {d.efficiency_score} · Cost: {d.cost_score}</p>
                {d.speeding_events > 0 && <p className="text-red-400">{d.speeding_events} speeding events</p>}
                {d.hard_braking_events > 0 && <p className="text-amber-400">{d.hard_braking_events} hard braking</p>}
                <p>Fuel spend: {formatNaira(d.total_fuel_spend)}</p>
              </TooltipContent>
            </Tooltip>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
