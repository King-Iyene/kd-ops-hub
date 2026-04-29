import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { usePageTitle } from '@/hooks/usePageTitle';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui-kit/EmptyState';
import { AuroraHero } from '@/components/AuroraHero';
import { Loader2, Radio, Search, MapPin, Gauge, Truck, Clock, AlertTriangle, Map as MapIcon } from 'lucide-react';
import { useJsApiLoader, GoogleMap, Polyline as GPolyline } from '@react-google-maps/api';
import { GOOGLE_MAPS_API_KEY, MAP_OPTIONS } from '@/lib/maps';
import { cn } from '@/lib/utils';

const TRAIL_WINDOW_MS = 30 * 60 * 1000;
const STALE_THRESHOLD_MS = 90 * 1000;
const SPEED_THRESHOLD_KMH = 100;
const LAGOS_CENTER: google.maps.LatLngLiteral = { lat: 6.5244, lng: 3.3792 };
const MAPS_LIBRARIES: ('places' | 'geometry')[] = [];

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

// Bearing (compass heading 0–360°) from point A to B. Used to rotate the
// driver marker's direction arrow so it always points where the vehicle is
// headed — same trick the Uber/Bolt rider apps use.
const bearingDeg = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δλ = toRad(lng2 - lng1);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
};

// Great-circle distance in metres (Haversine).
const haversineMeters = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
};

// Sum trail distance — used for live "distance covered" without waiting for
// odometer readout at trip end.
const trailDistanceKm = (pings: Ping[], startLat: number | null, startLng: number | null): number => {
  if (pings.length === 0) return 0;
  let m = 0;
  let prevLat = startLat;
  let prevLng = startLng;
  for (const p of pings) {
    if (prevLat != null && prevLng != null) {
      m += haversineMeters(prevLat, prevLng, p.lat, p.lng);
    }
    prevLat = p.lat; prevLng = p.lng;
  }
  return m / 1000;
};

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

// ── Driver Overlay ────────────────────────────────────────────────────────────
//
// A custom google.maps.OverlayView that renders the driver bubble as HTML.
// The rAF interpolation loop calls .setPosition() and targets the
// .kd-driver-arrow element for bearing rotation — same approach as the
// previous Leaflet DivIcon but adapted for the Google Maps overlay API.
//
// The class is created lazily (inside makeDriverOverlayClass) because
// google.maps.OverlayView is only available after the Maps JS API loads.

type DriverOverlayConfig = {
  initials: string;
  color: string;
  pulse: boolean;
  selected: boolean;
};

