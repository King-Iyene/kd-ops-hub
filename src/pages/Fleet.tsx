import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { useCompanySettings } from '@/queries';
import { formatDate } from '@/lib/format';
import { SubPageHeader } from '@/components/SubPageHeader';
import { usePageTitle } from '@/hooks/usePageTitle';
import { TableSkeleton } from '@/components/ui-kit/TableSkeleton';
import { AuroraHero } from '@/components/AuroraHero';
import { Car, Fuel, MapPin, History, User, AlertTriangle, Wrench, Radio, TrendingUp, RefreshCw, Shield, LayoutDashboard, ClipboardCheck, UserCheck } from 'lucide-react';
import { useAutoRefresh } from '@/hooks/useAutoRefresh';
import { LiveTrackingTab } from '@/components/fleet/LiveTrackingTab';
import { cn } from '@/lib/utils';
import { ComplianceDashboard } from '@/components/fleet/ComplianceDashboard';
import { DriverVerificationPanel } from '@/components/fleet/DriverVerificationPanel';
import { IncidentReportPanel } from '@/components/fleet/IncidentReportPanel';
import { MaintenanceHub } from '@/components/fleet/MaintenanceHub';
import { InspectionHistory } from '@/components/fleet/InspectionHistory';
import { VehicleLifecyclePanel } from '@/components/fleet/VehicleLifecyclePanel';
import GeofencesTab from '@/components/fleet/GeofencesTab';
import VehiclesTab from '@/components/fleet/VehiclesTab';
import { DashboardTab } from '@/components/fleet/DashboardTab';
import { FuelTab } from '@/components/fleet/FuelTab';
import { TripsTab } from '@/components/fleet/TripsTab';
import { MyRequestsTab } from '@/components/fleet/MyRequestsTab';
import { ActivityTab } from '@/components/fleet/ActivityTab';
import { AnomaliesTab } from '@/components/fleet/AnomaliesTab';
import {
  type FieldStaff,
  type VehicleSummary,
  type FuelRequest,
  type TripLog,
} from '@/lib/fleet-utils';
import { blendBenchmark, median } from '@/lib/receipts';

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
// Fleet — thin shell: shared data + tab router
// ---------------------------------------------------------------------------

type FleetTab =
  | 'dashboard' | 'fuel' | 'trips' | 'vehicles' | 'my_requests'
  | 'activity' | 'anomalies' | 'geofences' | 'live' | 'compliance'
  | 'drivers' | 'incidents' | 'maintenance' | 'inspections' | 'lifecycle';

