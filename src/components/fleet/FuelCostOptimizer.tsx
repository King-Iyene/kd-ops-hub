import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatNaira } from '@/lib/format';
import {
  TrendingDown,
  TrendingUp,
  Fuel,
  MapPin,
  BarChart2,
  ArrowUpRight,
  ArrowDownRight,
  DollarSign,
} from 'lucide-react';

interface StationStats {
  station: string;
  total_requests: number;
  total_spend: number;
  avg_price_per_litre: number | null;
  anomaly_rate: number;
}

interface VehicleCost {
  vehicle_id: string;
  name: string;
  plate: string;
  spend_30d: number;
  km_30d: number;
  cost_per_km: number | null;
  rank: number;
}

interface Props {
  vehicles: { id: string; name: string; plate_number: string }[];
}

export function FuelCostOptimizer({ vehicles }: Props) {
  const [loading, setLoading] = useState(true);
  const [stationStats, setStationStats] = useState<StationStats[]>([]);
  const [vehicleCosts, setVehicleCosts] = useState<VehicleCost[]>([]);
  const [avgCostPerKm, setAvgCostPerKm] = useState<number | null>(null);
  const [potentialSavings, setPotentialSavings] = useState(0);

  useEffect(() => {
    (async () => {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const [fuelRes, tripRes] = await Promise.all([
        supabase
          .from('fuel_requests')
          .select('vehicle_id, station_name, amount_ngn, litres_est, litres_filled, is_anomaly, created_at')
          .in('status', ['approved', 'payment_sent', 'receipt_uploaded', 'completed'])
          .is('deleted_at', null)
          .gte('created_at', thirtyDaysAgo.toISOString()),
        supabase
          .from('trip_logs')
          .select('vehicle_id, km_driven')
          .gte('created_at', thirtyDaysAgo.toISOString())
          .not('km_driven', 'is', null),
      ]);

      type FuelRow = { vehicle_id: string | null; station_name: string; amount_ngn: number; litres_est: number | null; litres_filled: number | null; is_anomaly: boolean; created_at: string };
      type TripRow = { vehicle_id: string | null; km_driven: number };

      const fuels = (fuelRes.data || []) as FuelRow[];
      const trips = (tripRes.data || []) as TripRow[];

      // Station analysis
      const stationMap = new Map<string, { count: number; spend: number; litres: number; anomalies: number }>();
      for (const f of fuels) {
        const name = f.station_name || 'Unknown';
        const curr = stationMap.get(name) || { count: 0, spend: 0, litres: 0, anomalies: 0 };
        curr.count++;
        curr.spend += f.amount_ngn || 0;
        curr.litres += f.litres_filled || f.litres_est || 0;
        if (f.is_anomaly) curr.anomalies++;
        stationMap.set(name, curr);
      }

      const stations: StationStats[] = Array.from(stationMap.entries())
        .map(([station, data]) => ({
          station,
          total_requests: data.count,
          total_spend: data.spend,
          avg_price_per_litre: data.litres > 0 ? data.spend / data.litres : null,
          anomaly_rate: data.count > 0 ? data.anomalies / data.count : 0,
        }))
        .sort((a, b) => b.total_spend - a.total_spend)
        .slice(0, 6);

      setStationStats(stations);

      // Vehicle cost efficiency
      const vSpendMap = new Map<string, number>();
      for (const f of fuels) {
        if (f.vehicle_id) vSpendMap.set(f.vehicle_id, (vSpendMap.get(f.vehicle_id) || 0) + f.amount_ngn);
      }
      const vKmMap = new Map<string, number>();
      for (const t of trips) {
        if (t.vehicle_id) vKmMap.set(t.vehicle_id, (vKmMap.get(t.vehicle_id) || 0) + t.km_driven);
      }

      const costs: VehicleCost[] = vehicles
        .map((v) => {
          const spend = vSpendMap.get(v.id) || 0;
          const km = vKmMap.get(v.id) || 0;
          return {
            vehicle_id: v.id,
            name: v.name,
            plate: v.plate_number,
            spend_30d: spend,
            km_30d: km,
            cost_per_km: spend > 0 && km > 0 ? spend / km : null,
            rank: 0,
          };
        })
        .filter((v) => v.spend_30d > 0)
        .sort((a, b) => (a.cost_per_km ?? Infinity) - (b.cost_per_km ?? Infinity));

      costs.forEach((c, i) => { c.rank = i + 1; });
      setVehicleCosts(costs);

      const validCosts = costs.filter((c) => c.cost_per_km != null);
      if (validCosts.length > 0) {
        const avg = validCosts.reduce((s, c) => s + c.cost_per_km!, 0) / validCosts.length;
        setAvgCostPerKm(avg);

        // Potential savings: bring worst performers to avg
        const worstHalf = validCosts.slice(Math.ceil(validCosts.length / 2));
        const savings = worstHalf.reduce((s, c) => {
          if (c.cost_per_km! > avg) {
            return s + (c.cost_per_km! - avg) * c.km_30d;
          }
          return s;
        }, 0);
        setPotentialSavings(Math.round(savings));
      }

      setLoading(false);
    })();
  }, [vehicles]);

  if (loading) {
    return <div className="h-48 bg-muted animate-pulse rounded-lg" />;
  }

  const bestStation = stationStats.length > 0 ? stationStats.reduce((best, s) => {
    if (!s.avg_price_per_litre) return best;
    if (!best || !best.avg_price_per_litre || s.avg_price_per_litre < best.avg_price_per_litre) return s;
    return best;
  }, null as StationStats | null) : null;

  return (
    <div className="space-y-4">
      {/* Summary strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {avgCostPerKm != null && (
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
                <BarChart2 className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Fleet avg cost/km</p>
                <p className="text-lg font-bold">{formatNaira(avgCostPerKm)}/km</p>
              </div>
            </CardContent>
          </Card>
        )}
        {potentialSavings > 0 && (
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100 text-green-700">
                <DollarSign className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Monthly savings opportunity</p>
                <p className="text-lg font-bold text-green-600">{formatNaira(potentialSavings)}</p>
                <p className="text-[10px] text-muted-foreground">By optimizing worst performers</p>
              </div>
            </CardContent>
          </Card>
        )}
        {bestStation?.avg_price_per_litre && (
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
                <MapPin className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Best station (price/L)</p>
                <p className="text-sm font-bold truncate">{bestStation.station}</p>
                <p className="text-xs text-muted-foreground">{formatNaira(bestStation.avg_price_per_litre)}/L</p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Cost/km ranking */}
      {vehicleCosts.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Fuel className="h-4 w-4 text-muted-foreground" />
              Vehicle Cost Efficiency (30 days)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="text-left py-2 pr-2">#</th>
                    <th className="text-left py-2">Vehicle</th>
                    <th className="text-right py-2 px-2">Spend</th>
                    <th className="text-right py-2 px-2">Distance</th>
                    <th className="text-right py-2">Cost/km</th>
                    <th className="text-right py-2 pl-2">Rating</th>
                  </tr>
                </thead>
                <tbody>
                  {vehicleCosts.slice(0, 8).map((vc) => {
                    const isGood = vc.cost_per_km != null && avgCostPerKm != null && vc.cost_per_km <= avgCostPerKm;
                    return (
                      <tr key={vc.vehicle_id} className="border-b last:border-0">
                        <td className="py-2 pr-2 text-muted-foreground">{vc.rank}</td>
                        <td className="py-2">
                          <div className="font-medium">{vc.name}</div>
                          <div className="text-xs text-muted-foreground">{vc.plate}</div>
                        </td>
                        <td className="text-right py-2 px-2 tabular-nums">{formatNaira(vc.spend_30d)}</td>
                        <td className="text-right py-2 px-2 tabular-nums">{vc.km_30d > 0 ? `${vc.km_30d.toLocaleString()} km` : '—'}</td>
                        <td className="text-right py-2 tabular-nums font-medium">
                          {vc.cost_per_km != null ? `${formatNaira(vc.cost_per_km)}` : '—'}
                        </td>
                        <td className="text-right py-2 pl-2">
                          {vc.cost_per_km != null ? (
                            isGood ? (
                              <Badge variant="outline" className="text-green-600 border-green-200 text-[10px]">
                                <ArrowDownRight className="h-3 w-3 mr-0.5" /> Efficient
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-red-600 border-red-200 text-[10px]">
                                <ArrowUpRight className="h-3 w-3 mr-0.5" /> High
                              </Badge>
                            )
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
