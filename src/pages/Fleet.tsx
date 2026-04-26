import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { compressImage } from '@/lib/image-compression';
import { useAuthStore } from '@/store/authStore';
import { logAudit } from '@/lib/audit';
import { writeRejectionNotification, isValidRejectionReason } from '@/lib/rejections';
import { notifyUser, notifyRoles } from '@/lib/notify';
import { formatNaira, formatDate } from '@/lib/format';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip, ResponsiveContainer } from 'recharts';
import { FilePreviewTrigger } from '@/components/FilePreview';
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
import { StatusBadge } from '@/components/ui-kit/StatusBadge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { usePageTitle } from '@/hooks/usePageTitle';
import { TableSkeleton } from '@/components/ui-kit/TableSkeleton';
import { EmptyState } from '@/components/ui-kit/EmptyState';
import { AuroraHero } from '@/components/AuroraHero';
import { ChartGradients, GlassTooltip, axisTick, chartAnim, chartTheme } from '@/components/ChartKit';
import { burst } from '@/components/Burst';
import {
  MobileCard,
  MobileCardHeader,
  MobileCardTitle,
  MobileCardMeta,
  MobileCardRow,
  MobileCardFooter,
} from '@/components/ui-kit/MobileCard';
import { Loader2, Check, X, Fuel, MapPin, Plus, Car, Pencil, Trash2, Info, CreditCard, History, User, AlertTriangle, Wrench, FileText, Upload, RotateCcw, Timer, Navigation, LocateFixed, LocateOff, CheckCircle2, Radio, Map as MapIcon, Gauge, Zap, ParkingCircle, TrendingUp, BarChart2, Download, Ban, CalendarOff, CheckSquare } from 'lucide-react';
import L from 'leaflet';
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
// Fix Leaflet default marker icons broken by Vite's asset pipeline
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: new URL('leaflet/dist/images/marker-icon.png', import.meta.url).href,
  iconRetinaUrl: new URL('leaflet/dist/images/marker-icon-2x.png', import.meta.url).href,
  shadowUrl: new URL('leaflet/dist/images/marker-shadow.png', import.meta.url).href,
});
import { BankAccountField, type BankAccountValue } from '@/components/BankAccountField';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Progress } from '@/components/ui/progress';
import { getBankCode, createTransferRecipient, initiateTransfer } from '@/lib/paystack';
import { cn } from '@/lib/utils';

interface FieldStaff {
  id: string;
  full_name: string;
  email: string;
}

interface VehicleSummary {
  id: string;
  name: string;
  plate_number: string;
  weekly_budget_ngn: number;
  carry_forward_ngn: number;
  assigned_driver_id: string | null;
  insurance_expiry: string | null;
  road_worthiness_expiry: string | null;
  next_service_date: string | null;
  tank_capacity_litres: number;
  current_fuel_litres: number;
  last_refuel_at: string | null;
  avg_km_per_litre: number;
  fuel_consumption_rate_lkm: number;
  home_base_lat: number | null;
  home_base_lng: number | null;
  out_of_service_until: string | null;
}

interface FuelRequest {
  id: string;
  employee_id: string;
  employee_name: string;
  station_name: string;
  amount_ngn: number;
  litres_est: number | null;
  odometer: number | null;
  reason: string | null;
  status: string;
  admin_note: string | null;
  created_at: string;
  bank_name: string | null;
  account_number: string | null;
  account_name: string | null;
  request_doc_url: string | null;
  receipt_url: string | null;
  payment_sent_at: string | null;
  fuel_station_name: string | null;
  litres_filled: number | null;
  budget_exception: boolean;
  budget_exception_by: string | null;
  budget_exception_at: string | null;
  is_anomaly: boolean;
  anomaly_type: string | null;
  anomaly_reviewed_by: string | null;
  anomaly_reviewed_at: string | null;
  anomaly_review_note: string | null;
}

interface TripLog {
  id: string;
  employee_id: string;
  employee_name: string;
  date: string;
  start_location: string;
  end_location: string;
  odometer_start: number | null;
  odometer_end: number | null;
  km_driven: number | null;
  vehicle_id: string | null;
  fuel_amount_ngn: number | null;
  litres: number | null;
  issues: string | null;
  created_at: string;
  trip_start_time: string | null;
  trip_end_time: string | null;
  duration_minutes: number | null;
  start_lat: number | null;
  start_lng: number | null;
  end_lat: number | null;
  end_lng: number | null;
  is_anomaly: boolean;
  anomaly_reason: string | null;
  is_out_of_area: boolean;
  anomaly_reviewed_by: string | null;
  anomaly_reviewed_at: string | null;
  anomaly_review_note: string | null;
  status: string;
}

interface BreadcrumbRow {
  id: string;
  trip_id: string;
  lat: number;
  lng: number;
  accuracy: number | null;
  speed_kmh: number | null;
  heading: number | null;
  is_speeding: boolean;
  recorded_at: string;
}

interface TripEvent {
  id: string;
  trip_id: string;
  event_type: 'speeding' | 'hard_braking' | 'extended_stop';
  lat: number | null;
  lng: number | null;
  speed_kmh: number | null;
  details: string | null;
  recorded_at: string;
}

// ---------------------------------------------------------------------------
// Geolocation & trip-clock helpers (outside component — no hook rules)
// ---------------------------------------------------------------------------

type GeoCoords = { lat: number; lng: number; accuracy: number };
type GeoState = 'idle' | 'acquiring' | 'ok' | 'denied' | 'unavailable' | 'timeout' | 'https-required';

const isGeoError = (s: GeoState): s is Exclude<GeoState, 'idle' | 'acquiring' | 'ok'> =>
  s === 'denied' || s === 'unavailable' || s === 'timeout' || s === 'https-required';

const GEO_ERROR_MSG: Record<Exclude<GeoState, 'idle' | 'acquiring' | 'ok'>, string> = {
  denied:          'Location permission denied — click the lock icon in your address bar, allow location, then retry. Or type the location below.',
  unavailable:     'GPS signal unavailable — your browser could not determine location. Please type the location below.',
  timeout:         'GPS timed out — your browser took too long to respond. Please type the location below or retry.',
  'https-required':'This page must be loaded over HTTPS for GPS to work. Please type the location below.',
};

