import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Shield, TrendingUp, Fuel, AlertTriangle, Award } from 'lucide-react';
import { formatNaira } from '@/lib/format';

interface DriverScore {
  driver_id: string;
  name: string;
  safety_score: number;
  trip_count: number;
  total_km: number;
  speeding_events: number;
  hard_braking_events: number;
  fuel_efficiency: number | null;
  total_fuel_spend: number;
}

function scoreColor(score: number): string {
  if (score >= 90) return 'text-green-600';
  if (score >= 70) return 'text-amber-600';
  return 'text-red-600';
}

function scoreBg(score: number): string {
  if (score >= 90) return 'bg-green-500';
  if (score >= 70) return 'bg-amber-500';
  return 'bg-red-500';
}

function scoreLabel(score: number): string {
  if (score >= 90) return 'Excellent';
  if (score >= 80) return 'Good';
  if (score >= 70) return 'Fair';
  if (score >= 50) return 'Needs Improvement';
  return 'At Risk';
}

export function DriverScorecard() {
  const [scores, setScores] = useState<DriverScore[]>([]);
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
          .from('profiles')
          .select('id, full_name')
          .in('role', ['field_staff', 'driver', 'operations'])
          .eq('status', 'active'),
      ]);

      type Trip = { driver_id: string; km_driven: number | null; litres: number | null };
      type Event = { trip_id: string; event_type: string };
      type FuelRow = { driver_id: string; amount_ngn: number };
      type Profile = { id: string; full_name: string };

      const trips = (tripsRes.data || []) as Trip[];
      const events = (eventsRes.data || []) as Event[];
      const fuelRows = (fuelRes.data || []) as FuelRow[];
      const profiles = (profilesRes.data || []) as Profile[];

      const tripIdToDriver = new Map<string, string>();
      const driverTrips = new Map<string, { count: number; km: number; litres: number }>();
      const driverEvents = new Map<string, { speeding: number; hard_braking: number }>();

      for (const t of trips) {
        if (!t.driver_id) continue;
        const existing = driverTrips.get(t.driver_id) || { count: 0, km: 0, litres: 0 };
        existing.count++;
        existing.km += t.km_driven || 0;
        existing.litres += t.litres || 0;
        driverTrips.set(t.driver_id, existing);
      }

      // Build trip_id -> driver_id map by querying trip_logs for the event trip_ids
      const eventTripIds = [...new Set(events.map((e) => e.trip_id))];
      if (eventTripIds.length > 0) {
        const { data: tripDrivers } = await supabase
          .from('trip_logs')
          .select('id, driver_id')
          .in('id', eventTripIds.slice(0, 500));
        for (const td of (tripDrivers || []) as { id: string; driver_id: string }[]) {
          tripIdToDriver.set(td.id, td.driver_id);
        }
      }

      for (const e of events) {
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

      const driverScores: DriverScore[] = profiles
        .filter((p) => driverTrips.has(p.id) || driverFuel.has(p.id))
        .map((p) => {
          const t = driverTrips.get(p.id) || { count: 0, km: 0, litres: 0 };
          const ev = driverEvents.get(p.id) || { speeding: 0, hard_braking: 0 };
          const fuelSpend = driverFuel.get(p.id) || 0;

          // Safety score: start at 100, deduct for incidents per 100km
          let score = 100;
          const per100km = t.km > 0 ? 100 / t.km : 0;
          score -= ev.speeding * 5 * per100km;
          score -= ev.hard_braking * 3 * per100km;
          score = Math.max(0, Math.min(100, Math.round(score)));

          const fuelEff = t.km > 0 && t.litres > 0 ? t.km / t.litres : null;

          return {
            driver_id: p.id,
            name: p.full_name || 'Unknown',
            safety_score: score,
            trip_count: t.count,
            total_km: Math.round(t.km),
            speeding_events: ev.speeding,
            hard_braking_events: ev.hard_braking,
            fuel_efficiency: fuelEff ? Math.round(fuelEff * 10) / 10 : null,
            total_fuel_spend: fuelSpend,
          };
        })
        .sort((a, b) => b.safety_score - a.safety_score);

      setScores(driverScores);
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Shield className="h-4 w-4 text-muted-foreground" /> Driver Safety Scores
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-32 bg-muted animate-pulse rounded" />
        </CardContent>
      </Card>
    );
  }

  if (scores.length === 0) return null;

  const topDrivers = scores.slice(0, 8);

  return (
    <Card>
      <CardHeader className="pb-2 pt-4">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Shield className="h-4 w-4 text-muted-foreground" />
          Driver Safety Scores
          <Badge variant="secondary" className="text-[10px] font-normal">Last 30 days</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2.5">
        {topDrivers.map((d, i) => (
          <div key={d.driver_id} className="flex items-center gap-3">
            <div className="w-5 text-center">
              {i === 0 ? (
                <Award className="h-4 w-4 text-amber-500 mx-auto" />
              ) : (
                <span className="text-xs text-muted-foreground">{i + 1}</span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-sm font-medium truncate">{d.name}</span>
                <span className={`text-xs font-semibold ${scoreColor(d.safety_score)}`}>
                  {d.safety_score}
                </span>
              </div>
              <Progress
                value={d.safety_score}
                className="h-1.5"
              />
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="text-right shrink-0 min-w-[60px]">
                  <Badge
                    variant="secondary"
                    className={`text-[10px] px-1.5 ${
                      d.safety_score >= 90
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                        : d.safety_score >= 70
                        ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                        : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                    }`}
                  >
                    {scoreLabel(d.safety_score)}
                  </Badge>
                </div>
              </TooltipTrigger>
              <TooltipContent side="left" className="text-xs space-y-1">
                <p className="font-medium">{d.name}</p>
                <p>{d.trip_count} trips · {d.total_km.toLocaleString()} km</p>
                {d.speeding_events > 0 && <p className="text-red-400">{d.speeding_events} speeding events</p>}
                {d.hard_braking_events > 0 && <p className="text-amber-400">{d.hard_braking_events} hard braking events</p>}
                {d.fuel_efficiency != null && <p>{d.fuel_efficiency} km/L</p>}
                <p>Fuel: {formatNaira(d.total_fuel_spend)}</p>
              </TooltipContent>
            </Tooltip>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
