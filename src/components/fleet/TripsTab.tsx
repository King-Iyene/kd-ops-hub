import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { friendlyDbError } from '@/lib/db-errors';
import { logAudit } from '@/lib/audit';
import { notifyRoles } from '@/lib/notify';
import { notifyAnomalyToAdmins } from '@/lib/notify-events';
import { formatNaira, formatDate, formatTime } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  MobileCard,
  MobileCardHeader,
  MobileCardTitle,
  MobileCardFooter,
} from '@/components/ui-kit/MobileCard';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import {
  Loader2, Fuel, MapPin, Plus, Pencil, Trash2, AlertTriangle, Navigation,
  LocateFixed, LocateOff, CheckCircle2, Radio, Map as MapIcon, Gauge, Timer,
  ClipboardCheck, Download,
} from 'lucide-react';
import { useJsApiLoader, GoogleMap, Marker } from '@react-google-maps/api';
import { GOOGLE_MAPS_API_KEY, MAP_OPTIONS, MAPS_LIBRARIES } from '@/lib/maps';
import { scoreAnomalySeverity } from '@/lib/receipts';
import { useToast } from '@/hooks/use-toast';
import TripMapModal, { LocationCell } from '@/components/fleet/TripMapModal';
import { VehicleInspectionForm } from '@/components/fleet/VehicleInspectionForm';
import {
  type FieldStaff,
  type VehicleSummary,
  type TripLog,
  type BreadcrumbRow,
  type TripEvent,
  type GeoCoords,
  type GeoState,
  isGeoError,
  GEO_ERROR_MSG,
  getGeolocation,
  formatCoords,
  formatDuration,
  detectAnomalies,
  exportCsv,
  haversineKm,
  reverseGeocode,
} from '@/lib/fleet-utils';

// ---------------------------------------------------------------------------

