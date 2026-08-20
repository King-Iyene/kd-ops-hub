import { AlertTriangle } from 'lucide-react';
import { formatDate } from '@/lib/format';
import { type FieldStaff, type VehicleSummary } from '@/lib/fleet-utils';
import { FleetInsightsPanel } from '@/components/fleet/FleetInsightsPanel';
import FleetAnalyticsDashboard from '@/components/fleet/FleetAnalyticsDashboard';
import { FuelCostOptimizer } from '@/components/fleet/FuelCostOptimizer';
import { FleetBudgetForecaster } from '@/components/fleet/FleetBudgetForecaster';
import { FuelPriceIntelligence } from '@/components/fleet/FuelPriceIntelligence';
import { FuelStationComparison } from '@/components/fleet/FuelStationComparison';
import { DriverLeaderboard } from '@/components/fleet/DriverLeaderboard';
import { DriverScorecard } from '@/components/fleet/DriverScorecard';

// ---------------------------------------------------------------------------
// ServiceAlert — inline helper only used by DashboardTab
// ---------------------------------------------------------------------------

function ServiceAlert({ v, todayStr, in30Str }: { v: VehicleSummary; todayStr: string; in30Str: string }) {
  const msgs: string[] = [];
  if (v.insurance_expiry && v.insurance_expiry <= in30Str)
    msgs.push(`insurance expires ${formatDate(v.insurance_expiry)}${v.insurance_expiry <= todayStr ? ' (EXPIRED)' : ''}`);
  if (v.road_worthiness_expiry && v.road_worthiness_expiry <= in30Str)
    msgs.push(`roadworthy expires ${formatDate(v.road_worthiness_expiry)}${v.road_worthiness_expiry <= todayStr ? ' (EXPIRED)' : ''}`);
  if ((v as any).next_service_date && (v as any).next_service_date <= in30Str)
    msgs.push(`service due ${formatDate((v as any).next_service_date)}`);
  return (
    <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
      <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
      <span><strong>{v.name}</strong> ({(v as any).plate_number}): {msgs.join(' · ')}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DashboardTab
// ---------------------------------------------------------------------------

export interface DashboardTabProps {
  vehicles: VehicleSummary[];
  staff: FieldStaff[];
  serviceAlerts: VehicleSummary[];
  onNavigate: (tab: string) => void;
}

export function DashboardTab({ vehicles, staff, serviceAlerts, onNavigate }: DashboardTabProps) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const in30Str = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);

  return (
    <div className="space-y-4">
      <FleetInsightsPanel vehicles={vehicles as any} onNavigate={(t) => onNavigate(t)} />
      <FleetAnalyticsDashboard vehicles={vehicles} staff={staff} onNavigateToVehicles={() => onNavigate('vehicles')} />
      <FuelCostOptimizer vehicles={vehicles.map((v) => ({ id: v.id, name: v.name, plate_number: v.plate_number }))} />
      <FleetBudgetForecaster />
      <FuelPriceIntelligence />
      <FuelStationComparison />
      <DriverLeaderboard />
      <DriverScorecard />
      {serviceAlerts.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold mb-2 flex items-center gap-2 text-amber-600">
            <AlertTriangle className="h-4 w-4" /> Document Expiry Alerts
          </h2>
          <div className="flex flex-col gap-2">
            {serviceAlerts.map((v) => (
              <ServiceAlert key={v.id} v={v} todayStr={todayStr} in30Str={in30Str} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