function getGeolocation(): Promise<GeoCoords> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject('unavailable'); return; }

    if (typeof window !== 'undefined'
        && window.location.protocol !== 'https:'
        && window.location.hostname !== 'localhost'
        && window.location.hostname !== '127.0.0.1') {
      reject('https-required');
      return;
    }

    let settled = false;
    const settle = (coords: GeoCoords) => {
      if (settled) return;
      settled = true;
      clearTimeout(hardTimer);
      resolve(coords);
    };
    const fail = (code: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(hardTimer);
      reject(code);
    };

    // Hard backstop — some desktop browsers silently hang on
    // getCurrentPosition (no GPS hardware + no cached WiFi fix).
    // Neither success nor error callback ever fires in that case,
    // so a JS timer is the only reliable escape hatch.
    const hardTimer = setTimeout(() => fail('timeout'), 7_000);

    // Phase 0 — instant cache hit (up to 60 s old).
    // Desktop browsers cache their last IP/WiFi fix; this returns it
    // immediately without a network round-trip.  Mobile devices with a GPS
    // chip will beat this via Phase 2, so it doesn't hurt accuracy there.
    navigator.geolocation.getCurrentPosition(
      (p) => settle({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      () => {/* no cached fix — continue to Phase 1 */},
      { enableHighAccuracy: false, timeout: 1_000, maximumAge: 60_000 },
    );
    // Phase 1 — fresh low-accuracy fix (IP / WiFi on desktop, quick cell-tower
    // on mobile).  30 s maximumAge lets desktop Chrome/Firefox return a recent
    // IP location without a new network lookup, avoiding silent hangs.
    navigator.geolocation.getCurrentPosition(
      (p) => settle({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      () => {/* ignore; Phase 2 is authoritative */},
      { enableHighAccuracy: false, timeout: 5_000, maximumAge: 30_000 },
    );
    // Phase 2 — full GPS accuracy, races Phases 0 and 1.
    // On mobile this uses the GPS chip and typically wins with the best fix.
    // On desktop (no GPS hardware) Phase 0/1 will already have resolved.
    navigator.geolocation.getCurrentPosition(
      (p) => settle({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      (e) => fail(e.code === 1 ? 'denied' : e.code === 2 ? 'unavailable' : 'timeout'),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 },
    );
  });
}

function formatCoords(lat: number, lng: number): string {
  return `${Math.abs(lat).toFixed(5)}°${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lng).toFixed(5)}°${lng >= 0 ? 'E' : 'W'}`;
}

function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function detectAnomalies(distanceKm: number | null, durationMin: number): { isAnomaly: boolean; reason: string | null } {
  const flags: string[] = [];
  if (distanceKm !== null && distanceKm < 0)              flags.push('Odometer went backwards');
  if (distanceKm !== null && distanceKm > 500)            flags.push('Distance exceeds 500 km');
  if (durationMin > 720)                                  flags.push('Trip exceeded 12 hours');
  if (durationMin < 2 && distanceKm !== null && distanceKm > 1) flags.push('Implausibly short duration for distance covered');
  if (durationMin > 5 && distanceKm === 0)                flags.push('No distance recorded despite 5+ minutes elapsed');
  if (distanceKm !== null && durationMin > 0) {
    const avgKmH = (distanceKm / durationMin) * 60;
    if (avgKmH > 150) flags.push(`Average speed ${avgKmH.toFixed(0)} km/h exceeds 150 km/h`);
  }
  return flags.length > 0 ? { isAnomaly: true, reason: flags.join('; ') } : { isAnomaly: false, reason: null };
}

// Convert rows to a downloadable CSV file. Keys become headers.
function exportCsv<T extends Record<string, unknown>>(rows: T[], filename: string): void {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    if (v == null) return '';
    const s = String(v);
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };
  const lines = [
    headers.join(','),
    ...rows.map((r) => headers.map((h) => escape(r[h])).join(',')),
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ---------------------------------------------------------------------------
// Reverse geocoding (Nominatim / OpenStreetMap — free, no API key required)
// ---------------------------------------------------------------------------

const geocodeCache = new Map<string, string>();

async function reverseGeocode(lat: number, lng: number): Promise<string> {
  const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  if (geocodeCache.has(key)) return geocodeCache.get(key)!;
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`,
      { headers: { 'Accept-Language': 'en-GB', 'User-Agent': 'KD-Ops-Hub-Fleet/1.0' } },
    );
    if (!res.ok) throw new Error('geocode_fail');
    const json = await res.json();
    const address = (json.display_name as string) || formatCoords(lat, lng);
    geocodeCache.set(key, address);
    return address;
  } catch {
    return formatCoords(lat, lng);
  }
}

// ---------------------------------------------------------------------------
// Trip map sub-components (must live before Fleet to satisfy JSX scope)
// ---------------------------------------------------------------------------

function FitBoundsToRoute({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length >= 2) {
      map.fitBounds(points as L.LatLngTuple[], { padding: [32, 32], maxZoom: 15 });
    } else if (points.length === 1) {
      map.setView(points[0] as L.LatLngTuple, 14);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

const EVENT_LABEL: Record<string, string> = {
  speeding:      'Speeding',
  hard_braking:  'Hard Braking',
  extended_stop: 'Extended Stop',
};

const EVENT_COLOR: Record<string, string> = {
  speeding:      'bg-red-100 text-red-700 border-red-300',
  hard_braking:  'bg-orange-100 text-orange-700 border-orange-300',
  extended_stop: 'bg-blue-100 text-blue-700 border-blue-300',
};

const EVENT_ICON: Record<string, React.ReactNode> = {
  speeding:      <Gauge className="h-3 w-3" />,
  hard_braking:  <Zap className="h-3 w-3" />,
  extended_stop: <ParkingCircle className="h-3 w-3" />,
};

interface TripMapModalProps {
  trip: TripLog;
  breadcrumbs: BreadcrumbRow[];
  events: TripEvent[];
  loading: boolean;
  onClose: () => void;
}

function TripMapModal({ trip, breadcrumbs, events, loading, onClose }: TripMapModalProps) {
  const [activeTab, setActiveTab] = useState<'map' | 'events'>('map');

  const startPos: [number, number] | null =
    trip.start_lat != null && trip.start_lng != null ? [trip.start_lat, trip.start_lng] : null;
  const endPos: [number, number] | null =
    trip.end_lat != null && trip.end_lng != null ? [trip.end_lat, trip.end_lng] : null;

  const center: [number, number] = startPos ?? endPos ?? [6.5244, 3.3792]; // Lagos fallback
  const trail: [number, number][] = breadcrumbs.map((b) => [b.lat, b.lng]);
  const boundsPoints: [number, number][] =
    trail.length >= 2 ? trail : [startPos, endPos].filter(Boolean) as [number, number][];

  // Custom Leaflet markers — pulse animation comes from CSS classes on the
  // divIcon. The geometry / coordinates are unchanged; only visuals are
  // restyled.
  const startIcon = useMemo(() => L.divIcon({
    className: '',
    html: '<div class="kd-trip-marker-start"></div>',
    iconSize: [18, 18] as L.PointExpression,
    iconAnchor: [9, 9] as L.PointExpression,
  }), []);

  const endIcon = useMemo(() => L.divIcon({
    className: '',
    html: '<div class="kd-trip-marker-end"></div>',
    iconSize: [18, 18] as L.PointExpression,
    iconAnchor: [9, 9] as L.PointExpression,
  }), []);

  const eventIcon = useMemo(() => L.divIcon({
    className: '',
    html: '<div class="kd-trip-marker-event"></div>',
    iconSize: [12, 12] as L.PointExpression,
    iconAnchor: [6, 6] as L.PointExpression,
  }), []);

  const hasGps = startPos != null || endPos != null;

  // Telemetry — read-only, derived purely from existing data
  const distanceKm = trip.km_driven;
  const durationMin = trip.duration_minutes;
  const litres = trip.litres;
  const avgSpeedKph = distanceKm != null && durationMin != null && durationMin > 0
    ? Math.round((distanceKm / (durationMin / 60)) * 10) / 10
    : null;

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-4xl p-0 max-h-[92vh] flex flex-col gap-0">
        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border/60 shrink-0">
          <div className="flex items-center gap-3">
            <div className="relative h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <span className="pointer-events-none absolute inset-0 rounded-xl bg-[hsl(var(--tod-glow))] opacity-15 blur-md" />
              <MapIcon className="relative h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="kd-display text-lg truncate">Trip Map · {trip.employee_name}</DialogTitle>
              <DialogDescription className="mt-0.5 truncate">
                {formatDate(trip.date)} · {trip.start_location || '—'} → {trip.end_location || '—'}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Telemetry strip */}
        <div className="px-6 pt-4 pb-3 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-2 shrink-0 border-b border-border/60">
          <div className="rounded-lg border border-border/50 bg-muted/30 px-3 py-2">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground/80">Distance</p>
            <p className="kd-stat-number text-base font-bold leading-tight">
              {distanceKm != null ? `${distanceKm.toLocaleString()} km` : '—'}
            </p>
          </div>
          <div className="rounded-lg border border-border/50 bg-muted/30 px-3 py-2">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground/80">Duration</p>
            <p className="kd-stat-number text-base font-bold leading-tight">
              {durationMin != null ? formatDuration(durationMin * 60) : '—'}
            </p>
          </div>
          <div className="rounded-lg border border-border/50 bg-muted/30 px-3 py-2">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground/80">Avg speed</p>
            <p className="kd-stat-number text-base font-bold leading-tight">
              {avgSpeedKph != null ? `${avgSpeedKph} km/h` : '—'}
            </p>
          </div>
          <div className="rounded-lg border border-border/50 bg-muted/30 px-3 py-2">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground/80">Fuel</p>
            <p className="kd-stat-number text-base font-bold leading-tight">
              {litres != null ? `${litres} L` : '—'}
            </p>
          </div>
          <div className="rounded-lg border border-border/50 bg-muted/30 px-3 py-2 col-span-2 sm:col-span-1">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground/80">Telemetry</p>
            <p className="kd-stat-number text-base font-bold leading-tight">
              {breadcrumbs.length} ping{breadcrumbs.length === 1 ? '' : 's'} · {events.length} event{events.length === 1 ? '' : 's'}
            </p>
          </div>
        </div>

        {/* Tab bar */}
        <div className="px-6 pt-3 flex gap-1 shrink-0">
          {(['map', 'events'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium kd-transition',
                activeTab === t
                  ? 'bg-primary/10 text-primary border-b-2 border-primary rounded-b-none'
                  : 'text-muted-foreground hover:bg-muted',
              )}
            >
              {t === 'map' ? <MapIcon className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
              {t === 'map' ? 'Map' : 'Events'}
              {t === 'events' && events.length > 0 && (
                <span className="bg-destructive text-destructive-foreground text-[10px] rounded-full px-1.5 leading-none kd-status-live-danger">
                  {events.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto min-h-0 px-6 pt-3 pb-4">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="flex items-center gap-3 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="text-sm">Loading trip telemetry…</span>
              </div>
            </div>
          ) : activeTab === 'map' ? (
            <>
              {!hasGps ? (
                <Card><CardContent className="p-0">
                  <EmptyState
                    illustration="satellite"
                    title="No GPS coordinates"
                    description="This trip doesn't have GPS coordinates recorded. Distance and duration data is still available above."
                  />
                </CardContent></Card>
              ) : (
                <div className="kd-trip-map rounded-xl overflow-hidden border border-border/60 shadow-sm" style={{ height: 440 }}>
                  <MapContainer center={center} zoom={13} style={{ height: '100%', width: '100%' }} scrollWheelZoom>
                    <TileLayer
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    />
                    {boundsPoints.length >= 1 && <FitBoundsToRoute points={boundsPoints} />}
                    {trail.length > 1 && (
                      <>
                        {/* Soft glow underlay */}
                        <Polyline positions={trail} color="#00ECFF" weight={8} opacity={0.18} />
                        {/* Crisp top stroke */}
                        <Polyline positions={trail} color="#006994" weight={3} opacity={0.9} />
                      </>
                    )}
                    {startPos && (
                      <Marker position={startPos} icon={startIcon}>
                        <Popup>
                          <strong>Start</strong><br />{trip.start_location || formatCoords(startPos[0], startPos[1])}<br />
                          {trip.trip_start_time && new Date(trip.trip_start_time).toLocaleTimeString('en-GB')}
                        </Popup>
                      </Marker>
                    )}
                    {endPos && (
                      <Marker position={endPos} icon={endIcon}>
                        <Popup>
                          <strong>End</strong><br />{trip.end_location || formatCoords(endPos[0], endPos[1])}<br />
                          {trip.trip_end_time && new Date(trip.trip_end_time).toLocaleTimeString('en-GB')}
                        </Popup>
                      </Marker>
                    )}
                    {events.map((ev) =>
                      ev.lat != null && ev.lng != null ? (
                        <Marker key={ev.id} position={[ev.lat, ev.lng]} icon={eventIcon}>
                          <Popup>
                            <strong>{EVENT_LABEL[ev.event_type] || ev.event_type}</strong><br />
                            {ev.details}<br />
                            <span style={{ fontSize: '0.7rem', color: '#666' }}>
                              {new Date(ev.recorded_at).toLocaleTimeString('en-GB')}
                            </span>
                          </Popup>
                        </Marker>
                      ) : null,
                    )}
                  </MapContainer>
                </div>
              )}
              {/* Legend */}
              <div className="flex items-center gap-4 pt-3 text-xs text-muted-foreground flex-wrap">
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-success inline-block shrink-0 kd-status-live-success" /> Start</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-destructive inline-block shrink-0" /> End</span>
                <span className="flex items-center gap-1.5"><span className="w-6 h-0.5 bg-primary inline-block shrink-0" /> Route</span>
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-warning inline-block shrink-0 kd-status-live-warning" /> Event</span>
              </div>
            </>
          ) : (
            /* Events tab */
            events.length === 0 ? (
              <Card><CardContent className="p-0">
                <EmptyState
                  illustration="radar"
                  title="No driving events"
                  description="No events were recorded for this trip. The journey was clean."
                />
              </CardContent></Card>
            ) : (
              <div className="space-y-2 py-1">
                {events.map((ev) => (
                  <div key={ev.id} className="flex items-start gap-3 p-3 rounded-lg border border-border/60 bg-card kd-transition hover:border-primary/20">
                    <span className={`flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded border shrink-0 ${EVENT_COLOR[ev.event_type] || 'bg-muted text-muted-foreground'}`}>
                      {EVENT_ICON[ev.event_type]}
                      {EVENT_LABEL[ev.event_type] || ev.event_type}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm">{ev.details || '—'}</p>
                      {ev.lat != null && ev.lng != null && (
                        <p className="text-xs text-muted-foreground font-mono mt-0.5">{formatCoords(ev.lat, ev.lng)}</p>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                      {new Date(ev.recorded_at).toLocaleTimeString('en-GB')}
                    </span>
                  </div>
                ))}
              </div>
            )
          )}
        </div>

        {/* Sticky footer */}
        <DialogFooter className="px-6 py-4 border-t border-border/60 bg-card/50 backdrop-blur-sm shrink-0 mt-0">
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------

function WeeklyBudgetBar({
  spent, total, carryForward, remaining,
}: {
  spent: number; total: number; carryForward: number; remaining: number;
}) {
  const pctRemaining = total > 0 ? Math.min(100, Math.round((remaining / total) * 100)) : 0;
  const isOver   = remaining <= 0;
  const isRed    = !isOver && pctRemaining < 25;
  const isAmber  = !isOver && !isRed && pctRemaining < 50;

  const barColour = total <= 0
    ? ''
    : isOver  ? '[&>div]:bg-destructive'
    : isRed   ? '[&>div]:bg-red-500'
    : isAmber ? '[&>div]:bg-amber-500'
    :           '[&>div]:bg-green-500';

  const remainColour = isOver ? 'text-destructive' : isRed ? 'text-red-600' : isAmber ? 'text-amber-600' : 'text-green-700';

  return (
    <div className="rounded-md border px-3 py-2.5 space-y-2 bg-muted/30 text-xs">
      <div className="flex items-center justify-between">
        <span className="font-medium text-muted-foreground">Weekly Budget</span>
        <span className={`font-semibold ${remainColour}`}>
          {formatNaira(remaining)} remaining
        </span>
      </div>
      <Progress
        value={total > 0 ? pctRemaining : 0}
        className={`h-2 bg-muted/60 ${barColour}`}
      />
      <div className="grid grid-cols-3 text-muted-foreground gap-1">
        <div>
          <p>Used</p>
          <p className="font-semibold text-foreground tabular-nums">{formatNaira(spent)}</p>
        </div>
        <div className="text-center">
          <p>Remaining</p>
          <p className={`font-semibold tabular-nums ${remainColour}`}>{formatNaira(remaining)}</p>
        </div>
        <div className="text-right">
          <p>Total</p>
          <p className="font-semibold text-foreground tabular-nums">{formatNaira(total)}</p>
        </div>
      </div>
      {carryForward > 0 && (
        <p className="text-blue-600">
          Includes {formatNaira(carryForward)} carry-forward from last week.
        </p>
      )}
      {isOver  && <p className="text-destructive font-medium">Weekly budget exhausted.</p>}
      {isRed   && <p className="text-red-600">Less than 25% of budget remaining.</p>}
      {isAmber && <p className="text-amber-600">Less than 50% of budget remaining.</p>}
    </div>
  );
}

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

function FuelRequestFuelLevel({ vehicleId, vehicles }: { vehicleId: string | null | undefined; vehicles: VehicleSummary[] }) {
  if (!vehicleId) return <span className="text-muted-foreground">—</span>;
  const veh = vehicles.find((v) => v.id === vehicleId);
  if (!veh) return <span className="text-muted-foreground">—</span>;
  const cap = veh.tank_capacity_litres || 60;
  const cur = Math.min(veh.current_fuel_litres || 0, cap);
  const pct = cap > 0 ? Math.round((cur / cap) * 100) : 0;
  return (
    <span className={`font-medium ${pct < 20 ? 'text-red-600' : pct < 50 ? 'text-amber-600' : 'text-green-600'}`}>
      {cur.toFixed(0)}L ({pct}%)
      {pct < 20 && <AlertTriangle className="inline h-3 w-3 ml-0.5 -mt-0.5" />}
    </span>
  );
}

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
// Fleet Analytics Dashboard — visible to super_admin, admin, finance only
// ---------------------------------------------------------------------------

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

function KpiCard({
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
          )}
        </CardContent>
      </Card>

    </div>
  );
}

const Fleet = () => {
  usePageTitle('Fleet');
  const { profile } = useAuthStore();
  const { toast } = useToast();
  const isAdmin =
    profile?.role === 'admin' ||
    profile?.role === 'finance' ||
    profile?.role === 'super_admin';

  const [tab, setTab] = useState<'fuel' | 'trips' | 'vehicles' | 'my_requests' | 'activity' | 'anomalies'>('fuel');
  const [activityLogs, setActivityLogs] = useState<any[]>([]);

  const [staff, setStaff] = useState<FieldStaff[]>([]);
  const [fuelRequests, setFuelRequests] = useState<FuelRequest[]>([]);
  const [tripLogs, setTripLogs] = useState<TripLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Fuel request form
  const [showFuelForm, setShowFuelForm] = useState(false);
  const [fuelForm, setFuelForm] = useState({
    employee_id: profile?.id || '',
    station_name: '',
    amount_ngn: '',
    litres_est: '',
    odometer: '',
    reason: '',
  });

  const EMPTY_FUEL_BANK: BankAccountValue = { bank_name: '', account_number: '', account_name: '', verified: false };
  const [fuelBankDetails, setFuelBankDetails] = useState<BankAccountValue>(EMPTY_FUEL_BANK);
  const [showFuelBankSection, setShowFuelBankSection] = useState(false);
  const [fuelDoc, setFuelDoc] = useState<File | null>(null);

  // Post-payment receipt upload
  const [uploadingReceiptFor, setUploadingReceiptFor] = useState<FuelRequest | null>(null);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptForm, setReceiptForm] = useState({ fuel_station_name: '', litres_filled: '', notes: '' });
  const [submittingReceipt, setSubmittingReceipt] = useState(false);

  // Phase 1 — vehicle & weekly budget state
  const [vehicles, setVehicles] = useState<VehicleSummary[]>([]);
  const [fuelVehicleId, setFuelVehicleId] = useState('');
  const [weekBudget, setWeekBudget] = useState<{
    spent: number; total: number; carryForward: number; remaining: number;
  } | null>(null);

  // Anomaly detection
  const [showDuplicateFuelWarning, setShowDuplicateFuelWarning] = useState(false);
  const [pendingFuelAsException, setPendingFuelAsException] = useState(false);
  const [reviewingAnomaly, setReviewingAnomaly] = useState<{ type: 'trip' | 'fuel'; id: string; label: string } | null>(null);
  const [anomalyReviewDecision, setAnomalyReviewDecision] = useState<'valid' | 'fraudulent' | ''>('');
  const [anomalyReviewNote, setAnomalyReviewNote] = useState('');
  const [submittingAnomalyReview, setSubmittingAnomalyReview] = useState(false);

  // Phase 4 — repair request form
  const EMPTY_REPAIR_BANK: BankAccountValue = { bank_name: '', account_number: '', account_name: '', verified: false };
  const [showRepairForm, setShowRepairForm] = useState(false);
  const [repairForm, setRepairForm] = useState({ employee_id: profile?.id || '', description: '', amount_ngn: '', notes: '' });
  const [repairBank, setRepairBank] = useState<BankAccountValue>(EMPTY_REPAIR_BANK);
  const [repairReceipt, setRepairReceipt] = useState<File | null>(null);

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
  const [startTripForm, setStartTripForm] = useState({ vehicle_id: '', odometer_start: '', manual_location: '' });
  const [lastVehicleOdometer, setLastVehicleOdometer] = useState<number | null>(null);
  const [startingTrip, setStartingTrip] = useState(false);

  // End Trip dialog
  const [showEndTrip, setShowEndTrip] = useState(false);
  const [endGeoState, setEndGeoState] = useState<GeoState>('idle');
  const [endCoords, setEndCoords] = useState<GeoCoords | null>(null);
  const [endTripForm, setEndTripForm] = useState({ odometer_end: '', fuel_amount_ngn: '', litres: '', issues: '', manual_location: '' });
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

  useEffect(() => {
    // keep form employee_id in sync with the logged-in user
    setFuelForm((f) => ({ ...f, employee_id: profile?.id || '' }));
    setTripForm((f) => ({ ...f, employee_id: profile?.id || '' }));
  }, [profile?.id]);

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Recover any in-progress trip for this employee when their profile loads.
  useEffect(() => {
    if (!profile?.id) return;
    (async () => {
      const { data } = await supabase
        .from('trip_logs').select('*')
        .eq('driver_id', profile.id)
        .eq('status', 'in_progress')
        .limit(1).maybeSingle();
      if (data) {
        setActiveTrip({
          ...data,
          employee_id: data.driver_id,
          employee_name: profile.full_name || '',
        } as TripLog);
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

    const MIN_DIST_KM = 0.020;   // 20 m — suppress tiny GPS jitter
    const MIN_INTERVAL_MS = 15_000; // 15 s — max breadcrumb rate at rest
    const STOP_THRESHOLD_MS = 5 * 60_000; // 5 min — flag as extended stop
    const SPEED_THRESHOLD_KMH = 100;
    const HARD_BRAKE_DROP_KMH = 40;

    const onPosition = (pos: GeolocationPosition) => {
      const { latitude: lat, longitude: lng, accuracy, speed, heading } = pos.coords;
      const speedKmh = speed != null && speed >= 0 ? speed * 3.6 : null;
      setLiveSpeed(speedKmh != null ? Math.round(speedKmh) : null);

      const now = Date.now();
      const prevPos = lastBreadcrumbPosRef.current;
      const distMoved = prevPos ? haversineKm(prevPos.lat, prevPos.lng, lat, lng) : Infinity;
      const msSinceLast = now - lastBreadcrumbTimeRef.current;

      const hasMovedEnough = distMoved >= MIN_DIST_KM;
      const timeThresholdMet = msSinceLast >= MIN_INTERVAL_MS;
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
      }).then(() => {}).catch(() => {});

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
        ).then(() => {}).catch(() => {});
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTrip?.id]);

  const enrich = (rows: any[], staffList: FieldStaff[]) => {
    const byId = new Map(staffList.map((s) => [s.id, s]));
    return rows.map((r) => ({
      ...r,
      employee_id: r.driver_id,
      employee_name: byId.get(r.driver_id)?.full_name || r.driver_id,
    }));
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      // Managers (admin/finance/super_admin/operations) see all records.
      // Field staff and drivers only pull their own records from the DB.
      const canSeeAll = ['admin', 'finance', 'super_admin', 'operations'].includes(profile?.role || '');
      const uid = profile?.id || '';

      const fuelBase = supabase.from('fuel_requests').select('*').order('created_at', { ascending: false }).limit(100);
      const tripBase = supabase.from('trip_logs').select('*').order('created_at', { ascending: false }).limit(100);

      const [staffRes, profilesRes, fuelRes, tripRes, activityRes, vehicleRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, full_name, email')
          .eq('role', 'field_staff')
          .eq('status', 'active')
          .order('full_name'),
        supabase.from('profiles').select('id, full_name, email'),
        canSeeAll ? fuelBase : fuelBase.eq('driver_id', uid),
        canSeeAll ? tripBase : tripBase.eq('driver_id', uid),
        supabase
          .from('audit_logs')
          .select('*')
          .or('action_type.ilike.%fuel%,action_type.ilike.%trip%,action_type.ilike.%fleet%,action_type.ilike.%vehicle%')
          .order('created_at', { ascending: false })
          .limit(50),
        supabase
          .from('vehicles')
          .select('*')
          .eq('status', 'active')
          .order('name'),
      ]);

      const fieldStaff = (staffRes.data as FieldStaff[]) || [];
      setStaff(fieldStaff);

      const lookup = ((profilesRes.data as FieldStaff[]) || []).concat(fieldStaff);
      setFuelRequests(enrich(fuelRes.data || [], lookup));
      setTripLogs(enrich(tripRes.data || [], lookup));
      setActivityLogs(activityRes.data || []);
      setVehicles((vehicleRes.data as VehicleSummary[]) || []);
    } catch (err) {
      console.error('[Fleet] fetchData failed:', err);
    } finally {
      setLoading(false);
    }
  };

  // Fetch current-week spend for a vehicle, accounting for carry-forward.
  // Counts only approved/post-approval statuses — pending requests do not
  // reduce the available budget until the admin approves them.
  const fetchWeekBudget = async (vehicleId: string) => {
    if (!vehicleId) { setWeekBudget(null); return; }
    const v = vehicles.find((x) => x.id === vehicleId);
    if (!v || !v.weekly_budget_ngn) { setWeekBudget(null); return; }

    // Week window: Monday 00:00:00 → Sunday 23:59:59 (local time)
    const now = new Date();
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    monday.setHours(0, 0, 0, 0);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);

    const { data } = await supabase
      .from('fuel_requests')
      .select('amount_ngn')
      .eq('vehicle_id', vehicleId)
      .in('status', ['approved', 'payment_sent', 'receipt_uploaded', 'completed'])
      .gte('created_at', monday.toISOString())
      .lte('created_at', sunday.toISOString());

    const spent = (data || []).reduce((s: number, r: any) => s + (r.amount_ngn || 0), 0);
    const carryForward = v.carry_forward_ngn ?? 0;
    const total = v.weekly_budget_ngn + carryForward;
    setWeekBudget({ spent, total, carryForward, remaining: Math.max(0, total - spent) });
  };

  // Phase 4 — pre-fill odometer_start from the employee's last trip end reading
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

  // Phase 4 — submit repair reimbursement (creates expense with category='repair')
  const submitRepairRequest = async () => {
    if (!repairForm.employee_id || !repairForm.description || !repairForm.amount_ngn) {
      toast({ title: 'Employee, description and amount are required', variant: 'destructive' });
      return;
    }
    const amount = parseFloat(repairForm.amount_ngn) || 0;
    if (amount > 10000 && !repairReceipt) {
      toast({ title: 'A receipt is required for repairs over ₦10,000', variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    try {
      let receiptUrl: string | null = null;
      if (repairReceipt) {
        const compressed = await compressImage(repairReceipt);
        const ext = compressed.name.split('.').pop();
        const path = `repairs/${profile?.id}/${Date.now()}.${ext}`;
        const { data: upData } = await supabase.storage
          .from('receipts')
          .upload(path, compressed, { upsert: true });
        if (upData) {
          const { data: urlData } = supabase.storage.from('receipts').getPublicUrl(upData.path);
          receiptUrl = urlData.publicUrl;
        }
      }
      await supabase.from('expenses').insert({
        submitted_by: repairForm.employee_id,
        category: 'repair',
        budget_category: 'repair',
        amount_ngn: amount,
        date: new Date().toISOString().slice(0, 10),
        description: repairForm.description,
        status: 'pending',
        receipt_url: receiptUrl,
        ...(repairBank.verified ? {
          bank_name: repairBank.bank_name,
          account_number: repairBank.account_number,
          account_name: repairBank.account_name,
        } : {}),
      });
      await logAudit('repair_request_submitted', `Repair: ${repairForm.description} (${formatNaira(amount)})`, profile);
      await notifyRoles({
        roles: ['super_admin', 'admin', 'finance'],
        type: 'repair_request_submitted',
        module: 'fleet',
        title: 'Repair reimbursement submitted',
        body: `${formatNaira(amount)}: ${repairForm.description}`,
      });
      toast({ title: 'Repair request submitted' });
      setShowRepairForm(false);
      setRepairForm({ employee_id: profile?.id || '', description: '', amount_ngn: '', notes: '' });
      setRepairBank(EMPTY_REPAIR_BANK);
      setRepairReceipt(null);
      fetchData();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
    setSubmitting(false);
  };

  // ---- Trip clock-in helpers ----

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
          reverseGeocode(c.lat, c.lng).then(onAddress).catch(() => {});
        }
      })
      .catch((code) => { setState(code as GeoState); });
  };

  const openStartTrip = () => {
    setShowStartTrip(true);
    setStartCoords(null);
    setStartAddress(null);
    setStartTripForm({ vehicle_id: '', odometer_start: '', manual_location: '' });
    setLastVehicleOdometer(null);
    setStartGeoState('idle');
    acquireGeo(setStartGeoState, setStartCoords, setStartAddress);
    if (profile?.id) {
      fetchLastOdometer(profile.id).then((v) =>
        setStartTripForm((f) => ({ ...f, odometer_start: v })),
      );
    }
  };

  const handleStartTrip = async () => {
    const odoStart = parseFloat(startTripForm.odometer_start);
    if (!Number.isFinite(odoStart) || odoStart < 0) {
      toast({ title: 'Start odometer reading is required', variant: 'destructive' });
      return;
    }
    // Manual input is always the displayed location string.
    // GPS coordinates are stored separately for mapping.
    const locationStr = startTripForm.manual_location.trim()
      || (startCoords ? (startAddress || formatCoords(startCoords.lat, startCoords.lng)) : '');
    setStartingTrip(true);
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('trip_logs')
      .insert({
        driver_id: profile?.id,
        vehicle_id: startTripForm.vehicle_id || null,
        date: now.slice(0, 10),
        trip_start_time: now,
        start_location: locationStr,
        start_lat: startCoords?.lat ?? null,
        start_lng: startCoords?.lng ?? null,
        odometer_start: odoStart,
        status: 'in_progress',
        end_location: '',
      })
      .select('*').single();
    setStartingTrip(false);
    if (error) {
      toast({ title: 'Failed to start trip', description: error.message, variant: 'destructive' });
      return;
    }
    setActiveTrip({ ...data, employee_id: data.driver_id, employee_name: profile?.full_name || '' } as TripLog);
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
    fetchData();
  };

  const openEndTrip = () => {
    setShowEndTrip(true);
    setEndCoords(null);
    setEndAddress(null);
    setEndTripForm({ odometer_end: '', fuel_amount_ngn: '', litres: '', issues: '', manual_location: '' });
    setEndGeoState('idle');
    acquireGeo(setEndGeoState, setEndCoords, setEndAddress);
  };

  const handleEndTrip = async () => {
    if (!activeTrip) return;
    const odoEnd = parseFloat(endTripForm.odometer_end);
    if (!Number.isFinite(odoEnd) || odoEnd < 0) {
      toast({ title: 'End odometer reading is required', variant: 'destructive' });
      return;
    }
    const endLocationStr = endTripForm.manual_location.trim()
      || (endCoords ? (endAddress || formatCoords(endCoords.lat, endCoords.lng)) : '');
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

    setEndingTrip(true);
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

    // RULE 1: notify admins on trip anomaly (e.g. distance > 500 km)
    if (isAnomaly) {
      await notifyRoles({
        roles: ['super_admin', 'admin', 'operations'],
        type: 'trip_anomaly',
        module: 'fleet',
        title: 'Trip anomaly detected',
        body: anomalyReason || 'A trip has been flagged for review.',
      });
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
        const cap = veh.tank_capacity_litres || 60;
        const startLevel = veh.current_fuel_litres || 0;
        const afterConsume = startLevel - consumed;
        const floored = afterConsume < 0;
        const levelAfterConsume = Math.max(0, afterConsume);
        const newBalance = Math.min(cap, levelAfterConsume + litresPurchased);
        const vPayload: Record<string, unknown> = { current_fuel_litres: newBalance };
        if (litresPurchased > 0) vPayload.last_refuel_at = now.toISOString();
        await supabase.from('vehicles').update(vPayload).eq('id', veh.id);
        if (consumed > 0) {
          await supabase.from('fuel_level_logs').insert({
            vehicle_id: veh.id,
            event_type: 'trip_consumed',
            amount_litres: consumed,
            resulting_level_litres: levelAfterConsume,
            reference_id: activeTrip.id,
          });
        }
        if (litresPurchased > 0) {
          await supabase.from('fuel_level_logs').insert({
            vehicle_id: veh.id,
            event_type: 'fuel_added',
            amount_litres: litresPurchased,
            resulting_level_litres: newBalance,
            reference_id: activeTrip.id,
          });
        }
        if (floored) {
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
        .select('*')
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

    fetchData();
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
      supabase.from('trip_breadcrumbs').select('*').eq('trip_id', t.id).order('recorded_at'),
      supabase.from('trip_events').select('*').eq('trip_id', t.id).order('recorded_at'),
    ]);
    setMapBreadcrumbs((bcRes.data as BreadcrumbRow[]) || []);
    setMapEvents((evRes.data as TripEvent[]) || []);
    setLoadingMapData(false);
  };

  // ---- End trip clock-in helpers ----

  const submitFuelRequest = async (asException = false, skipDuplicateCheck = false) => {
    if (!fuelForm.employee_id) {
      toast({ title: 'Select an employee', variant: 'destructive' });
      return;
    }

    // Block fuel requests for vehicles currently out of service
    if (fuelVehicleId) {
      const fuelVeh = vehicles.find((v) => v.id === fuelVehicleId);
      if (fuelVeh?.out_of_service_until) {
        const today = new Date().toISOString().slice(0, 10);
        if (fuelVeh.out_of_service_until >= today) {
          toast({ title: 'Vehicle out of service', description: `This vehicle is out of service until ${formatDate(fuelVeh.out_of_service_until)}. Fuel requests are blocked.`, variant: 'destructive' });
          return;
        }
      }
    }

    // RULE 3: same-day duplicate check (only when a vehicle is selected)
    if (!skipDuplicateCheck && fuelVehicleId) {
      const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
      const dayEnd   = new Date(); dayEnd.setHours(23, 59, 59, 999);
      const { data: dupes } = await supabase
        .from('fuel_requests')
        .select('id')
        .eq('vehicle_id', fuelVehicleId)
        .gte('created_at', dayStart.toISOString())
        .lte('created_at', dayEnd.toISOString())
        .limit(1);
      if (dupes?.length) {
        setPendingFuelAsException(asException);
        setShowDuplicateFuelWarning(true);
        return;
      }
    }

    // RULE 2: fuel efficiency anomaly check
    let fuelIsAnomaly = false;
    let fuelAnomalyType: string | null = null;
    const litresEst = parseFloat(fuelForm.litres_est);
    const odometerNow = parseFloat(fuelForm.odometer);
    if (fuelVehicleId && litresEst > 0 && Number.isFinite(odometerNow) && odometerNow > 0) {
      const { data: lastTrip } = await supabase
        .from('trip_logs')
        .select('odometer_end')
        .eq('vehicle_id', fuelVehicleId)
        .not('odometer_end', 'is', null)
        .order('trip_end_time', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (lastTrip?.odometer_end) {
        const distKm = odometerNow - (lastTrip.odometer_end as number);
        if (distKm > 0) {
          const effKmL = distKm / litresEst;
          if (effKmL < 2 || effKmL > 30) {
            fuelIsAnomaly = true;
            fuelAnomalyType = 'efficiency_anomaly';
          }
        }
      }
    }

    // Append duplicate marker to note if employee confirmed a same-day re-submit
    let noteStr = fuelForm.reason;
    if (skipDuplicateCheck) {
      noteStr = noteStr ? `${noteStr} [duplicate_same_day]` : 'duplicate_same_day';
    }

    setSubmitting(true);
    const { data: inserted, error } = await supabase.from('fuel_requests').insert({
      driver_id: fuelForm.employee_id,
      station_name: fuelForm.station_name,
      amount_ngn: parseFloat(fuelForm.amount_ngn) || 0,
      litres_est: parseFloat(fuelForm.litres_est) || null,
      odometer: parseFloat(fuelForm.odometer) || null,
      reason: noteStr || null,
      status: asException ? 'budget_blocked' : 'pending',
      vehicle_id: fuelVehicleId || null,
      is_anomaly: fuelIsAnomaly,
      anomaly_type: fuelAnomalyType,
      ...(fuelBankDetails.verified ? {
        bank_name: fuelBankDetails.bank_name,
        account_number: fuelBankDetails.account_number,
        account_name: fuelBankDetails.account_name,
      } : {}),
    }).select('id').single();
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      // RULE 2: notify admins if efficiency anomaly was detected
      if (fuelIsAnomaly && inserted?.id) {
        await notifyRoles({
          roles: ['super_admin', 'admin', 'operations'],
          type: 'fuel_efficiency_anomaly',
          module: 'fleet',
          title: 'Fuel efficiency anomaly',
          body: `A fuel request was flagged: estimated efficiency outside normal range (2–30 km/L). Please review.`,
        });
      }
      // Upload supporting document (optional) and patch the URL back onto the row.
      if (fuelDoc && inserted?.id) {
        try {
          const compressed = await compressImage(fuelDoc);
          const safeName = compressed.name.replace(/[^a-zA-Z0-9._-]/g, '_');
          const path = `fuel-request-docs/${inserted.id}-${safeName}`;
          const { data: upData, error: upErr } = await supabase.storage
            .from('receipts')
            .upload(path, compressed, { upsert: true });
          if (upErr) throw upErr;
          if (upData) {
            const { data: urlData } = supabase.storage.from('receipts').getPublicUrl(upData.path);
            await supabase
              .from('fuel_requests')
              .update({ request_doc_url: urlData.publicUrl })
              .eq('id', inserted.id);
          }
        } catch (docErr: any) {
          // Don't fail the whole submission — the request is already logged.
          toast({
            title: 'Request submitted, but document upload failed',
            description: docErr?.message || 'Please edit the request to re-attach.',
            variant: 'destructive',
          });
        }
      }

      await logAudit(
        asException ? 'fuel_budget_exception_requested' : 'fuel_request_submitted',
        `Fuel request ${asException ? 'submitted as budget exception' : 'submitted'} (${formatNaira(
          parseFloat(fuelForm.amount_ngn) || 0,
        )} at ${fuelForm.station_name})`,
        profile,
      );
      await notifyRoles({
        roles: ['super_admin', 'admin', 'finance'],
        type: 'fuel_request_submitted',
        module: 'fleet',
        title: asException ? 'Fuel budget exception requested' : 'Fuel request submitted',
        body: `${formatNaira(parseFloat(fuelForm.amount_ngn) || 0)} at ${fuelForm.station_name}${asException ? ' — OVER BUDGET' : ''}`,
      });
      toast({ title: 'Fuel request submitted' });
      setShowFuelForm(false);
      setFuelForm({
        employee_id: profile?.id || '',
        station_name: '',
        amount_ngn: '',
        litres_est: '',
        odometer: '',
        reason: '',
      });
      setShowFuelBankSection(false);
      setFuelBankDetails(EMPTY_FUEL_BANK);
      setFuelVehicleId('');
      setWeekBudget(null);
      setFuelDoc(null);
      fetchData();
    }
    setSubmitting(false);
  };

  const submitTripLog = async () => {
    if (!tripForm.employee_id) {
      toast({ title: 'Select an employee', variant: 'destructive' });
      return;
    }
    const start = parseFloat(tripForm.odometer_start);
    const end = parseFloat(tripForm.odometer_end);
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
      // Update vehicle fuel balance: deduct estimated consumption, add any litres purchased
      if (tripForm.vehicle_id) {
        const veh = vehicles.find((v) => v.id === tripForm.vehicle_id);
        if (veh) {
          const eff = veh.avg_km_per_litre > 0 ? veh.avg_km_per_litre : null;
          const consumed = km && km > 0 && eff ? km / eff : 0;
          const litresPurchased = parseFloat(tripForm.litres) || 0;
          const cap = veh.tank_capacity_litres || 60;
          const newBalance = Math.min(cap, Math.max(0, (veh.current_fuel_litres || 0) - consumed + litresPurchased));
          const updatePayload: Record<string, unknown> = { current_fuel_litres: newBalance };
          if (litresPurchased > 0) updatePayload.last_refuel_at = new Date().toISOString();
          await supabase.from('vehicles').update(updatePayload).eq('id', veh.id);
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
      fetchData();
    }
    setSubmitting(false);
  };

  const [rejectingFuel, setRejectingFuel] = useState<FuelRequest | null>(null);
  const [fuelRejectReason, setFuelRejectReason] = useState('');
  const [confirmDeleteFuel, setConfirmDeleteFuel] = useState<FuelRequest | null>(null);
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
      toast({ title: 'Error saving', description: error.message, variant: 'destructive' });
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
            const cap = veh.tank_capacity_litres || 60;
            const newBalance = Math.min(cap, Math.max(0, (veh.current_fuel_litres || 0) + delta));
            await supabase.from('vehicles').update({ current_fuel_litres: newBalance }).eq('id', veh.id);
            await logAudit(
              'trip_fuel_adjusted',
              `Trip edit adjusted ${veh.plate_number} fuel balance by ${delta > 0 ? '+' : ''}${delta.toFixed(1)} L (now ${newBalance.toFixed(1)} L)`,
              profile,
            );
          }
        }
      }
      toast({ title: 'Trip log updated' });
      setSelectedTrip(null);
      setTripEditMode(false);
      await fetchData();
    }
  };

  const handleFuelAction = async (
    request: FuelRequest,
    status: 'approved' | 'rejected',
  ) => {
    if (!isAdmin) {
      toast({
        title: 'Not authorized',
        description: 'Only Admin or Finance roles can approve or reject fuel requests.',
        variant: 'destructive',
      });
      return;
    }
    if (status === 'rejected') {
      setRejectingFuel(request);
      setFuelRejectReason('');
      return;
    }
    const now = new Date().toISOString();
    const { error } = await supabase
      .from('fuel_requests')
      .update({ status: 'approved' })
      .eq('id', request.id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    await supabase.from('expenses').insert({
      category: 'fuel',
      budget_category: 'fuel',
      amount_ngn: request.amount_ngn,
      date: now.slice(0, 10),
      description: `Fuel — ${request.station_name || 'Station'} — ${request.reason || 'Fuel request'}`,
      submitted_by: (request as any).driver_id || request.employee_id,
      status: 'approved',
      approved_by: profile?.id,
      approved_at: now,
      ...(request.bank_name ? {
        bank_name: request.bank_name,
        account_number: request.account_number,
        account_name: request.account_name,
      } : {}),
    });
    burst({ palette: 'success', count: 50 });
    await logAudit(
      'fuel_request_approved',
      `Fuel request for ${request.employee_name} approved (${formatNaira(request.amount_ngn || 0)})`,
      profile,
    );
    if ((request as any).driver_id || request.employee_id) {
      await notifyUser({
        userId: (request as any).driver_id || request.employee_id,
        type: 'fuel_request_approved',
        module: 'fleet',
        title: 'Your fuel request was approved',
        body: `${formatNaira(request.amount_ngn || 0)} at ${request.station_name}`,
      });
    }

    // Update vehicle fuel balance when a vehicle was specified on the request
    if ((request as any).vehicle_id && request.litres_est && request.litres_est > 0) {
      const veh = vehicles.find((v) => v.id === (request as any).vehicle_id);
      if (veh) {
        const newBalance = Math.min(veh.current_fuel_litres + request.litres_est, veh.tank_capacity_litres);
        await supabase
          .from('vehicles')
          .update({ current_fuel_litres: newBalance, last_refuel_at: now })
          .eq('id', veh.id);
      }
    }

    // Phase 2 — auto-pay via Paystack if the employee provided bank details
    if (request.bank_name && request.account_number && request.account_name) {
      try {
        const { data: batch } = await supabase.from('payment_batches').insert({
          name: `Fuel Reimbursement — ${request.account_name}`,
          payment_date: now.slice(0, 10),
          total_amount: request.amount_ngn,
          beneficiary_count: 1,
          status: 'approved',
          is_quick_pay: true,
          payment_category: 'fuel_reimbursement',
          batch_type: 'contractor',
          created_by: profile?.id,
        }).select().single();
        if (batch) {
          const { data: batchItem } = await supabase.from('batch_items').insert({
            batch_id: batch.id,
            full_name: request.account_name,
            bank_name: request.bank_name,
            account_number: request.account_number,
            amount_ngn: request.amount_ngn,
            item_type: 'adhoc',
            status: 'pending',
          }).select().single();
          await supabase.from('fuel_requests').update({ batch_id: batch.id }).eq('id', request.id);
          const bankCode = await getBankCode(request.bank_name);
          const recipient = await createTransferRecipient({
            name: request.account_name,
            account_number: request.account_number,
            bank_code: bankCode,
          });
          await initiateTransfer({
            recipient_code: recipient.recipient_code,
            amount_ngn: request.amount_ngn,
            reference: batch.id,
            reason: `Fuel reimbursement — ${request.station_name}`,
          });
          if (batchItem) {
            await supabase.from('batch_items')
              .update({ paystack_recipient_code: recipient.recipient_code })
              .eq('id', batchItem.id);
          }
          toast({ title: 'Approved & payment initiated automatically' });
        }
      } catch (autoPayErr) {
        console.warn('[Fleet] auto-pay failed:', autoPayErr);
        toast({ title: 'Approved. Bank transfer failed — process manually via Expenses.' });
      }
    } else {
      toast({ title: 'Fuel request approved' });
    }
    // Fire smart-alerts for budget thresholds (best-effort)
    if ((request as any).vehicle_id) {
      supabase.functions.invoke('fleet-alerts', {
        body: { event: 'fuel_approved', vehicle_id: (request as any).vehicle_id },
      }).catch(() => {/* best-effort */});
    }
    fetchData();
  };

  const handleBudgetException = async (r: FuelRequest) => {
    if (profile?.role !== 'super_admin' && profile?.role !== 'admin') {
      toast({ title: 'Only super_admin or admin may approve budget exceptions', variant: 'destructive' });
      return;
    }
    const now = new Date().toISOString();
    const note = `Approved as budget exception by ${profile.full_name || 'Admin'} on ${new Date().toLocaleDateString('en-GB')}.`;
    const { error } = await supabase
      .from('fuel_requests')
      .update({
        status: 'approved',
        budget_exception: true,
        budget_exception_by: profile.id,
        budget_exception_at: now,
        admin_note: r.admin_note ? `${r.admin_note}\n${note}` : note,
      })
      .eq('id', r.id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    await supabase.from('expenses').insert({
      category: 'fuel',
      budget_category: 'fuel',
      amount_ngn: r.amount_ngn,
      date: now.slice(0, 10),
      description: `Fuel — ${r.station_name || 'Station'} — ${r.reason || 'Fuel request'} [Budget Exception]`,
      submitted_by: (r as any).driver_id || r.employee_id,
      status: 'approved',
      approved_by: profile.id,
      approved_at: now,
      ...(r.bank_name ? {
        bank_name: r.bank_name,
        account_number: r.account_number,
        account_name: r.account_name,
      } : {}),
    });
    await logAudit(
      'fuel_budget_exception_approved',
      `Budget exception approved for ${r.employee_name} (${formatNaira(r.amount_ngn || 0)}) by ${profile.full_name}`,
      profile,
    );
    const employeeId = (r as any).driver_id || r.employee_id;
    if (employeeId) {
      await notifyUser({
        userId: employeeId,
        type: 'fuel_request_approved',
        module: 'fleet',
        title: 'Your fuel request was approved as a budget exception',
        body: `${formatNaira(r.amount_ngn || 0)} at ${r.station_name}`,
      });
    }
    toast({ title: 'Budget exception approved' });
    // Fire smart-alerts for budget thresholds (best-effort)
    if ((r as any).vehicle_id) {
      supabase.functions.invoke('fleet-alerts', {
        body: { event: 'fuel_approved', vehicle_id: (r as any).vehicle_id },
      }).catch(() => {/* best-effort */});
    }
    fetchData();
  };

  const handleMarkPaymentSent = async (r: FuelRequest) => {
    const { error } = await supabase
      .from('fuel_requests')
      .update({ status: 'payment_sent', payment_sent_at: new Date().toISOString() })
      .eq('id', r.id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    await logAudit(
      'fuel_payment_sent',
      `Payment marked as sent for ${r.employee_name} (${formatNaira(r.amount_ngn || 0)})`,
      profile,
    );
    const employeeId = (r as any).driver_id || r.employee_id;
    if (employeeId) {
      await notifyUser({
        userId: employeeId,
        type: 'fuel_payment_sent',
        module: 'fleet',
        title: 'Fuel payment sent',
        body: `${formatNaira(r.amount_ngn || 0)} has been sent. Please upload your receipt.`,
      });
    }
    toast({ title: 'Payment marked as sent. Employee will be prompted to upload receipt.' });
    fetchData();
  };

  const submitFuelReceipt = async () => {
    if (!uploadingReceiptFor || !receiptFile) {
      toast({ title: 'Please select a receipt file', variant: 'destructive' });
      return;
    }
    setSubmittingReceipt(true);
    try {
      const compressed = await compressImage(receiptFile);
      const safeName = compressed.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `fuel-receipts/${uploadingReceiptFor.id}-${safeName}`;
      const { data: upData, error: upErr } = await supabase.storage
        .from('receipts')
        .upload(path, compressed, { upsert: true });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from('receipts').getPublicUrl(upData.path);
      const { error } = await supabase
        .from('fuel_requests')
        .update({
          status: 'receipt_uploaded',
          receipt_url: urlData.publicUrl,
          fuel_station_name: receiptForm.fuel_station_name.trim() || null,
          litres_filled: parseFloat(receiptForm.litres_filled) || null,
          admin_note: receiptForm.notes.trim() || null,
        })
        .eq('id', uploadingReceiptFor.id);
      if (error) throw error;
      // CHANGE 2 — bump vehicle fuel level from actual litres filled
      const litresFilledNum = parseFloat(receiptForm.litres_filled) || 0;
      const receiptVehicleId = (uploadingReceiptFor as any).vehicle_id as string | null;
      if (receiptVehicleId && litresFilledNum > 0) {
        const veh = vehicles.find((v) => v.id === receiptVehicleId);
        if (veh) {
          const cap = veh.tank_capacity_litres || 60;
          const newLevel = Math.min(cap, (veh.current_fuel_litres || 0) + litresFilledNum);
          await supabase.from('vehicles').update({
            current_fuel_litres: newLevel,
            last_refuel_at: new Date().toISOString(),
          }).eq('id', receiptVehicleId);
          await supabase.from('fuel_level_logs').insert({
            vehicle_id: receiptVehicleId,
            event_type: 'fuel_added',
            amount_litres: litresFilledNum,
            resulting_level_litres: newLevel,
            reference_id: uploadingReceiptFor.id,
          });
        }
      }
      await logAudit(
        'fuel_receipt_uploaded',
        `Receipt uploaded for fuel request (${formatNaira(uploadingReceiptFor.amount_ngn || 0)})`,
        profile,
      );
      await notifyRoles({
        roles: ['super_admin', 'admin', 'finance'],
        type: 'fuel_receipt_uploaded',
        module: 'fleet',
        title: 'Fuel receipt uploaded',
        body: `${profile?.full_name || 'Employee'} uploaded a receipt for ${formatNaira(uploadingReceiptFor.amount_ngn || 0)}`,
      });
      toast({ title: 'Receipt submitted. Admin will review.' });
      setUploadingReceiptFor(null);
      setReceiptFile(null);
      setReceiptForm({ fuel_station_name: '', litres_filled: '', notes: '' });
      fetchData();
    } catch (err: any) {
      toast({ title: 'Error uploading receipt', description: err.message, variant: 'destructive' });
    }
    setSubmittingReceipt(false);
  };

  const handleMarkComplete = async (r: FuelRequest) => {
    const { error } = await supabase
      .from('fuel_requests')
      .update({ status: 'completed' })
      .eq('id', r.id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    await logAudit('fuel_request_completed', `Fuel request completed for ${r.employee_name} (${formatNaira(r.amount_ngn || 0)})`, profile);
    const employeeId = (r as any).driver_id || r.employee_id;
    if (employeeId) {
      await notifyUser({
        userId: employeeId,
        type: 'fuel_request_completed',
        module: 'fleet',
        title: 'Fuel request completed',
        body: `Your fuel request for ${formatNaira(r.amount_ngn || 0)} has been marked complete.`,
      });
    }
    toast({ title: 'Marked as complete' });
    fetchData();
  };

  const handleRequestReceiptResubmission = async (r: FuelRequest) => {
    const { error } = await supabase
      .from('fuel_requests')
      .update({ status: 'payment_sent', receipt_url: null })
      .eq('id', r.id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    await logAudit('fuel_receipt_resubmission_requested', `Receipt resubmission requested for ${r.employee_name}`, profile);
    const employeeId = (r as any).driver_id || r.employee_id;
    if (employeeId) {
      await notifyUser({
        userId: employeeId,
        type: 'fuel_receipt_resubmission',
        module: 'fleet',
        title: 'Receipt resubmission required',
        body: 'Admin has requested a new receipt for your fuel payment. Please re-upload.',
      });
    }
    toast({ title: 'Resubmission requested. Employee notified.' });
    fetchData();
  };

  const confirmFuelReject = async () => {
    if (!rejectingFuel) return;
    if (!isValidRejectionReason(fuelRejectReason)) {
      toast({ title: 'Reason is required (min 10 chars)', variant: 'destructive' });
      return;
    }
    const r = rejectingFuel;
    const { error } = await supabase
      .from('fuel_requests')
      .update({
        status: 'rejected',
        rejection_reason: fuelRejectReason.trim(),
        admin_note: fuelRejectReason.trim(),
      })
      .eq('id', r.id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    await writeRejectionNotification({
      entity: 'fuel',
      entityLabel: 'fuel request',
      amount: r.amount_ngn,
      reason: fuelRejectReason.trim(),
      submitterId: (r as any).driver_id || r.employee_id || null,
      actor: profile,
      auditType: 'fuel_request_rejected',
      auditDescription: `Fuel request for ${r.employee_name} rejected (${formatNaira(r.amount_ngn || 0)}): ${fuelRejectReason.trim()}`,
    });
    toast({ title: 'Fuel request rejected' });
    setRejectingFuel(null);
    setFuelRejectReason('');
    fetchData();
  };

  const resubmitFuel = async (r: FuelRequest) => {
    const { error } = await supabase.from('fuel_requests').insert({
      driver_id: profile?.id,
      station_name: r.station_name,
      amount_ngn: r.amount_ngn,
      litres_est: r.litres_est,
      odometer: r.odometer,
      reason: r.reason,
      status: 'pending',
      resubmitted_from_id: r.id,
    } as any);
    if (error) {
      toast({ title: 'Resubmit failed', description: error.message, variant: 'destructive' });
      return;
    }
    await logAudit(
      'resubmission_created',
      `Fuel request re-edited and resubmitted (${formatNaira(r.amount_ngn || 0)})`,
      profile,
    );
    toast({ title: 'Resubmitted for approval' });
    fetchData();
  };

  const deleteFuelRequest = async (r: FuelRequest) => {
    const { error } = await supabase.from('fuel_requests').delete().eq('id', r.id);
    if (error) {
      toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
      return;
    }
    await logAudit('fuel_request_deleted', `Fuel request for ${r.employee_name} deleted (${formatNaira(r.amount_ngn || 0)})`, profile);
    toast({ title: 'Fuel request deleted' });
    setConfirmDeleteFuel(null);
    fetchData();
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
    fetchData();
  };

  const handleAnomalyReview = async () => {
    if (!reviewingAnomaly || !anomalyReviewDecision || !anomalyReviewNote.trim()) return;
    setSubmittingAnomalyReview(true);
    const reviewedAt = new Date().toISOString();
    const reviewPayload = {
      anomaly_reviewed_by: profile?.id,
      anomaly_reviewed_at: reviewedAt,
      anomaly_review_note: `${anomalyReviewDecision === 'valid' ? 'Reviewed — Valid' : 'Fraudulent / Error'}: ${anomalyReviewNote.trim()}`,
    };
    const table = reviewingAnomaly.type === 'trip' ? 'trip_logs' : 'fuel_requests';
    const { error } = await supabase.from(table).update(reviewPayload).eq('id', reviewingAnomaly.id);
    setSubmittingAnomalyReview(false);
    if (error) {
      toast({ title: 'Review failed', description: error.message, variant: 'destructive' });
      return;
    }
    await logAudit(
      'anomaly_reviewed',
      `Anomaly on ${reviewingAnomaly.type} "${reviewingAnomaly.label}" marked as ${anomalyReviewDecision === 'valid' ? 'Valid' : 'Fraudulent/Error'}: ${anomalyReviewNote.trim()}`,
      profile,
    );
    toast({ title: 'Anomaly review saved' });
    setReviewingAnomaly(null);
    setAnomalyReviewDecision('');
    setAnomalyReviewNote('');
    fetchData();
  };

  if (loading) return <TableSkeleton rows={5} />;

  // Phase 4 — service alerts (vehicles with expiries within 30 days)
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

  const myFuelRequests = fuelRequests.filter((r) => r.employee_id === profile?.id);
  const myTripLogs = tripLogs.filter((r) => r.employee_id === profile?.id);

  const visibleFuel = isAdmin ? fuelRequests : myFuelRequests;
  const visibleTrips = isAdmin ? tripLogs : myTripLogs;

  const anomalousTrips = tripLogs.filter((t) => t.is_anomaly || t.is_out_of_area);
  const anomalousFuelReqs = fuelRequests.filter((r) => r.is_anomaly);
  const totalAnomalies = anomalousTrips.length + anomalousFuelReqs.length;

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

  const pendingFuelCount = fuelRequests.filter((r) => r.status === 'pending').length;
  const activeVehicleCount = vehicles.filter((v) => (v as any).status !== 'retired').length;

  return (
    <div className="space-y-6">
      {/* Mission control hero */}
      <AuroraHero className="p-5 sm:p-6" scanLine={totalAnomalies > 0}>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Car className="h-4 w-4 opacity-80 kd-icon-glow" />
              <span className="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-80">Fleet · Operations Deck</span>
            </div>
            <h1 className="kd-display text-3xl sm:text-4xl font-bold tracking-tight">
              {totalAnomalies > 0 ? `${totalAnomalies} anomal${totalAnomalies === 1 ? 'y' : 'ies'} flagged` : 'Fleet running smoothly'}
            </h1>
            <p className="text-sm opacity-70 mt-1.5">
              {isAdmin
                ? 'Review fuel requests, trip logs, and keep the fleet on the road.'
                : 'Submit fuel requests and daily trip logs.'}
            </p>
          </div>
          {/* Live status pills */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/15 text-xs font-medium">
              <Car className="h-3 w-3" /> {activeVehicleCount} active vehicle{activeVehicleCount === 1 ? '' : 's'}
            </span>
            {isAdmin && (
              <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/15 text-xs font-medium">
                <Fuel className="h-3 w-3" />
                <span className={`h-1.5 w-1.5 rounded-full ${pendingFuelCount > 0 ? 'bg-amber-300 kd-status-live-warning' : 'bg-emerald-400 kd-status-live-success'}`} />
                {pendingFuelCount} pending fuel
              </span>
            )}
            {totalAnomalies > 0 && (
              <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-500/20 backdrop-blur-md border border-red-300/30 text-xs font-medium">
                <AlertTriangle className="h-3 w-3 text-red-200" />
                <span className="h-1.5 w-1.5 rounded-full bg-red-400 kd-status-live-danger" />
                {totalAnomalies} anomal{totalAnomalies === 1 ? 'y' : 'ies'}
              </span>
            )}
            <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/15 text-xs font-medium">
              <Radio className="h-3 w-3" /> Live telemetry
            </span>
          </div>
        </div>
      </AuroraHero>

      {/* Fleet analytics — admins / finance only */}
      {isAdmin && (
        <FleetAnalyticsDashboard
          vehicles={vehicles}
          staff={staff}
          onNavigateToVehicles={() => setTab('vehicles')}
        />
      )}

      {/* Phase 4 — service / compliance alerts */}
      {serviceAlerts.length > 0 && (
        <div className="flex flex-col gap-2">
          {serviceAlerts.map((v) => (
            <ServiceAlert key={v.id} v={v} todayStr={todayStr} in30Str={in30Str} />
          ))}
        </div>
      )}

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        {/* Mobile: horizontal scroll lets tabs stay readable instead of clipping */}
        <div className="overflow-x-auto kd-mobile-snap-x -mx-1 sm:mx-0 px-1 sm:px-0">
          <TabsList className="w-max sm:w-full">
            <TabsTrigger value="fuel" className="shrink-0">
              <Fuel className="mr-2 h-4 w-4" /> Fuel Requests
            </TabsTrigger>
            <TabsTrigger value="my_requests" className="shrink-0">
              <User className="mr-2 h-4 w-4" /> My Requests
            </TabsTrigger>
            <TabsTrigger value="trips" className="shrink-0">
              <MapPin className="mr-2 h-4 w-4" /> Trip Logs
            </TabsTrigger>
            {isAdmin && (
              <TabsTrigger value="vehicles" className="shrink-0">
                <Car className="mr-2 h-4 w-4" /> Vehicles
              </TabsTrigger>
            )}
            <TabsTrigger value="activity" className="shrink-0">
              <History className="mr-2 h-4 w-4" /> Activity
            </TabsTrigger>
            {isAdmin && (
              <TabsTrigger value="anomalies" className="relative shrink-0">
                <AlertTriangle className="mr-2 h-4 w-4" /> Anomalies
                {totalAnomalies > 0 && (
                  <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold w-4 h-4 kd-status-live-danger">
                    {totalAnomalies > 9 ? '9+' : totalAnomalies}
                  </span>
                )}
              </TabsTrigger>
            )}
          </TabsList>
        </div>

        {/* FUEL */}
        <TabsContent value="fuel" className="mt-4 space-y-4">
          <div className="flex justify-end gap-2 flex-wrap">
            {isAdmin && visibleFuel.length > 0 && (
              <Button variant="outline" size="sm" onClick={() => exportCsv(
                visibleFuel.map((r) => ({
                  date: r.created_at.slice(0, 10),
                  employee: r.employee_name,
                  station: r.station_name,
                  amount_ngn: r.amount_ngn,
                  litres_est: r.litres_est ?? '',
                  litres_filled: r.litres_filled ?? '',
                  odometer: r.odometer ?? '',
                  status: r.status,
                  is_anomaly: r.is_anomaly ? 'yes' : '',
                  anomaly_type: r.anomaly_type ?? '',
                })),
                `fuel-requests-${new Date().toISOString().slice(0, 10)}.csv`,
              )}>
                <Download className="mr-2 h-4 w-4" /> Export CSV
              </Button>
            )}
            <Button variant="outline" onClick={() => setShowRepairForm(true)}>
              <Wrench className="mr-2 h-4 w-4" /> Repair Request
            </Button>
            <Button onClick={() => setShowFuelForm(true)}>
              <Plus className="mr-2 h-4 w-4" /> New Fuel Request
            </Button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {isAdmin ? 'All Fuel Requests' : 'My Fuel Requests'}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Station</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Litres</TableHead>
                    <TableHead>Vehicle Fuel</TableHead>
                    <TableHead>Purpose</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                    {isAdmin && <TableHead className="text-right">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleFuel.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={isAdmin ? 9 : 8}
                        className="text-center text-muted-foreground text-sm py-8"
                      >
                        No fuel requests yet.
                      </TableCell>
                    </TableRow>
                  )}
                  {visibleFuel.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.employee_name}</TableCell>
                      <TableCell>{r.station_name}</TableCell>
                      <TableCell className="text-right currency">
                        {formatNaira(r.amount_ngn || 0)}
                      </TableCell>
                      <TableCell className="text-right">{r.litres_est ?? '—'}</TableCell>
                      <TableCell className="text-xs">
                        <FuelRequestFuelLevel vehicleId={(r as any).vehicle_id} vehicles={vehicles} />
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-xs">
                        <p className="truncate">{r.reason || '—'}</p>
                        {r.request_doc_url && (
                          <div className="mt-1">
                            <FilePreviewTrigger
                              url={r.request_doc_url}
                              label="View Document"
                              fileName={`fuel-request-${r.id.slice(0, 8)}`}
                              variant="link"
                            />
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {r.status === 'budget_blocked'
                          ? <Badge variant="outline" className="border-red-300 text-red-700 bg-red-50 dark:bg-red-950/20 dark:text-red-400">Over Budget</Badge>
                          : <StatusBadge status={r.status} />}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDate(r.created_at)}
                      </TableCell>
                      {isAdmin && (
                        <TableCell>
                          {r.status === 'budget_blocked' ? (
                            <div className="flex justify-end gap-1 flex-wrap">
                              {(profile?.role === 'super_admin' || profile?.role === 'admin') && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-xs text-amber-700 border-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/20"
                                  onClick={() => handleBudgetException(r)}
                                >
                                  <Check className="h-3 w-3 mr-1" /> Approve as Budget Exception
                                </Button>
                              )}
                              <Button size="sm" variant="ghost" onClick={() => setConfirmDeleteFuel(r)} title="Delete">
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          ) : r.status === 'pending' ? (
                            <div className="flex justify-end gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleFuelAction(r, 'approved')}
                              >
                                <Check className="h-4 w-4 text-success" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleFuelAction(r, 'rejected')}
                              >
                                <X className="h-4 w-4 text-destructive" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setConfirmDeleteFuel(r)}
                                title="Delete"
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          ) : r.status === 'approved' ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-xs"
                              onClick={() => handleMarkPaymentSent(r)}
                            >
                              <CreditCard className="h-3 w-3 mr-1" /> Mark Payment Sent
                            </Button>
                          ) : r.status === 'receipt_uploaded' ? (
                            <div className="flex justify-end gap-1 flex-wrap">
                              {r.receipt_url && (
                                <FilePreviewTrigger
                                  url={r.receipt_url}
                                  label="View Receipt"
                                  fileName={`fuel-receipt-${r.id.slice(0, 8)}`}
                                />
                              )}
                              <Button size="sm" variant="outline" className="text-xs text-green-700 border-green-300 hover:bg-green-50" onClick={() => handleMarkComplete(r)}>
                                <Check className="h-3 w-3 mr-1" /> Complete
                              </Button>
                              <Button size="sm" variant="ghost" className="text-xs" onClick={() => handleRequestReceiptResubmission(r)}>
                                <RotateCcw className="h-3 w-3 mr-1" /> Re-request
                              </Button>
                            </div>
                          ) : r.status === 'rejected' && r.employee_id === profile?.id ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => resubmitFuel(r)}
                            >
                              Re-edit & Resubmit
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </div>

              {/* Mobile fuel requests — thumb-friendly card list */}
              <div className="md:hidden p-3 space-y-2">
                {visibleFuel.length === 0 ? (
                  <p className="text-center text-muted-foreground text-sm py-8">No fuel requests yet.</p>
                ) : visibleFuel.map((r) => {
                  const accent =
                    r.status === 'pending' ? 'bg-amber-500'
                    : r.status === 'approved' ? 'bg-emerald-500'
                    : r.status === 'rejected' ? 'bg-red-500'
                    : r.status === 'budget_blocked' ? 'bg-red-500'
                    : r.status === 'receipt_uploaded' ? 'bg-blue-500'
                    : 'bg-muted-foreground';
                  return (
                    <MobileCard key={r.id} accentClassName={accent}>
                      <MobileCardHeader>
                        <div className="min-w-0 flex-1">
                          <MobileCardTitle>{r.employee_name}</MobileCardTitle>
                          <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                            {r.station_name}
                          </p>
                        </div>
                        <MobileCardMeta className="currency text-base">
                          {formatNaira(r.amount_ngn || 0)}
                        </MobileCardMeta>
                      </MobileCardHeader>

                      <div className="flex items-center gap-3 text-xs">
                        {r.status === 'budget_blocked'
                          ? <Badge variant="outline" className="border-red-300 text-red-700 bg-red-50">Over Budget</Badge>
                          : <StatusBadge status={r.status} />}
                        <span className="text-muted-foreground tabular-nums ml-auto">
                          {r.litres_est ? `${r.litres_est} L` : ''}
                        </span>
                        <span className="text-muted-foreground">{formatDate(r.created_at)}</span>
                      </div>

                      {r.reason && (
                        <p className="text-xs text-muted-foreground line-clamp-2">{r.reason}</p>
                      )}

                      {r.request_doc_url && (
                        <FilePreviewTrigger
                          url={r.request_doc_url}
                          label="View Document"
                          fileName={`fuel-request-${r.id.slice(0, 8)}`}
                          variant="link"
                        />
                      )}

                      {/* Admin actions, condensed for mobile */}
                      {isAdmin && r.status === 'pending' && (
                        <MobileCardFooter>
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1 h-9 border-destructive/40 text-destructive hover:bg-destructive/5"
                            onClick={() => handleFuelAction(r, 'rejected')}
                          >
                            <X className="h-4 w-4 mr-1.5" /> Reject
                          </Button>
                          <Button
                            size="sm"
                            className="flex-1 h-9 bg-success hover:bg-success/90 text-success-foreground"
                            onClick={() => handleFuelAction(r, 'approved')}
                          >
                            <Check className="h-4 w-4 mr-1.5" /> Approve
                          </Button>
                        </MobileCardFooter>
                      )}
                      {isAdmin && r.status === 'budget_blocked' && (profile?.role === 'super_admin' || profile?.role === 'admin') && (
                        <MobileCardFooter>
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1 h-9 text-amber-700 border-amber-300 hover:bg-amber-50"
                            onClick={() => handleBudgetException(r)}
                          >
                            <Check className="h-4 w-4 mr-1.5" /> Approve as Exception
                          </Button>
                        </MobileCardFooter>
                      )}
                      {isAdmin && r.status === 'approved' && (
                        <MobileCardFooter>
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1 h-9"
                            onClick={() => handleMarkPaymentSent(r)}
                          >
                            <CreditCard className="h-4 w-4 mr-1.5" /> Mark Payment Sent
                          </Button>
                        </MobileCardFooter>
                      )}
                      {isAdmin && r.status === 'receipt_uploaded' && (
                        <MobileCardFooter>
                          {r.receipt_url && (
                            <FilePreviewTrigger
                              url={r.receipt_url}
                              label="View Receipt"
                              fileName={`fuel-receipt-${r.id.slice(0, 8)}`}
                              className="flex-1 h-9"
                            />
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1 h-9 text-green-700 border-green-300 hover:bg-green-50"
                            onClick={() => handleMarkComplete(r)}
                          >
                            <Check className="h-4 w-4 mr-1.5" /> Complete
                          </Button>
                        </MobileCardFooter>
                      )}
                      {r.status === 'rejected' && r.employee_id === profile?.id && (
                        <MobileCardFooter>
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1 h-9"
                            onClick={() => resubmitFuel(r)}
                          >
                            Re-edit & Resubmit
                          </Button>
                        </MobileCardFooter>
                      )}
                    </MobileCard>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TRIPS */}
        <TabsContent value="trips" className="mt-4 space-y-4">
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
                  <p className="text-xs truncate">{activeTrip.start_location || '—'}</p>
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
                    GPS tracking active · Last ping {lastBreadcrumbAt.toLocaleTimeString('en-GB')} · {breadcrumbCount} pings recorded
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
                        <p className="text-xs text-muted-foreground truncate">From: {t.start_location || '—'}</p>
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
              <div className="hidden md:block">
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
                        {t.trip_start_time
                          ? new Date(t.trip_start_time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
                          : '—'}
                      </TableCell>
                      <TableCell className="text-xs tabular-nums">
                        {t.trip_end_time
                          ? new Date(t.trip_end_time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
                          : t.status === 'in_progress' ? <span className="text-green-600 font-medium">Live</span> : '—'}
                      </TableCell>
                      <TableCell className="text-xs tabular-nums">
                        {t.duration_minutes != null
                          ? `${Math.floor(t.duration_minutes / 60)}h ${t.duration_minutes % 60}m`
                          : '—'}
                      </TableCell>
                      <TableCell className="text-xs font-mono max-w-[140px] truncate" title={t.start_location}>
                        {t.start_location || '—'}
                      </TableCell>
                      <TableCell className="text-xs font-mono max-w-[140px] truncate" title={t.end_location}>
                        {t.end_location || (t.status === 'in_progress' ? <span className="text-green-600 italic">In progress…</span> : '—')}
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
                            {t.trip_start_time && ` · ${new Date(t.trip_start_time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`}
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
                          <span className="font-mono text-[11px] truncate flex-1">{t.start_location || '—'}</span>
                        </div>
                        <div className="flex items-start gap-2">
                          <span className="text-muted-foreground w-10 shrink-0">To</span>
                          <span className="font-mono text-[11px] truncate flex-1">
                            {t.end_location || (isLive ? <span className="text-green-600 italic">In progress…</span> : '—')}
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
        </TabsContent>

        {/* MY REQUESTS */}
        <TabsContent value="my_requests" className="mt-4 space-y-4">
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowRepairForm(true)}>
              <Wrench className="mr-2 h-4 w-4" /> Repair Request
            </Button>
            <Button onClick={() => setShowFuelForm(true)}>
              <Plus className="mr-2 h-4 w-4" /> New Fuel Request
            </Button>
          </div>

          {/* Yellow action banners for payment_sent requests */}
          {myFuelRequests.filter((r) => r.status === 'payment_sent').map((r) => (
            <div
              key={r.id}
              className="flex items-start gap-3 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-200"
            >
              <AlertTriangle className="h-5 w-5 mt-0.5 shrink-0 text-amber-600" />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm">Payment sent for {r.station_name} — {formatNaira(r.amount_ngn || 0)}</p>
                <p className="text-xs mt-0.5">
                  {r.payment_sent_at ? `Sent on ${formatDate(r.payment_sent_at)}. ` : ''}
                  Please upload your fuel receipt to complete this request.
                </p>
              </div>
              <Button
                size="sm"
                className="shrink-0 bg-amber-600 hover:bg-amber-700 text-white"
                onClick={() => {
                  setUploadingReceiptFor(r);
                  setReceiptFile(null);
                  setReceiptForm({ fuel_station_name: r.station_name || '', litres_filled: '', notes: '' });
                }}
              >
                <Upload className="h-3.5 w-3.5 mr-1.5" /> Upload Receipt
              </Button>
            </div>
          ))}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">My Fuel Requests</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Station</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Litres</TableHead>
                    <TableHead>Purpose</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {myFuelRequests.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground text-sm py-8">
                        You have no fuel requests yet.
                      </TableCell>
                    </TableRow>
                  )}
                  {myFuelRequests.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.station_name}</TableCell>
                      <TableCell className="text-right currency">{formatNaira(r.amount_ngn || 0)}</TableCell>
                      <TableCell className="text-right">{r.litres_est ?? '—'}</TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-xs truncate">{r.reason || '—'}</TableCell>
                      <TableCell><StatusBadge status={r.status} /></TableCell>
                      <TableCell className="text-muted-foreground">{formatDate(r.created_at)}</TableCell>
                      <TableCell>
                        {r.status === 'payment_sent' && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs"
                            onClick={() => {
                              setUploadingReceiptFor(r);
                              setReceiptFile(null);
                              setReceiptForm({ fuel_station_name: r.station_name || '', litres_filled: '', notes: '' });
                            }}
                          >
                            <Upload className="h-3 w-3 mr-1" /> Upload Receipt
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ACTIVITY */}
        <TabsContent value="activity" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Fleet Activity Log</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Action</TableHead>
                    <TableHead>Details</TableHead>
                    <TableHead>By</TableHead>
                    <TableHead>When</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activityLogs.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground text-sm py-8">
                        No fleet activity recorded yet.
                      </TableCell>
                    </TableRow>
                  )}
                  {activityLogs.map((log: any) => (
                    <TableRow key={log.id}>
                      <TableCell className="font-medium capitalize">
                        {(log.action_type || '').replace(/_/g, ' ')}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-sm truncate">
                        {log.description || '—'}
                      </TableCell>
                      <TableCell className="text-sm">
                        {log.performed_by_name || log.performed_by?.slice(0, 8) || '—'}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {log.created_at ? formatDate(log.created_at) : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* VEHICLES */}
        {isAdmin && (
          <TabsContent value="vehicles" className="mt-4">
            <VehiclesTab staff={staff} />
          </TabsContent>
        )}

        {/* ANOMALIES */}
        {isAdmin && (
          <TabsContent value="anomalies" className="mt-4 space-y-6">
            <div>
              <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-500" /> Flagged Trip Logs
                <span className="text-xs text-muted-foreground font-normal">({anomalousTrips.length})</span>
              </h2>
              {anomalousTrips.length === 0 ? (
                <Card><CardContent className="p-0"><EmptyState illustration="radar" title="No anomalous trips" description="All trip logs look normal. Anything unusual will surface here." /></CardContent></Card>
              ) : (
                <Card>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Employee</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>Route</TableHead>
                          <TableHead>Flags</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Reviewed</TableHead>
                          <TableHead></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {anomalousTrips.map((t) => (
                          <TableRow key={t.id} className="bg-red-50/40 dark:bg-red-950/10">
                            <TableCell className="font-medium text-sm">{t.employee_name}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{formatDate(t.date)}</TableCell>
                            <TableCell className="text-xs max-w-[200px]">
                              <span className="truncate block" title={`${t.start_location} → ${t.end_location}`}>
                                {t.start_location || '—'} → {t.end_location || '—'}
                              </span>
                            </TableCell>
                            <TableCell className="text-xs">
                              <div className="flex flex-col gap-0.5">
                                {t.is_anomaly && (
                                  <span className="text-red-600 flex items-center gap-1">
                                    <AlertTriangle className="h-3 w-3" /> {t.anomaly_reason}
                                  </span>
                                )}
                                {t.is_out_of_area && (
                                  <span className="text-orange-600 flex items-center gap-1">
                                    <MapPin className="h-3 w-3" /> Out-of-area end location
                                  </span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              {t.anomaly_reviewed_at ? (
                                <span className="text-xs text-muted-foreground">{t.anomaly_review_note?.split(':')[0]}</span>
                              ) : (
                                <Badge variant="outline" className="border-red-300 text-red-700 text-xs">Unreviewed</Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {t.anomaly_reviewed_at ? formatDate(t.anomaly_reviewed_at.slice(0, 10)) : '—'}
                            </TableCell>
                            <TableCell>
                              {!t.anomaly_reviewed_at && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-xs"
                                  onClick={() => setReviewingAnomaly({ type: 'trip', id: t.id, label: `${t.start_location} → ${t.end_location}` })}
                                >
                                  Review
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}
            </div>

            <div>
              <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
                <Fuel className="h-4 w-4 text-red-500" /> Flagged Fuel Requests
                <span className="text-xs text-muted-foreground font-normal">({anomalousFuelReqs.length})</span>
              </h2>
              {anomalousFuelReqs.length === 0 ? (
                <Card><CardContent className="p-0"><EmptyState illustration="radar" title="No anomalous fuel requests" description="All fuel requests look normal." /></CardContent></Card>
              ) : (
                <Card>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Employee</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>Station</TableHead>
                          <TableHead>Amount</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Reviewed</TableHead>
                          <TableHead></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {anomalousFuelReqs.map((r) => (
                          <TableRow key={r.id} className="bg-red-50/40 dark:bg-red-950/10">
                            <TableCell className="font-medium text-sm">{r.employee_name}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{formatDate(r.created_at.slice(0, 10))}</TableCell>
                            <TableCell className="text-sm">{r.station_name || '—'}</TableCell>
                            <TableCell className="text-sm tabular-nums">{formatNaira(r.amount_ngn || 0)}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="border-orange-300 text-orange-700 text-xs">
                                {r.anomaly_type === 'efficiency_anomaly' ? 'Efficiency' : r.anomaly_type || 'Anomaly'}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {r.anomaly_reviewed_at ? (
                                <span className="text-xs text-muted-foreground">{r.anomaly_review_note?.split(':')[0]}</span>
                              ) : (
                                <Badge variant="outline" className="border-red-300 text-red-700 text-xs">Unreviewed</Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {r.anomaly_reviewed_at ? formatDate(r.anomaly_reviewed_at.slice(0, 10)) : '—'}
                            </TableCell>
                            <TableCell>
                              {!r.anomaly_reviewed_at && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-xs"
                                  onClick={() => setReviewingAnomaly({ type: 'fuel', id: r.id, label: `${r.station_name} — ${r.employee_name}` })}
                                >
                                  Review
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>
        )}
      </Tabs>

      {/* FUEL REQUEST DIALOG */}
      {/* NEW FUEL REQUEST DIALOG */}
      {(() => {
        const requested = parseFloat(fuelForm.amount_ngn) || 0;
        const isOverBudget = !!(weekBudget && weekBudget.total > 0 && requested > weekBudget.remaining);
        return (
          <Dialog open={showFuelForm} onOpenChange={(v) => { setShowFuelForm(v); if (!v) { setShowFuelBankSection(false); setFuelBankDetails(EMPTY_FUEL_BANK); setFuelVehicleId(''); setWeekBudget(null); setFuelDoc(null); } }}>
            <DialogContent className="max-w-lg max-h-[90vh] flex flex-col gap-0 p-0">

              {/* Pinned header */}
              <DialogHeader className="shrink-0 px-6 pt-5 pb-4 border-b">
                <DialogTitle className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-100">
                    <Fuel className="h-4 w-4 text-orange-600" />
                  </div>
                  New Fuel Request
                </DialogTitle>
                <DialogDescription>Submit a fuel reimbursement request for approval.</DialogDescription>
              </DialogHeader>

              {/* Scrollable body */}
              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5 min-h-0">

                {/* Driver & Vehicle */}
                <div className="space-y-3">
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Driver & Vehicle</p>
                  <div className="space-y-1">
                    <Label>Employee</Label>
                    <Select value={fuelForm.employee_id} onValueChange={(v) => setFuelForm({ ...fuelForm, employee_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                      <SelectContent>
                        {staff.map((s) => (
                          <SelectItem key={s.id} value={s.id}>{s.full_name || s.email}</SelectItem>
                        ))}
                        {profile && !staff.find((s) => s.id === profile.id) && (
                          <SelectItem value={profile.id}>{profile.full_name || profile.email} (me)</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  {vehicles.length > 0 && (
                    <div className="space-y-1.5">
                      <Label>Vehicle <span className="text-muted-foreground font-normal text-xs">(optional)</span></Label>
                      <Select value={fuelVehicleId} onValueChange={(v) => { setFuelVehicleId(v); fetchWeekBudget(v); }}>
                        <SelectTrigger><SelectValue placeholder="Select vehicle (optional)" /></SelectTrigger>
                        <SelectContent>
                          {vehicles.map((v) => (
                            <SelectItem key={v.id} value={v.id}>
                              {v.name} — {(v as any).plate_number}
                              {(() => {
                                const today = new Date().toISOString().slice(0, 10);
                                return (v as any).out_of_service_until >= today ? ' (Out of service)' : '';
                              })()}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {(() => {
                        const fv = vehicles.find((v) => v.id === fuelVehicleId);
                        const today = new Date().toISOString().slice(0, 10);
                        if (fv?.out_of_service_until && fv.out_of_service_until >= today) {
                          return (
                            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                              <Ban className="h-4 w-4 mt-0.5 shrink-0" />
                              <span>Out of service until {formatDate(fv.out_of_service_until)}. Fuel requests are blocked.</span>
                            </div>
                          );
                        }
                        return null;
                      })()}
                      {weekBudget && weekBudget.total > 0 && (
                        <WeeklyBudgetBar spent={weekBudget.spent} total={weekBudget.total} carryForward={weekBudget.carryForward} remaining={weekBudget.remaining} />
                      )}
                    </div>
                  )}
                </div>

                {/* Fuel Details */}
                <div className="space-y-3 pt-4 border-t">
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Fuel Details</p>
                  <div className="space-y-1">
                    <Label>Fuel Station</Label>
                    <Input value={fuelForm.station_name} onChange={(e) => setFuelForm({ ...fuelForm, station_name: e.target.value })} placeholder="e.g. NNPC, Total, MRS" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label>Amount Requested (₦)</Label>
                      <Input type="number" value={fuelForm.amount_ngn} onChange={(e) => setFuelForm({ ...fuelForm, amount_ngn: e.target.value })} placeholder="0" />
                    </div>
                    <div className="space-y-1">
                      <Label>Litres (estimated)</Label>
                      <Input type="number" value={fuelForm.litres_est} onChange={(e) => setFuelForm({ ...fuelForm, litres_est: e.target.value })} placeholder="0" />
                    </div>
                  </div>

                  {/* Live amount display */}
                  {requested > 0 && (
                    <div className={`rounded-xl border px-4 py-3 text-center transition-all duration-300 ${isOverBudget ? 'bg-red-50 border-red-200' : 'bg-emerald-50 border-emerald-200'}`}>
                      <p className={`text-2xl font-bold tracking-tight ${isOverBudget ? 'text-red-700' : 'text-emerald-700'}`}>
                        {formatNaira(requested)}
                      </p>
                      {weekBudget && weekBudget.total > 0 && (
                        <p className={`text-xs mt-0.5 ${isOverBudget ? 'text-red-500' : 'text-emerald-600'}`}>
                          {isOverBudget
                            ? `${formatNaira(requested - weekBudget.remaining)} over budget`
                            : `${formatNaira(weekBudget.remaining - requested)} remaining after this`}
                        </p>
                      )}
                    </div>
                  )}

                  <div className="space-y-1">
                    <Label>Current Odometer Reading <span className="text-muted-foreground font-normal text-xs">(optional)</span></Label>
                    <Input type="number" value={fuelForm.odometer} onChange={(e) => setFuelForm({ ...fuelForm, odometer: e.target.value })} placeholder="km" />
                  </div>
                </div>

                {/* Purpose & Documents */}
                <div className="space-y-3 pt-4 border-t">
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Purpose & Documents</p>
                  <div className="space-y-1">
                    <Label>Purpose / Reason</Label>
                    <Textarea value={fuelForm.reason} onChange={(e) => setFuelForm({ ...fuelForm, reason: e.target.value })} placeholder="Brief description of trip purpose…" className="resize-none" rows={2} />
                  </div>
                  <div className="space-y-1">
                    <Label>Supporting Document <span className="text-muted-foreground font-normal text-xs">(Optional)</span></Label>
                    <label className={`flex flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed px-4 py-4 cursor-pointer transition-colors ${fuelDoc ? 'border-primary/40 bg-primary/5' : 'border-border hover:border-primary/30 hover:bg-muted/40'}`}>
                      <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" onChange={(e) => setFuelDoc(e.target.files?.[0] ?? null)} />
                      {fuelDoc ? (
                        <>
                          <FileText className="h-5 w-5 text-primary" />
                          <p className="text-xs font-medium text-foreground">{fuelDoc.name}</p>
                          <p className="text-xs text-muted-foreground">{(fuelDoc.size / 1024).toFixed(1)} KB — click to change</p>
                        </>
                      ) : (
                        <>
                          <Upload className="h-5 w-5 text-muted-foreground" />
                          <p className="text-xs text-muted-foreground text-center">Click to attach receipt, quote, or supporting evidence</p>
                        </>
                      )}
                    </label>
                  </div>
                </div>

                {/* Bank (optional) */}
                <div className="pt-4 border-t">
                  {!showFuelBankSection ? (
                    <button type="button" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 transition-colors" onClick={() => setShowFuelBankSection(true)}>
                      <CreditCard className="h-3.5 w-3.5" />
                      Add bank account for reimbursement (optional)
                    </button>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Bank account <span className="text-muted-foreground font-normal">(optional)</span></span>
                        <button type="button" className="text-xs text-muted-foreground hover:text-destructive transition-colors" onClick={() => { setShowFuelBankSection(false); setFuelBankDetails(EMPTY_FUEL_BANK); }}>Remove</button>
                      </div>
                      <BankAccountField value={fuelBankDetails} onChange={setFuelBankDetails} />
                    </div>
                  )}
                </div>
              </div>

              {/* Pinned footer */}
              <div className="shrink-0 px-6 pb-6 pt-4 border-t bg-background space-y-3">
                {isOverBudget && (
                  <div className="flex items-start gap-2 rounded-lg border border-destructive bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                    <p><strong>{formatNaira(requested)}</strong> exceeds your remaining weekly budget of <strong>{formatNaira(weekBudget!.remaining)}</strong>. Submit as a budget exception or contact your manager.</p>
                  </div>
                )}
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" onClick={() => setShowFuelForm(false)}>Cancel</Button>
                  {isOverBudget ? (
                    <Button variant="outline" className="border-amber-400 text-amber-700 hover:bg-amber-50" onClick={() => submitFuelRequest(true)} disabled={submitting || !fuelForm.employee_id || !fuelForm.station_name || !fuelForm.amount_ngn}>
                      {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Request Budget Exception
                    </Button>
                  ) : (
                    <Button onClick={() => submitFuelRequest()} disabled={submitting || !fuelForm.employee_id || !fuelForm.station_name || !fuelForm.amount_ngn}>
                      {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Submit Request
                    </Button>
                  )}
                </div>
              </div>

            </DialogContent>
          </Dialog>
        );
      })()}

      {/* START TRIP DIALOG */}
      {(() => {
        const locationOk = startGeoState === 'ok' || startTripForm.manual_location.trim().length > 0;
        const odoOk = !!startTripForm.odometer_start && Number.isFinite(parseFloat(startTripForm.odometer_start));
        const tripReady = locationOk && odoOk;
        const steps = [
          { label: 'Location', done: locationOk },
          { label: 'Odometer', done: odoOk },
          { label: 'Ready', done: tripReady },
        ];
        return (
          <Dialog open={showStartTrip} onOpenChange={(v) => { if (!v) setShowStartTrip(false); }}>
            <DialogContent className="max-w-md max-h-[90vh] flex flex-col gap-0 p-0">
              <DialogHeader className="shrink-0 px-6 pt-6 pb-3 border-b">
                <DialogTitle className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-100">
                    <Navigation className="h-4 w-4 text-green-600" />
                  </div>
                  Start Trip
                </DialogTitle>
                <DialogDescription>Enter your start location and odometer reading to begin.</DialogDescription>
              </DialogHeader>

              <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 min-h-0">

                {/* Step progress */}
                <div className="flex items-center gap-1">
                  {steps.map((step, i) => (
                    <div key={step.label} className="flex items-center gap-1 flex-1">
                      <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium transition-all duration-300 whitespace-nowrap ${step.done ? 'bg-green-100 text-green-700' : 'bg-muted text-muted-foreground'}`}>
                        {step.done
                          ? <CheckCircle2 className="h-3 w-3 shrink-0" />
                          : <div className="h-3 w-3 rounded-full border-2 border-current shrink-0" />}
                        {step.label}
                      </div>
                      {i < steps.length - 1 && (
                        <div className={`flex-1 h-px transition-colors duration-300 ${step.done ? 'bg-green-300' : 'bg-border'}`} />
                      )}
                    </div>
                  ))}
                </div>

                {/* GPS status panel */}
                <div className={`rounded-md border px-3 py-2.5 flex items-start gap-2 text-sm transition-colors duration-300 ${
                  startGeoState === 'ok'        ? 'border-green-300 bg-green-50 text-green-800' :
                  startGeoState === 'acquiring' ? 'border-blue-200 bg-blue-50 text-blue-700' :
                  startGeoState === 'idle'      ? 'border-border bg-muted/40 text-muted-foreground' :
                                                  'border-amber-300 bg-amber-50 text-amber-800'
                }`}>
                  {/* Animated icon per state */}
                  {startGeoState === 'acquiring' && (
                    <div className="relative shrink-0 mt-0.5">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="absolute -inset-1 rounded-full bg-blue-400 opacity-20 animate-ping" />
                    </div>
                  )}
                  {startGeoState === 'ok' && (
                    <div className="relative shrink-0 mt-0.5">
                      <LocateFixed className="h-4 w-4 text-green-600" />
                      <span className="absolute -inset-1 rounded-full bg-green-400 opacity-25 animate-ping" />
                    </div>
                  )}
                  {isGeoError(startGeoState) && <LocateOff className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" />}
                  {startGeoState === 'idle' && <LocateFixed className="h-4 w-4 mt-0.5 shrink-0" />}

                  <div className="flex-1 min-w-0">
                    {startGeoState === 'acquiring' && (
                      <>
                        <p>Acquiring GPS location…</p>
                        <p className="text-xs opacity-75 mt-0.5">
                          On desktop: check the browser address bar and click <strong>Allow</strong> if prompted.
                        </p>
                      </>
                    )}
                    {startGeoState === 'ok' && startCoords && (
                      <>
                        {startAddress
                          ? <p className="font-medium text-xs leading-snug">{startAddress}</p>
                          : <Loader2 className="h-3 w-3 animate-spin text-green-600 mt-0.5" />}
                        <p className="font-mono text-xs text-muted-foreground mt-0.5">{formatCoords(startCoords.lat, startCoords.lng)}</p>
                        <p className="text-xs text-green-600 mt-0.5">Accuracy: ±{Math.round(startCoords.accuracy)} m</p>
                      </>
                    )}
                    {isGeoError(startGeoState) && (
                      <p className="text-xs">{GEO_ERROR_MSG[startGeoState as Exclude<GeoState, 'idle'|'acquiring'|'ok'>]}</p>
                    )}
                    {startGeoState === 'idle' && <p>Waiting for GPS…</p>}
                  </div>
                  {(isGeoError(startGeoState) || startGeoState === 'ok') && (
                    <button type="button" className="text-xs underline shrink-0" onClick={() => acquireGeo(setStartGeoState, setStartCoords, setStartAddress)}>
                      {startGeoState === 'ok' ? 'Re-acquire' : 'Retry'}
                    </button>
                  )}
                </div>

                {/* Manual location fallback */}
                {isGeoError(startGeoState) && (
                  <div className="space-y-1">
                    <Label>Start Location <span className="text-destructive">*</span></Label>
                    <Input
                      value={startTripForm.manual_location}
                      onChange={(e) => setStartTripForm((f) => ({ ...f, manual_location: e.target.value }))}
                      placeholder="e.g. Victoria Island depot, Lagos"
                    />
                  </div>
                )}

                {/* Vehicle selector */}
                {vehicles.length > 0 && (
                  <div className="space-y-1">
                    <Label>Vehicle <span className="text-muted-foreground font-normal text-xs">(optional)</span></Label>
                    <Select
                      value={startTripForm.vehicle_id || '__none__'}
                      onValueChange={(v) => {
                        const vid = v === '__none__' ? '' : v;
                        setStartTripForm((f) => ({ ...f, vehicle_id: vid }));
                        if (vid) {
                          supabase.from('trip_logs').select('odometer_end').eq('vehicle_id', vid)
                            .not('odometer_end', 'is', null).neq('status', 'in_progress')
                            .order('trip_end_time', { ascending: false }).limit(1).maybeSingle()
                            .then(({ data }) => setLastVehicleOdometer(data?.odometer_end ?? null));
                        } else {
                          setLastVehicleOdometer(null);
                        }
                      }}
                    >
                      <SelectTrigger><SelectValue placeholder="Select vehicle" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">No vehicle</SelectItem>
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
                  <Label>Start Odometer Reading (km) <span className="text-destructive">*</span></Label>
                  <Input
                    type="number"
                    value={startTripForm.odometer_start}
                    onChange={(e) => setStartTripForm((f) => ({ ...f, odometer_start: e.target.value }))}
                    placeholder="e.g. 42500"
                  />

                  {/* Odometer dashboard readout */}
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

                {/* Privacy notice */}
                <div className="flex items-start gap-2 rounded-md bg-muted/50 border px-3 py-2 text-xs text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <p>Your location is recorded at trip start and end only — not tracked continuously.</p>
                </div>
              </div>

              <DialogFooter className="shrink-0 px-6 pb-6 pt-3 border-t bg-background">
                <Button variant="outline" onClick={() => setShowStartTrip(false)}>Cancel</Button>
                <Button
                  className={`transition-all duration-300 text-white ${
                    tripReady && !startingTrip
                      ? 'bg-green-600 hover:bg-green-700 ring-2 ring-green-400 ring-offset-2'
                      : 'bg-green-600 hover:bg-green-700'
                  }`}
                  onClick={handleStartTrip}
                  disabled={startingTrip || !startTripForm.odometer_start || (startGeoState !== 'ok' && !startTripForm.manual_location.trim())}
                >
                  {startingTrip
                    ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Starting…</>
                    : <><Timer className="mr-2 h-4 w-4" /> {tripReady ? 'Start Trip' : 'Start Trip'}</>}
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
              <Navigation className="h-4 w-4 rotate-180" /> End Trip
            </DialogTitle>
            <DialogDescription>
              Record your end location and odometer reading to complete this trip.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 min-h-0">
            {/* Trip-in-progress summary */}
            {activeTrip && (
              <div className="rounded-md bg-muted/50 px-3 py-2 text-xs space-y-1">
                <p className="text-muted-foreground">Trip started</p>
                <p className="font-medium">{activeTrip.trip_start_time ? formatDate(activeTrip.trip_start_time) : '—'} · {formatDuration(elapsedSeconds)} elapsed</p>
                <p className="font-mono truncate">{activeTrip.start_location || '—'}</p>
              </div>
            )}

            {/* GPS status panel */}
            <div className={`rounded-md border px-3 py-2.5 flex items-start gap-2 text-sm ${
              endGeoState === 'ok'       ? 'border-green-300 bg-green-50 text-green-800' :
              endGeoState === 'acquiring'? 'border-blue-200 bg-blue-50 text-blue-700' :
              endGeoState === 'idle'     ? 'border-border bg-muted/40 text-muted-foreground' :
                                           'border-amber-300 bg-amber-50 text-amber-800'
            }`}>
              {endGeoState === 'acquiring' && <Loader2 className="h-4 w-4 mt-0.5 shrink-0 animate-spin" />}
              {endGeoState === 'ok'        && <LocateFixed className="h-4 w-4 mt-0.5 shrink-0 text-green-600" />}
              {isGeoError(endGeoState) && <LocateOff className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" />}
              {endGeoState === 'idle'      && <LocateFixed className="h-4 w-4 mt-0.5 shrink-0" />}
              <div className="flex-1 min-w-0">
                {endGeoState === 'acquiring' && <p>Acquiring GPS location…</p>}
                {endGeoState === 'ok' && endCoords && (
                  <>
                    {endAddress
                      ? <p className="font-medium text-xs leading-snug">{endAddress}</p>
                      : <Loader2 className="h-3 w-3 animate-spin text-green-600 mt-0.5" />}
                    <p className="font-mono text-xs text-muted-foreground mt-0.5">{formatCoords(endCoords.lat, endCoords.lng)}</p>
                    <p className="text-xs text-green-600 mt-0.5">Accuracy: ±{Math.round(endCoords.accuracy)} m</p>
                  </>
                )}
                {isGeoError(endGeoState) && (
                  <p className="text-xs">{GEO_ERROR_MSG[endGeoState as Exclude<GeoState, 'idle'|'acquiring'|'ok'>]}</p>
                )}
                {endGeoState === 'idle' && <p>Waiting for GPS…</p>}
              </div>
              {isGeoError(endGeoState) && (
                <button type="button" className="text-xs underline shrink-0" onClick={() => acquireGeo(setEndGeoState, setEndCoords, setEndAddress)}>
                  Retry
                </button>
              )}
            </div>

            {/* Location input — only shown as a fallback when GPS fails */}
            {isGeoError(endGeoState) && (
              <div className="space-y-1">
                <Label>
                  End Location <span className="text-destructive">*</span>
                </Label>
                <Input
                  value={endTripForm.manual_location}
                  onChange={(e) => setEndTripForm((f) => ({ ...f, manual_location: e.target.value }))}
                  placeholder="e.g. Ikeja client office, Lagos"
                />
              </div>
            )}

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
                <Label>Litres <span className="text-muted-foreground font-normal text-xs">(optional)</span></Label>
                <Input
                  type="number"
                  value={endTripForm.litres}
                  onChange={(e) => setEndTripForm((f) => ({ ...f, litres: e.target.value }))}
                  placeholder="Optional"
                />
              </div>
            </div>

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
            <Button
              onClick={handleEndTrip}
              disabled={
                endingTrip ||
                !endTripForm.odometer_end ||
                (endGeoState !== 'ok' && !endTripForm.manual_location.trim())
              }
            >
              {endingTrip && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <CheckCircle2 className="mr-2 h-4 w-4" /> Complete Trip
            </Button>
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

      <Dialog
        open={!!rejectingFuel}
        onOpenChange={(v) => {
          if (!v) {
            setRejectingFuel(null);
            setFuelRejectReason('');
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject fuel request</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Reason is required. The employee is notified with this note.
          </p>
          <Textarea
            value={fuelRejectReason}
            onChange={(e) => setFuelRejectReason(e.target.value)}
            placeholder="e.g. Exceeds weekly fuel budget — split across two weeks."
            rows={3}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectingFuel(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmFuelReject}
              disabled={!isValidRejectionReason(fuelRejectReason)}
            >
              Reject with reason
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirmDeleteFuel} onOpenChange={(v) => { if (!v) setConfirmDeleteFuel(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete fuel request</DialogTitle>
            <DialogDescription>
              Delete this fuel request from {confirmDeleteFuel?.employee_name}? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDeleteFuel(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => confirmDeleteFuel && deleteFuelRequest(confirmDeleteFuel)}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                  <p className="font-medium">{selectedTrip.start_location || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">To</p>
                  <p className="font-medium">{selectedTrip.end_location || '—'}</p>
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
                  <p className="font-medium">{selectedTrip.fuel_amount_ngn ? formatNaira(selectedTrip.fuel_amount_ngn) : '—'}</p>
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

      {/* FUEL RECEIPT UPLOAD DIALOG */}
      <Dialog
        open={!!uploadingReceiptFor}
        onOpenChange={(v) => {
          if (!v) { setUploadingReceiptFor(null); setReceiptFile(null); setReceiptForm({ fuel_station_name: '', litres_filled: '', notes: '' }); }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload Fuel Receipt</DialogTitle>
            <DialogDescription>
              Confirm the station details and attach a photo or PDF of your receipt.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-md bg-muted/50 px-3 py-2 text-sm space-y-0.5">
              <p className="text-muted-foreground text-xs">Fuel request</p>
              <p className="font-medium">{uploadingReceiptFor?.station_name} — {formatNaira(uploadingReceiptFor?.amount_ngn || 0)}</p>
            </div>
            <div className="space-y-1">
              <Label>Station Name <span className="text-muted-foreground font-normal text-xs">(confirm or correct)</span></Label>
              <Input
                value={receiptForm.fuel_station_name}
                onChange={(e) => setReceiptForm({ ...receiptForm, fuel_station_name: e.target.value })}
                placeholder="e.g. Total Energies, Lekki"
              />
            </div>
            <div className="space-y-1">
              <Label>Litres Filled <span className="text-muted-foreground font-normal text-xs">(optional)</span></Label>
              <Input
                type="number"
                value={receiptForm.litres_filled}
                onChange={(e) => setReceiptForm({ ...receiptForm, litres_filled: e.target.value })}
                placeholder="e.g. 25.5"
              />
            </div>
            <div className="space-y-1">
              <Label>Receipt <span className="text-destructive">*</span></Label>
              <Input
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={(e) => setReceiptFile(e.target.files?.[0] ?? null)}
              />
              <p className="text-xs text-muted-foreground">Photo or PDF of the fuel station receipt.</p>
              {receiptFile && (
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{receiptFile.name}</span>
                  {' '}— {(receiptFile.size / 1024).toFixed(1)} KB
                </p>
              )}
            </div>
            <div className="space-y-1">
              <Label>Notes <span className="text-muted-foreground font-normal text-xs">(optional)</span></Label>
              <Textarea
                value={receiptForm.notes}
                onChange={(e) => setReceiptForm({ ...receiptForm, notes: e.target.value })}
                placeholder="Any additional notes for admin…"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadingReceiptFor(null)}>Cancel</Button>
            <Button
              onClick={submitFuelReceipt}
              disabled={submittingReceipt || !receiptFile}
            >
              {submittingReceipt && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <Upload className="mr-2 h-4 w-4" /> Submit Receipt
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Phase 4 — Repair request dialog */}
      <Dialog open={showRepairForm} onOpenChange={(v) => { setShowRepairForm(v); if (!v) { setRepairForm({ employee_id: profile?.id || '', description: '', amount_ngn: '', notes: '' }); setRepairBank(EMPTY_REPAIR_BANK); setRepairReceipt(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Vehicle Repair Reimbursement</DialogTitle>
            <DialogDescription>
              Submit a repair or maintenance cost for reimbursement. Receipts are required for amounts over ₦10,000.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Employee</Label>
              <Select
                value={repairForm.employee_id}
                onValueChange={(v) => setRepairForm({ ...repairForm, employee_id: v })}
              >
                <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                <SelectContent>
                  {staff.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.full_name || s.email}</SelectItem>
                  ))}
                  {profile && !staff.find((s) => s.id === profile.id) && (
                    <SelectItem value={profile.id}>{profile.full_name || profile.email} (me)</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Description of Repair</Label>
              <Textarea
                value={repairForm.description}
                onChange={(e) => setRepairForm({ ...repairForm, description: e.target.value })}
                placeholder="e.g. Replaced front tyre — Toyota Camry ABC-123-XY"
                rows={2}
              />
            </div>
            <div className="space-y-1">
              <Label>Amount (₦)</Label>
              <Input
                type="number"
                value={repairForm.amount_ngn}
                onChange={(e) => setRepairForm({ ...repairForm, amount_ngn: e.target.value })}
              />
              {parseFloat(repairForm.amount_ngn) > 10000 && !repairReceipt && (
                <p className="text-xs text-amber-600 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" /> Receipt required for amounts over ₦10,000
                </p>
              )}
            </div>
            <div className="space-y-1">
              <Label>
                Receipt {parseFloat(repairForm.amount_ngn) > 10000 ? <span className="text-destructive">*</span> : <span className="text-muted-foreground text-xs">(optional)</span>}
              </Label>
              <Input
                type="file"
                accept="image/*,application/pdf"
                onChange={(e) => setRepairReceipt(e.target.files?.[0] || null)}
              />
              {repairReceipt && <p className="text-xs text-muted-foreground">{repairReceipt.name}</p>}
            </div>
            <div className="pt-2 border-t space-y-2">
              <p className="text-sm font-medium">Bank account for reimbursement <span className="text-muted-foreground font-normal text-xs">(optional)</span></p>
              <BankAccountField value={repairBank} onChange={setRepairBank} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRepairForm(false)}>Cancel</Button>
            <Button
              onClick={submitRepairRequest}
              disabled={
                submitting ||
                !repairForm.employee_id ||
                !repairForm.description ||
                !repairForm.amount_ngn
              }
            >
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Submit Repair
            </Button>
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

      {/* DUPLICATE FUEL WARNING */}
      <Dialog open={showDuplicateFuelWarning} onOpenChange={(v) => { if (!v) setShowDuplicateFuelWarning(false); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" /> Duplicate fuel request today
            </DialogTitle>
            <DialogDescription>
              A fuel request for this vehicle has already been submitted today. Are you sure you want to submit another?
              If you proceed, the note <strong>"duplicate_same_day"</strong> will be appended to this request.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDuplicateFuelWarning(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => {
                setShowDuplicateFuelWarning(false);
                submitFuelRequest(pendingFuelAsException, true);
              }}
            >
              Yes, submit anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ANOMALY REVIEW DIALOG */}
      <Dialog open={!!reviewingAnomaly} onOpenChange={(v) => { if (!v) { setReviewingAnomaly(null); setAnomalyReviewDecision(''); setAnomalyReviewNote(''); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Review anomaly</DialogTitle>
            <DialogDescription className="text-xs break-words">
              {reviewingAnomaly?.label}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Decision <span className="text-destructive">*</span></Label>
              <Select value={anomalyReviewDecision} onValueChange={(v) => setAnomalyReviewDecision(v as any)}>
                <SelectTrigger><SelectValue placeholder="Select outcome…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="valid">Reviewed — Valid</SelectItem>
                  <SelectItem value="fraudulent">Fraudulent / Error</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Reason / notes <span className="text-destructive">*</span></Label>
              <Textarea
                value={anomalyReviewNote}
                onChange={(e) => setAnomalyReviewNote(e.target.value)}
                placeholder="Explain why this anomaly is valid or fraudulent…"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setReviewingAnomaly(null); setAnomalyReviewDecision(''); setAnomalyReviewNote(''); }}>
              Cancel
            </Button>
            <Button
              onClick={handleAnomalyReview}
              disabled={submittingAnomalyReview || !anomalyReviewDecision || !anomalyReviewNote.trim()}
            >
              {submittingAnomalyReview && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save review
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Fleet;

// ---------------------------------------------------------------------------
// Vehicles management tab
// ---------------------------------------------------------------------------

function FuelGauge({ tank, current, lastRefuel }: { tank: number; current: number; lastRefuel: string | null }) {
  const cap = tank || 60;
  const cur = Math.min(current || 0, cap);
  const pct = cap > 0 ? Math.round((cur / cap) * 100) : 0;
  const isCritical = pct < 10;
  const barColor = pct >= 50 ? 'bg-green-500' : pct >= 25 ? 'bg-amber-500' : 'bg-red-500';
  const textColor = pct >= 50 ? 'text-green-700' : pct >= 25 ? 'text-amber-600' : 'text-red-600';
  const daysSince = lastRefuel
    ? Math.floor((Date.now() - new Date(lastRefuel).getTime()) / 86_400_000)
    : null;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className={`font-medium ${textColor}`}>
          {pct}% — {cur.toFixed(0)}L remaining of {cap}L
        </span>
      </div>
      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${barColor}${isCritical ? ' animate-pulse' : ''}`}
          style={{ width: `${Math.max(pct, 2)}%` }}
        />
      </div>
      {daysSince !== null && (
        <p className="text-[10px] text-muted-foreground">
          Last filled {daysSince === 0 ? 'today' : `${daysSince}d ago`}
        </p>
      )}
      {isCritical && (
        <p className="text-[10px] text-red-600 font-medium flex items-center gap-0.5 animate-pulse">
          <AlertTriangle className="h-2.5 w-2.5" /> Critical — may be empty
        </p>
      )}
      {!isCritical && pct < 25 && (
        <p className="text-[10px] text-red-600 font-medium flex items-center gap-0.5">
          <AlertTriangle className="h-2.5 w-2.5" /> Low fuel
        </p>
      )}
    </div>
  );
}

interface Vehicle {
  id: string;
  name: string;
  plate_number: string;
  make_model: string | null;
  year: number | null;
  color: string | null;
  vin: string | null;
  assigned_driver_id: string | null;
  weekly_budget_ngn: number;
  tank_capacity_litres: number;
  current_fuel_litres: number;
  last_refuel_at: string | null;
  avg_km_per_litre: number;
  fuel_consumption_rate_lkm: number;
  home_base_lat: number | null;
  home_base_lng: number | null;
  insurance_expiry: string | null;
  road_worthiness_expiry: string | null;
  last_service_date: string | null;
  next_service_date: string | null;
  notes: string | null;
  status: string;
  out_of_service_until: string | null;
  created_at: string;
}

interface MaintenanceRecord {
  id: string;
  vehicle_id: string;
  service_type: string;
  due_date: string | null;
  due_mileage_km: number | null;
  recurrence: string;
  last_done_date: string | null;
  last_done_mileage_km: number | null;
  status: string;
  notes: string | null;
  created_at: string;
}

interface FuelLevelLog {
  id: string;
  vehicle_id: string;
  event_type: 'trip_consumed' | 'fuel_added';
  amount_litres: number;
  resulting_level_litres: number;
  reference_id: string | null;
  created_at: string;
}

function FuelHistoryDialog({ vehicle, onClose }: { vehicle: Vehicle; onClose: () => void }) {
  const [logs, setLogs] = useState<FuelLevelLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
    supabase
      .from('fuel_level_logs')
      .select('*')
      .eq('vehicle_id', vehicle.id)
      .gte('created_at', since)
      .order('created_at')
      .then(({ data }) => {
        setLogs((data as FuelLevelLog[]) || []);
        setLoading(false);
      });
  }, [vehicle.id]);

  const chartData = logs.map((l) => ({
    date: new Date(l.created_at).toLocaleDateString('en-GB', { month: 'short', day: 'numeric' }),
    level: parseFloat(l.resulting_level_litres.toFixed(1)),
    type: l.event_type,
  }));

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Fuel history — {vehicle.name} ({vehicle.plate_number})</DialogTitle>
          <DialogDescription>Last 30 days of fuel level changes</DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : logs.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">No fuel level changes recorded in the last 30 days.</p>
        ) : (
          <div className="space-y-4">
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis unit="L" domain={[0, vehicle.tank_capacity_litres || 60]} tick={{ fontSize: 11 }} />
                <ReTooltip formatter={(v: number) => [`${v}L`, 'Fuel level']} />
                <Line
                  type="monotone"
                  dataKey="level"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={(props: any) => {
                    const { cx, cy, payload } = props;
                    const fill = payload.type === 'fuel_added' ? '#22c55e' : '#ef4444';
                    return <circle key={`dot-${cx}-${cy}`} cx={cx} cy={cy} r={4} fill={fill} stroke="white" strokeWidth={1.5} />;
                  }}
                />
              </LineChart>
            </ResponsiveContainer>
            <div className="flex items-center gap-4 text-xs text-muted-foreground justify-center">
              <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full bg-green-500" /> Fuel added</span>
              <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full bg-red-500" /> Trip consumed</span>
            </div>
            <div className="max-h-48 overflow-y-auto border rounded text-xs">
              <table className="w-full">
                <thead className="sticky top-0 bg-muted text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-2">Date</th>
                    <th className="text-left px-3 py-2">Event</th>
                    <th className="text-right px-3 py-2">Amount</th>
                    <th className="text-right px-3 py-2">Level after</th>
                  </tr>
                </thead>
                <tbody>
                  {[...logs].reverse().map((l) => (
                    <tr key={l.id} className="border-t">
                      <td className="px-3 py-1.5 text-muted-foreground">{new Date(l.created_at).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}</td>
                      <td className="px-3 py-1.5">
                        {l.event_type === 'fuel_added'
                          ? <span className="text-green-600 font-medium">Fuel added</span>
                          : <span className="text-red-600 font-medium">Trip consumed</span>}
                      </td>
                      <td className="px-3 py-1.5 text-right">{l.event_type === 'fuel_added' ? '+' : '−'}{l.amount_litres.toFixed(1)}L</td>
                      <td className="px-3 py-1.5 text-right font-medium">{l.resulting_level_litres.toFixed(1)}L</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const emptyVehicleForm = {
  name: '',
  plate_number: '',
  make_model: '',
  year: '',
  color: '',
  vin: '',
  assigned_driver_id: '',
  weekly_budget_ngn: '',
  tank_capacity_litres: '60',
  avg_km_per_litre: '10',
  insurance_expiry: '',
  road_worthiness_expiry: '',
  last_service_date: '',
  next_service_date: '',
  notes: '',
};

function VehiclesTab({ staff }: { staff: FieldStaff[] }) {
  const { toast } = useToast();
  const { profile } = useAuthStore();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Vehicle | null>(null);
  const [form, setForm] = useState(emptyVehicleForm);
  const [submitting, setSubmitting] = useState(false);
  const [allEmployees, setAllEmployees] = useState<FieldStaff[]>([]);
  const [confirmDelete, setConfirmDelete] = useState<Vehicle | null>(null);
  const [viewingFuelHistory, setViewingFuelHistory] = useState<Vehicle | null>(null);
  const [viewingMaintenance, setViewingMaintenance] = useState<Vehicle | null>(null);
  const [settingOutOfService, setSettingOutOfService] = useState<Vehicle | null>(null);
  const [outOfServiceDate, setOutOfServiceDate] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [vRes, dRes] = await Promise.all([
        supabase.from('vehicles').select('*').order('name'),
        supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('role', ['field_staff', 'driver', 'operations'])
          .eq('status', 'active')
          .order('full_name'),
      ]);
      setVehicles((vRes.data as Vehicle[]) || []);
      setAllEmployees((dRes.data as FieldStaff[]) || []);
    } catch (err) {
      console.error('[Fleet] VehiclesTab load failed:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const reset = () => {
    setEditing(null);
    setForm(emptyVehicleForm);
  };

  const openEdit = (v: Vehicle) => {
    setEditing(v);
    setForm({
      name: v.name,
      plate_number: v.plate_number,
      make_model: v.make_model || '',
      year: v.year ? String(v.year) : '',
      color: v.color || '',
      vin: v.vin || '',
      assigned_driver_id: v.assigned_driver_id || '',
      weekly_budget_ngn: String(v.weekly_budget_ngn || 0),
      tank_capacity_litres: String(v.tank_capacity_litres || 60),
      avg_km_per_litre: String(v.avg_km_per_litre || 10),
      insurance_expiry: v.insurance_expiry || '',
      road_worthiness_expiry: v.road_worthiness_expiry || '',
      last_service_date: v.last_service_date || '',
      next_service_date: v.next_service_date || '',
      notes: v.notes || '',
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.plate_number.trim()) {
      toast({ title: 'Name and plate number are required', variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    const payload = {
      name: form.name.trim(),
      plate_number: form.plate_number.trim().toUpperCase(),
      make_model: form.make_model.trim() || null,
      year: parseInt(form.year) || null,
      color: form.color.trim() || null,
      vin: form.vin.trim() || null,
      assigned_driver_id: form.assigned_driver_id || null,
      weekly_budget_ngn: parseFloat(form.weekly_budget_ngn) || 0,
      tank_capacity_litres: parseFloat(form.tank_capacity_litres) || 60,
      avg_km_per_litre: parseFloat(form.avg_km_per_litre) || 10,
      insurance_expiry: form.insurance_expiry || null,
      road_worthiness_expiry: form.road_worthiness_expiry || null,
      last_service_date: form.last_service_date || null,
      next_service_date: form.next_service_date || null,
      notes: form.notes.trim() || null,
      updated_at: new Date().toISOString(),
    };
    try {
      if (editing) {
        const { error } = await supabase.from('vehicles').update(payload).eq('id', editing.id);
        if (error) throw error;
        await logAudit('fleet_vehicle_updated', `Vehicle "${payload.name}" (${payload.plate_number}) updated`, profile);
        toast({ title: 'Vehicle updated' });
      } else {
        const { error } = await supabase.from('vehicles').insert({ ...payload, status: 'active' });
        if (error) throw error;
        await logAudit('fleet_vehicle_added', `Vehicle "${payload.name}" (${payload.plate_number}) added`, profile);
        toast({ title: 'Vehicle added' });
      }
      setShowForm(false);
      reset();
      load();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const toggleStatus = async (v: Vehicle) => {
    const next = v.status === 'active' ? 'inactive' : 'active';
    await supabase.from('vehicles').update({ status: next }).eq('id', v.id);
    await logAudit(
      next === 'inactive' ? 'fleet_vehicle_deactivated' : 'fleet_vehicle_updated',
      `Vehicle "${v.name}" ${next === 'inactive' ? 'deactivated' : 'reactivated'}`,
      profile,
    );
    toast({ title: `Vehicle ${next}` });
    load();
  };

  const handleDelete = async (v: Vehicle) => {
    const { error } = await supabase.from('vehicles').delete().eq('id', v.id);
    if (error) {
      toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
      return;
    }
    await logAudit('fleet_vehicle_deleted', `Vehicle "${v.name}" (${v.plate_number}) deleted`, profile);
    toast({ title: 'Vehicle deleted' });
    load();
  };

  const employeeName = (id: string | null) => {
    if (!id) return '—';
    const d = allEmployees.find((s) => s.id === id) || staff.find((s) => s.id === id);
    return d?.full_name || '(unassigned)';
  };

  const isExpiringSoon = (date: string | null) => {
    if (!date) return false;
    const d = new Date(date);
    const diff = (d.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    return diff >= 0 && diff <= 30;
  };

  const isExpired = (date: string | null) => {
    if (!date) return false;
    return new Date(date) < new Date();
  };

  const isOutOfService = (v: Vehicle) => {
    if (!v.out_of_service_until) return false;
    return v.out_of_service_until >= new Date().toISOString().slice(0, 10);
  };

  const handleMarkOutOfService = async () => {
    if (!settingOutOfService) return;
    const { error } = await supabase
      .from('vehicles')
      .update({ out_of_service_until: outOfServiceDate || null })
      .eq('id', settingOutOfService.id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    if (outOfServiceDate && settingOutOfService.assigned_driver_id) {
      await notifyUser({
        userId: settingOutOfService.assigned_driver_id,
        type: 'vehicle_out_of_service',
        module: 'fleet',
        priority: 'high',
        title: `${settingOutOfService.plate_number} is out of service`,
        body: `${settingOutOfService.name} (${settingOutOfService.plate_number}) has been marked out of service until ${formatDate(outOfServiceDate)}.`,
      });
    }
    toast({ title: outOfServiceDate ? 'Vehicle marked out of service' : 'Vehicle returned to service' });
    setSettingOutOfService(null);
    setOutOfServiceDate('');
    load();
  };

  if (loading) return <TableSkeleton rows={5} />;

  return (
    <>
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <p className="text-sm text-muted-foreground">
            {vehicles.length} vehicle{vehicles.length !== 1 ? 's' : ''} registered
          </p>
          <Button onClick={() => { reset(); setShowForm(true); }}>
            <Plus className="mr-2 h-4 w-4" /> Add Vehicle
          </Button>
        </div>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vehicle</TableHead>
                  <TableHead>Plate</TableHead>
                  <TableHead>Assigned Employee</TableHead>
                  <TableHead>Fuel Level</TableHead>
                  <TableHead className="text-right">Weekly Budget</TableHead>
                  <TableHead>Insurance</TableHead>
                  <TableHead>Road Worthiness</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vehicles.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground text-sm py-8">
                      No vehicles registered yet. Add your first vehicle to start tracking.
                    </TableCell>
                  </TableRow>
                )}
                {vehicles.map((v) => (
                  <TableRow key={v.id} className={`kd-transition${isOutOfService(v) ? ' bg-red-50/40 dark:bg-red-950/10' : ''}`}>
                    <TableCell>
                      <div className="font-medium flex items-center gap-2">
                        {v.name}
                        {isOutOfService(v) && (
                          <Badge variant="secondary" className="bg-destructive/10 text-destructive border border-destructive/20 text-xs">
                            <Ban className="h-3 w-3 mr-1" /> Out of Service
                          </Badge>
                        )}
                      </div>
                      {v.make_model && (
                        <div className="text-xs text-muted-foreground">
                          {v.make_model}{v.year ? ` (${v.year})` : ''}{v.color ? ` · ${v.color}` : ''}
                        </div>
                      )}
                      {isOutOfService(v) && v.out_of_service_until && (
                        <div className="text-xs text-destructive mt-0.5">Until {formatDate(v.out_of_service_until)}</div>
                      )}
                    </TableCell>
                    <TableCell className="font-mono">{v.plate_number}</TableCell>
                    <TableCell className="text-sm">{employeeName(v.assigned_driver_id)}</TableCell>
                    <TableCell className="min-w-[140px]">
                      <FuelGauge
                        tank={v.tank_capacity_litres}
                        current={v.current_fuel_litres}
                        lastRefuel={v.last_refuel_at}
                      />
                    </TableCell>
                    <TableCell className="text-right currency">{formatNaira(v.weekly_budget_ngn)}</TableCell>
                    <TableCell>
                      {v.insurance_expiry ? (
                        <Badge
                          variant="secondary"
                          className={
                            isExpired(v.insurance_expiry)
                              ? 'bg-destructive/10 text-destructive'
                              : isExpiringSoon(v.insurance_expiry)
                              ? 'bg-warning/10 text-warning'
                              : 'bg-success/10 text-success'
                          }
                        >
                          {formatDate(v.insurance_expiry)}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {v.road_worthiness_expiry ? (
                        <Badge
                          variant="secondary"
                          className={
                            isExpired(v.road_worthiness_expiry)
                              ? 'bg-destructive/10 text-destructive'
                              : isExpiringSoon(v.road_worthiness_expiry)
                              ? 'bg-warning/10 text-warning'
                              : 'bg-success/10 text-success'
                          }
                        >
                          {formatDate(v.road_worthiness_expiry)}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={
                          v.status === 'active'
                            ? 'bg-success/10 text-success cursor-pointer'
                            : 'bg-muted text-muted-foreground cursor-pointer'
                        }
                        onClick={() => toggleStatus(v)}
                      >
                        {v.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" title="Fuel history" onClick={() => setViewingFuelHistory(v)}>
                          <History className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="ghost" title="Maintenance schedule" onClick={() => setViewingMaintenance(v)}>
                          <Wrench className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          title={isOutOfService(v) ? 'Return to service' : 'Mark out of service'}
                          onClick={() => { setSettingOutOfService(v); setOutOfServiceDate(v.out_of_service_until || ''); }}
                        >
                          <CalendarOff className={`h-4 w-4 ${isOutOfService(v) ? 'text-destructive' : ''}`} />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => openEdit(v)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(v)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Dialog open={showForm} onOpenChange={(v) => { if (!v) { setShowForm(false); reset(); } }}>
        <DialogContent className="max-w-2xl p-0 max-h-[90vh] flex flex-col gap-0">
          {/* Header — adds a TOD halo behind the icon */}
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-border/60">
            <div className="flex items-center gap-3">
              <div className="relative h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <span className="pointer-events-none absolute inset-0 rounded-xl bg-[hsl(var(--tod-glow))] opacity-15 blur-md" />
                <Car className="relative h-5 w-5 text-primary" />
              </div>
              <div>
                <DialogTitle className="kd-display text-lg">{editing ? 'Edit Vehicle' : 'Add Vehicle'}</DialogTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {editing ? `Updating ${form.name || 'this vehicle'}` : 'Register a new company vehicle'}
                </p>
              </div>
            </div>
          </DialogHeader>

          {/* Scrollable body */}
          <div className="overflow-y-auto px-6 py-5 space-y-7 flex-1 min-h-0">
            {/* Identity */}
            <section>
              <div className="flex items-center gap-2 mb-3">
                <Car className="h-3.5 w-3.5 text-muted-foreground" />
                <h3 className="kd-display text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Identity</h3>
                <div className="flex-1 h-px bg-border/60" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Name <span className="text-destructive">*</span></Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Office Hilux" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Plate number <span className="text-destructive">*</span></Label>
                  <Input value={form.plate_number} onChange={(e) => setForm({ ...form, plate_number: e.target.value })} placeholder="e.g. LAG-123-AB" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Make / model</Label>
                  <Input value={form.make_model} onChange={(e) => setForm({ ...form, make_model: e.target.value })} placeholder="e.g. Toyota Hilux" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Year</Label>
                  <Input type="number" value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} placeholder="e.g. 2022" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Color</Label>
                  <Input value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} placeholder="e.g. White" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">VIN</Label>
                  <Input value={form.vin} onChange={(e) => setForm({ ...form, vin: e.target.value })} />
                </div>
              </div>
            </section>

            {/* Fuel */}
            <section>
              <div className="flex items-center gap-2 mb-3">
                <Fuel className="h-3.5 w-3.5 text-muted-foreground" />
                <h3 className="kd-display text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Fuel & efficiency</h3>
                <div className="flex-1 h-px bg-border/60" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Tank capacity (litres)</Label>
                  <Input type="number" value={form.tank_capacity_litres} onChange={(e) => setForm({ ...form, tank_capacity_litres: e.target.value })} placeholder="e.g. 60" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Avg fuel efficiency (km/L)</Label>
                  <Input type="number" step="0.1" value={form.avg_km_per_litre} onChange={(e) => setForm({ ...form, avg_km_per_litre: e.target.value })} placeholder="e.g. 10" />
                </div>
              </div>
            </section>

            {/* Assignment */}
            <section>
              <div className="flex items-center gap-2 mb-3">
                <User className="h-3.5 w-3.5 text-muted-foreground" />
                <h3 className="kd-display text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Assignment & budget</h3>
                <div className="flex-1 h-px bg-border/60" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Assigned employee</Label>
                  <Select value={form.assigned_driver_id || '__none__'} onValueChange={(v) => setForm({ ...form, assigned_driver_id: v === '__none__' ? '' : v })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Unassigned" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Unassigned</SelectItem>
                      {allEmployees.map((d) => (
                        <SelectItem key={d.id} value={d.id}>{d.full_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Weekly fuel budget (₦)</Label>
                  <Input type="number" value={form.weekly_budget_ngn} onChange={(e) => setForm({ ...form, weekly_budget_ngn: e.target.value })} />
                </div>
              </div>
            </section>

            {/* Compliance & service */}
            <section>
              <div className="flex items-center gap-2 mb-3">
                <Wrench className="h-3.5 w-3.5 text-muted-foreground" />
                <h3 className="kd-display text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Compliance & service</h3>
                <div className="flex-1 h-px bg-border/60" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Insurance expiry</Label>
                  <Input type="date" value={form.insurance_expiry} onChange={(e) => setForm({ ...form, insurance_expiry: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Road worthiness expiry</Label>
                  <Input type="date" value={form.road_worthiness_expiry} onChange={(e) => setForm({ ...form, road_worthiness_expiry: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Last service date</Label>
                  <Input type="date" value={form.last_service_date} onChange={(e) => setForm({ ...form, last_service_date: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Next service date</Label>
                  <Input type="date" value={form.next_service_date} onChange={(e) => setForm({ ...form, next_service_date: e.target.value })} />
                </div>
              </div>
            </section>

            {/* Notes */}
            <section>
              <div className="flex items-center gap-2 mb-3">
                <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                <h3 className="kd-display text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Notes</h3>
                <div className="flex-1 h-px bg-border/60" />
              </div>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} placeholder="Internal notes about this vehicle..." />
            </section>
          </div>

          {/* Sticky footer */}
          <DialogFooter className="px-6 py-4 border-t border-border/60 bg-card/50 backdrop-blur-sm flex-row items-center sm:justify-between gap-3 mt-0">
            <p className="text-xs text-muted-foreground hidden sm:block">
              {(!form.name.trim() || !form.plate_number.trim())
                ? <><span className="text-destructive">●</span> Fill in name and plate number to save</>
                : <><span className="text-success">●</span> Ready to save</>}
            </p>
            <div className="flex gap-2 ml-auto">
              <Button variant="outline" onClick={() => { setShowForm(false); reset(); }}>Cancel</Button>
              <Button
                onClick={handleSave}
                disabled={submitting || !form.name.trim() || !form.plate_number.trim()}
                className={(!submitting && form.name.trim() && form.plate_number.trim()) ? 'kd-magnetic' : ''}
              >
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editing ? 'Update vehicle' : 'Add vehicle'}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirmDelete} onOpenChange={(v) => { if (!v) setConfirmDelete(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete vehicle</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete <strong>{confirmDelete?.name}</strong> ({confirmDelete?.plate_number})? This action cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={async () => {
                if (confirmDelete) {
                  await handleDelete(confirmDelete);
                  setConfirmDelete(null);
                }
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {viewingFuelHistory && (
        <FuelHistoryDialog vehicle={viewingFuelHistory} onClose={() => setViewingFuelHistory(null)} />
      )}

      {viewingMaintenance && (
        <VehicleMaintenanceDialog vehicle={viewingMaintenance} onClose={() => { setViewingMaintenance(null); load(); }} />
      )}

      {/* Out-of-service dialog */}
      <Dialog open={!!settingOutOfService} onOpenChange={(open) => { if (!open) { setSettingOutOfService(null); setOutOfServiceDate(''); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarOff className="h-4 w-4" />
              {settingOutOfService && isOutOfService(settingOutOfService) ? 'Return to service' : 'Mark out of service'}
            </DialogTitle>
            <DialogDescription>
              {settingOutOfService?.name} ({settingOutOfService?.plate_number})
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>Out of service until</Label>
              <Input
                type="date"
                value={outOfServiceDate}
                onChange={(e) => setOutOfServiceDate(e.target.value)}
                min={new Date().toISOString().slice(0, 10)}
              />
              <p className="text-xs text-muted-foreground">Leave blank to return the vehicle to service immediately.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setSettingOutOfService(null); setOutOfServiceDate(''); }}>Cancel</Button>
            <Button
              variant={outOfServiceDate ? 'destructive' : 'default'}
              onClick={handleMarkOutOfService}
            >
              {outOfServiceDate ? 'Mark out of service' : 'Return to service'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---------------------------------------------------------------------------
// VehicleMaintenanceDialog
// ---------------------------------------------------------------------------

const SERVICE_TYPES = [
  'Oil Change',
  'Tyre Rotation',
  'Brake Service',
  'Full Service',
  'Air Filter',
  'Transmission Service',
  'Custom',
];

const RECURRENCE_OPTIONS: { value: string; label: string }[] = [
  { value: 'one_time',       label: 'One-time' },
  { value: 'every_3_months', label: 'Every 3 months' },
  { value: 'every_6_months', label: 'Every 6 months' },
  { value: 'every_10000_km', label: 'Every 10,000 km' },
  { value: 'custom',         label: 'Custom' },
];

function effectiveMaintStatus(item: MaintenanceRecord): 'done' | 'overdue' | 'upcoming' | 'pending' {
  if (item.status === 'done') return 'done';
  if (item.due_date) {
    const days = Math.ceil((new Date(item.due_date).getTime() - Date.now()) / 86_400_000);
    if (days < 0) return 'overdue';
    if (days <= 7) return 'upcoming';
  }
  return 'pending';
}

function maintStatusBadge(status: ReturnType<typeof effectiveMaintStatus>) {
  switch (status) {
    case 'done':     return 'bg-success/10 text-success border-success/20';
    case 'overdue':  return 'bg-destructive/10 text-destructive border-destructive/20';
    case 'upcoming': return 'bg-warning/10 text-warning border-warning/20';
    default:         return 'bg-muted text-muted-foreground border-border';
  }
}

function addMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

function VehicleMaintenanceDialog({ vehicle, onClose }: { vehicle: Vehicle; onClose: () => void }) {
  const { toast } = useToast();
  const { profile } = useAuthStore();
  const [records, setRecords] = useState<MaintenanceRecord[]>([]);
  const [loadingRec, setLoadingRec] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [addForm, setAddForm] = useState({
    service_type: 'Oil Change',
    custom_service_type: '',
    due_date: '',
    due_mileage_km: '',
    recurrence: 'one_time',
    last_done_date: '',
    last_done_mileage_km: '',
    notes: '',
  });

  const loadRecords = useCallback(async () => {
    setLoadingRec(true);
    const { data } = await supabase
      .from('vehicle_maintenance')
      .select('*')
      .eq('vehicle_id', vehicle.id)
      .order('due_date', { ascending: true, nullsFirst: false });
    setRecords((data as MaintenanceRecord[]) || []);
    setLoadingRec(false);
  }, [vehicle.id]);

  useEffect(() => { loadRecords(); }, [loadRecords]);

  const resetAdd = () => setAddForm({
    service_type: 'Oil Change', custom_service_type: '', due_date: '',
    due_mileage_km: '', recurrence: 'one_time', last_done_date: '',
    last_done_mileage_km: '', notes: '',
  });

  const handleAdd = async () => {
    const svcType = addForm.service_type === 'Custom' ? addForm.custom_service_type.trim() : addForm.service_type;
    if (!svcType) { toast({ title: 'Service type is required', variant: 'destructive' }); return; }

    // Calculate due_date / due_mileage_km from recurrence
    let dueDate: string | null = addForm.due_date || null;
    let dueMileage: number | null = parseInt(addForm.due_mileage_km) || null;
    const baseDateStr = addForm.last_done_date || new Date().toISOString().slice(0, 10);
    const baseMileage = parseInt(addForm.last_done_mileage_km) || 0;

    switch (addForm.recurrence) {
      case 'every_3_months': dueDate = addMonths(baseDateStr, 3); dueMileage = null; break;
      case 'every_6_months': dueDate = addMonths(baseDateStr, 6); dueMileage = null; break;
      case 'every_10000_km': dueDate = null; dueMileage = baseMileage + 10_000; break;
    }

    setSubmitting(true);
    const { error } = await supabase.from('vehicle_maintenance').insert({
      vehicle_id: vehicle.id,
      service_type: svcType,
      due_date: dueDate,
      due_mileage_km: dueMileage,
      recurrence: addForm.recurrence,
      last_done_date: addForm.last_done_date || null,
      last_done_mileage_km: parseInt(addForm.last_done_mileage_km) || null,
      status: 'pending',
      notes: addForm.notes.trim() || null,
      created_by: profile?.id,
    });
    setSubmitting(false);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Service item added' });
    setShowAdd(false);
    resetAdd();
    loadRecords();
  };

  const handleMarkDone = async (item: MaintenanceRecord) => {
    const today = new Date().toISOString().slice(0, 10);
    // Calculate next due from recurrence
    let nextDueDate: string | null = null;
    let nextDueMileage: number | null = null;
    const baseMileage = item.last_done_mileage_km || 0;
    switch (item.recurrence) {
      case 'every_3_months': nextDueDate = addMonths(today, 3); break;
      case 'every_6_months': nextDueDate = addMonths(today, 6); break;
      case 'every_10000_km': nextDueMileage = baseMileage + 10_000; break;
    }
    const isRecurring = item.recurrence !== 'one_time' && item.recurrence !== 'custom';
    const { error } = await supabase.from('vehicle_maintenance').update({
      status: isRecurring ? 'pending' : 'done',
      last_done_date: today,
      due_date: isRecurring ? nextDueDate : item.due_date,
      due_mileage_km: isRecurring ? nextDueMileage : item.due_mileage_km,
    }).eq('id', item.id);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Marked as done' + (isRecurring ? ' — next due date set' : '') });
    loadRecords();
  };

  const handleDelete = async (id: string) => {
    await supabase.from('vehicle_maintenance').delete().eq('id', id);
    loadRecords();
  };

  const pending = records.filter((r) => effectiveMaintStatus(r) !== 'done');
  const done    = records.filter((r) => effectiveMaintStatus(r) === 'done');

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col gap-0 p-0">
        <DialogHeader className="shrink-0 px-6 pt-6 pb-3 border-b">
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="h-4 w-4" /> Maintenance — {vehicle.name} ({vehicle.plate_number})
          </DialogTitle>
          <DialogDescription>Service schedule and history for this vehicle.</DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 min-h-0">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">{pending.length} active item{pending.length !== 1 ? 's' : ''}</p>
            <Button size="sm" onClick={() => setShowAdd(true)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Add Service Item
            </Button>
          </div>

          {loadingRec ? (
            <TableSkeleton rows={3} />
          ) : pending.length === 0 && done.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No service items yet. Click "Add Service Item" to create the first one.</p>
          ) : (
            <>
              {pending.length > 0 && (
                <Card>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Service Type</TableHead>
                          <TableHead>Due Date</TableHead>
                          <TableHead>Due Mileage (km)</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Last Done</TableHead>
                          <TableHead>Notes</TableHead>
                          <TableHead></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pending.map((item) => {
                          const st = effectiveMaintStatus(item);
                          return (
                            <TableRow key={item.id}>
                              <TableCell className="font-medium text-sm">{item.service_type}</TableCell>
                              <TableCell className="text-sm">{item.due_date ? formatDate(item.due_date) : '—'}</TableCell>
                              <TableCell className="text-sm">{item.due_mileage_km != null ? item.due_mileage_km.toLocaleString() : '—'}</TableCell>
                              <TableCell>
                                <Badge variant="secondary" className={`text-xs border ${maintStatusBadge(st)}`}>
                                  {st.charAt(0).toUpperCase() + st.slice(1)}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {item.last_done_date ? formatDate(item.last_done_date) : '—'}
                                {item.last_done_mileage_km != null && ` / ${item.last_done_mileage_km.toLocaleString()} km`}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground max-w-[160px] truncate">{item.notes || '—'}</TableCell>
                              <TableCell>
                                <div className="flex gap-1">
                                  <Button size="sm" variant="ghost" title="Mark done" onClick={() => handleMarkDone(item)}>
                                    <CheckSquare className="h-4 w-4 text-success" />
                                  </Button>
                                  <Button size="sm" variant="ghost" onClick={() => handleDelete(item.id)}>
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}

              {done.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Completed</p>
                  <Card>
                    <CardContent className="p-0">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Service Type</TableHead>
                            <TableHead>Last Done Date</TableHead>
                            <TableHead>Last Done Mileage</TableHead>
                            <TableHead>Notes</TableHead>
                            <TableHead></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {done.map((item) => (
                            <TableRow key={item.id} className="opacity-60">
                              <TableCell className="text-sm">{item.service_type}</TableCell>
                              <TableCell className="text-sm">{item.last_done_date ? formatDate(item.last_done_date) : '—'}</TableCell>
                              <TableCell className="text-sm">{item.last_done_mileage_km != null ? item.last_done_mileage_km.toLocaleString() + ' km' : '—'}</TableCell>
                              <TableCell className="text-xs text-muted-foreground max-w-[160px] truncate">{item.notes || '—'}</TableCell>
                              <TableCell>
                                <Button size="sm" variant="ghost" onClick={() => handleDelete(item.id)}>
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter className="shrink-0 px-6 pb-4 pt-3 border-t bg-background">
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>

      {/* Add service item sub-dialog */}
      <Dialog open={showAdd} onOpenChange={(open) => { if (!open) { setShowAdd(false); resetAdd(); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Service Item</DialogTitle>
            <DialogDescription>{vehicle.name} ({vehicle.plate_number})</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1">
              <Label>Service Type <span className="text-destructive">*</span></Label>
              <Select value={addForm.service_type} onValueChange={(v) => setAddForm({ ...addForm, service_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SERVICE_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
              {addForm.service_type === 'Custom' && (
                <Input
                  placeholder="Describe the service…"
                  value={addForm.custom_service_type}
                  onChange={(e) => setAddForm({ ...addForm, custom_service_type: e.target.value })}
                />
              )}
            </div>

            <div className="space-y-1">
              <Label>Recurrence</Label>
              <Select value={addForm.recurrence} onValueChange={(v) => setAddForm({ ...addForm, recurrence: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RECURRENCE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {(addForm.recurrence === 'one_time' || addForm.recurrence === 'custom') && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Due Date</Label>
                  <Input type="date" value={addForm.due_date} onChange={(e) => setAddForm({ ...addForm, due_date: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>Due Mileage (km)</Label>
                  <Input type="number" placeholder="e.g. 45000" value={addForm.due_mileage_km} onChange={(e) => setAddForm({ ...addForm, due_mileage_km: e.target.value })} />
                </div>
              </div>
            )}

            {(addForm.recurrence === 'every_3_months' || addForm.recurrence === 'every_6_months') && (
              <div className="space-y-1">
                <Label>Last Done Date <span className="text-muted-foreground text-xs font-normal">(used to calculate next due)</span></Label>
                <Input type="date" value={addForm.last_done_date} onChange={(e) => setAddForm({ ...addForm, last_done_date: e.target.value })} />
                <p className="text-xs text-muted-foreground">
                  Next due: {addForm.last_done_date
                    ? formatDate(addMonths(addForm.last_done_date, addForm.recurrence === 'every_3_months' ? 3 : 6))
                    : formatDate(addMonths(new Date().toISOString().slice(0, 10), addForm.recurrence === 'every_3_months' ? 3 : 6))}
                </p>
              </div>
            )}

            {addForm.recurrence === 'every_10000_km' && (
              <div className="space-y-1">
                <Label>Last Done Mileage (km) <span className="text-muted-foreground text-xs font-normal">(used to calculate next due)</span></Label>
                <Input type="number" placeholder="e.g. 35000" value={addForm.last_done_mileage_km} onChange={(e) => setAddForm({ ...addForm, last_done_mileage_km: e.target.value })} />
                {addForm.last_done_mileage_km && (
                  <p className="text-xs text-muted-foreground">Next due at: {(parseInt(addForm.last_done_mileage_km) + 10_000).toLocaleString()} km</p>
                )}
              </div>
            )}

            <div className="space-y-1">
              <Label>Notes</Label>
              <Textarea rows={2} placeholder="Optional notes…" value={addForm.notes} onChange={(e) => setAddForm({ ...addForm, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowAdd(false); resetAdd(); }}>Cancel</Button>
            <Button onClick={handleAdd} disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
