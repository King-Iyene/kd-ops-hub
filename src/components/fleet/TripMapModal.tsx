import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useJsApiLoader, GoogleMap, Polyline as GPolyline, OverlayView } from '@react-google-maps/api';
import { GOOGLE_MAPS_API_KEY, MAP_OPTIONS, MAPS_LIBRARIES } from '@/lib/maps';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui-kit/EmptyState';
import { cn } from '@/lib/utils';
import { formatDate, formatTime } from '@/lib/format';
import { Loader2, MapPin, RotateCcw, Play, Pause, AlertTriangle, Gauge, Zap, ParkingCircle, Map as MapIcon } from 'lucide-react';
import { type TripLog, type BreadcrumbRow, type TripEvent, formatCoords, formatDuration, haversineKm, reverseGeocode, computeIdleMinutes } from '@/lib/fleet-utils';

const EVENT_LABEL: Record<string, string> = {
  speeding:      'Speeding',
  hard_braking:  'Hard Braking',
  extended_stop: 'Extended Stop',
};

function TripGoogleMap({ trail, startPos, endPos, events, replayStep = null }: {
  trail: [number, number][];
  startPos: [number, number] | null;
  endPos: [number, number] | null;
  events: { id: string; lat: number; lng: number; event_type: string; details: string; recorded_at: string }[];
  replayStep?: number | null;
}) {
  const { isLoaded } = useJsApiLoader({ id: 'kd-gmaps', googleMapsApiKey: GOOGLE_MAPS_API_KEY, libraries: MAPS_LIBRARIES });
  const [gmap, setGmap] = useState<google.maps.Map | null>(null);

  const center: google.maps.LatLngLiteral = useMemo(() => {
    if (trail.length > 0) return { lat: trail[Math.floor(trail.length / 2)][0], lng: trail[Math.floor(trail.length / 2)][1] };
    if (startPos) return { lat: startPos[0], lng: startPos[1] };
    return { lat: 6.5244, lng: 3.3792 };
  }, [trail, startPos]);

  const onLoad = useCallback((map: google.maps.Map) => {
    setGmap(map);
    const allPoints = [...trail.map(([lat, lng]) => ({ lat, lng }))];
    if (startPos) allPoints.push({ lat: startPos[0], lng: startPos[1] });
    if (endPos) allPoints.push({ lat: endPos[0], lng: endPos[1] });
    if (allPoints.length >= 2) {
      const bounds = new google.maps.LatLngBounds();
      allPoints.forEach((p) => bounds.extend(p));
      map.fitBounds(bounds, 32);
    } else if (allPoints.length === 1) {
      map.setCenter(allPoints[0]);
      map.setZoom(14);
    }
  }, [trail, startPos, endPos]);

  const trailPath = useMemo(() => trail.map(([lat, lng]) => ({ lat, lng })), [trail]);

  if (!GOOGLE_MAPS_API_KEY) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-sm text-muted-foreground">
        <MapIcon className="h-8 w-8 opacity-30" />
        <p>Add <code className="bg-muted px-1 rounded">VITE_GOOGLE_MAPS_API_KEY</code> to enable maps</p>
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <GoogleMap
      center={center}
      zoom={13}
      mapContainerStyle={{ width: '100%', height: '100%' }}
      options={{ ...MAP_OPTIONS, fullscreenControl: true }}
      onLoad={onLoad}
    >
      {trailPath.length > 1 && (
        <>
          <GPolyline path={trailPath} options={{ strokeColor: '#00ECFF', strokeWeight: 8, strokeOpacity: 0.18 }} />
          <GPolyline path={trailPath} options={{ strokeColor: '#006994', strokeWeight: 3, strokeOpacity: 0.9 }} />
        </>
      )}
      {startPos && (
        <OverlayView position={{ lat: startPos[0], lng: startPos[1] }} mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}>
          <div className="kd-trip-marker-start" style={{ transform: 'translate(-50%, -50%)' }} />
        </OverlayView>
      )}
      {endPos && (
        <OverlayView position={{ lat: endPos[0], lng: endPos[1] }} mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}>
          <div className="kd-trip-marker-end" style={{ transform: 'translate(-50%, -50%)' }} />
        </OverlayView>
      )}
      {events.map((ev) => (
        <OverlayView key={ev.id} position={{ lat: ev.lat, lng: ev.lng }} mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}>
          <div className="kd-trip-marker-event" style={{ transform: 'translate(-50%, -50%)' }} title={EVENT_LABEL[ev.event_type] || ev.event_type} />
        </OverlayView>
      ))}
      {replayStep !== null && trail[replayStep] && (
        <OverlayView
          position={{ lat: trail[replayStep][0], lng: trail[replayStep][1] }}
          mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
        >
          <div style={{
            transform: 'translate(-50%, -50%)',
            width: 18,
            height: 18,
            borderRadius: '50%',
            background: '#f59e0b',
            border: '3px solid #fff',
            boxShadow: '0 0 0 3px #f59e0b55, 0 2px 6px rgba(0,0,0,.4)',
          }} />
        </OverlayView>
      )}
    </GoogleMap>
  );
}

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

