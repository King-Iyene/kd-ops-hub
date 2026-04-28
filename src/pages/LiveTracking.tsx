import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { usePageTitle } from '@/hooks/usePageTitle';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui-kit/EmptyState';
import { AuroraHero } from '@/components/AuroraHero';
import { Loader2, Radio, Search, MapPin, Gauge, Truck, Clock, AlertTriangle } from 'lucide-react';
import L from 'leaflet';
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { cn } from '@/lib/utils';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: new URL('leaflet/dist/images/marker-icon.png', import.meta.url).href,
  iconRetinaUrl: new URL('leaflet/dist/images/marker-icon-2x.png', import.meta.url).href,
  shadowUrl: new URL('leaflet/dist/images/marker-shadow.png', import.meta.url).href,
});

const TRAIL_WINDOW_MS = 30 * 60 * 1000;        // last 30 min of pings on map
const STALE_THRESHOLD_MS = 90 * 1000;          // > 90s without a ping = stale
const SPEED_THRESHOLD_KMH = 100;               // matches Fleet.tsx
const LAGOS_CENTER: [number, number] = [6.5244, 3.3792];

type Ping = {
  lat: number;
  lng: number;
  speed_kmh: number | null;
  heading: number | null;
  is_speeding: boolean;
  recorded_at: string;
};

type LiveTrip = {
  id: string;
  driver_id: string;
  driver_name: string;
  vehicle_id: string | null;
  vehicle_plate: string | null;
  vehicle_name: string | null;
  trip_start_time: string;
  start_location: string | null;
  start_lat: number | null;
  start_lng: number | null;
  trail: Ping[];                               // sorted by recorded_at ASC
};

const initialsOf = (name: string) =>
  name.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('') || '?';