function makeDriverOverlayClass() {
  return class DriverOverlay extends google.maps.OverlayView {
    private pos: google.maps.LatLng;
    private el: HTMLDivElement | null = null;
    private cfg: DriverOverlayConfig;
    private clickHandler: (() => void) | null = null;

    constructor(pos: google.maps.LatLngLiteral, cfg: DriverOverlayConfig) {
      super();
      this.pos = new google.maps.LatLng(pos);
      this.cfg = cfg;
    }

    private html(): string {
      const { initials, color, pulse, selected } = this.cfg;
      return `<div style="position:relative;width:48px;height:48px;display:flex;align-items:center;justify-content:center;transform:translate(-50%,-50%)">
        ${pulse ? `<div style="position:absolute;inset:6px;border-radius:50%;background:${color};opacity:0.25;animation:kd-live-pulse 1.6s ease-out infinite;pointer-events:none;"></div>` : ''}
        <div class="kd-driver-arrow" style="position:absolute;inset:0;transform:rotate(0deg);transform-origin:50% 50%;pointer-events:none;">
          <div style="position:absolute;left:50%;top:-2px;transform:translateX(-50%);width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-bottom:11px solid ${color};filter:drop-shadow(0 2px 3px rgba(0,0,0,0.4));"></div>
        </div>
        <div style="position:relative;z-index:2;width:32px;height:32px;border-radius:50%;background:${color};color:white;font-weight:700;font-size:11px;letter-spacing:0.5px;display:flex;align-items:center;justify-content:center;border:${selected ? '3px' : '2.5px'} solid white;box-shadow:0 0 0 ${selected ? '3px' : '1px'} ${color}90,0 6px 14px rgba(0,0,0,0.35);">${initials}</div>
      </div>`;
    }

    onAdd() {
      this.el = document.createElement('div');
      this.el.style.cssText = 'position:absolute;cursor:pointer;user-select:none;';
      this.el.innerHTML = this.html();
      if (this.clickHandler) this.el.addEventListener('click', this.clickHandler);
      this.getPanes()!.overlayMouseTarget.appendChild(this.el);
    }

    draw() {
      if (!this.el) return;
      const proj = this.getProjection();
      if (!proj) return;
      const px = proj.fromLatLngToDivPixel(this.pos);
      if (!px) return;
      this.el.style.left = `${px.x}px`;
      this.el.style.top = `${px.y}px`;
    }

    onRemove() {
      this.el?.remove();
      this.el = null;
    }

    setPosition(lat: number, lng: number) {
      this.pos = new google.maps.LatLng(lat, lng);
      this.draw();
    }

    getArrow(): HTMLElement | null {
      return this.el?.querySelector<HTMLElement>('.kd-driver-arrow') ?? null;
    }

    getElement(): HTMLElement | null {
      return this.el;
    }

    updateConfig(cfg: Partial<DriverOverlayConfig>) {
      this.cfg = { ...this.cfg, ...cfg };
      if (this.el) {
        const prevArrow = this.getArrow();
        const prevTransform = prevArrow?.style.transform ?? 'rotate(0deg)';
        this.el.innerHTML = this.html();
        // Re-apply bearing so the arrow doesn't reset to 0° after a colour change
        const nextArrow = this.getArrow();
        if (nextArrow) nextArrow.style.transform = prevTransform;
      }
    }

    onClick(handler: () => void) {
      this.clickHandler = handler;
      this.el?.addEventListener('click', handler);
    }
  };
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

  // ── Google Maps state ──────────────────────────────────────────────────────
  const { isLoaded: mapsLoaded } = useJsApiLoader({
    id: 'kd-gmaps',
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    libraries: MAPS_LIBRARIES,
  });
  const [googleMap, setGoogleMap] = useState<google.maps.Map | null>(null);
  const onMapLoad = useCallback((map: google.maps.Map) => setGoogleMap(map), []);

  // The DriverOverlay class is only available after the Maps JS API loads.
  type AnyDriverOverlay = InstanceType<ReturnType<typeof makeDriverOverlayClass>>;
  const OverlayClassRef = useRef<ReturnType<typeof makeDriverOverlayClass> | null>(null);
  useEffect(() => {
    if (mapsLoaded && !OverlayClassRef.current) {
      OverlayClassRef.current = makeDriverOverlayClass();
    }
  }, [mapsLoaded]);

  // ── Smooth animation refs ─────────────────────────────────────────────────
  //
  // The marker position and direction-arrow rotation are NOT driven by React
  // state — that would mean either choppy 1-update-per-ping movement or 60
  // rerenders/sec per driver. Instead we drive them imperatively from a
  // single requestAnimationFrame loop:
  //
  //   • markerRefs    — Leaflet Marker instances by tripId, set via ref={}.
  //   • animRef       — current "interpolating from A to B over N ms" state.
  //   • displayPosRef — last-rendered position; doubles as the "from" for the
  //                     next animation when a fresh ping arrives.
  //
  // This is the pattern Uber's Android client uses with ValueAnimator and
  // what Mapbox's "animate-marker" example does on the web.
  type AnimState = {
    fromLat: number; fromLng: number;
    toLat: number;   toLng: number;
    fromBearing: number; toBearing: number;
    startTime: number;
    duration: number;
  };
  const markerRefs = useRef<Map<string, AnyDriverOverlay>>(new Map());
  const animRef = useRef<Map<string, AnimState>>(new Map());
  const displayPosRef = useRef<Map<string, { lat: number; lng: number; bearing: number }>>(new Map());

  // Schedule a new animation toward a fresh GPS fix. Suppresses bearing
  // updates when movement is < 10 m (GPS jitter while parked) so the
  // direction arrow doesn't spin randomly at rest.
  const animateTo = (tripId: string, lat: number, lng: number) => {
    const current = displayPosRef.current.get(tripId) ?? { lat, lng, bearing: 0 };
    const distM = haversineMeters(current.lat, current.lng, lat, lng);
    const newBearing = distM >= 10
      ? bearingDeg(current.lat, current.lng, lat, lng)
      : current.bearing;
    animRef.current.set(tripId, {
      fromLat: current.lat, fromLng: current.lng,
      toLat: lat, toLng: lng,
      fromBearing: current.bearing, toBearing: newBearing,
      startTime: performance.now(),
      duration: 1500, // matches typical 1-2s ping cadence at driving speed
    });
  };

  // The rAF loop — drives BOTH position and bearing for ALL drivers from a
  // single frame. Position interpolates linearly over `duration`; bearing
  // takes a faster 350ms ease so the arrow flicks to the new heading without
  // lagging the marker.
  //
  // We also re-apply bearing every frame to all markers (not just animating
  // ones). React-Leaflet rebuilds the icon DOM when the icon prop changes
  // (e.g., color flips on speeding/stale state), which resets the arrow's
  // inline transform back to rotate(0). Re-applying every frame is cheap
  // (browser short-circuits same-value style writes) and keeps the arrow
  // pointing the right way through state changes.
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const t0 = performance.now();

      for (const [tripId, anim] of animRef.current) {
        const elapsed = t0 - anim.startTime;
        const tPos = Math.min(1, elapsed / anim.duration);
        const lat = anim.fromLat + (anim.toLat - anim.fromLat) * tPos;
        const lng = anim.fromLng + (anim.toLng - anim.fromLng) * tPos;

        // Bearing — shortest-path interpolation over a faster 350ms window.
        const tBear = Math.min(1, elapsed / 350);
        let delta = anim.toBearing - anim.fromBearing;
        if (delta > 180) delta -= 360;
        if (delta < -180) delta += 360;
        const bearing = ((anim.fromBearing + delta * tBear) % 360 + 360) % 360;

        const m = markerRefs.current.get(tripId);
        if (m) m.setPosition(lat, lng);
        displayPosRef.current.set(tripId, { lat, lng, bearing });

        if (tPos >= 1) animRef.current.delete(tripId);
      }

      // Re-apply bearing to every mounted overlay (rebuild-proof — updateConfig
      // preserves it, but explicit re-apply costs nearly nothing and is safer).
      for (const [tripId, marker] of markerRefs.current) {
        const display = displayPosRef.current.get(tripId);
        if (!display) continue;
        const arrow = marker.getArrow();
        if (!arrow) continue;
        const want = `rotate(${display.bearing}deg)`;
        if (arrow.style.transform !== want) arrow.style.transform = want;
      }

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Tick clock for live elapsed / "last ping X ago"
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
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
        const distanceKm = trailDistanceKm(t.trail, t.start_lat, t.start_lng);
        const maxSpeedKmh = t.trail.reduce((mx, p) => p.speed_kmh != null && p.speed_kmh > mx ? p.speed_kmh : mx, 0);
        const avgSpeedKmh = elapsedMs > 0 ? (distanceKm / (elapsedMs / 3_600_000)) : 0;
        return { trip: t, lat, lng, lastPingMs, stale, speeding, elapsedMs, last, distanceKm, maxSpeedKmh, avgSpeedKmh };
      })
      .filter((row) => !q
        || row.trip.driver_name.toLowerCase().includes(q)
        || (row.trip.vehicle_plate ?? '').toLowerCase().includes(q)
        || (row.trip.vehicle_name ?? '').toLowerCase().includes(q));
  }, [trips, search, now]);

  // Re-fit bounds whenever the *set* of drivers changes (not on every tick)
  const fitVersion = useMemo(() => Array.from(trips.keys()).sort().join(','), [trips]);

  // ── Overlay lifecycle — syncs tripList with DriverOverlay instances ──────
  useEffect(() => {
    if (!googleMap || !OverlayClassRef.current) return;
    const OverlayClass = OverlayClassRef.current;

    // Remove overlays for trips that have ended
    for (const [id, overlay] of markerRefs.current) {
      if (!trips.has(id)) {
        overlay.setMap(null);
        markerRefs.current.delete(id);
      }
    }

    // Create or update overlays for current trips
    for (const row of tripList) {
      if (row.lat == null || row.lng == null) continue;
      const t = row.trip;
      const color = row.speeding ? '#dc2626' : row.stale ? '#94a3b8' : '#0ea5e9';
      const existing = markerRefs.current.get(t.id);

      if (existing) {
        existing.updateConfig({ color, pulse: !row.stale, selected: selectedId === t.id });
      } else {
        const display = displayPosRef.current.get(t.id);
        const pos = display ? { lat: display.lat, lng: display.lng } : { lat: row.lat, lng: row.lng };
        const overlay = new OverlayClass(pos, {
          initials: initialsOf(t.driver_name),
          color,
          pulse: !row.stale,
          selected: selectedId === t.id,
        });
        overlay.setMap(googleMap);
        overlay.onClick(() => setSelectedId(t.id));
        markerRefs.current.set(t.id, overlay);
      }
    }
  }, [googleMap, tripList, selectedId]);

  // ── Fit bounds when driver set changes (not on every GPS ping) ───────────
  const lastFitVersion = useRef('');
  useEffect(() => {
    if (!googleMap || fitVersion === lastFitVersion.current) return;
    lastFitVersion.current = fitVersion;
    const pts = tripList.filter((r) => r.lat != null && r.lng != null);
    if (pts.length === 0) return;
    if (pts.length === 1) {
      googleMap.setCenter({ lat: pts[0].lat!, lng: pts[0].lng! });
      googleMap.setZoom(15);
    } else {
      const bounds = new google.maps.LatLngBounds();
      pts.forEach((r) => bounds.extend({ lat: r.lat!, lng: r.lng! }));
      googleMap.fitBounds(bounds, 60);
    }
  }, [googleMap, fitVersion, tripList]);

  // ── Fly to selected driver ────────────────────────────────────────────────
  useEffect(() => {
    if (!googleMap || !flyTarget) return;
    googleMap.panTo({ lat: flyTarget[0], lng: flyTarget[1] });
    if ((googleMap.getZoom() ?? 0) < 16) googleMap.setZoom(16);
    setFlyTarget(null);
  }, [googleMap, flyTarget]);

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
        const trail = trailByTrip.get(t.id) ?? [];
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
          trail,
        });
        // Seed displayPosRef with the latest trail point so the marker mounts
        // at the right place and the first new ping animates from it.
        const lastPing = trail[trail.length - 1];
        const seedLat = lastPing?.lat ?? t.start_lat;
        const seedLng = lastPing?.lng ?? t.start_lng;
        if (seedLat != null && seedLng != null) {
          // Initial bearing: derived from the last two trail points if we have them.
          let bearing = 0;
          if (trail.length >= 2) {
            const prev = trail[trail.length - 2];
            bearing = bearingDeg(prev.lat, prev.lng, lastPing!.lat, lastPing!.lng);
          }
          displayPosRef.current.set(t.id, { lat: seedLat, lng: seedLng, bearing });
        }
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
          // Seed displayPosRef so the marker mounts at the right place.
          if (trip.start_lat != null && trip.start_lng != null) {
            displayPosRef.current.set(trip.id, { lat: trip.start_lat, lng: trip.start_lng, bearing: 0 });
          }
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
          // Schedule the marker animation BEFORE setState so the rAF loop
          // starts interpolating on the next frame, before React rerenders.
          animateTo(b.trip_id, b.lat, b.lng);
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

  const mapPoints = useMemo<[number, number][]>(() =>
    tripList.filter((r) => r.lat != null && r.lng != null).map((r) => [r.lat as number, r.lng as number] as [number, number]),
  [tripList]);
  const mapCenter = useMemo<google.maps.LatLngLiteral>(() =>
    mapPoints.length > 0 ? { lat: mapPoints[0][0], lng: mapPoints[0][1] } : LAGOS_CENTER,
  [mapPoints]);

  // ── Permission gate ──
  const allowed = ['super_admin', 'admin'].includes(profile?.role ?? '');
  if (!allowed) {
    return (
      <div className="container mx-auto px-4 py-8">
        <EmptyState
          title="Access denied"
          description="Live Tracking is available to admins only."
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

                    <div className="grid grid-cols-3 gap-1 text-xs pt-1">
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Speed</p>
                        <p className={cn(
                          'font-mono font-semibold',
                          row.speeding ? 'text-red-600' : 'text-foreground',
                        )}>
                          {row.last?.speed_kmh != null ? `${Math.round(row.last.speed_kmh)}` : '—'}
                          <span className="text-[10px] font-normal text-muted-foreground ml-0.5">km/h</span>
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Distance</p>
                        <p className="font-mono font-semibold text-foreground">
                          {row.distanceKm.toFixed(1)}
                          <span className="text-[10px] font-normal text-muted-foreground ml-0.5">km</span>
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Max</p>
                        <p className="font-mono font-semibold text-foreground">
                          {row.maxSpeedKmh > 0 ? Math.round(row.maxSpeedKmh) : '—'}
                          <span className="text-[10px] font-normal text-muted-foreground ml-0.5">km/h</span>
                        </p>
                      </div>
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
          {!GOOGLE_MAPS_API_KEY ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-sm text-muted-foreground">
              <MapIcon className="h-8 w-8 opacity-30" />
              <p>Add <code className="bg-muted px-1 rounded">VITE_GOOGLE_MAPS_API_KEY</code> to enable maps</p>
            </div>
          ) : !mapsLoaded ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <GoogleMap
              center={mapCenter}
              zoom={mapPoints.length > 0 ? 14 : 11}
              mapContainerStyle={{ width: '100%', height: '100%' }}
              options={{ ...MAP_OPTIONS, fullscreenControl: true }}
              onLoad={onMapLoad}
            >
              {/* Trail polylines — rendered declaratively; driver positions
                  managed imperatively by DriverOverlay via the rAF loop */}
              {tripList.map((row) => {
                if (row.lat == null || row.lng == null) return null;
                const t = row.trip;
                const color = row.speeding ? '#dc2626' : row.stale ? '#94a3b8' : '#0ea5e9';
                const trail: google.maps.LatLngLiteral[] = [];
                if (t.start_lat != null && t.start_lng != null) trail.push({ lat: t.start_lat, lng: t.start_lng });
                t.trail.forEach((p) => trail.push({ lat: p.lat, lng: p.lng }));
                if (trail.length < 2) return null;
                return (
                  <span key={t.id}>
                    <GPolyline path={trail} options={{ strokeColor: color, strokeWeight: 8, strokeOpacity: 0.18 }} />
                    <GPolyline path={trail} options={{ strokeColor: color, strokeWeight: 3, strokeOpacity: 0.85 }} />
                  </span>
                );
              })}
            </GoogleMap>
          )}
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