export function isCoordString(s: string) {
  return /[°]\s*[NSns]/.test(s);
}

// Module-level cache — each unique coordinate string is geocoded at most once per session.
export const geocodeResultCache = new Map<string, string>();

export function LocationCell({ location, lat, lng, showCoords = false }: {
  location: string; lat: number | null; lng: number | null; showCoords?: boolean
}) {
  const { isLoaded } = useJsApiLoader({ id: 'kd-gmaps', googleMapsApiKey: GOOGLE_MAPS_API_KEY, libraries: MAPS_LIBRARIES });
  const [resolved, setResolved] = useState<string | null>(() => geocodeResultCache.get(location) ?? null);
  const [geocoding, setGeocoding] = useState(false);
  const isCoord = isCoordString(location);

  useEffect(() => {
    if (!isCoord || !isLoaded || lat == null || lng == null) return;
    const cached = geocodeResultCache.get(location);
    if (cached) { setResolved(cached); return; }
    setGeocoding(true);
    reverseGeocode(lat, lng)
      .then((name) => { if (name) { geocodeResultCache.set(location, name); setResolved(name); } })
      .catch(() => {})
      .finally(() => setGeocoding(false));
  }, [isCoord, isLoaded, location, lat, lng]);

  if (!location) return <span>—</span>;
  if (geocoding) return <span className="text-muted-foreground italic text-xs">Resolving…</span>;

  const displayName = resolved ?? location;
  const coordText = lat != null && lng != null ? formatCoords(lat, lng) : null;

  return (
    <span className="block min-w-0">
      <span className="truncate block" title={resolved && isCoord ? location : displayName}>{displayName}</span>
      {showCoords && coordText && (
        <span className="block text-[10px] font-mono text-muted-foreground/55 leading-tight mt-0.5">{coordText}</span>
      )}
    </span>
  );
}

