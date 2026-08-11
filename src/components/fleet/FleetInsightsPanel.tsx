import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { formatNaira } from '@/lib/format';
import {
  AlertTriangle,
  TrendingDown,
  TrendingUp,
  Shield,
  Fuel,
  Wrench,
  Zap,
  Target,
  Clock,
  Car,
  Activity,
  CheckCircle2,
  XCircle,
  ArrowRight,
} from 'lucide-react';

interface VehicleHealth {
  id: string;
  name: string;
  plate_number: string;
  health_score: number;
  fuel_efficiency_score: number;
  maintenance_score: number;
  compliance_score: number;
  inspection_score: number;
  issues: string[];
  trend: 'up' | 'down' | 'stable';
}

interface FleetInsight {
  id: string;
  type: 'warning' | 'opportunity' | 'action' | 'positive';
  title: string;
  description: string;
  impact?: string;
  vehicle?: string;
}

interface Props {
  vehicles: { id: string; name: string; plate_number: string; weekly_budget_ngn: number; insurance_expiry: string | null; road_worthiness_expiry: string | null; next_service_date: string | null; assigned_driver_id: string | null; tank_capacity_litres: number; current_fuel_litres: number; out_of_service_until: string | null }[];
  onNavigate: (tab: string) => void;
}

function healthColor(score: number) {
  if (score >= 85) return 'text-green-600';
  if (score >= 65) return 'text-amber-600';
  return 'text-red-600';
}

function healthBg(score: number) {
  if (score >= 85) return 'bg-green-500';
  if (score >= 65) return 'bg-amber-500';
  return 'bg-red-500';
}

function healthLabel(score: number) {
  if (score >= 90) return 'Excellent';
  if (score >= 75) return 'Good';
  if (score >= 60) return 'Fair';
  if (score >= 40) return 'Needs Attention';
  return 'Critical';
}