const Fleet = () => {
  usePageTitle('Fleet');
  const { profile } = useAuthStore();
  const isAdmin =
    profile?.role === 'admin' ||
    profile?.role === 'finance' ||
    profile?.role === 'super_admin' ||
    profile?.role === 'operations';

  const [tab, setTab] = useState<FleetTab>(isAdmin ? 'dashboard' : 'my_requests');

  // ── Shared data ────────────────────────────────────────────────────────
  const [staff, setStaff] = useState<FieldStaff[]>([]);
  const [fuelRequests, setFuelRequests] = useState<FuelRequest[]>([]);
  const [tripLogs, setTripLogs] = useState<TripLog[]>([]);
  const [activityLogs, setActivityLogs] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<VehicleSummary[]>([]);
  const [fuelPriceBenchmark, setFuelPriceBenchmark] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const hasFetchedRef = useRef(false);
  const { data: companySettings } = useCompanySettings();
  const externalFuelPrice = useMemo(
    () => (companySettings as any)?.fuel_price_ngn_per_litre ?? null,
    [companySettings],
  );

  const enrich = (rows: any[], staffList: FieldStaff[]) => {
    const byId = new Map(staffList.map((s) => [s.id, s]));
    return rows.map((r) => ({
      ...r,
      employee_id: r.driver_id,
      employee_name: byId.get(r.driver_id)?.full_name || r.driver_id,
    }));
  };

  async function fetchData() {
    if (!hasFetchedRef.current) setLoading(true);
    setLoadError(false);
    try {
      const canSeeAll = ['admin', 'finance', 'super_admin', 'operations'].includes(profile?.role || '');
      const uid = profile?.id || '';

      const fuelBase = supabase
        .from('fuel_requests')
        .select('*, batch:payment_batches(batch_items(paystack_fee_ngn, paystack_raw, status))')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(100);
      const tripBase = supabase.from('trip_logs').select('id, driver_id, date, trip_start_time, trip_end_time, duration_minutes, start_location, end_location, start_lat, start_lng, end_lat, end_lng, odometer_start, odometer_end, km_driven, fuel_amount_ngn, litres, vehicle_id, status, is_anomaly, is_out_of_area, anomaly_reason, anomaly_reviewed_at, anomaly_review_note, issues, created_at').order('created_at', { ascending: false }).limit(100);

      const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000).toISOString();

      const [staffRes, profilesRes, fuelRes, tripRes, activityRes, vehicleRes, fleetPricesRes] = await Promise.all([
        supabase
          .from('profiles_directory')
          .select('id, full_name, email')
          .eq('role', 'field_staff')
          .eq('status', 'active')
          .order('full_name'),
        supabase.from('profiles_directory').select('id, full_name, email').limit(2000),
        canSeeAll ? fuelBase : fuelBase.eq('driver_id', uid),
        canSeeAll ? tripBase : tripBase.eq('driver_id', uid),
        supabase
          .from('audit_logs')
          .select('id, action_type, description, performed_by_name, performed_by, created_at')
          .or('action_type.ilike.%fuel%,action_type.ilike.%trip%,action_type.ilike.%fleet%,action_type.ilike.%vehicle%')
          .order('created_at', { ascending: false })
          .limit(50),
        supabase
          .from('vehicles')
          .select('id, name, plate_number, weekly_budget_ngn, carry_forward_ngn, assigned_driver_id, insurance_expiry, road_worthiness_expiry, next_service_date, tank_capacity_litres, current_fuel_litres, last_refuel_at, avg_km_per_litre, fuel_consumption_rate_lkm, home_base_lat, home_base_lng, out_of_service_until, status, total_mileage_km')
          .eq('status', 'active')
          .order('name'),
        supabase
          .from('fuel_requests')
          .select('amount_ngn, litres_filled')
          .not('litres_filled', 'is', null)
          .gt('litres_filled', 0)
          .gte('created_at', thirtyDaysAgo)
          .is('deleted_at', null),
      ]);

      const fieldStaff = (staffRes.data as FieldStaff[]) || [];
      setStaff(fieldStaff);

      const lookup = ((profilesRes.data as FieldStaff[]) || []).concat(fieldStaff);
      const fuelWithFee = (fuelRes.data || []).map((row: any) => {
        const item = row?.batch?.batch_items?.[0];
        return {
          ...row,
          paystack_fee_ngn: item?.paystack_fee_ngn ?? null,
          paystack_raw:     item?.paystack_raw     ?? null,
        };
      });
      setFuelRequests(enrich(fuelWithFee, lookup));
      setTripLogs(enrich(tripRes.data || [], lookup));
      setActivityLogs(activityRes.data || []);
      setVehicles((vehicleRes.data as VehicleSummary[]) || []);
      const externalPrice: number | null = externalFuelPrice;
      const impliedPrices = ((fleetPricesRes.data as any[]) || [])
        .map((r: any) => r.amount_ngn / r.litres_filled)
        .filter((p: number) => p > 100 && p < 5000);
      const fleetMedian = impliedPrices.length >= 3 ? median(impliedPrices) : null;
      setFuelPriceBenchmark(blendBenchmark(fleetMedian, externalPrice));
    } catch (err) {
      console.error('[Fleet] fetchData failed:', err);
      if (!hasFetchedRef.current) setLoadError(true);
    } finally {
      hasFetchedRef.current = true;
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { lastUpdatedLabel, refresh: manualRefresh } = useAutoRefresh(fetchData);

  // ── Derived data ─────────────────────────────────────────────────────
  const myFuelRequests = useMemo(() => fuelRequests.filter((r) => r.employee_id === profile?.id), [fuelRequests, profile?.id]);
  const myTripLogs = useMemo(() => tripLogs.filter((r) => r.employee_id === profile?.id), [tripLogs, profile?.id]);

  const anomalousTrips = tripLogs.filter((t) => t.is_anomaly || t.is_out_of_area);
  const anomalousFuelReqs = fuelRequests.filter((r) => r.is_anomaly);
  const totalAnomalies = anomalousTrips.length + anomalousFuelReqs.length;

  const pendingFuelCount = fuelRequests.filter((r) => r.status === 'pending').length;
  const activeVehicleCount = vehicles.filter((v) => (v as any).status !== 'retired').length;

  // ── Loading / error gates ─────────────────────────────────────────────
  if (loading) return <TableSkeleton rows={5} />;

  if (loadError) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <div className="text-center space-y-4 max-w-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10">
            <AlertTriangle className="h-7 w-7 text-destructive" />
          </div>
          <h2 className="text-lg font-semibold text-foreground">Fleet data failed to load</h2>
          <p className="text-sm text-muted-foreground">
            There was a problem fetching fleet data. Check your connection and try again.
          </p>
          <button
            onClick={() => { setLoadError(false); setLoading(true); fetchData(); }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 kd-transition"
          >
            <RefreshCw className="h-4 w-4" /> Retry
          </button>
        </div>
      </div>
    );
  }

  // Service alerts (vehicles with expiries within 30 days)
  const todayStr = new Date().toISOString().slice(0, 10);
  const in30Str = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
  const serviceAlerts = isAdmin
    ? vehicles.filter(
        (v) =>
          (v.insurance_expiry && v.insurance_expiry <= in30Str) ||
          (v.road_worthiness_expiry && v.road_worthiness_expiry <= in30Str) ||
          (v.next_service_date && v.next_service_date <= in30Str),
      )
    : [];

  return (
    <div className="space-y-6">
      {/* Mission control hero */}
      <AuroraHero className="p-5 sm:p-6" scanLine={totalAnomalies > 0} pattern="route">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Car className="h-4 w-4 text-muted-foreground" />
              <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Fleet</span>
            </div>
            <h1 className="kd-display text-3xl sm:text-4xl font-bold tracking-tight">
              {totalAnomalies > 0 ? `${totalAnomalies} anomal${totalAnomalies === 1 ? 'y' : 'ies'} flagged` : 'Fleet running smoothly'}
            </h1>
            <p className="text-sm text-muted-foreground mt-1.5">
              {isAdmin
                ? 'Review fuel requests, trip logs, and keep the fleet on the road.'
                : 'Submit fuel requests and daily trip logs.'}
            </p>
          </div>
          {/* Live status pills */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted border border-border text-xs font-medium">
              <Car className="h-3 w-3" /> {activeVehicleCount} active vehicle{activeVehicleCount === 1 ? '' : 's'}
            </span>
            {isAdmin && (
              <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted border border-border text-xs font-medium">
                <Fuel className="h-3 w-3" />
                <span className={`h-1.5 w-1.5 rounded-full ${pendingFuelCount > 0 ? 'bg-amber-300 kd-status-live-warning' : 'bg-emerald-400 kd-status-live-success'}`} />
                {pendingFuelCount} pending fuel
              </span>
            )}
            {totalAnomalies > 0 && (
              <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-500/20 border border-red-300/30 text-xs font-medium">
                <AlertTriangle className="h-3 w-3 text-red-200" />
                <span className="h-1.5 w-1.5 rounded-full bg-red-400 kd-status-live-danger" />
                {totalAnomalies} anomal{totalAnomalies === 1 ? 'y' : 'ies'}
              </span>
            )}
            <button
              type="button"
              onClick={manualRefresh}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted border border-border text-xs font-medium hover:bg-muted/80 transition-colors"
              title="Refresh fleet data"
            >
              <RefreshCw className="h-3 w-3" /> {lastUpdatedLabel}
            </button>
          </div>
        </div>
      </AuroraHero>

      {/* Service alerts banner */}
      {serviceAlerts.length > 0 && (
        <div className="flex flex-col gap-2">
          {serviceAlerts.map((v) => (
            <ServiceAlert key={v.id} v={v} todayStr={todayStr} in30Str={in30Str} />
          ))}
        </div>
      )}

      {/* ─── Horizontal tab strip ─── */}
      <div className="-mx-4 md:-mx-5 lg:-mx-6 px-4 md:px-5 lg:px-6 sticky top-14 z-10 bg-background/95 backdrop-blur-sm border-b border-border/40 -mt-1 pt-1 pb-1.5">
        <div className="overflow-x-auto scrollbar-none">
          <div className="flex items-center gap-0.5 min-w-max">
            {[
              { group: 'overview', items: [
                ...(isAdmin ? [{ icon: LayoutDashboard, label: 'Dashboard', value: 'dashboard' as const }] : []),
                { icon: User, label: 'My Requests', value: 'my_requests' as const },
              ]},
              { group: 'operations', items: [
                ...(isAdmin ? [{ icon: Fuel, label: 'Fuel', value: 'fuel' as const, badge: pendingFuelCount > 0 ? String(pendingFuelCount) : undefined }] : []),
                { icon: MapPin, label: 'Trips', value: 'trips' as const },
                ...(isAdmin ? [
                  { icon: Radio, label: 'Live', value: 'live' as const, live: true },
                  { icon: History, label: 'Activity', value: 'activity' as const },
                ] : []),
              ]},
              { group: 'fleet', items: [
                { icon: Car, label: 'Vehicles', value: 'vehicles' as const },
                ...(isAdmin ? [
                  { icon: Wrench, label: 'Maintenance', value: 'maintenance' as const },
                  { icon: TrendingUp, label: 'Lifecycle', value: 'lifecycle' as const },
                ] : []),
                { icon: ClipboardCheck, label: 'Inspections', value: 'inspections' as const },
                { icon: ClipboardCheck, label: 'Compliance', value: 'compliance' as const },
              ]},
              { group: 'safety', items: [
                ...(isAdmin ? [
                  { icon: AlertTriangle, label: 'Anomalies', value: 'anomalies' as const, badge: totalAnomalies > 0 ? (totalAnomalies > 9 ? '9+' : String(totalAnomalies)) : undefined },
                ] : []),
                { icon: AlertTriangle, label: 'Incidents', value: 'incidents' as const },
                ...(isAdmin ? [
                  { icon: Shield, label: 'Geofences', value: 'geofences' as const },
                  { icon: UserCheck, label: 'Drivers', value: 'drivers' as const },
                ] : []),
              ]},
            ].filter(g => g.items.length > 0).map((group, gi) => (
              <div key={group.group} className="contents">
                {gi > 0 && <span className="w-px h-4 bg-border/60 mx-1 shrink-0" />}
                {group.items.map((item) => {
                  const isActive = tab === item.value;
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => setTab(item.value)}
                      className={cn(
                        'flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all shrink-0',
                        isActive
                          ? 'bg-primary text-primary-foreground shadow-sm'
                          : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground active:bg-muted',
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {(item as any).live && (
                        <span className="relative flex h-1.5 w-1.5 -ml-0.5">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-green-500" />
                        </span>
                      )}
                      <span>{item.label}</span>
                      {(item as any).badge && (
                        <span className="inline-flex items-center justify-center rounded-full text-[9px] font-bold min-w-[16px] h-4 px-1 bg-amber-500 text-white">
                          {(item as any).badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Sub-page back arrow */}
      {tab !== 'dashboard' && tab !== 'my_requests' && (
        <SubPageHeader
          parentTitle="Fleet"
          currentTitle={{
            fuel: 'Fuel Requests', trips: 'Trip Logs', vehicles: 'Vehicles',
            activity: 'Activity', anomalies: 'Anomalies', geofences: 'Geofences',
            live: 'Live Tracking', compliance: 'Compliance', drivers: 'Drivers',
            incidents: 'Incidents', maintenance: 'Maintenance', inspections: 'Inspections',
            lifecycle: 'Lifecycle',
          }[tab] ?? tab}
          onBack={() => setTab(isAdmin ? 'dashboard' : 'my_requests')}
        />
      )}

      {/* ─── Tab content ─── */}
      <div>
        <main className="flex-1 min-w-0">
          {isAdmin && tab === 'dashboard' && (
            <DashboardTab
              vehicles={vehicles}
              staff={staff}
              serviceAlerts={serviceAlerts}
              onNavigate={(t) => setTab(t as FleetTab)}
            />
          )}

          {tab === 'fuel' && (
            <FuelTab
              staff={staff}
              vehicles={vehicles}
              fuelRequests={fuelRequests}
              isAdmin={isAdmin}
              profile={profile}
              onRefresh={fetchData}
            />
          )}

          {tab === 'trips' && (
            <TripsTab
              staff={staff}
              vehicles={vehicles}
              tripLogs={tripLogs}
              isAdmin={isAdmin}
              profile={profile}
              onRefresh={fetchData}
            />
          )}

          {tab === 'my_requests' && (
            <MyRequestsTab
              myFuelRequests={myFuelRequests}
              myTripLogs={myTripLogs}
              vehicles={vehicles}
              profile={profile}
              onNewFuelRequest={() => setTab('fuel')}
              onNewRepairRequest={() => setTab('fuel')}
              onLogExternalPurchase={() => setTab('fuel')}
              onUploadReceipt={() => setTab('fuel')}
              onUploadRepairReceipt={() => setTab('fuel')}
            />
          )}

          {tab === 'activity' && (
            <ActivityTab activityLogs={activityLogs} />
          )}

          {tab === 'anomalies' && (
            <AnomaliesTab
              anomalousTrips={anomalousTrips}
              anomalousFuelReqs={anomalousFuelReqs}
              vehicles={vehicles}
              staff={staff}
              onRefresh={fetchData}
            />
          )}

          {tab === 'vehicles' && <VehiclesTab staff={staff} />}
          {tab === 'geofences' && <GeofencesTab />}
          {tab === 'live' && <LiveTrackingTab />}
          {tab === 'compliance' && <ComplianceDashboard vehicles={vehicles} onUpdated={fetchData} />}
          {tab === 'drivers' && <DriverVerificationPanel />}
          {tab === 'incidents' && <IncidentReportPanel vehicles={vehicles} staff={staff} />}
          {tab === 'maintenance' && <MaintenanceHub />}
          {tab === 'inspections' && <InspectionHistory />}
          {tab === 'lifecycle' && <VehicleLifecyclePanel />}
        </main>
      </div>
    </div>
  );
};

export default Fleet;