function TripMapModal({ trip, breadcrumbs, events, loading, onClose }: TripMapModalProps) {
  const [activeTab, setActiveTab] = useState<'map' | 'replay' | 'events'>('map');
  const [replayPlaying, setReplayPlaying] = useState(false);
  const [replayStep, setReplayStep] = useState(0);
  const [replaySpeed, setReplaySpeed] = useState(4);
  const replayRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [startPlaceName, setStartPlaceName] = useState<string | null>(null);
  const [endPlaceName, setEndPlaceName]     = useState<string | null>(null);

  useEffect(() => {
    if (trip.start_lat != null && trip.start_lng != null && isCoordString(trip.start_location)) {
      reverseGeocode(trip.start_lat, trip.start_lng).then((a) => { if (a) setStartPlaceName(a); }).catch(() => {});
    }
    if (trip.end_lat != null && trip.end_lng != null && isCoordString(trip.end_location)) {
      reverseGeocode(trip.end_lat, trip.end_lng).then((a) => { if (a) setEndPlaceName(a); }).catch(() => {});
    }
  }, [trip.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const displayStart = startPlaceName ?? trip.start_location;
  const displayEnd   = endPlaceName   ?? trip.end_location;

  // Smooth the displayed route: remove consecutive points within 15 m of each other.
  // This cleans up GPS jitter clusters that slipped through the recording filter
  // (e.g. older trips recorded before the accuracy gate was added).
  const trail: [number, number][] = (() => {
    const pts: [number, number][] = [];
    for (const b of breadcrumbs) {
      const prev = pts[pts.length - 1];
      if (!prev || haversineKm(prev[0], prev[1], b.lat, b.lng) >= 0.015) {
        pts.push([b.lat, b.lng]);
      }
    }
    return pts;
  })();
  const totalSteps = breadcrumbs.length; // replay uses raw breadcrumbs for accurate timestamps

  useEffect(() => {
    if (replayPlaying && totalSteps > 0) {
      replayRef.current = setInterval(() => {
        setReplayStep((s) => {
          if (s >= totalSteps - 1) {
            setReplayPlaying(false);
            return totalSteps - 1;
          }
          return s + 1;
        });
      }, Math.max(50, 300 / replaySpeed));
    } else {
      if (replayRef.current) clearInterval(replayRef.current);
    }
    return () => { if (replayRef.current) clearInterval(replayRef.current); };
  }, [replayPlaying, replaySpeed, totalSteps]);

  const startPos: [number, number] | null =
    trip.start_lat != null && trip.start_lng != null ? [trip.start_lat, trip.start_lng] : null;
  const endPos: [number, number] | null =
    trip.end_lat != null && trip.end_lng != null ? [trip.end_lat, trip.end_lng] : null;

  const mapEvents = events.filter((ev) => ev.lat != null && ev.lng != null) as (TripEvent & { lat: number; lng: number })[];

  const hasGps = startPos != null || endPos != null;

  // Telemetry — read-only, derived purely from existing data
  const distanceKm = trip.km_driven;
  const durationMin = trip.duration_minutes;
  const litres = trip.litres;
  const avgSpeedKph = distanceKm != null && durationMin != null && durationMin > 0
    ? Math.round((distanceKm / (durationMin / 60)) * 10) / 10
    : null;
  const idleMinutes = loading ? null : computeIdleMinutes(breadcrumbs);
  const extStops = events.filter((ev) => ev.event_type === 'extended_stop').length;

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
              <DialogDescription className="mt-0.5 space-y-0.5">
                <span className="block text-[11px] text-muted-foreground">{formatDate(trip.date)}</span>
                <span className="block truncate">
                  {displayStart || '—'}
                  {trip.start_lat != null && trip.start_lng != null && (
                    <span className="ml-1 font-mono text-[10px] text-muted-foreground/60">{formatCoords(trip.start_lat, trip.start_lng)}</span>
                  )}
                  {' → '}
                  {displayEnd || '—'}
                  {trip.end_lat != null && trip.end_lng != null && (
                    <span className="ml-1 font-mono text-[10px] text-muted-foreground/60">{formatCoords(trip.end_lat, trip.end_lng)}</span>
                  )}
                </span>
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Telemetry strip */}
        <div className="px-6 pt-4 pb-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 shrink-0 border-b border-border/60">
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
          <div className={`rounded-lg border px-3 py-2 ${idleMinutes != null && idleMinutes > 30 ? 'border-amber-300 bg-amber-50/40 dark:bg-amber-950/20' : 'border-border/50 bg-muted/30'}`}>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground/80">Stopped</p>
            <p className={`kd-stat-number text-base font-bold leading-tight ${idleMinutes != null && idleMinutes > 30 ? 'text-amber-600' : ''}`}>
              {idleMinutes != null ? `${idleMinutes} min` : '—'}
            </p>
          </div>
          <div className="rounded-lg border border-border/50 bg-muted/30 px-3 py-2">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground/80">Telemetry</p>
            <p className="kd-stat-number text-base font-bold leading-tight">
              {breadcrumbs.length} ping{breadcrumbs.length === 1 ? '' : 's'} · {extStops} stop{extStops !== 1 ? 's' : ''}
            </p>
          </div>
        </div>

        {/* Tab bar */}
        <div className="px-6 pt-3 flex gap-1 shrink-0 flex-wrap">
          {([
            { key: 'map', label: 'Map', icon: <MapIcon className="h-3.5 w-3.5" /> },
            { key: 'replay', label: 'Replay', icon: <Play className="h-3.5 w-3.5" />, disabled: trail.length < 2 },
            { key: 'events', label: 'Events', icon: <AlertTriangle className="h-3.5 w-3.5" />, badge: events.length > 0 ? events.length : 0 },
          ] as const).map(({ key, label, icon, disabled, badge }: any) => (
            <button
              key={key}
              onClick={() => !disabled && setActiveTab(key)}
              disabled={disabled}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium kd-transition',
                activeTab === key
                  ? 'bg-primary/10 text-primary border-b-2 border-primary rounded-b-none'
                  : 'text-muted-foreground hover:bg-muted',
                disabled && 'opacity-40 cursor-not-allowed',
              )}
            >
              {icon}
              {label}
              {badge > 0 && (
                <span className="bg-destructive text-destructive-foreground text-[10px] rounded-full px-1.5 leading-none kd-status-live-danger">
                  {badge}
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
                <div className="rounded-xl overflow-hidden border border-border/60 shadow-sm" style={{ height: 440 }}>
                  <TripGoogleMap trail={trail} startPos={startPos} endPos={endPos} events={mapEvents} />
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
          ) : activeTab === 'replay' ? (
            <>
              <div className="rounded-xl overflow-hidden border border-border/60 shadow-sm" style={{ height: 400 }}>
                <TripGoogleMap trail={trail} startPos={startPos} endPos={endPos} events={mapEvents} replayStep={replayStep} />
              </div>
              {/* Replay controls */}
              <div className="mt-3 flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => { setReplayStep(0); setReplayPlaying(false); }}>
                    <RotateCcw className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" onClick={() => setReplayPlaying((p) => !p)}>
                    {replayPlaying ? <Pause className="h-3.5 w-3.5 mr-1" /> : <Play className="h-3.5 w-3.5 mr-1" />}
                    {replayPlaying ? 'Pause' : 'Play'}
                  </Button>
                  <div className="flex items-center gap-1.5 ml-2 text-xs text-muted-foreground">
                    Speed:
                    {[1, 2, 4, 8].map((s) => (
                      <button key={s} onClick={() => setReplaySpeed(s)}
                        className={cn('px-2 py-0.5 rounded border text-xs', replaySpeed === s ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted')}>
                        {s}×
                      </button>
                    ))}
                  </div>
                  <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                    {replayStep + 1} / {totalSteps}
                    {breadcrumbs[replayStep]?.recorded_at && (
                      <> · {formatTime(breadcrumbs[replayStep].recorded_at)}</>
                    )}
                    {breadcrumbs[replayStep]?.speed_kmh != null && (
                      <> · {Math.round(breadcrumbs[replayStep].speed_kmh!)} km/h</>
                    )}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={Math.max(0, totalSteps - 1)}
                  value={replayStep}
                  onChange={(e) => { setReplayPlaying(false); setReplayStep(Number(e.target.value)); }}
                  className="w-full accent-primary"
                />
              </div>
              <div className="flex items-center gap-4 pt-1 text-xs text-muted-foreground flex-wrap">
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-success inline-block shrink-0 kd-status-live-success" /> Start</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-destructive inline-block shrink-0" /> End</span>
                <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-full" style={{ background: '#f59e0b' }} /> Current position</span>
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
                      {formatTime(ev.recorded_at)}
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

export default TripMapModal;