export function FleetInsightsPanel({ vehicles, onNavigate }: Props) {
  const [loading, setLoading] = useState(true);
  const [vehicleHealths, setVehicleHealths] = useState<VehicleHealth[]>([]);
  const [insights, setInsights] = useState<FleetInsight[]>([]);
  const [overallHealth, setOverallHealth] = useState(0);
  const [weekOverWeekChange, setWeekOverWeekChange] = useState<number | null>(null);
  const [totalSavingsOpportunity, setTotalSavingsOpportunity] = useState(0);

  useEffect(() => {
    if (!vehicles.length) { setLoading(false); return; }

    (async () => {
      const now = new Date();
      const todayStr = now.toISOString().slice(0, 10);
      const thirtyDaysAgo = new Date(now);
      thirtyDaysAgo.setDate(now.getDate() - 30);
      const sixtyDaysAgo = new Date(now);
      sixtyDaysAgo.setDate(now.getDate() - 60);

      const monday = new Date(now);
      monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
      monday.setHours(0, 0, 0, 0);
      const lastMonday = new Date(monday);
      lastMonday.setDate(monday.getDate() - 7);

      const vIds = vehicles.map((v) => v.id);

      const [fuelRes, tripRes, maintRes, inspRes] = await Promise.all([
        supabase
          .from('fuel_requests')
          .select('vehicle_id, amount_ngn, created_at, is_anomaly, status')
          .in('status', ['approved', 'payment_sent', 'receipt_uploaded', 'completed'])
          .is('deleted_at', null)
          .gte('created_at', sixtyDaysAgo.toISOString()),
        supabase
          .from('trip_logs')
          .select('vehicle_id, km_driven, litres, is_anomaly, created_at')
          .gte('created_at', thirtyDaysAgo.toISOString())
          .not('km_driven', 'is', null),
        supabase
          .from('vehicle_maintenance')
          .select('vehicle_id, due_date, completed_at, priority')
          .in('vehicle_id', vIds),
        supabase
          .from('vehicle_inspections')
          .select('vehicle_id, overall_result, reviewed_at, created_at')
          .gte('created_at', thirtyDaysAgo.toISOString()),
      ]);

      type FuelRow = { vehicle_id: string | null; amount_ngn: number; created_at: string; is_anomaly: boolean; status: string };
      type TripRow = { vehicle_id: string | null; km_driven: number; litres: number | null; is_anomaly: boolean; created_at: string };
      type MaintRow = { vehicle_id: string; due_date: string | null; completed_at: string | null; priority: string | null };
      type InspRow = { vehicle_id: string; overall_result: string; reviewed_at: string | null; created_at: string };

      const fuels = (fuelRes.data || []) as FuelRow[];
      const trips = (tripRes.data || []) as TripRow[];
      const maints = (maintRes.data || []) as MaintRow[];
      const insps = (inspRes.data || []) as InspRow[];

      const in30 = new Date(now);
      in30.setDate(now.getDate() + 30);
      const in30Str = in30.toISOString().slice(0, 10);

      const thisWeekFuels = fuels.filter((f) => new Date(f.created_at) >= monday);
      const lastWeekFuels = fuels.filter((f) => { const d = new Date(f.created_at); return d >= lastMonday && d < monday; });
      const thisWeekSpend = thisWeekFuels.reduce((s, f) => s + (f.amount_ngn || 0), 0);
      const lastWeekSpend = lastWeekFuels.reduce((s, f) => s + (f.amount_ngn || 0), 0);
      const wow = lastWeekSpend > 0 ? Math.round(((thisWeekSpend - lastWeekSpend) / lastWeekSpend) * 100) : null;
      setWeekOverWeekChange(wow);

      const healths: VehicleHealth[] = vehicles.map((v) => {
        const issues: string[] = [];
        const vFuels = fuels.filter((f) => f.vehicle_id === v.id && new Date(f.created_at) >= thirtyDaysAgo);
        const vTrips = trips.filter((t) => t.vehicle_id === v.id);
        const vMaints = maints.filter((m) => m.vehicle_id === v.id);
        const vInsps = insps.filter((i) => i.vehicle_id === v.id);

        // Fuel efficiency score (0-100)
        const anomalyRate = vFuels.length > 0 ? vFuels.filter((f) => f.is_anomaly).length / vFuels.length : 0;
        const fuelScore = Math.max(0, Math.round(100 - anomalyRate * 200));

        // Maintenance score
        const overdue = vMaints.filter((m) => m.due_date && !m.completed_at && m.due_date < todayStr);
        const upcoming = vMaints.filter((m) => m.due_date && !m.completed_at && m.due_date >= todayStr && m.due_date <= in30Str);
        let maintScore = 100;
        if (overdue.length > 0) { maintScore -= overdue.length * 25; issues.push(`${overdue.length} overdue maintenance`); }
        if (upcoming.length > 0) { maintScore -= upcoming.length * 5; }
        maintScore = Math.max(0, maintScore);

        // Compliance score
        let compScore = 100;
        if (v.insurance_expiry && v.insurance_expiry < todayStr) { compScore -= 40; issues.push('Insurance expired'); }
        else if (v.insurance_expiry && v.insurance_expiry <= in30Str) { compScore -= 10; issues.push('Insurance expiring soon'); }
        if (v.road_worthiness_expiry && v.road_worthiness_expiry < todayStr) { compScore -= 40; issues.push('Road worthiness expired'); }
        else if (v.road_worthiness_expiry && v.road_worthiness_expiry <= in30Str) { compScore -= 10; }
        if (!v.assigned_driver_id) { compScore -= 10; issues.push('No driver assigned'); }
        compScore = Math.max(0, compScore);

        // Inspection score
        const failedInsps = vInsps.filter((i) => i.overall_result === 'fail');
        const unresolvedDefects = failedInsps.filter((i) => !i.reviewed_at);
        let inspScore = 100;
        if (unresolvedDefects.length > 0) { inspScore -= unresolvedDefects.length * 20; issues.push(`${unresolvedDefects.length} unresolved defects`); }
        inspScore = Math.max(0, inspScore);

        if (v.out_of_service_until && v.out_of_service_until > todayStr) { issues.push('Out of service'); }

        const overall = Math.round(fuelScore * 0.2 + maintScore * 0.3 + compScore * 0.3 + inspScore * 0.2);

        // Simple trend based on anomaly rate
        const trend: 'up' | 'down' | 'stable' = anomalyRate > 0.2 ? 'down' : anomalyRate === 0 ? 'up' : 'stable';

        return {
          id: v.id,
          name: v.name,
          plate_number: v.plate_number,
          health_score: overall,
          fuel_efficiency_score: fuelScore,
          maintenance_score: maintScore,
          compliance_score: compScore,
          inspection_score: inspScore,
          issues,
          trend,
        };
      });

      healths.sort((a, b) => a.health_score - b.health_score);
      setVehicleHealths(healths);
      setOverallHealth(healths.length > 0 ? Math.round(healths.reduce((s, h) => s + h.health_score, 0) / healths.length) : 0);

      // Generate smart insights
      const smartInsights: FleetInsight[] = [];
      let insightId = 0;

      // Vehicles needing attention
      const criticalVehicles = healths.filter((h) => h.health_score < 50);
      if (criticalVehicles.length > 0) {
        smartInsights.push({
          id: String(++insightId),
          type: 'warning',
          title: `${criticalVehicles.length} vehicle${criticalVehicles.length > 1 ? 's' : ''} need${criticalVehicles.length === 1 ? 's' : ''} urgent attention`,
          description: criticalVehicles.map((v) => `${v.name} (${v.health_score}%)`).join(', '),
          vehicle: criticalVehicles[0].name,
        });
      }

      // Budget overruns
      const overBudgetVehicles = vehicles.filter((v) => {
        const weekSpendV = thisWeekFuels.filter((f) => f.vehicle_id === v.id).reduce((s, f) => s + (f.amount_ngn || 0), 0);
        return v.weekly_budget_ngn > 0 && weekSpendV > v.weekly_budget_ngn;
      });
      if (overBudgetVehicles.length > 0) {
        const excess = overBudgetVehicles.reduce((s, v) => {
          const spent = thisWeekFuels.filter((f) => f.vehicle_id === v.id).reduce((t, f) => t + (f.amount_ngn || 0), 0);
          return s + (spent - v.weekly_budget_ngn);
        }, 0);
        smartInsights.push({
          id: String(++insightId),
          type: 'warning',
          title: `${overBudgetVehicles.length} vehicle${overBudgetVehicles.length > 1 ? 's' : ''} over budget this week`,
          description: `Excess spend: ${formatNaira(excess)}. Review fuel consumption patterns.`,
          impact: formatNaira(excess),
        });
      }

      // Anomaly rate
      const recentAnomalies = fuels.filter((f) => f.is_anomaly && new Date(f.created_at) >= thirtyDaysAgo);
      const recentFuels = fuels.filter((f) => new Date(f.created_at) >= thirtyDaysAgo);
      if (recentAnomalies.length > 0 && recentFuels.length > 0) {
        const rate = Math.round((recentAnomalies.length / recentFuels.length) * 100);
        if (rate > 15) {
          const anomalySpend = recentAnomalies.reduce((s, f) => s + (f.amount_ngn || 0), 0);
          smartInsights.push({
            id: String(++insightId),
            type: 'warning',
            title: `${rate}% anomaly rate in fuel requests`,
            description: `${recentAnomalies.length} of ${recentFuels.length} requests flagged. Potential savings: ${formatNaira(anomalySpend)}.`,
            impact: formatNaira(anomalySpend),
          });
          setTotalSavingsOpportunity((prev) => prev + anomalySpend * 0.5);
        }
      }

      // Unassigned vehicles
      const unassigned = vehicles.filter((v) => !v.assigned_driver_id);
      if (unassigned.length > 0) {
        smartInsights.push({
          id: String(++insightId),
          type: 'action',
          title: `${unassigned.length} vehicle${unassigned.length > 1 ? 's' : ''} without assigned drivers`,
          description: 'Assign drivers to improve accountability and tracking.',
        });
      }

      // Week-over-week spend change
      if (wow !== null && wow > 20) {
        smartInsights.push({
          id: String(++insightId),
          type: 'opportunity',
          title: `Fuel spend up ${wow}% week-over-week`,
          description: `This week: ${formatNaira(thisWeekSpend)} vs last week: ${formatNaira(lastWeekSpend)}. Check for route inefficiencies or unauthorized fueling.`,
          impact: formatNaira(thisWeekSpend - lastWeekSpend),
        });
      } else if (wow !== null && wow < -10) {
        smartInsights.push({
          id: String(++insightId),
          type: 'positive',
          title: `Fuel spend down ${Math.abs(wow)}% week-over-week`,
          description: `Great progress — saved ${formatNaira(lastWeekSpend - thisWeekSpend)} compared to last week.`,
        });
      }

      // Overdue maintenance
      const allOverdue = maints.filter((m) => m.due_date && !m.completed_at && m.due_date < todayStr);
      if (allOverdue.length > 0) {
        const highPriority = allOverdue.filter((m) => m.priority === 'high' || m.priority === 'critical');
        smartInsights.push({
          id: String(++insightId),
          type: highPriority.length > 0 ? 'warning' : 'action',
          title: `${allOverdue.length} overdue maintenance item${allOverdue.length > 1 ? 's' : ''}`,
          description: highPriority.length > 0 ? `${highPriority.length} are high/critical priority. Delaying could lead to costly breakdowns.` : 'Schedule maintenance to prevent breakdowns and extend vehicle life.',
        });
      }

      // Unresolved inspection defects
      const unresolvedTotal = insps.filter((i) => i.overall_result === 'fail' && !i.reviewed_at).length;
      if (unresolvedTotal > 0) {
        smartInsights.push({
          id: String(++insightId),
          type: 'action',
          title: `${unresolvedTotal} unresolved inspection defect${unresolvedTotal > 1 ? 's' : ''}`,
          description: 'Resolve defects promptly to maintain fleet safety and compliance.',
        });
      }

      // Low fuel vehicles
      const lowFuel = vehicles.filter((v) => v.tank_capacity_litres > 0 && v.current_fuel_litres / v.tank_capacity_litres < 0.15);
      if (lowFuel.length > 0) {
        smartInsights.push({
          id: String(++insightId),
          type: 'action',
          title: `${lowFuel.length} vehicle${lowFuel.length > 1 ? 's' : ''} running low on fuel`,
          description: lowFuel.map((v) => `${v.name} (${Math.round((v.current_fuel_litres / v.tank_capacity_litres) * 100)}%)`).join(', '),
        });
      }

      // Predictive maintenance: detect fuel efficiency degradation
      for (const v of vehicles) {
        const vTrips = trips.filter((t) => t.vehicle_id === v.id && t.km_driven && t.km_driven > 0 && t.litres && t.litres > 0);
        if (vTrips.length < 6) continue;
        const sorted = [...vTrips].sort((a, b) => a.created_at.localeCompare(b.created_at));
        const half = Math.floor(sorted.length / 2);
        const olderAvg = sorted.slice(0, half).reduce((s, t) => s + t.km_driven! / t.litres!, 0) / half;
        const recentAvg = sorted.slice(half).reduce((s, t) => s + t.km_driven! / t.litres!, 0) / (sorted.length - half);
        if (olderAvg > 0 && recentAvg < olderAvg * 0.85) {
          const dropPct = Math.round((1 - recentAvg / olderAvg) * 100);
          smartInsights.push({
            id: String(++insightId),
            type: 'warning',
            title: `${v.name}: fuel efficiency dropped ${dropPct}%`,
            description: `Recent average ${recentAvg.toFixed(1)} km/L vs earlier ${olderAvg.toFixed(1)} km/L. Possible injector, air filter, or tyre issue.`,
            vehicle: v.name,
          });
        }
      }

      // Positive: all vehicles healthy
      const healthyCount = healths.filter((h) => h.health_score >= 85).length;
      if (healthyCount === healths.length && healths.length > 0) {
        smartInsights.push({
          id: String(++insightId),
          type: 'positive',
          title: 'All vehicles in good health',
          description: 'Your fleet is performing well across all metrics. Keep it up!',
        });
      }

      setInsights(smartInsights);
      setLoading(false);
    })();
  }, [vehicles]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-24 bg-muted animate-pulse rounded-lg" />)}
        </div>
        <div className="h-48 bg-muted animate-pulse rounded-lg" />
      </div>
    );
  }

  const iconByType: Record<FleetInsight['type'], React.ReactNode> = {
    warning: <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />,
    opportunity: <Target className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />,
    action: <Zap className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />,
    positive: <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />,
  };

  const bgByType: Record<FleetInsight['type'], string> = {
    warning: 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30',
    opportunity: 'border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/30',
    action: 'border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30',
    positive: 'border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30',
  };

  const atRiskVehicles = vehicleHealths.filter((v) => v.health_score < 65);
  const excellentVehicles = vehicleHealths.filter((v) => v.health_score >= 85);

  return (
    <div className="space-y-4">
      {/* Overall Fleet Health */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="col-span-2 lg:col-span-1">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className={`flex h-12 w-12 items-center justify-center rounded-full ${overallHealth >= 85 ? 'bg-green-100 text-green-700' : overallHealth >= 65 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                <Activity className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Fleet Health Score</p>
                <p className={`text-2xl font-bold ${healthColor(overallHealth)}`}>{overallHealth}%</p>
                <p className="text-xs text-muted-foreground">{healthLabel(overallHealth)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Car className="h-3.5 w-3.5 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">Fleet Size</p>
            </div>
            <p className="text-2xl font-bold">{vehicles.length}</p>
            <p className="text-xs text-muted-foreground">
              {vehicles.filter((v) => v.assigned_driver_id).length} assigned
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Shield className="h-3.5 w-3.5 text-green-600" />
              <p className="text-xs text-muted-foreground">Healthy</p>
            </div>
            <p className="text-2xl font-bold text-green-600">{excellentVehicles.length}</p>
            <p className="text-xs text-muted-foreground">
              {vehicles.length > 0 ? Math.round((excellentVehicles.length / vehicles.length) * 100) : 0}% of fleet
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
              <p className="text-xs text-muted-foreground">At Risk</p>
            </div>
            <p className="text-2xl font-bold text-red-600">{atRiskVehicles.length}</p>
            {weekOverWeekChange !== null && (
              <p className={`text-xs flex items-center gap-1 ${weekOverWeekChange > 0 ? 'text-red-500' : 'text-green-500'}`}>
                {weekOverWeekChange > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {Math.abs(weekOverWeekChange)}% fuel WoW
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Smart Insights */}
      {insights.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-500" />
              Smart Insights
              <Badge variant="secondary" className="ml-auto text-xs">{insights.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {insights.map((insight) => (
              <div key={insight.id} className={`flex gap-3 p-3 rounded-lg border ${bgByType[insight.type]}`}>
                {iconByType[insight.type]}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{insight.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{insight.description}</p>
                  {insight.impact && (
                    <Badge variant="outline" className="mt-1 text-xs currency">{insight.impact}</Badge>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Vehicle Health Breakdown */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Activity className="h-4 w-4 text-muted-foreground" />
              Vehicle Health Breakdown
            </CardTitle>
            <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => onNavigate('vehicles')}>
              View all <ArrowRight className="h-3 w-3 ml-1" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {vehicleHealths.slice(0, 8).map((vh) => (
              <div key={vh.id} className="flex items-center gap-3">
                <div className="w-32 lg:w-48 truncate">
                  <p className="text-sm font-medium truncate">{vh.name}</p>
                  <p className="text-xs text-muted-foreground">{vh.plate_number}</p>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Progress value={vh.health_score} className="flex-1 h-2" />
                    <span className={`text-sm font-semibold w-10 text-right ${healthColor(vh.health_score)}`}>{vh.health_score}%</span>
                  </div>
                  {vh.issues.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {vh.issues.slice(0, 3).map((issue, i) => (
                        <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{issue}</span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="shrink-0">
                  {vh.trend === 'up' && <TrendingUp className="h-4 w-4 text-green-500" />}
                  {vh.trend === 'down' && <TrendingDown className="h-4 w-4 text-red-500" />}
                  {vh.trend === 'stable' && <Activity className="h-4 w-4 text-muted-foreground" />}
                </div>
              </div>
            ))}
          </div>

          {/* Score Legend */}
          <div className="flex items-center gap-4 mt-4 pt-3 border-t text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><Fuel className="h-3 w-3" /> Fuel 20%</span>
            <span className="flex items-center gap-1"><Wrench className="h-3 w-3" /> Maintenance 30%</span>
            <span className="flex items-center gap-1"><Shield className="h-3 w-3" /> Compliance 30%</span>
            <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Inspections 20%</span>
          </div>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <Button variant="outline" className="h-auto py-3 flex-col gap-1" onClick={() => onNavigate('inspections')}>
          <CheckCircle2 className="h-4 w-4 text-blue-500" />
          <span className="text-xs">Run Inspection</span>
        </Button>
        <Button variant="outline" className="h-auto py-3 flex-col gap-1" onClick={() => onNavigate('maintenance')}>
          <Wrench className="h-4 w-4 text-amber-500" />
          <span className="text-xs">Maintenance</span>
        </Button>
        <Button variant="outline" className="h-auto py-3 flex-col gap-1" onClick={() => onNavigate('anomalies')}>
          <AlertTriangle className="h-4 w-4 text-red-500" />
          <span className="text-xs">Review Anomalies</span>
        </Button>
        <Button variant="outline" className="h-auto py-3 flex-col gap-1" onClick={() => onNavigate('compliance')}>
          <Shield className="h-4 w-4 text-green-500" />
          <span className="text-xs">Compliance</span>
        </Button>
      </div>
    </div>
  );
}