function TripVehicleFuel({
  vehicleId, vehicles, kmDriven, litresAdded,
}: {
  vehicleId: string;
  vehicles: VehicleSummary[];
  kmDriven?: number | null;
  litresAdded?: number | null;
}) {
  if (!vehicleId) return null;
  const veh = vehicles.find((v) => v.id === vehicleId);
  if (!veh) return null;

  const cap = veh.tank_capacity_litres || 60;
  const startFuel = Math.min(veh.current_fuel_litres || 0, cap);
  const eff = veh.avg_km_per_litre > 0 ? veh.avg_km_per_litre : null;

  const consumed = kmDriven != null && kmDriven > 0 && eff ? kmDriven / eff : null;
  const added = litresAdded && litresAdded > 0 ? litresAdded : null;
  const hasCalc = consumed != null || added != null;

  const endFuel = hasCalc
    ? Math.min(cap, Math.max(0, startFuel - (consumed ?? 0) + (added ?? 0)))
    : null;

  const toPct = (v: number) => cap > 0 ? Math.round((v / cap) * 100) : 0;
  const barColor = (pct: number) => pct >= 50 ? 'bg-green-500' : pct >= 20 ? 'bg-amber-500' : 'bg-red-500';
  const txtColor = (pct: number) => pct >= 50 ? 'text-green-700' : pct >= 20 ? 'text-amber-700' : 'text-red-700';

  const startPct = toPct(startFuel);
  const endPct = endFuel != null ? toPct(endFuel) : null;

  return (
    <div className="rounded-md border bg-muted/30 p-3 space-y-2 mt-1 text-xs">
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-muted-foreground font-medium">Fuel at start</span>
          <span className={`font-semibold ${txtColor(startPct)}`}>
            {startFuel.toFixed(0)}L / {cap}L ({startPct}%)
          </span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <div className={`h-full rounded-full ${barColor(startPct)}`} style={{ width: `${startPct}%` }} />
        </div>
      </div>

      {consumed != null && (
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Est. consumed ({kmDriven?.toLocaleString()} km ÷ {eff} km/L)</span>
          <span className="text-red-600 font-medium">−{consumed.toFixed(1)}L</span>
        </div>
      )}
      {added != null && (
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Fuel purchased this trip</span>
          <span className="text-green-600 font-medium">+{added.toFixed(1)}L</span>
        </div>
      )}

      {endFuel != null && endPct != null && (
        <div className="pt-1 border-t space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground font-medium">Fuel at end</span>
            <span className={`font-semibold ${txtColor(endPct)}`}>
              {endFuel.toFixed(0)}L / {cap}L ({endPct}%)
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <div className={`h-full rounded-full ${barColor(endPct)}`} style={{ width: `${endPct}%` }} />
          </div>
          {endPct < 20 && (
            <p className="flex items-center gap-1 text-red-600 mt-0.5">
              <AlertTriangle className="h-3 w-3" /> Low fuel after this trip
            </p>
          )}
        </div>
      )}

      {startPct < 20 && !hasCalc && (
        <p className="flex items-center gap-1 text-red-600">
          <AlertTriangle className="h-3 w-3" /> Low fuel — consider refuelling before this trip
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

interface TripsTabProps {
  staff: FieldStaff[];
  vehicles: VehicleSummary[];
  tripLogs: TripLog[];
  isAdmin: boolean;
  profile: any;
  onRefresh: () => void;
}

export function TripsTab({ staff, vehicles, tripLogs, isAdmin, profile, onRefresh }: TripsTabProps) {
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);

  // Trip log form
  const [showTripForm, setShowTripForm] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const [tripForm, setTripForm] = useState({
    employee_id: profile?.id || '',
    vehicle_id: '',
    date: today,
    start_location: '',
    end_location: '',
    odometer_start: '',
    odometer_end: '',
    fuel_amount_ngn: '',
    litres: '',
    issues: '',
  });

  // Real-time trip clock-in
  const [activeTrip, setActiveTrip] = useState<TripLog | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Start Trip dialog
  const [showStartTrip, setShowStartTrip] = useState(false);
  const [startGeoState, setStartGeoState] = useState<GeoState>('idle');
  const [startCoords, setStartCoords] = useState<GeoCoords | null>(null);
  const [startTripForm, setStartTripForm] = useState({ vehicle_id: '', odometer_start: '' });
  const [lastVehicleOdometer, setLastVehicleOdometer] = useState<number | null>(null);
  const [startingTrip, setStartingTrip] = useState(false);

  // Vehicle Inspection (DVIR)
  const [showInspection, setShowInspection] = useState(false);
  const [inspectionVehicleId, setInspectionVehicleId] = useState('');
  const [inspectionVehicleName, setInspectionVehicleName] = useState('');

  // End Trip dialog
  const [showEndTrip, setShowEndTrip] = useState(false);
  const [endGeoState, setEndGeoState] = useState<GeoState>('idle');
  const [endCoords, setEndCoords] = useState<GeoCoords | null>(null);
  const [endTripForm, setEndTripForm] = useState({ odometer_end: '', fuel_amount_ngn: '', litres: '', issues: '' });
  const [endingTrip, setEndingTrip] = useState(false);

  // Post-trip summary
  const [tripSummary, setTripSummary] = useState<{
    distanceKm: number | null; durationMin: number; isAnomaly: boolean; anomalyReason: string | null;
    startLocation: string; endLocation: string;
  } | null>(null);

  // Cancel in-progress trip confirmation
  const [confirmCancelTrip, setConfirmCancelTrip] = useState(false);

  // Live breadcrumb tracking (watchPosition)
  const watchIdRef = useRef<number | null>(null);
  const prevSpeedRef = useRef<number | null>(null);
  const lastBreadcrumbPosRef = useRef<{ lat: number; lng: number } | null>(null);
  const lastBreadcrumbTimeRef = useRef<number>(0);
  const [liveSpeed, setLiveSpeed] = useState<number | null>(null);
  const [lastBreadcrumbAt, setLastBreadcrumbAt] = useState<Date | null>(null);
  const [breadcrumbCount, setBreadcrumbCount] = useState(0);

  // Map view state
  const [viewingTripMap, setViewingTripMap] = useState<TripLog | null>(null);
  const [mapBreadcrumbs, setMapBreadcrumbs] = useState<BreadcrumbRow[]>([]);
  const [mapEvents, setMapEvents] = useState<TripEvent[]>([]);
  const [loadingMapData, setLoadingMapData] = useState(false);

  // Reverse-geocoded human addresses for start/end GPS fixes
  const [startAddress, setStartAddress] = useState<string | null>(null);
  const [endAddress, setEndAddress] = useState<string | null>(null);

  // Google Maps API — loaded once for the Start Trip dialog map
  const { isLoaded: mapsLoaded } = useJsApiLoader({ id: 'kd-gmaps', googleMapsApiKey: GOOGLE_MAPS_API_KEY, libraries: MAPS_LIBRARIES });
  // Draggable pin position in the Start Trip map — starts at GPS fix, can be adjusted
  const [startPinnedCoords, setStartPinnedCoords] = useState<{ lat: number; lng: number } | null>(null);
  // Sync GPS fix → pin whenever a fresh fix arrives
  useEffect(() => {
    if (startCoords) setStartPinnedCoords({ lat: startCoords.lat, lng: startCoords.lng });
  }, [startCoords]);

  useEffect(() => {
    // keep form employee_id in sync with the logged-in user
    setTripForm((f) => ({ ...f, employee_id: profile?.id || '' }));
  }, [profile?.id]);

  // Recover any in-progress trip for this employee when their profile loads.
  useEffect(() => {
    if (!profile?.id) return;
    (async () => {
      const { data } = await supabase
        .from('trip_logs').select('id, driver_id, trip_start_time, vehicle_id, odometer_start, start_location, start_lat, start_lng, status')
        .eq('driver_id', profile.id)
        .eq('status', 'in_progress')
        .limit(1).maybeSingle();
      if (data) {
        setActiveTrip({
          ...data,
          employee_id: data.driver_id,
          employee_name: profile.full_name || '',
        } as unknown as TripLog);
      } else {
        setActiveTrip(null);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  // Elapsed-time counter — computed from wall clock so tab throttling can't cause drift.
  useEffect(() => {
    if (!activeTrip?.trip_start_time) { setElapsedSeconds(0); return; }
    const startMs = Date.parse(activeTrip.trip_start_time);
    const tick = () => setElapsedSeconds(Math.floor((Date.now() - startMs) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    const onVisibility = () => { if (!document.hidden) tick(); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVisibility); };
  }, [activeTrip?.trip_start_time]);

  // Live breadcrumb tracking — runs for the lifetime of an active trip.
  // Inserts GPS pings to trip_breadcrumbs and driving events to trip_events.
  useEffect(() => {
    const tripId = activeTrip?.id ?? null;

    if (!tripId) {
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      prevSpeedRef.current = null;
      lastBreadcrumbPosRef.current = null;
      lastBreadcrumbTimeRef.current = 0;
      setLiveSpeed(null);
      setLastBreadcrumbAt(null);
      setBreadcrumbCount(0);
      return;
    }

    if (!navigator.geolocation) return;

    const MIN_DIST_KM = 0.030;    // 30 m — minimum genuine movement before saving
    const MAX_ACCURACY_M = 50;    // discard fixes worse than 50 m — pure GPS noise
    const MIN_INTERVAL_MS = 20_000; // 20 s — max periodic save rate when moving slowly
    const STOP_THRESHOLD_MS = 5 * 60_000; // 5 min — flag as extended stop
    const SPEED_THRESHOLD_KMH = 100;
    const HARD_BRAKE_DROP_KMH = 40;

    const onPosition = (pos: GeolocationPosition) => {
      const { latitude: lat, longitude: lng, accuracy, speed, heading } = pos.coords;

      // Drop fixes where the GPS circle is larger than our movement threshold —
      // any "movement" within that circle is indistinguishable from sensor noise.
      if (accuracy != null && accuracy > MAX_ACCURACY_M) return;

      const speedKmh = speed != null && speed >= 0 ? speed * 3.6 : null;
      setLiveSpeed(speedKmh != null ? Math.round(speedKmh) : null);

      const now = Date.now();
      const prevPos = lastBreadcrumbPosRef.current;
      const distMoved = prevPos ? haversineKm(prevPos.lat, prevPos.lng, lat, lng) : Infinity;
      const msSinceLast = now - lastBreadcrumbTimeRef.current;

      const hasMovedEnough = distMoved >= MIN_DIST_KM;
      // Periodic save only fires when actually moving — prevents stationary jitter pings.
      const isActuallyMoving = speedKmh == null || speedKmh > 3;
      const timeThresholdMet = msSinceLast >= MIN_INTERVAL_MS && isActuallyMoving;
      const isExtendedStop = !hasMovedEnough && msSinceLast >= STOP_THRESHOLD_MS;

      if (!hasMovedEnough && !timeThresholdMet) return;

      lastBreadcrumbPosRef.current = { lat, lng };
      lastBreadcrumbTimeRef.current = now;
      setLastBreadcrumbAt(new Date());
      setBreadcrumbCount((n) => n + 1);

      const isSpeeding = speedKmh != null && speedKmh > SPEED_THRESHOLD_KMH;
      const isHardBraking =
        speedKmh != null &&
        prevSpeedRef.current != null &&
        prevSpeedRef.current - speedKmh >= HARD_BRAKE_DROP_KMH;

      prevSpeedRef.current = speedKmh;

      // Insert breadcrumb (fire-and-forget — errors are non-critical)
      supabase.from('trip_breadcrumbs').insert({
        trip_id: tripId, lat, lng,
        accuracy: accuracy ?? null,
        speed_kmh: speedKmh,
        heading: heading ?? null,
        is_speeding: isSpeeding,
      }).then(() => {}, () => {});

      // Collect events to batch-insert
      const evts: Array<{ event_type: string; speed_kmh: number | null; details: string }> = [];
      if (isSpeeding) evts.push({
        event_type: 'speeding',
        speed_kmh: speedKmh,
        details: `${Math.round(speedKmh!)} km/h — exceeds ${SPEED_THRESHOLD_KMH} km/h threshold`,
      });
      if (isHardBraking) evts.push({
        event_type: 'hard_braking',
        speed_kmh: speedKmh,
        details: `Speed dropped from ${Math.round(prevSpeedRef.current ?? 0)} to ${Math.round(speedKmh!)} km/h`,
      });
      if (isExtendedStop) evts.push({
        event_type: 'extended_stop',
        speed_kmh: speedKmh,
        details: `Vehicle stationary for ${Math.round(msSinceLast / 60_000)} minutes`,
      });

      if (evts.length > 0) {
        supabase.from('trip_events').insert(
          evts.map((ev) => ({ ...ev, trip_id: tripId, lat, lng })),
        ).then(() => {}, () => {});
      }
    };

    watchIdRef.current = navigator.geolocation.watchPosition(
      onPosition,
      () => { /* silent — live tracking is best-effort */ },
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 5_000 },
    );

    return () => {
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };

  }, [activeTrip?.id]);

  // ---- Trip clock-in helpers ----

  const prefillOdometer = async (employeeId: string) => {
    if (!employeeId) return;
    const { data } = await supabase
      .from('trip_logs')
      .select('odometer_end')
      .eq('driver_id', employeeId)
      .not('odometer_end', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1);
    if (data?.[0]?.odometer_end) {
      setTripForm((f) => ({ ...f, odometer_start: String(data[0].odometer_end) }));
    }
  };

  const fetchLastOdometer = async (employeeId: string): Promise<string> => {
    const { data } = await supabase
      .from('trip_logs').select('odometer_end')
      .eq('driver_id', employeeId)
      .not('odometer_end', 'is', null)
      .neq('status', 'in_progress')
      .order('created_at', { ascending: false }).limit(1);
    return data?.[0]?.odometer_end != null ? String(data[0].odometer_end) : '';
  };

  const acquireGeo = (
    setState: (s: GeoState) => void,
    setCoords: (c: GeoCoords | null) => void,
    onAddress?: (addr: string) => void,
  ) => {
    setState('acquiring');
    setCoords(null);
    getGeolocation()
      .then((c) => {
        setCoords(c);
        setState('ok');
        if (onAddress) {
          reverseGeocode(c.lat, c.lng).then((a) => { if (a) onAddress(a); }).catch(() => {});
        }
      })
      .catch((code) => { setState(code as GeoState); });
  };

  const openStartTrip = () => {
    setShowStartTrip(true);
    setStartCoords(null);
    setStartAddress(null);
    setStartPinnedCoords(null);
    setStartTripForm({ vehicle_id: '', odometer_start: '' });
    setLastVehicleOdometer(null);
    setStartGeoState('idle');
    acquireGeo(setStartGeoState, setStartCoords, (addr) => {
      setStartAddress(addr);
    });
    if (profile?.id) {
      fetchLastOdometer(profile.id).then((v) =>
        setStartTripForm((f) => ({ ...f, odometer_start: v })),
      );
    }
  };

  const handleStartTrip = async () => {
    if (!startTripForm.vehicle_id) {
      toast({ title: 'Vehicle is required', description: 'Please select a vehicle before starting a trip.', variant: 'destructive' });
      return;
    }
    const odoStart = parseFloat(startTripForm.odometer_start);
    if (!Number.isFinite(odoStart) || odoStart < 0) {
      toast({ title: 'Start odometer reading is required', variant: 'destructive' });
      return;
    }
    const pinCoords = startPinnedCoords ?? startCoords;
    setStartingTrip(true);
    // If geocoding hasn't resolved yet, wait up to 5 s before falling back to coordinates.
    let resolvedStartAddr = startAddress;
    if (!resolvedStartAddr && pinCoords) {
      try {
        resolvedStartAddr = await Promise.race<string | null>([
          reverseGeocode(pinCoords.lat, pinCoords.lng).catch(() => null),
          new Promise<null>((r) => setTimeout(() => r(null), 5_000)),
        ]);
      } catch { resolvedStartAddr = null; }
    }
    const locationStr = pinCoords ? (resolvedStartAddr || formatCoords(pinCoords.lat, pinCoords.lng)) : '';
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('trip_logs')
      .insert({
        driver_id: profile?.id,
        vehicle_id: startTripForm.vehicle_id || null,
        date: now.slice(0, 10),
        trip_start_time: now,
        start_location: locationStr,
        start_lat: pinCoords?.lat ?? null,
        start_lng: pinCoords?.lng ?? null,
        odometer_start: odoStart,
        status: 'in_progress',
        end_location: '',
      })
      .select('id, driver_id, trip_start_time, vehicle_id, odometer_start, start_location, start_lat, start_lng, status').single();
    setStartingTrip(false);
    if (error) {
      toast({ title: 'Failed to start trip', description: error.message, variant: 'destructive' });
      return;
    }
    setActiveTrip({ ...data, employee_id: data.driver_id, employee_name: profile?.full_name || '' } as unknown as TripLog);
    setShowStartTrip(false);
    await logAudit('trip_started', `Trip started at ${locationStr || 'unknown location'} (odometer: ${odoStart.toLocaleString()} km)`, profile);
    const startVeh = vehicles.find((v) => v.id === startTripForm.vehicle_id);
    await notifyRoles({
      roles: ['super_admin', 'admin', 'operations'],
      type: 'trip_started',
      module: 'fleet',
      title: `${profile?.full_name || 'An employee'} started a trip`,
      body: `${startVeh ? startVeh.plate_number + ' · ' : ''}From: ${locationStr || 'unknown location'} · Odometer: ${odoStart.toLocaleString()} km`,
    });
    toast({ title: 'Trip started', description: 'Tap "End Trip" when you arrive at your destination.' });
    onRefresh();
  };

  const openEndTrip = () => {
    setShowEndTrip(true);
    setEndCoords(null);
    setEndAddress(null);
    setEndTripForm({ odometer_end: '', fuel_amount_ngn: '', litres: '', issues: '' });
    setEndGeoState('idle');
    acquireGeo(setEndGeoState, setEndCoords, (addr) => {
      setEndAddress(addr);
    });
  };

  const handleEndTrip = async () => {
    if (!activeTrip) return;
    const odoEnd = parseFloat(endTripForm.odometer_end);
    if (!Number.isFinite(odoEnd) || odoEnd < 0) {
      toast({ title: 'End odometer reading is required', variant: 'destructive' });
      return;
    }
    setEndingTrip(true);
    // If geocoding hasn't resolved yet, wait up to 5 s before falling back to coordinates.
    let resolvedEndAddr = endAddress;
    if (!resolvedEndAddr && endCoords) {
      try {
        resolvedEndAddr = await Promise.race<string | null>([
          reverseGeocode(endCoords.lat, endCoords.lng).catch(() => null),
          new Promise<null>((r) => setTimeout(() => r(null), 5_000)),
        ]);
      } catch { resolvedEndAddr = null; }
    }
    const endLocationStr = endCoords ? (resolvedEndAddr || formatCoords(endCoords.lat, endCoords.lng)) : '';
    const now = new Date();
    const startMs = activeTrip.trip_start_time ? Date.parse(activeTrip.trip_start_time) : Date.now();
    const durationMin = Math.max(0, Math.round((now.getTime() - startMs) / 60_000));
    const distanceKm = activeTrip.odometer_start != null ? odoEnd - activeTrip.odometer_start : null;
    const { isAnomaly, reason: anomalyReason } = detectAnomalies(distanceKm, durationMin);

    // RULE 4: out-of-area detection
    const tripVeh = activeTrip.vehicle_id ? vehicles.find((v) => v.id === activeTrip.vehicle_id) : null;
    let isOutOfArea = false;
    if (endCoords && tripVeh?.home_base_lat != null && tripVeh?.home_base_lng != null) {
      const distFromBase = haversineKm(endCoords.lat, endCoords.lng, tripVeh.home_base_lat, tripVeh.home_base_lng);
      if (distFromBase > 100) isOutOfArea = true;
    }

    const { error } = await supabase
      .from('trip_logs')
      .update({
        trip_end_time: now.toISOString(),
        duration_minutes: durationMin,
        end_location: endLocationStr,
        end_lat: endCoords?.lat ?? null,
        end_lng: endCoords?.lng ?? null,
        odometer_end: odoEnd,
        km_driven: distanceKm,
        fuel_amount_ngn: parseFloat(endTripForm.fuel_amount_ngn) || null,
        litres: parseFloat(endTripForm.litres) || null,
        issues: endTripForm.issues || null,
        status: 'completed',
        is_anomaly: isAnomaly,
        anomaly_reason: anomalyReason,
        is_out_of_area: isOutOfArea,
      })
      .eq('id', activeTrip.id);
    setEndingTrip(false);
    if (error) {
      toast({ title: 'Failed to end trip', description: error.message, variant: 'destructive' });
      return;
    }

    // RULE 1: notify admins on trip anomaly with severity-based escalation
    if (isAnomaly && anomalyReason) {
      const tripFlagTypes = anomalyReason.split('; ').map((r) => {
        if (r.includes('backwards')) return 'odometer_regression';
        if (r.includes('500 km')) return 'excessive_distance';
        if (r.includes('12 hours')) return 'excessive_duration';
        if (r.includes('Implausibly')) return 'implausible_trip';
        if (r.includes('No distance')) return 'stationary_trip';
        if (r.includes('150 km/h')) return 'excessive_speed';
        return 'trip_anomaly';
      });
      const tripSeverity = scoreAnomalySeverity(tripFlagTypes);
      await notifyRoles({
        roles: ['super_admin', 'admin', 'operations'],
        type: 'trip_anomaly',
        module: 'fleet',
        priority: tripSeverity === 'critical' || tripSeverity === 'high' ? 'high' : 'normal',
        title: `Trip anomaly (${tripSeverity})`,
        body: anomalyReason,
      });
      if (tripSeverity === 'high' || tripSeverity === 'critical') {
        void notifyAnomalyToAdmins({
          title: `Fleet anomaly: ${tripSeverity} severity on trip`,
          summary: `${profile?.full_name || 'Employee'}: ${anomalyReason}`,
          severity: tripSeverity,
          link: `${window.location.origin}/fleet`,
        });
      }
    }

    // RULE 4: notify admins when vehicle ends trip far from home base
    if (isOutOfArea && tripVeh) {
      await notifyRoles({
        roles: ['super_admin', 'admin', 'operations'],
        type: 'trip_out_of_area',
        module: 'fleet',
        title: `${tripVeh.plate_number} out-of-area trip end`,
        body: `${tripVeh.plate_number} ended a trip more than 100 km from its home base.`,
      });
    }

    // Routine trip completion notification — always sent so admins see every trip close
    {
      const completionVeh = tripVeh || (activeTrip.vehicle_id ? vehicles.find((v) => v.id === activeTrip.vehicle_id) : null);
      const distStr = distanceKm != null ? `${distanceKm.toFixed(0)} km` : null;
      const durStr = `${Math.floor(durationMin / 60)}h ${durationMin % 60}m`;
      await notifyRoles({
        roles: ['super_admin', 'admin', 'operations'],
        type: 'trip_completed',
        module: 'fleet',
        title: `${profile?.full_name || 'Employee'} completed a trip${isAnomaly ? ' ⚠' : ''}`,
        body: [
          completionVeh?.plate_number,
          distStr,
          durStr,
          endLocationStr ? `→ ${endLocationStr}` : null,
        ].filter(Boolean).join(' · '),
      });
    }

    // Update vehicle fuel balance — CHANGE 1
    if (activeTrip.vehicle_id) {
      const veh = vehicles.find((v) => v.id === activeTrip.vehicle_id);
      if (veh) {
        const litresPurchased = parseFloat(endTripForm.litres) || 0;
        // Prefer fuel_consumption_rate_lkm (L/km); fall back to 1/avg_km_per_litre
        const rate = veh.fuel_consumption_rate_lkm > 0
          ? veh.fuel_consumption_rate_lkm
          : (veh.avg_km_per_litre > 0 ? 1 / veh.avg_km_per_litre : null);
        const consumed = distanceKm && distanceKm > 0 && rate ? distanceKm * rate : 0;
        const netDelta = -consumed + litresPurchased;
        const { data: newLevel, error: fuelLevelErr } = await supabase.rpc('adjust_vehicle_fuel_level', {
          p_vehicle_id: veh.id,
          p_delta_litres: netDelta,
          p_last_refuel_at: litresPurchased > 0 ? now.toISOString() : null,
        });
        if (fuelLevelErr) {
          toast({ title: 'Fuel level sync failed', description: fuelLevelErr.message, variant: 'destructive' });
        }
        const resultLevel = newLevel ?? Math.max(0, (veh.current_fuel_litres || 0) + netDelta);
        if (consumed > 0) {
          await supabase.from('fuel_level_logs').insert({
            vehicle_id: veh.id,
            event_type: 'trip_consumed',
            amount_litres: consumed,
            resulting_level_litres: Math.max(0, resultLevel - litresPurchased),
            reference_id: activeTrip.id,
          });
        }
        if (litresPurchased > 0) {
          await supabase.from('fuel_level_logs').insert({
            vehicle_id: veh.id,
            event_type: 'fuel_added',
            amount_litres: litresPurchased,
            resulting_level_litres: resultLevel,
            reference_id: activeTrip.id,
          });
        }
        if (consumed > (veh.current_fuel_litres || 0)) {
          await notifyRoles({
            roles: ['super_admin', 'admin', 'operations'],
            type: 'fuel_level_critical',
            module: 'fleet',
            title: `${veh.plate_number} fuel may be empty`,
            body: `${veh.plate_number} fuel level may be empty — last trip consumed more than estimated remaining fuel.`,
          });
        }
      }
    }
    await logAudit(
      'trip_ended',
      `Trip ended at ${endLocationStr || 'unknown location'} — ${distanceKm?.toLocaleString() ?? '—'} km in ${durationMin} min${isAnomaly ? ' ⚠ ANOMALY' : ''}`,
      profile,
    );
    setTripSummary({ distanceKm, durationMin, isAnomaly, anomalyReason, startLocation: activeTrip.start_location || '—', endLocation: endLocationStr || '—' });
    setActiveTrip(null);
    setShowEndTrip(false);
    // Fire smart-alerts (best-effort — no await so UI closes instantly)
    if (activeTrip.vehicle_id) {
      supabase.functions.invoke('fleet-alerts', {
        body: { event: 'trip_ended', vehicle_id: activeTrip.vehicle_id },
      }).catch(() => {/* best-effort */});
    }

    // Maintenance proximity alerts — check after every trip
    if (activeTrip.vehicle_id) {
      const { data: mainItems } = await supabase
        .from('vehicle_maintenance')
        .select('due_date, service_type, due_mileage_km')
        .eq('vehicle_id', activeTrip.vehicle_id)
        .neq('status', 'done');
      const maintVeh = vehicles.find((v) => v.id === activeTrip.vehicle_id);
      const plate = maintVeh?.plate_number ?? 'Vehicle';
      const todayMs = Date.now();
      for (const item of mainItems || []) {
        if (item.due_date) {
          const daysUntil = Math.ceil((new Date(item.due_date).getTime() - todayMs) / 86_400_000);
          if (daysUntil >= 0 && daysUntil <= 7) {
            await notifyRoles({
              roles: ['super_admin', 'admin', 'operations'],
              type: 'maintenance_due_soon',
              module: 'fleet',
              priority: 'high',
              title: `⚠️ ${plate}: ${item.service_type} due in ${daysUntil} day${daysUntil !== 1 ? 's' : ''}`,
              body: `${plate}: ${item.service_type} is due in ${daysUntil} day${daysUntil !== 1 ? 's' : ''} (due ${formatDate(item.due_date)}).`,
            });
          }
        }
        if (item.due_mileage_km != null && Number.isFinite(odoEnd)) {
          const kmRemaining = item.due_mileage_km - odoEnd;
          if (kmRemaining >= 0 && kmRemaining <= 500) {
            await notifyRoles({
              roles: ['super_admin', 'admin', 'operations'],
              type: 'maintenance_due_km',
              module: 'fleet',
              priority: 'high',
              title: `⚠️ ${plate}: ${item.service_type} due in ~${Math.round(kmRemaining)} km`,
              body: `${plate}: ${item.service_type} due in ~${Math.round(kmRemaining)} km (current: ${Math.round(odoEnd).toLocaleString()} km, due at: ${item.due_mileage_km.toLocaleString()} km).`,
            });
          }
        }
      }
    }

    onRefresh();
  };

  const handleCancelActiveTrip = async () => {
    if (!activeTrip) return;
    const { error } = await supabase.from('trip_logs').delete().eq('id', activeTrip.id);
    if (error) { toast({ title: 'Failed to cancel trip', description: error.message, variant: 'destructive' }); return; }
    await logAudit('trip_cancelled', 'In-progress trip cancelled and removed', profile);
    setActiveTrip(null);
    setConfirmCancelTrip(false);
    toast({ title: 'Trip cancelled' });
  };

  const openTripMap = async (t: TripLog) => {
    setViewingTripMap(t);
    setLoadingMapData(true);
    setMapBreadcrumbs([]);
    setMapEvents([]);
    const [bcRes, evRes] = await Promise.all([
      supabase.from('trip_breadcrumbs').select('lat, lng, speed_kmh, recorded_at').eq('trip_id', t.id).order('recorded_at'),
      supabase.from('trip_events').select('id, lat, lng, event_type, details, recorded_at').eq('trip_id', t.id).order('recorded_at'),
    ]);
    setMapBreadcrumbs((bcRes.data as BreadcrumbRow[]) || []);
    setMapEvents((evRes.data as TripEvent[]) || []);
    setLoadingMapData(false);
  };

  // ---- End trip clock-in helpers ----

  const submitTripLog = async () => {
    if (!tripForm.employee_id) {
      toast({ title: 'Select an employee', variant: 'destructive' });
      return;
    }
    // Block future-dated trip logs — common typo and breaks reporting.
    if (tripForm.date) {
      const todayStr = new Date().toISOString().slice(0, 10);
      if (tripForm.date > todayStr) {
        toast({ title: 'Trip date cannot be in the future', variant: 'destructive' });
        return;
      }
    }
    const start = parseFloat(tripForm.odometer_start);
    const end = parseFloat(tripForm.odometer_end);
    if (Number.isFinite(start) && Number.isFinite(end) && end < start) {
      toast({ title: 'Invalid odometer', description: 'End reading must be ≥ start reading.', variant: 'destructive' });
      return;
    }
    const km = Number.isFinite(end - start) && tripForm.odometer_start && tripForm.odometer_end ? end - start : null;
    setSubmitting(true);
    const { error } = await supabase.from('trip_logs').insert({
      driver_id: tripForm.employee_id,
      vehicle_id: tripForm.vehicle_id || null,
      date: tripForm.date,
      start_location: tripForm.start_location,
      end_location: tripForm.end_location,
      odometer_start: Number.isFinite(start) ? start : null,
      odometer_end: Number.isFinite(end) ? end : null,
      km_driven: km,
      fuel_amount_ngn: parseFloat(tripForm.fuel_amount_ngn) || null,
      litres: parseFloat(tripForm.litres) || null,
      issues: tripForm.issues || null,
    });
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      if (tripForm.vehicle_id) {
        const veh = vehicles.find((v) => v.id === tripForm.vehicle_id);
        if (veh) {
          const eff = veh.avg_km_per_litre > 0 ? veh.avg_km_per_litre : null;
          const consumed = km && km > 0 && eff ? km / eff : 0;
          const litresPurchased = parseFloat(tripForm.litres) || 0;
          const netDelta = -consumed + litresPurchased;
          const { error: tripFuelErr } = await supabase.rpc('adjust_vehicle_fuel_level', {
            p_vehicle_id: veh.id,
            p_delta_litres: netDelta,
            p_last_refuel_at: litresPurchased > 0 ? new Date().toISOString() : null,
          });
          if (tripFuelErr) {
            toast({ title: 'Fuel level sync failed', description: tripFuelErr.message, variant: 'destructive' });
          }
        }
      }
      await logAudit(
        'trip_log_submitted',
        `Trip log ${tripForm.start_location} → ${tripForm.end_location} (${km ?? '—'} km)`,
        profile,
      );
      toast({ title: 'Trip log submitted' });
      setShowTripForm(false);
      setTripForm({
        employee_id: profile?.id || '',
        vehicle_id: '',
        date: today,
        start_location: '',
        end_location: '',
        odometer_start: '',
        odometer_end: '',
        fuel_amount_ngn: '',
        litres: '',
        issues: '',
      });
      onRefresh();
    }
    setSubmitting(false);
  };

  const [confirmDeleteTrip, setConfirmDeleteTrip] = useState<TripLog | null>(null);

  // Trip log detail / edit
  const canEditTrip = profile?.role === 'admin' || profile?.role === 'super_admin';
  const [selectedTrip, setSelectedTrip] = useState<TripLog | null>(null);
  const [tripEditMode, setTripEditMode] = useState(false);
  const [savingTripEdit, setSavingTripEdit] = useState(false);
  const [tripEditForm, setTripEditForm] = useState({
    date: '',
    start_location: '',
    end_location: '',
    odometer_start: '',
    odometer_end: '',
    fuel_amount_ngn: '',
    litres: '',
    issues: '',
  });

  const openTripDetail = (t: TripLog) => {
    setSelectedTrip(t);
    setTripEditMode(false);
    setTripEditForm({
      date: t.date,
      start_location: t.start_location,
      end_location: t.end_location,
      odometer_start: t.odometer_start != null ? String(t.odometer_start) : '',
      odometer_end: t.odometer_end != null ? String(t.odometer_end) : '',
      fuel_amount_ngn: t.fuel_amount_ngn != null ? String(t.fuel_amount_ngn) : '',
      litres: t.litres != null ? String(t.litres) : '',
      issues: t.issues || '',
    });
  };

  const saveTripEdit = async () => {
    if (!selectedTrip) return;
    const start = parseFloat(tripEditForm.odometer_start);
    const end = parseFloat(tripEditForm.odometer_end);
    const hasOdo = Number.isFinite(start) && Number.isFinite(end) && tripEditForm.odometer_start && tripEditForm.odometer_end;
    const km = hasOdo ? end - start : selectedTrip.km_driven;
    const newLitres = parseFloat(tripEditForm.litres) || null;

    // Re-run anomaly detection whenever odometer values change
    const { isAnomaly: editIsAnomaly, reason: editAnomalyReason } = (hasOdo && km != null)
      ? detectAnomalies(km, selectedTrip.duration_minutes || 0)
      : { isAnomaly: selectedTrip.is_anomaly, reason: selectedTrip.anomaly_reason };

    setSavingTripEdit(true);
    const { error } = await supabase
      .from('trip_logs')
      .update({
        date: tripEditForm.date,
        start_location: tripEditForm.start_location,
        end_location: tripEditForm.end_location,
        odometer_start: Number.isFinite(start) ? start : null,
        odometer_end: Number.isFinite(end) ? end : null,
        km_driven: km,
        fuel_amount_ngn: parseFloat(tripEditForm.fuel_amount_ngn) || null,
        litres: newLitres,
        issues: tripEditForm.issues || null,
        is_anomaly: editIsAnomaly,
        anomaly_reason: editAnomalyReason,
      })
      .eq('id', selectedTrip.id);
    setSavingTripEdit(false);
    if (error) {
      toast({ title: 'Could not save', description: friendlyDbError(error), variant: 'destructive' });
    } else {
      // Recalculate vehicle fuel balance when litres or distance changed
      const kmChanged = km !== selectedTrip.km_driven;
      const litresChanged = newLitres !== selectedTrip.litres;
      if (selectedTrip.vehicle_id && (kmChanged || litresChanged)) {
        const veh = vehicles.find((v) => v.id === selectedTrip.vehicle_id);
        if (veh) {
          const rate = veh.fuel_consumption_rate_lkm > 0
            ? veh.fuel_consumption_rate_lkm
            : veh.avg_km_per_litre > 0 ? 1 / veh.avg_km_per_litre : null;
          const origConsumed = selectedTrip.km_driven && selectedTrip.km_driven > 0 && rate ? selectedTrip.km_driven * rate : 0;
          const newConsumed  = km && km > 0 && rate ? km * rate : 0;
          const origBought   = selectedTrip.litres || 0;
          const newBought    = newLitres || 0;
          const delta = (-newConsumed + newBought) - (-origConsumed + origBought);
          if (Math.abs(delta) > 0.01) {
            const { data: newBalance, error: adjErr } = await supabase.rpc('adjust_vehicle_fuel_level', {
              p_vehicle_id: veh.id,
              p_delta_litres: delta,
            });
            if (adjErr) {
              toast({ title: 'Fuel level sync failed', description: adjErr.message, variant: 'destructive' });
            }
            await logAudit(
              'trip_fuel_adjusted',
              `Trip edit adjusted ${veh.plate_number} fuel balance by ${delta > 0 ? '+' : ''}${delta.toFixed(1)} L (now ${(newBalance ?? 0).toFixed(1)} L)`,
              profile,
            );
          }
        }
      }
      toast({ title: 'Trip log updated' });
      setSelectedTrip(null);
      setTripEditMode(false);
      onRefresh();
    }
  };

  const deleteTripLog = async (t: TripLog) => {
    const { error } = await supabase.from('trip_logs').delete().eq('id', t.id);
    if (error) {
      toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
      return;
    }
    await logAudit('trip_log_deleted', `Trip log deleted: ${t.start_location} → ${t.end_location}`, profile);
    toast({ title: 'Trip log deleted' });
    setConfirmDeleteTrip(null);
    onRefresh();
  };

  // ---- Derived values ----

  const myTripLogs = useMemo(() => tripLogs.filter((r) => r.employee_id === profile?.id), [tripLogs, profile?.id]);
  const visibleTrips = isAdmin ? tripLogs : myTripLogs;

  const fleetAvgEfficiency = (() => {
    let totalKm = 0;
    let totalLitres = 0;
    for (const t of visibleTrips) {
      if (t.km_driven && t.litres && t.km_driven > 0 && t.litres > 0) {
        totalKm += t.km_driven;
        totalLitres += t.litres;
      }
    }
    return totalLitres > 0 ? (totalKm / totalLitres).toFixed(1) : null;
  })();

  return (
    <>
      <div className="space-y-4">
        <div className="flex justify-end gap-2 flex-wrap">
          {isAdmin && visibleTrips.length > 0 && (
            <Button variant="outline" size="sm" onClick={() => exportCsv(
              visibleTrips.map((t) => ({
                date: t.date,
                employee: t.employee_name,
                vehicle: vehicles.find((v) => v.id === t.vehicle_id)?.plate_number ?? '',
                start_time: t.trip_start_time ?? '',
                end_time: t.trip_end_time ?? '',
                duration_min: t.duration_minutes ?? '',
                start_location: t.start_location,
                end_location: t.end_location,
                km_driven: t.km_driven ?? '',
                fuel_ngn: t.fuel_amount_ngn ?? '',
                litres: t.litres ?? '',
                status: t.status,
                is_anomaly: t.is_anomaly ? 'yes' : '',
                is_out_of_area: t.is_out_of_area ? 'yes' : '',
                anomaly_reason: t.anomaly_reason ?? '',
              })),
              `trip-logs-${new Date().toISOString().slice(0, 10)}.csv`,
            )}>
              <Download className="mr-2 h-4 w-4" /> Export CSV
            </Button>
          )}
          {!activeTrip && (
            <Button
              className="bg-green-600 hover:bg-green-700 text-white"
              onClick={openStartTrip}
            >
              <Navigation className="h-4 w-4 mr-2" /> Start Trip
            </Button>
          )}
          <Button variant="outline" onClick={() => { setShowTripForm(true); prefillOdometer(profile?.id || ''); }}>
            <Plus className="mr-2 h-4 w-4" /> Log Trip Manually
          </Button>
        </div>

        {/* Active trip card — live clock-in panel */}
        {activeTrip && (
          <div className="rounded-lg border-2 border-green-500 bg-green-50 dark:border-green-700 dark:bg-green-950/20 p-4 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Radio className="h-4 w-4 text-green-600 animate-pulse shrink-0" />
                <span className="font-semibold text-green-800 dark:text-green-300 text-sm">Trip In Progress</span>
              </div>
              <div className="flex items-center gap-4">
                {liveSpeed != null && (
                  <div className="flex items-center gap-1 text-sm">
                    <Gauge className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className={`font-mono font-bold tabular-nums ${
                      liveSpeed > 100 ? 'text-red-600' : liveSpeed > 80 ? 'text-amber-600' : 'text-green-700 dark:text-green-400'
                    }`}>
                      {liveSpeed} km/h
                    </span>
                  </div>
                )}
                <span className="text-2xl font-mono font-bold text-green-700 dark:text-green-400 tabular-nums">
                  {formatDuration(elapsedSeconds)}
                </span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Started</p>
                <p className="font-medium">{activeTrip.trip_start_time ? formatDate(activeTrip.trip_start_time) : '—'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Vehicle</p>
                <p className="font-medium">{vehicles.find((v) => v.id === activeTrip.vehicle_id)?.name || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Start Location</p>
                <div className="text-xs">
                  <LocationCell location={activeTrip.start_location || ''} lat={activeTrip.start_lat} lng={activeTrip.start_lng} showCoords />
                </div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Start Odometer</p>
                <p className="font-medium">{activeTrip.odometer_start != null ? `${activeTrip.odometer_start.toLocaleString()} km` : '—'}</p>
              </div>
              {(() => {
                const av = vehicles.find((v) => v.id === activeTrip.vehicle_id);
                if (!av || !av.tank_capacity_litres) return null;
                const pct = Math.round(Math.min(100, (av.current_fuel_litres / av.tank_capacity_litres) * 100));
                const col = pct < 25 ? 'text-red-600' : pct < 50 ? 'text-amber-600' : 'text-green-700 dark:text-green-400';
                return (
                  <div className="col-span-2">
                    <p className="text-xs text-muted-foreground mb-1">Fuel Level</p>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${pct < 25 ? 'bg-red-500' : pct < 50 ? 'bg-amber-500' : 'bg-green-500'}`} style={{ width: `${pct}%` }} />
                      </div>
                      <span className={`text-xs font-medium tabular-nums shrink-0 ${col}`}>
                        {pct}% · {av.current_fuel_litres.toFixed(1)} L
                        {pct < 25 && ' ⚠'}
                      </span>
                    </div>
                  </div>
                );
              })()}
            </div>
            {/* Live GPS tracking status */}
            {lastBreadcrumbAt && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground border-t border-green-200 dark:border-green-800 pt-2">
                <Radio className="h-3 w-3 text-green-500 animate-pulse shrink-0" />
                <span>
                  GPS tracking active · Last ping {formatTime(lastBreadcrumbAt)} · {breadcrumbCount} pings recorded
                </span>
              </div>
            )}
            <div className="flex gap-2 pt-1 border-t border-green-200 dark:border-green-800">
              <Button className="flex-1 bg-green-600 hover:bg-green-700 text-white" onClick={openEndTrip}>
                <Navigation className="h-4 w-4 mr-2 rotate-180" /> End Trip
              </Button>
              <Button variant="ghost" size="sm" className="text-xs text-muted-foreground hover:text-destructive" onClick={() => setConfirmCancelTrip(true)}>
                Cancel Trip
              </Button>
            </div>
          </div>
        )}

        {/* Admin: Live trips overview */}
        {isAdmin && (() => {
          const liveTrips = tripLogs.filter((t) => t.status === 'in_progress');
          if (!liveTrips.length) return null;
          return (
            <div className="rounded-lg border border-green-300 bg-green-50 dark:border-green-700 dark:bg-green-950/20 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <Radio className="h-3.5 w-3.5 text-green-600 animate-pulse shrink-0" />
                <span className="text-sm font-semibold text-green-800 dark:text-green-300">
                  {liveTrips.length} Live Trip{liveTrips.length > 1 ? 's' : ''}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {liveTrips.map((t) => {
                  const lv = vehicles.find((v) => v.id === t.vehicle_id);
                  const elSec = t.trip_start_time ? Math.floor((Date.now() - Date.parse(t.trip_start_time)) / 1000) : null;
                  return (
                    <div key={t.id} className="bg-white dark:bg-green-950/40 rounded border border-green-200 dark:border-green-800 px-3 py-2 space-y-0.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium truncate">{t.employee_name}</span>
                        {elSec != null && (
                          <span className="text-xs font-mono text-green-700 dark:text-green-400 shrink-0">{formatDuration(elSec)}</span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{lv ? `${lv.plate_number} — ${lv.name}` : '—'}</p>
                      <div className="text-xs text-muted-foreground">From: <LocationCell location={t.start_location} lat={t.start_lat} lng={t.start_lng} showCoords /></div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* Today's trip stats */}
        {(() => {
          const todayStr = new Date().toISOString().slice(0, 10);
          const todayDone = visibleTrips.filter((t) => t.date === todayStr && t.status === 'completed');
          if (!todayDone.length) return null;
          const todayKm = todayDone.reduce((s, t) => s + (t.km_driven || 0), 0);
          const todayL  = todayDone.reduce((s, t) => s + (t.litres   || 0), 0);
          return (
            <div className="flex items-center gap-3 text-sm px-1 flex-wrap">
              <span className="font-semibold text-foreground">Today</span>
              <span className="text-muted-foreground">{todayDone.length} trip{todayDone.length > 1 ? 's' : ''} completed</span>
              <span className="text-muted-foreground">{todayKm.toLocaleString()} km</span>
              {todayL > 0 && <span className="text-muted-foreground">{todayL.toFixed(1)} L used</span>}
            </div>
          );
        })()}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {isAdmin ? 'All Trip Logs' : 'My Trip Logs'}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="hidden md:block overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Start Time</TableHead>
                  <TableHead>End Time</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Start Location</TableHead>
                  <TableHead>End Location</TableHead>
                  <TableHead className="text-right">Distance (km)</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Anomaly</TableHead>
                  {isAdmin && <TableHead className="text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleTrips.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={isAdmin ? 11 : 10}
                      className="text-center text-muted-foreground text-sm py-8"
                    >
                      No trip logs yet.
                    </TableCell>
                  </TableRow>
                )}
                {visibleTrips.map((t) => (
                  <TableRow
                    key={t.id}
                    className={`cursor-pointer hover:bg-muted/50 ${t.is_anomaly ? 'bg-red-50/50 dark:bg-red-950/10' : ''}`}
                    onClick={() => openTripDetail(t)}
                  >
                    <TableCell className="font-medium">{t.employee_name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{formatDate(t.date)}</TableCell>
                    <TableCell className="text-xs tabular-nums">
                      {t.trip_start_time ? formatTime(t.trip_start_time) : '—'}
                    </TableCell>
                    <TableCell className="text-xs tabular-nums">
                      {t.trip_end_time
                        ? formatTime(t.trip_end_time)
                        : t.status === 'in_progress' ? <span className="text-green-600 font-medium">Live</span> : '—'}
                    </TableCell>
                    <TableCell className="text-xs tabular-nums">
                      {t.duration_minutes != null
                        ? `${Math.floor(t.duration_minutes / 60)}h ${t.duration_minutes % 60}m`
                        : '—'}
                    </TableCell>
                    <TableCell className="text-xs max-w-[160px]">
                      <LocationCell location={t.start_location} lat={t.start_lat} lng={t.start_lng} showCoords />
                    </TableCell>
                    <TableCell className="text-xs max-w-[160px]">
                      {t.end_location
                        ? <LocationCell location={t.end_location} lat={t.end_lat} lng={t.end_lng} showCoords />
                        : t.status === 'in_progress' ? <span className="text-green-600 italic">In progress…</span> : '—'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {t.km_driven != null ? t.km_driven.toLocaleString() : '—'}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          t.status === 'in_progress'
                            ? 'border-green-400 text-green-700 bg-green-50'
                            : t.status === 'completed'
                            ? 'border-blue-300 text-blue-700 bg-blue-50'
                            : ''
                        }
                      >
                        {t.status === 'in_progress' ? 'In Progress' : t.status === 'completed' ? 'Completed' : t.status || 'Completed'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {t.is_anomaly ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex items-center gap-1 text-xs text-red-600 font-medium cursor-help">
                              <AlertTriangle className="h-3.5 w-3.5" /> Flag
                            </span>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs text-xs">{t.anomaly_reason}</TooltipContent>
                        </Tooltip>
                      ) : (
                        <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground/40" />
                      )}
                    </TableCell>
                    {isAdmin && (
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-0.5">
                          {(t.start_lat != null || t.end_lat != null) && (
                            <Button size="sm" variant="ghost" onClick={() => openTripMap(t)} title="View map">
                              <MapIcon className="h-4 w-4 text-blue-600" />
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" onClick={() => setConfirmDeleteTrip(t)} title="Delete">
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>

            {/* Mobile card list — same data, thumb-friendly */}
            <div className="md:hidden p-3 space-y-2">
              {visibleTrips.length === 0 ? (
                <p className="text-center text-muted-foreground text-sm py-8">No trip logs yet.</p>
              ) : visibleTrips.map((t) => {
                const isLive = t.status === 'in_progress';
                const accent =
                  isLive ? 'bg-green-500'
                  : t.is_anomaly ? 'bg-red-500'
                  : t.status === 'completed' ? 'bg-blue-500'
                  : 'bg-muted-foreground';
                return (
                  <MobileCard
                    key={t.id}
                    onClick={() => openTripDetail(t)}
                    accentClassName={accent}
                    className={t.is_anomaly ? 'bg-red-50/40 dark:bg-red-950/10' : ''}
                  >
                    <MobileCardHeader>
                      <div className="min-w-0 flex-1">
                        <MobileCardTitle>{t.employee_name}</MobileCardTitle>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {formatDate(t.date)}
                          {t.trip_start_time && ` · ${formatTime(t.trip_start_time)}`}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        {t.km_driven != null && (
                          <p className="text-base font-bold tabular-nums">{t.km_driven.toLocaleString()} <span className="text-xs font-normal text-muted-foreground">km</span></p>
                        )}
                        {isLive ? (
                          <Badge variant="outline" className="border-green-400 text-green-700 bg-green-50 mt-0.5">Live</Badge>
                        ) : t.duration_minutes != null && (
                          <p className="text-[11px] text-muted-foreground tabular-nums">
                            {Math.floor(t.duration_minutes / 60)}h {t.duration_minutes % 60}m
                          </p>
                        )}
                      </div>
                    </MobileCardHeader>

                    <div className="space-y-1 text-xs">
                      <div className="flex items-start gap-2">
                        <span className="text-muted-foreground w-10 shrink-0">From</span>
                        <span className="text-[11px] flex-1 min-w-0"><LocationCell location={t.start_location} lat={t.start_lat} lng={t.start_lng} showCoords /></span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="text-muted-foreground w-10 shrink-0">To</span>
                        <span className="text-[11px] flex-1 min-w-0">
                          {t.end_location
                            ? <LocationCell location={t.end_location} lat={t.end_lat} lng={t.end_lng} showCoords />
                            : isLive ? <span className="text-green-600 italic">In progress…</span> : '—'}
                        </span>
                      </div>
                    </div>

                    {t.is_anomaly && t.anomaly_reason && (
                      <div className="flex items-start gap-1.5 rounded-md bg-red-50 dark:bg-red-950/20 px-2 py-1.5 text-[11px] text-red-700 dark:text-red-300">
                        <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
                        <span className="leading-snug">{t.anomaly_reason}</span>
                      </div>
                    )}

                    {isAdmin && (t.start_lat != null || t.end_lat != null) && (
                      <MobileCardFooter>
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 h-9"
                          onClick={(e) => { e.stopPropagation(); openTripMap(t); }}
                        >
                          <MapIcon className="h-4 w-4 mr-1.5 text-blue-600" /> View map
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-9 px-3 text-destructive"
                          onClick={(e) => { e.stopPropagation(); setConfirmDeleteTrip(t); }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </MobileCardFooter>
                    )}
                  </MobileCard>
                );
              })}
            </div>
            {fleetAvgEfficiency && visibleTrips.length > 0 && (
              <div className="px-4 py-2 border-t text-sm text-muted-foreground flex justify-end gap-2">
                <span>Fleet average fuel efficiency:</span>
                <span className="font-semibold text-foreground">{fleetAvgEfficiency} km/L</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* START TRIP DIALOG */}
      {(() => {
        const odoOk = !!startTripForm.odometer_start && Number.isFinite(parseFloat(startTripForm.odometer_start));
        return (
          <Dialog open={showStartTrip} onOpenChange={(v) => { if (!v) setShowStartTrip(false); }}>
            <DialogContent className="max-w-md max-h-[90vh] flex flex-col gap-0 p-0 overflow-hidden">

              {/* ── Header ─────────────────────────────────────────── */}
              <DialogHeader className="shrink-0 px-5 pt-5 pb-3">
                <DialogTitle className="flex items-center gap-2 text-lg">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/40">
                    <Navigation className="h-4 w-4 text-green-600" />
                  </div>
                  Start Trip
                </DialogTitle>
                <DialogDescription className="text-xs mt-0.5">
                  Pin your exact location on the map, then enter your odometer reading.
                </DialogDescription>
              </DialogHeader>

              {/* ── Live map — drag pin to adjust ──────────────────── */}
              <div className="shrink-0 relative h-52 bg-muted/40">
                {mapsLoaded && startPinnedCoords ? (
                  <>
                    <GoogleMap
                      mapContainerStyle={{ width: '100%', height: '100%' }}
                      center={startPinnedCoords}
                      zoom={17}
                      options={{ ...MAP_OPTIONS, disableDefaultUI: true, gestureHandling: 'greedy', zoomControl: false, clickableIcons: false }}
                    >
                      <Marker
                        position={startPinnedCoords}
                        draggable
                        onDragEnd={(e) => {
                          const lat = e.latLng?.lat();
                          const lng = e.latLng?.lng();
                          if (lat != null && lng != null) {
                            setStartPinnedCoords({ lat, lng });
                            setStartAddress(null);
                            reverseGeocode(lat, lng).then((a) => a && setStartAddress(a));
                          }
                        }}
                      />
                    </GoogleMap>
                    <div className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 bg-white/90 dark:bg-black/70 backdrop-blur-sm rounded-full px-3 py-1 text-[10px] font-medium text-slate-700 dark:text-slate-200 shadow-sm">
                      Drag pin to adjust location
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full gap-2">
                    {isGeoError(startGeoState)
                      ? <LocateOff className="h-7 w-7 text-amber-400" />
                      : <Loader2 className="h-7 w-7 animate-spin text-blue-400" />}
                    <p className="text-xs text-muted-foreground">
                      {isGeoError(startGeoState) ? 'Location unavailable' : 'Getting your location…'}
                    </p>
                  </div>
                )}
              </div>

              {/* ── Location name strip ─────────────────────────────── */}
              <div className="shrink-0 border-y px-5 py-3 bg-background">
                {startGeoState === 'ok' && startPinnedCoords ? (
                  <div className="flex items-center gap-2.5">
                    <LocateFixed className="h-4 w-4 text-green-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold leading-snug truncate">
                        {startAddress || formatCoords(startPinnedCoords.lat, startPinnedCoords.lng)}
                      </p>
                      {startAddress && (
                        <p className="text-[10px] font-mono text-muted-foreground/60 leading-tight mt-0.5">
                          {formatCoords(startPinnedCoords.lat, startPinnedCoords.lng)}
                        </p>
                      )}
                    </div>
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      ±{Math.round(startCoords?.accuracy ?? 0)} m
                    </span>
                    <button
                      type="button"
                      className="text-[11px] text-green-600 hover:text-green-700 underline underline-offset-2 shrink-0"
                      onClick={() => {
                        setStartPinnedCoords(null);
                        acquireGeo(setStartGeoState, setStartCoords, (addr) => setStartAddress(addr));
                      }}
                    >
                      Re-acquire
                    </button>
                  </div>
                ) : isGeoError(startGeoState) ? (
                  <div className="flex items-center gap-2.5">
                    <LocateOff className="h-4 w-4 text-amber-500 shrink-0" />
                    <p className="flex-1 text-sm text-amber-700 dark:text-amber-400 font-medium truncate">
                      {GEO_ERROR_MSG[startGeoState as Exclude<GeoState, 'idle' | 'acquiring' | 'ok'>].split('—')[0].trim()}
                    </p>
                    <button
                      type="button"
                      className="text-[11px] text-amber-600 underline underline-offset-2 shrink-0"
                      onClick={() => acquireGeo(setStartGeoState, setStartCoords, (addr) => setStartAddress(addr))}
                    >
                      Retry
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2.5 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                    <p className="text-sm">Detecting your location…</p>
                  </div>
                )}
              </div>

              {/* ── Form fields ─────────────────────────────────────── */}
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 min-h-0">

                {/* Vehicle selector — required */}
                {vehicles.length > 0 && (
                  <div className="space-y-1.5">
                    <Label>Vehicle <span className="text-destructive">*</span></Label>
                    <Select
                      value={startTripForm.vehicle_id || ''}
                      onValueChange={(v) => {
                        setStartTripForm((f) => ({ ...f, vehicle_id: v }));
                        if (v) {
                          supabase.from('trip_logs').select('odometer_end').eq('vehicle_id', v)
                            .not('odometer_end', 'is', null).neq('status', 'in_progress')
                            .order('trip_end_time', { ascending: false }).limit(1).maybeSingle()
                            .then(({ data }) => setLastVehicleOdometer(data?.odometer_end ?? null));
                        } else {
                          setLastVehicleOdometer(null);
                        }
                      }}
                    >
                      <SelectTrigger className={!startTripForm.vehicle_id ? 'border-amber-400 focus:ring-amber-400' : ''}>
                        <SelectValue placeholder="Select vehicle (required)" />
                      </SelectTrigger>
                      <SelectContent>
                        {vehicles.map((v) => (
                          <SelectItem key={v.id} value={v.id}>
                            {v.name} — {(v as any).plate_number}
                            {v.current_fuel_litres != null && v.tank_capacity_litres > 0 && (
                              <span className={`ml-2 text-xs ${(v.current_fuel_litres / v.tank_capacity_litres) < 0.2 ? 'text-red-500' : 'text-muted-foreground'}`}>
                                ({Math.round((v.current_fuel_litres / v.tank_capacity_litres) * 100)}% fuel)
                              </span>
                            )}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {startTripForm.vehicle_id && (() => {
                      const veh = vehicles.find((v) => v.id === startTripForm.vehicle_id);
                      if (!veh || !veh.tank_capacity_litres) return null;
                      const pct = Math.round((veh.current_fuel_litres / veh.tank_capacity_litres) * 100);
                      if (pct >= 20) return null;
                      return (
                        <p className="text-xs text-red-600 flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" /> Low fuel: {pct}% — consider refuelling before departing.
                        </p>
                      );
                    })()}
                  </div>
                )}

                {/* Odometer input */}
                <div className="space-y-2">
                  <Label>Odometer Reading (km) <span className="text-destructive">*</span></Label>
                  <Input
                    type="number"
                    value={startTripForm.odometer_start}
                    onChange={(e) => setStartTripForm((f) => ({ ...f, odometer_start: e.target.value }))}
                    placeholder="e.g. 42500"
                  />

                  {startTripForm.odometer_start && Number.isFinite(parseFloat(startTripForm.odometer_start)) && (
                    <div className="rounded-xl bg-gradient-to-br from-slate-800 to-slate-900 px-4 py-3 flex items-center justify-between">
                      <div>
                        <p className="text-[10px] uppercase tracking-widest text-slate-400 mb-0.5">Odometer</p>
                        <p className="text-xl font-mono font-bold text-white tracking-wider">
                          {parseFloat(startTripForm.odometer_start).toLocaleString()}
                          <span className="text-sm font-normal text-slate-400 ml-1">km</span>
                        </p>
                      </div>
                      <Gauge className="h-7 w-7 text-slate-500" />
                    </div>
                  )}

                  {lastVehicleOdometer != null && startTripForm.odometer_start && (
                    parseFloat(startTripForm.odometer_start) < lastVehicleOdometer ? (
                      <p className="text-xs text-red-600 flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3 shrink-0" />
                        Odometer went backwards — last recorded was {lastVehicleOdometer.toLocaleString()} km. Please check.
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        +{(parseFloat(startTripForm.odometer_start) - lastVehicleOdometer).toLocaleString()} km since last trip
                      </p>
                    )
                  )}
                </div>

                {/* Pre-trip inspection */}
                {startTripForm.vehicle_id && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full gap-2 border-blue-300 text-blue-700 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950/30"
                    onClick={() => {
                      const veh = vehicles.find((v) => v.id === startTripForm.vehicle_id);
                      setInspectionVehicleId(startTripForm.vehicle_id);
                      setInspectionVehicleName(veh ? `${veh.name} (${(veh as any).plate_number})` : 'Vehicle');
                      setShowInspection(true);
                    }}
                  >
                    <ClipboardCheck className="h-4 w-4" /> Pre-Trip Vehicle Inspection
                  </Button>
                )}

                {/* Privacy notice */}
                <div className="flex items-start gap-2 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 px-3 py-2.5 text-xs text-blue-900 dark:text-blue-200">
                  <Radio className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold">Live tracking active during this trip</p>
                    <p className="opacity-85 mt-0.5">Your GPS position is sent every few seconds and stops the moment you tap End Trip.</p>
                  </div>
                </div>
              </div>

              {/* ── Footer ──────────────────────────────────────────── */}
              <DialogFooter className="shrink-0 px-5 pb-5 pt-3 border-t bg-background">
                <Button variant="outline" onClick={() => setShowStartTrip(false)}>Cancel</Button>
                <Button
                  className={`transition-all duration-300 text-white ${
                    odoOk && !startingTrip
                      ? 'bg-green-600 hover:bg-green-700 ring-2 ring-green-400 ring-offset-2'
                      : 'bg-muted-foreground/60 cursor-not-allowed'
                  }`}
                  onClick={handleStartTrip}
                  disabled={startingTrip || !startTripForm.odometer_start}
                >
                  {startingTrip
                    ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Starting…</>
                    : <><Timer className="mr-2 h-4 w-4" /> Start Trip</>}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        );
      })()}

      {/* END TRIP DIALOG */}
      <Dialog open={showEndTrip} onOpenChange={(v) => { if (!v) setShowEndTrip(false); }}>
        <DialogContent className="max-w-md max-h-[90vh] flex flex-col gap-0 p-0">
          <DialogHeader className="shrink-0 px-6 pt-6 pb-3 border-b">
            <DialogTitle className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-100">
                <Navigation className="h-4 w-4 text-red-600 rotate-180" />
              </div>
              End Trip
            </DialogTitle>
            <DialogDescription>
              Confirm your odometer reading to complete the trip. GPS end location is captured automatically.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 min-h-0">
            {/* Trip-in-progress summary */}
            {activeTrip && (
              <div className="rounded-xl bg-muted/40 border px-4 py-3 space-y-1">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Trip in progress</p>
                <p className="text-sm font-semibold">{formatDuration(elapsedSeconds)} elapsed</p>
                <div className="text-xs text-muted-foreground">
                  {activeTrip.start_location
                    ? <LocationCell location={activeTrip.start_location} lat={activeTrip.start_lat} lng={activeTrip.start_lng} showCoords />
                    : 'Start location not recorded'}
                </div>
              </div>
            )}

            {/* End Location — GPS auto-acquired, no manual input */}
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-muted-foreground" /> End Location
              </Label>

              {(endGeoState === 'idle' || endGeoState === 'acquiring') && (
                <div className="flex items-center gap-3 rounded-xl border bg-muted/30 px-4 py-3.5">
                  <Loader2 className="h-4 w-4 animate-spin text-blue-500 shrink-0" />
                  <div>
                    <p className="text-sm font-medium">Detecting your location…</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Using GPS and network signals</p>
                  </div>
                </div>
              )}

              {endGeoState === 'ok' && endCoords && (
                <div className="flex items-start gap-3 rounded-xl border border-green-200 bg-green-50 dark:bg-green-950/30 dark:border-green-800 px-4 py-3.5">
                  <LocateFixed className="h-4 w-4 text-green-600 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-green-800 dark:text-green-200 break-words leading-snug">
                      {endAddress || formatCoords(endCoords.lat, endCoords.lng)}
                    </p>
                    {endAddress && (
                      <p className="text-[10px] font-mono text-green-600/70 dark:text-green-400/70 leading-tight mt-0.5">
                        {formatCoords(endCoords.lat, endCoords.lng)}
                      </p>
                    )}
                    <p className="text-xs text-green-600 dark:text-green-400 mt-0.5">
                      GPS · ±{Math.round(endCoords.accuracy)} m accuracy
                    </p>
                  </div>
                  <button
                    type="button"
                    className="text-xs text-green-600 underline shrink-0 mt-0.5"
                    onClick={() => acquireGeo(setEndGeoState, setEndCoords, (addr) => setEndAddress(addr))}
                  >
                    Re-acquire
                  </button>
                </div>
              )}

              {isGeoError(endGeoState) && (
                <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 px-4 py-3.5">
                  <LocateOff className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-amber-800 dark:text-amber-200">GPS unavailable</p>
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                      {GEO_ERROR_MSG[endGeoState as Exclude<GeoState, 'idle' | 'acquiring' | 'ok'>]} Location won't be recorded — you can still end your trip.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="text-xs text-amber-600 underline shrink-0 mt-0.5"
                    onClick={() => acquireGeo(setEndGeoState, setEndCoords, (addr) => setEndAddress(addr))}
                  >
                    Retry
                  </button>
                </div>
              )}
            </div>

            {/* End odometer */}
            <div className="space-y-1">
              <Label>End Odometer Reading (km) <span className="text-destructive">*</span></Label>
              <Input
                type="number"
                value={endTripForm.odometer_end}
                onChange={(e) => setEndTripForm((f) => ({ ...f, odometer_end: e.target.value }))}
                placeholder="e.g. 42650"
              />
              {endTripForm.odometer_end && activeTrip?.odometer_start != null && (
                <p className="text-xs text-muted-foreground">
                  Distance: <strong>{Math.max(0, parseFloat(endTripForm.odometer_end) - activeTrip.odometer_start).toLocaleString()} km</strong>
                  {parseFloat(endTripForm.odometer_end) - activeTrip.odometer_start > 500 && (
                    <span className="text-amber-600 ml-2 flex items-center gap-0.5 inline-flex">
                      <AlertTriangle className="h-3 w-3" /> Distance &gt; 500 km — will be flagged for review
                    </span>
                  )}
                </p>
              )}
            </div>

            {/* Optional: fuel this trip */}
            {(() => {
              const km = activeTrip?.odometer_start != null && endTripForm.odometer_end
                ? Math.max(0, parseFloat(endTripForm.odometer_end) - activeTrip.odometer_start) : null;
              const tripVehForFuel = activeTrip?.vehicle_id ? vehicles.find((v) => v.id === activeTrip.vehicle_id) : null;
              const estL = km != null && km > 0 && tripVehForFuel?.fuel_consumption_rate_lkm
                ? Math.round(km * tripVehForFuel.fuel_consumption_rate_lkm * 10) / 10 : null;
              return (
                <div className="space-y-2">
                  {estL != null && (
                    <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-800 px-3 py-2 text-xs text-blue-700 dark:text-blue-300">
                      <Fuel className="h-3.5 w-3.5 shrink-0" />
                      <span>Vehicle spec estimates <strong>{estL} L</strong> consumed this trip ({tripVehForFuel?.fuel_consumption_rate_lkm} L/km × {km?.toLocaleString()} km)</span>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label>Fuel Purchased (₦) <span className="text-muted-foreground font-normal text-xs">(optional)</span></Label>
                      <Input
                        type="number"
                        value={endTripForm.fuel_amount_ngn}
                        onChange={(e) => setEndTripForm((f) => ({ ...f, fuel_amount_ngn: e.target.value }))}
                        placeholder="Optional"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Litres Purchased <span className="text-muted-foreground font-normal text-xs">(optional)</span></Label>
                      <Input
                        type="number"
                        value={endTripForm.litres}
                        onChange={(e) => setEndTripForm((f) => ({ ...f, litres: e.target.value }))}
                        placeholder={estL != null ? `Est. ${estL} L consumed` : 'Optional'}
                      />
                    </div>
                  </div>
                </div>
              );
            })()}

            <div className="space-y-1">
              <Label>Issues to Report <span className="text-muted-foreground font-normal text-xs">(optional)</span></Label>
              <Textarea
                value={endTripForm.issues}
                onChange={(e) => setEndTripForm((f) => ({ ...f, issues: e.target.value }))}
                rows={2}
                placeholder="Vehicle or route issues, incidents…"
              />
            </div>
          </div>
          <DialogFooter className="shrink-0 px-6 pb-6 pt-3 border-t bg-background">
            <Button variant="outline" onClick={() => setShowEndTrip(false)}>Cancel</Button>
            {(() => {
              const endReady = !!endTripForm.odometer_end;
              return (
                <Button
                  className={endReady && !endingTrip ? '' : 'bg-muted-foreground/60 hover:bg-muted-foreground/60 cursor-not-allowed'}
                  onClick={handleEndTrip}
                  disabled={endingTrip || !endTripForm.odometer_end}
                >
                  {endingTrip && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  <CheckCircle2 className="mr-2 h-4 w-4" /> Complete Trip
                </Button>
              );
            })()}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* TRIP SUMMARY DIALOG */}
      <Dialog open={!!tripSummary} onOpenChange={(v) => { if (!v) setTripSummary(null); }}>
        <DialogContent className="max-w-sm overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" /> Trip Completed
            </DialogTitle>
          </DialogHeader>
          {tripSummary && (
            <div className="space-y-4 min-w-0">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-md bg-muted/50 px-3 py-2 text-center min-w-0">
                  <p className="text-2xl font-bold tabular-nums">
                    {tripSummary.distanceKm != null ? tripSummary.distanceKm.toLocaleString() : '—'}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">Kilometres driven</p>
                </div>
                <div className="rounded-md bg-muted/50 px-3 py-2 text-center min-w-0">
                  <p className="text-2xl font-bold tabular-nums">
                    {Math.floor(tripSummary.durationMin / 60)}h {tripSummary.durationMin % 60}m
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">Duration</p>
                </div>
              </div>
              <div className="space-y-2 text-sm min-w-0">
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">From</p>
                  <p className="text-xs break-words">{tripSummary.startLocation}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">To</p>
                  <p className="text-xs break-words">{tripSummary.endLocation}</p>
                </div>
              </div>
              {tripSummary.isAnomaly && (
                <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold">Anomaly flagged for admin review</p>
                    <p className="text-xs mt-0.5">{tripSummary.anomalyReason}</p>
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setTripSummary(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CANCEL ACTIVE TRIP CONFIRMATION */}
      <Dialog open={confirmCancelTrip} onOpenChange={(v) => { if (!v) setConfirmCancelTrip(false); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel in-progress trip?</DialogTitle>
            <DialogDescription>
              This will permanently delete the trip record. Any distance and time already recorded will be lost. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmCancelTrip(false)}>Keep Trip</Button>
            <Button variant="destructive" onClick={handleCancelActiveTrip}>Cancel Trip</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* TRIP LOG DIALOG */}
      <Dialog open={showTripForm} onOpenChange={setShowTripForm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Daily Trip Log</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Employee</Label>
              <Select
                value={tripForm.employee_id}
                onValueChange={(v) => setTripForm({ ...tripForm, employee_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select employee" />
                </SelectTrigger>
                <SelectContent>
                  {staff.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.full_name || s.email}
                    </SelectItem>
                  ))}
                  {profile && !staff.find((s) => s.id === profile.id) && (
                    <SelectItem value={profile.id}>
                      {profile.full_name || profile.email} (me)
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Vehicle <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Select
                value={tripForm.vehicle_id || '__none__'}
                onValueChange={(v) => setTripForm({ ...tripForm, vehicle_id: v === '__none__' ? '' : v })}
              >
                <SelectTrigger><SelectValue placeholder="Select vehicle" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No vehicle</SelectItem>
                  {vehicles.map((v) => (
                    <SelectItem key={v.id} value={v.id}>{v.name} ({v.plate_number})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Date</Label>
              <Input
                type="date"
                value={tripForm.date}
                onChange={(e) => setTripForm({ ...tripForm, date: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Start Location</Label>
                <Input
                  value={tripForm.start_location}
                  onChange={(e) =>
                    setTripForm({ ...tripForm, start_location: e.target.value })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>End Location</Label>
                <Input
                  value={tripForm.end_location}
                  onChange={(e) =>
                    setTripForm({ ...tripForm, end_location: e.target.value })
                  }
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Odometer Start</Label>
                <Input
                  type="number"
                  value={tripForm.odometer_start}
                  onChange={(e) =>
                    setTripForm({ ...tripForm, odometer_start: e.target.value })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>Odometer End</Label>
                <Input
                  type="number"
                  value={tripForm.odometer_end}
                  onChange={(e) =>
                    setTripForm({ ...tripForm, odometer_end: e.target.value })
                  }
                />
                {tripForm.odometer_start && tripForm.odometer_end && (
                  <p className="text-xs text-muted-foreground">
                    {Math.max(
                      0,
                      parseFloat(tripForm.odometer_end) -
                        parseFloat(tripForm.odometer_start),
                    ).toLocaleString()}{' '}
                    km
                  </p>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Fuel Purchased (₦)</Label>
                <Input
                  type="number"
                  value={tripForm.fuel_amount_ngn}
                  onChange={(e) =>
                    setTripForm({ ...tripForm, fuel_amount_ngn: e.target.value })
                  }
                  placeholder="Optional"
                />
              </div>
              <div className="space-y-1">
                <Label>Litres</Label>
                <Input
                  type="number"
                  value={tripForm.litres}
                  onChange={(e) => setTripForm({ ...tripForm, litres: e.target.value })}
                  placeholder="Optional"
                />
              </div>
            </div>
            <TripVehicleFuel
              vehicleId={tripForm.vehicle_id}
              vehicles={vehicles}
              kmDriven={
                tripForm.odometer_start && tripForm.odometer_end
                  ? Math.max(0, parseFloat(tripForm.odometer_end) - parseFloat(tripForm.odometer_start))
                  : null
              }
              litresAdded={parseFloat(tripForm.litres) || null}
            />
            <div className="space-y-1">
              <Label>Issues to Report</Label>
              <Textarea
                value={tripForm.issues}
                onChange={(e) => setTripForm({ ...tripForm, issues: e.target.value })}
                placeholder="Optional — vehicle or route issues..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTripForm(false)}>
              Cancel
            </Button>
            <Button
              onClick={submitTripLog}
              disabled={
                submitting ||
                !tripForm.employee_id ||
                !tripForm.date ||
                !tripForm.start_location ||
                !tripForm.end_location
              }
            >
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Submit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete trip log confirmation */}
      <Dialog open={!!confirmDeleteTrip} onOpenChange={(v) => { if (!v) setConfirmDeleteTrip(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete trip log</DialogTitle>
            <DialogDescription>
              Delete this trip log ({confirmDeleteTrip?.start_location} → {confirmDeleteTrip?.end_location})? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDeleteTrip(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => confirmDeleteTrip && deleteTripLog(confirmDeleteTrip)}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Trip log detail / edit dialog */}
      <Dialog
        open={!!selectedTrip}
        onOpenChange={(v) => {
          if (!v) { setSelectedTrip(null); setTripEditMode(false); }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              Trip Log — {selectedTrip && formatDate(selectedTrip.date)}
            </DialogTitle>
            <DialogDescription>{selectedTrip?.employee_name}</DialogDescription>
          </DialogHeader>

          {selectedTrip && !tripEditMode && (
            <div className="space-y-3 text-sm">
              {selectedTrip.vehicle_id && (
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Vehicle</p>
                  <p className="font-medium">
                    {vehicles.find((v) => v.id === selectedTrip.vehicle_id)?.name || 'Unknown vehicle'}
                  </p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">From</p>
                  <p className="font-medium"><LocationCell location={selectedTrip.start_location} lat={selectedTrip.start_lat} lng={selectedTrip.start_lng} showCoords /></p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">To</p>
                  <p className="font-medium"><LocationCell location={selectedTrip.end_location} lat={selectedTrip.end_lat} lng={selectedTrip.end_lng} showCoords /></p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3 border rounded-lg p-3 bg-muted/30">
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Odometer Start</p>
                  <p className="font-semibold tabular-nums">{selectedTrip.odometer_start != null ? selectedTrip.odometer_start.toLocaleString() : '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Odometer End</p>
                  <p className="font-semibold tabular-nums">{selectedTrip.odometer_end != null ? selectedTrip.odometer_end.toLocaleString() : '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Distance (km)</p>
                  <p className="font-semibold tabular-nums text-primary">{selectedTrip.km_driven != null ? selectedTrip.km_driven.toLocaleString() : '—'}</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Fuel (₦)</p>
                  <p className="font-medium currency">{selectedTrip.fuel_amount_ngn ? formatNaira(selectedTrip.fuel_amount_ngn) : '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Litres</p>
                  <p className="font-medium">{selectedTrip.litres ?? '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">km/L</p>
                  <p className="font-medium">
                    {selectedTrip.km_driven && selectedTrip.litres && selectedTrip.km_driven > 0 && selectedTrip.litres > 0
                      ? (selectedTrip.km_driven / selectedTrip.litres).toFixed(1)
                      : '—'}
                  </p>
                </div>
              </div>
              {selectedTrip.issues && (
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Issues Reported</p>
                  <p className="text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">{selectedTrip.issues}</p>
                </div>
              )}
            </div>
          )}

          {selectedTrip && tripEditMode && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Date</Label>
                  <Input type="date" value={tripEditForm.date} onChange={(e) => setTripEditForm({ ...tripEditForm, date: e.target.value })} />
                </div>
                <div />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>From</Label>
                  <Input value={tripEditForm.start_location} onChange={(e) => setTripEditForm({ ...tripEditForm, start_location: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>To</Label>
                  <Input value={tripEditForm.end_location} onChange={(e) => setTripEditForm({ ...tripEditForm, end_location: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Odometer Start</Label>
                  <Input type="number" value={tripEditForm.odometer_start} onChange={(e) => setTripEditForm({ ...tripEditForm, odometer_start: e.target.value })} placeholder="e.g. 42500" />
                </div>
                <div className="space-y-1">
                  <Label>Odometer End</Label>
                  <Input type="number" value={tripEditForm.odometer_end} onChange={(e) => setTripEditForm({ ...tripEditForm, odometer_end: e.target.value })} placeholder="e.g. 42750" />
                </div>
              </div>
              {tripEditForm.odometer_start && tripEditForm.odometer_end && (
                <p className="text-xs text-muted-foreground">
                  Distance: <strong>{(parseFloat(tripEditForm.odometer_end) - parseFloat(tripEditForm.odometer_start)).toLocaleString()} km</strong>
                </p>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Fuel Purchased (₦)</Label>
                  <Input type="number" value={tripEditForm.fuel_amount_ngn} onChange={(e) => setTripEditForm({ ...tripEditForm, fuel_amount_ngn: e.target.value })} placeholder="Optional" />
                </div>
                <div className="space-y-1">
                  <Label>Litres</Label>
                  <Input type="number" value={tripEditForm.litres} onChange={(e) => setTripEditForm({ ...tripEditForm, litres: e.target.value })} placeholder="Optional" />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Issues to Report</Label>
                <Textarea value={tripEditForm.issues} onChange={(e) => setTripEditForm({ ...tripEditForm, issues: e.target.value })} rows={2} placeholder="Optional" />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            {!tripEditMode && (
              <>
                <Button variant="outline" onClick={() => setSelectedTrip(null)}>Close</Button>
                {canEditTrip && (
                  <Button variant="outline" onClick={() => setTripEditMode(true)}>
                    <Pencil className="h-3 w-3 mr-1" /> Edit
                  </Button>
                )}
              </>
            )}
            {tripEditMode && (
              <>
                <Button variant="outline" onClick={() => setTripEditMode(false)}>Cancel</Button>
                <Button onClick={saveTripEdit} disabled={savingTripEdit}>
                  {savingTripEdit && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save Changes
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* TRIP MAP MODAL */}
      {viewingTripMap && (
        <TripMapModal
          trip={viewingTripMap}
          breadcrumbs={mapBreadcrumbs}
          events={mapEvents}
          loading={loadingMapData}
          onClose={() => setViewingTripMap(null)}
        />
      )}

      {/* VEHICLE INSPECTION (DVIR) */}
      <VehicleInspectionForm
        vehicleId={inspectionVehicleId}
        vehicleName={inspectionVehicleName}
        open={showInspection}
        onOpenChange={setShowInspection}
      />
    </>
  );
}