const formatElapsed = (ms: number): string => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m.toString().padStart(2, '0')}m`;
  if (m > 0) return `${m}m ${sec.toString().padStart(2, '0')}s`;
  return `${sec}s`;
};

const formatPingAge = (ms: number): string => {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
};

// ── Custom map icon (DivIcon, color-coded by state) ──────────────────────────
const driverIcon = (opts: { initials: string; color: string; pulse: boolean; selected: boolean }) =>
  L.divIcon({
    className: '',
    html: `
      <div style="position:relative;width:44px;height:44px;display:flex;align-items:center;justify-content:center;">
        ${opts.pulse ? `<div style="position:absolute;inset:0;border-radius:50%;background:${opts.color};opacity:0.25;animation:kd-live-pulse 1.6s ease-out infinite;"></div>` : ''}
        <div style="
          position:relative;
          width:32px;height:32px;border-radius:50%;
          background:${opts.color};
          color:white;font-weight:700;font-size:11px;letter-spacing:0.5px;
          display:flex;align-items:center;justify-content:center;
          border:${opts.selected ? '3px' : '2.5px'} solid white;
          box-shadow:0 0 0 ${opts.selected ? '3px' : '1px'} ${opts.color}90,0 6px 14px rgba(0,0,0,0.35);
        ">${opts.initials}</div>
      </div>`,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
  });

// ── Auto-fit map to all driver positions on first load ──────────────────────
function FitBoundsToDrivers({ points, version }: { points: [number, number][]; version: number }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView(points[0], 15, { animate: true });
      return;
    }
    map.fitBounds(L.latLngBounds(points), { padding: [60, 60], maxZoom: 16, animate: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);
  return null;
}

function FlyToPoint({ point }: { point: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (point) map.flyTo(point, Math.max(map.getZoom(), 16), { duration: 0.8 });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [point?.[0], point?.[1]]);
  return null;
}

export default function LiveTracking() {
  usePageTitle('Live Tracking');
  const { profile } = useAuthStore();

  const [trips, setTrips] = useState<Map<string, LiveTrip>>(new Map());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [flyTarget, setFlyTarget] = useState<[number, number] | null>(null);
  const [now, setNow] = useState(Date.now());

  // Tick clock for live elapsed / "last ping X ago"
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // ── Fetch a single trip with its trail (used on initial load + on new trip) ──
  const fetchTrip = async (tripId: string): Promise<LiveTrip | null> => {
    const { data: t, error: tErr } = await supabase
      .from('trip_logs')
      .select('id, driver_id, vehicle_id, trip_start_time, start_location, start_lat, start_lng, status')
      .eq('id', tripId)
      .maybeSingle();
    if (tErr || !t || t.status !== 'in_progress') return null;

    const [{ data: driver }, { data: vehicle }, { data: bc }] = await Promise.all([
      supabase.from('profiles').select('id, full_name').eq('id', t.driver_id).maybeSingle(),
      t.vehicle_id
        ? supabase.from('vehicles').select('id, plate_number, name').eq('id', t.vehicle_id).maybeSingle()
        : Promise.resolve({ data: null as any }),
      supabase
        .from('trip_breadcrumbs')
        .select('lat, lng, speed_kmh, heading, is_speeding, recorded_at')
        .eq('trip_id', tripId)
        .gte('recorded_at', new Date(Date.now() - TRAIL_WINDOW_MS).toISOString())
        .order('recorded_at', { ascending: true }),
    ]);

    return {
      id: t.id,
      driver_id: t.driver_id,
      driver_name: driver?.full_name ?? '—',
      vehicle_id: t.vehicle_id ?? null,
      vehicle_plate: vehicle?.plate_number ?? null,
      vehicle_name: vehicle?.name ?? null,
      trip_start_time: t.trip_start_time,
      start_location: t.start_location ?? null,
      start_lat: t.start_lat ?? null,
      start_lng: t.start_lng ?? null,
      trail: (bc ?? []) as Ping[],
    };
  };

  // ── Initial load: all in-progress trips with trails ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: tripsData, error } = await supabase
        .from('trip_logs')
        .select('id, driver_id, vehicle_id, trip_start_time, start_location, start_lat, start_lng')
        .eq('status', 'in_progress')
        .order('trip_start_time', { ascending: false });
      if (error || !tripsData) { setLoading(false); return; }

      const ids = tripsData.map((t) => t.id);
      const [profilesRes, vehiclesRes, breadcrumbsRes] = await Promise.all([
        supabase.from('profiles').select('id, full_name')
          .in('id', tripsData.map((t) => t.driver_id)),
        supabase.from('vehicles').select('id, plate_number, name')
          .in('id', tripsData.filter((t) => t.vehicle_id).map((t) => t.vehicle_id as string)),
        ids.length > 0
          ? supabase.from('trip_breadcrumbs')
              .select('trip_id, lat, lng, speed_kmh, heading, is_speeding, recorded_at')
              .in('trip_id', ids)
              .gte('recorded_at', new Date(Date.now() - TRAIL_WINDOW_MS).toISOString())
              .order('recorded_at', { ascending: true })
          : Promise.resolve({ data: [] as any[] }),
      ]);

      if (cancelled) return;

      const profileById = new Map((profilesRes.data ?? []).map((p: any) => [p.id, p]));
      const vehicleById = new Map((vehiclesRes.data ?? []).map((v: any) => [v.id, v]));
      const trailByTrip = new Map<string, Ping[]>();
      for (const b of (breadcrumbsRes.data ?? []) as any[]) {
        const arr = trailByTrip.get(b.trip_id) ?? [];
        arr.push({
          lat: b.lat, lng: b.lng,
          speed_kmh: b.speed_kmh, heading: b.heading,
          is_speeding: b.is_speeding, recorded_at: b.recorded_at,
        });
        trailByTrip.set(b.trip_id, arr);
      }

      const m = new Map<string, LiveTrip>();
      for (const t of tripsData) {
        m.set(t.id, {
          id: t.id,
          driver_id: t.driver_id,
          driver_name: (profileById.get(t.driver_id) as any)?.full_name ?? '—',
          vehicle_id: t.vehicle_id ?? null,
          vehicle_plate: t.vehicle_id ? (vehicleById.get(t.vehicle_id) as any)?.plate_number ?? null : null,
          vehicle_name: t.vehicle_id ? (vehicleById.get(t.vehicle_id) as any)?.name ?? null : null,
          trip_start_time: t.trip_start_time,
          start_location: t.start_location ?? null,
          start_lat: t.start_lat ?? null,
          start_lng: t.start_lng ?? null,
          trail: trailByTrip.get(t.id) ?? [],
        });
      }
      setTrips(m);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Realtime subscriptions ──
  useEffect(() => {
    const channel = supabase
      .channel('live-tracking-fleet')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'trip_logs' },
        async (payload: any) => {
          if (payload.new?.status !== 'in_progress') return;
          const trip = await fetchTrip(payload.new.id);
          if (!trip) return;
          setTrips((prev) => {
            const m = new Map(prev);
            m.set(trip.id, trip);
            return m;
          });
        })
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'trip_logs' },
        (payload: any) => {
          const next = payload.new;
          if (!next) return;
          if (next.status !== 'in_progress') {
            setTrips((prev) => {
              if (!prev.has(next.id)) return prev;
              const m = new Map(prev);
              m.delete(next.id);
              return m;
            });
            setSelectedId((sel) => (sel === next.id ? null : sel));
          }
        })
      .on('postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'trip_logs' },
        (payload: any) => {
          const id = payload.old?.id;
          if (!id) return;
          setTrips((prev) => {
            if (!prev.has(id)) return prev;
            const m = new Map(prev);
            m.delete(id);
            return m;
          });
          setSelectedId((sel) => (sel === id ? null : sel));
        })
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'trip_breadcrumbs' },
        (payload: any) => {
          const b = payload.new;
          if (!b) return;
          setTrips((prev) => {
            const t = prev.get(b.trip_id);
            if (!t) return prev;
            const cutoff = Date.now() - TRAIL_WINDOW_MS;
            const trail = [
              ...t.trail.filter((p) => Date.parse(p.recorded_at) >= cutoff),
              { lat: b.lat, lng: b.lng, speed_kmh: b.speed_kmh, heading: b.heading, is_speeding: b.is_speeding, recorded_at: b.recorded_at },
            ];
            const m = new Map(prev);
            m.set(b.trip_id, { ...t, trail });
            return m;
          });
        })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refresh in-progress list every 60s as a safety net (in case a realtime
  // event is missed during a network hiccup).
  useEffect(() => {
    const t = setInterval(async () => {
      const { data } = await supabase
        .from('trip_logs')
        .select('id, status')
        .eq('status', 'in_progress');
      if (!data) return;
      const liveIds = new Set(data.map((r) => r.id));
      setTrips((prev) => {
        let changed = false;
        const m = new Map(prev);
        for (const id of prev.keys()) {
          if (!liveIds.has(id)) { m.delete(id); changed = true; }
        }
        return changed ? m : prev;
      });
    }, 60_000);
    return () => clearInterval(t);
  }, []);

  // ── Derived: enriched trip rows ──
  const tripList = useMemo(() => {
    const arr = Array.from(trips.values());
    arr.sort((a, b) => Date.parse(b.trip_start_time) - Date.parse(a.trip_start_time));
    const q = search.trim().toLowerCase();
    return arr
      .map((t) => {
        const last = t.trail[t.trail.length - 1];
        const lat = last?.lat ?? t.start_lat;
        const lng = last?.lng ?? t.start_lng;
        const lastPingMs = last ? Date.parse(last.recorded_at) : null;
        const stale = lastPingMs == null || (now - lastPingMs) > STALE_THRESHOLD_MS;
        const speeding = !!last?.is_speeding;
        const elapsedMs = Math.max(0, now - Date.parse(t.trip_start_time));
        return { trip: t, lat, lng, lastPingMs, stale, speeding, elapsedMs, last };
      })
      .filter((row) => !q
        || row.trip.driver_name.toLowerCase().includes(q)
        || (row.trip.vehicle_plate ?? '').toLowerCase().includes(q)
        || (row.trip.vehicle_name ?? '').toLowerCase().includes(q));
  }, [trips, search, now]);

  const mapPoints = useMemo<[number, number][]>(() =>
    tripList.filter((r) => r.lat != null && r.lng != null).map((r) => [r.lat as number, r.lng as number]),
  [tripList]);

  // Re-fit bounds whenever the *set* of drivers changes (not on every tick)
  const fitVersion = useMemo(() => Array.from(trips.keys()).sort().join(','), [trips]);

  // ── Permission gate ──
  const allowed = ['super_admin', 'admin', 'operations'].includes(profile?.role ?? '');
  if (!allowed) {
    return (
      <div className="container mx-auto px-4 py-8">
        <EmptyState
          title="Access denied"
          description="Live Tracking is available to managers (Super Admin, Admin, Operations)."
        />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6 space-y-4">
      <style>{`
        @keyframes kd-live-pulse {
          0%   { transform: scale(0.7); opacity: 0.55; }
          100% { transform: scale(2.2); opacity: 0;    }
        }
      `}</style>

      <AuroraHero className="p-5 sm:p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Radio className="h-4 w-4 opacity-80 kd-icon-glow" />
              <span className="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-80">Fleet · Live Tracking</span>
            </div>
            <h1 className="kd-display text-3xl sm:text-4xl font-bold tracking-tight">
              {tripList.length > 0
                ? `${tripList.length} driver${tripList.length === 1 ? '' : 's'} on the move`
                : 'No active trips right now'}
            </h1>
            <p className="text-sm opacity-80 mt-1 max-w-xl">
              Real-time map of every in-progress trip. Driver positions update every few seconds while the trip is active.
            </p>
          </div>
        </div>
      </AuroraHero>

      {/* Live counter strip */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-green-500"></span>
          </span>
          <span className="text-sm font-semibold">
            {tripList.length} live trip{tripList.length === 1 ? '' : 's'}
          </span>
        </div>
        {tripList.some((r) => r.speeding) && (
          <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" />
            {tripList.filter((r) => r.speeding).length} speeding
          </Badge>
        )}
        {tripList.some((r) => r.stale) && (
          <Badge variant="secondary" className="gap-1 bg-amber-100 text-amber-800 hover:bg-amber-100">
            {tripList.filter((r) => r.stale).length} stale
          </Badge>
        )}
        <div className="ml-auto relative w-full sm:w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter by driver or plate…"
            className="pl-8 h-9"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-4">
        {/* Driver list */}
        <div className="space-y-2 lg:max-h-[calc(100vh-280px)] lg:overflow-y-auto lg:pr-1">
          {loading ? (
            <Card><CardContent className="py-8 flex items-center justify-center text-muted-foreground gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading active trips…
            </CardContent></Card>
          ) : tripList.length === 0 ? (
            <Card><CardContent className="py-8">
              <EmptyState
                title="No active trips"
                description="Drivers will appear here as soon as they start a trip."
              />
            </CardContent></Card>
          ) : (
            tripList.map((row) => {
              const t = row.trip;
              const isSelected = selectedId === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setSelectedId(t.id);
                    if (row.lat != null && row.lng != null) setFlyTarget([row.lat, row.lng]);
                  }}
                  className={cn(
                    'w-full text-left rounded-xl border bg-card transition-all',
                    'hover:border-primary/50 hover:shadow-sm',
                    isSelected ? 'ring-2 ring-primary border-primary/60' : 'border-border',
                    row.speeding && 'border-red-300 dark:border-red-800',
                  )}
                >
                  <div className="p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div
                          className="h-9 w-9 rounded-full flex items-center justify-center text-white font-bold text-xs shrink-0"
                          style={{ background: row.speeding ? '#dc2626' : row.stale ? '#94a3b8' : '#0ea5e9' }}
                        >
                          {initialsOf(t.driver_name)}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold truncate">{t.driver_name}</p>
                          <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                            <Truck className="h-3 w-3 shrink-0" />
                            {t.vehicle_plate ? `${t.vehicle_plate}${t.vehicle_name ? ` · ${t.vehicle_name}` : ''}` : 'No vehicle'}
                          </p>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs font-mono text-muted-foreground flex items-center gap-1 justify-end">
                          <Clock className="h-3 w-3" /> {formatElapsed(row.elapsedMs)}
                        </p>
                        {row.lastPingMs != null && (
                          <p className={cn(
                            'text-[10px] mt-0.5',
                            row.stale ? 'text-amber-600 font-semibold' : 'text-muted-foreground',
                          )}>
                            ping {formatPingAge(now - row.lastPingMs)}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 text-xs">
                      <span className={cn(
                        'inline-flex items-center gap-1 font-mono',
                        row.speeding ? 'text-red-600 font-semibold' : 'text-muted-foreground',
                      )}>
                        <Gauge className="h-3 w-3" />
                        {row.last?.speed_kmh != null ? `${Math.round(row.last.speed_kmh)} km/h` : '—'}
                      </span>
                      {row.lat != null && row.lng != null ? (
                        <span className="text-muted-foreground font-mono text-[10px]">
                          {row.lat.toFixed(4)}, {row.lng.toFixed(4)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground italic text-[10px]">no GPS yet</span>
                      )}
                    </div>

                    {t.start_location && (
                      <p className="text-[11px] text-muted-foreground flex items-start gap-1">
                        <MapPin className="h-3 w-3 mt-0.5 shrink-0" />
                        <span className="truncate">From: {t.start_location}</span>
                      </p>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Map */}
        <div className="rounded-xl overflow-hidden border border-border/60 shadow-sm bg-muted/30 h-[60vh] lg:h-[calc(100vh-280px)] min-h-[400px]">
          <MapContainer
            center={mapPoints[0] ?? LAGOS_CENTER}
            zoom={mapPoints[0] ? 14 : 11}
            style={{ height: '100%', width: '100%' }}
            scrollWheelZoom
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            />
            <FitBoundsToDrivers points={mapPoints} version={fitVersion.length} />
            <FlyToPoint point={flyTarget} />

            {tripList.map((row) => {
              const t = row.trip;
              if (row.lat == null || row.lng == null) return null;
              const color = row.speeding ? '#dc2626' : row.stale ? '#94a3b8' : '#0ea5e9';

              const trailPositions: [number, number][] = t.trail.map((p) => [p.lat, p.lng]);
              if (t.start_lat != null && t.start_lng != null) {
                trailPositions.unshift([t.start_lat, t.start_lng]);
              }

              return (
                <span key={t.id}>
                  {trailPositions.length > 1 && (
                    <>
                      <Polyline positions={trailPositions} color={color} weight={8} opacity={0.18} />
                      <Polyline positions={trailPositions} color={color} weight={3} opacity={0.85} />
                    </>
                  )}
                  <Marker
                    position={[row.lat, row.lng]}
                    icon={driverIcon({
                      initials: initialsOf(t.driver_name),
                      color,
                      pulse: !row.stale,
                      selected: selectedId === t.id,
                    })}
                    eventHandlers={{ click: () => setSelectedId(t.id) }}
                  >
                    <Popup>
                      <div className="space-y-0.5 min-w-[180px]">
                        <strong>{t.driver_name}</strong>
                        {t.vehicle_plate && <div className="text-xs">{t.vehicle_plate} · {t.vehicle_name ?? ''}</div>}
                        <div className="text-xs">Elapsed: <strong>{formatElapsed(row.elapsedMs)}</strong></div>
                        <div className="text-xs">
                          Speed: <strong>{row.last?.speed_kmh != null ? `${Math.round(row.last.speed_kmh)} km/h` : '—'}</strong>
                          {row.speeding && <span className="ml-1 text-red-600 font-semibold">⚠ speeding</span>}
                        </div>
                        {row.lastPingMs != null && (
                          <div className="text-xs">
                            Last ping: {formatPingAge(now - row.lastPingMs)}
                            {row.stale && <span className="ml-1 text-amber-600 font-semibold">(stale)</span>}
                          </div>
                        )}
                      </div>
                    </Popup>
                  </Marker>
                </span>
              );
            })}
          </MapContainer>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap pl-1">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-sky-500 inline-block"></span> Active driver
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-red-600 inline-block"></span> Speeding
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-slate-400 inline-block"></span> Stale (no ping &gt; 90s)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-6 h-0.5 bg-sky-500 inline-block"></span> Recent trail (last 30 min)
        </span>
      </div>
    </div>
  );
}
