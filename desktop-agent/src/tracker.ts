import type { SupabaseClient } from '@supabase/supabase-js';
import { desktopCapturer, nativeImage, powerMonitor } from 'electron';

interface AgentSettings {
  is_enabled: boolean;
  capture_interval_minutes: number;
  screenshots_enabled: boolean;
  blur_screenshots: boolean;
}

interface ProductivityRule {
  app_name_contains: string | null;
  title_contains: string | null;
  category: 'productive' | 'neutral' | 'unproductive' | 'blocked';
  priority: number;
}

interface IdlePolicy {
  away_time_after_minutes: number;
  stop_tracking_when_unused_minutes: number;
}

interface OfficeLocation {
  lat: number;
  lon: number;
  radius_meters: number;
}

interface GeoLookup {
  ip: string | null;
  lat: number | null;
  lon: number | null;
  city: string | null;
  region: string | null;
  country: string | null;
}

const DEFAULT_IDLE_POLICY: IdlePolicy = { away_time_after_minutes: 5, stop_tracking_when_unused_minutes: 5 };
// ipapi.co's free tier allows 1,000 lookups/day/IP with no key. A real IP
// rarely moves within a workday, so looking it up every 5 minutes (not every
// tick) is both honest-enough freshness and comfortably inside that limit
// even for a short capture_interval_minutes.
const GEO_LOOKUP_INTERVAL_MS = 5 * 60_000;

let intervalHandle: ReturnType<typeof setInterval> | null = null;
let rules: ProductivityRule[] = [];
let rulesLoadedAt = 0;
let idlePolicy: IdlePolicy = DEFAULT_IDLE_POLICY;
let idlePolicyLoadedAt = 0;
let officeLocations: OfficeLocation[] = [];
let officeLocationsLoadedAt = 0;
let lastGeoLookup: GeoLookup | null = null;
let lastGeoLookupAt = 0;

// Haversine distance in meters between two lat/lon points.
function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function refreshOfficeLocations(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from('time_office_locations')
    .select('lat, lon, radius_meters')
    .eq('is_active', true);
  if (!error && data) {
    officeLocations = data as OfficeLocation[];
    officeLocationsLoadedAt = Date.now();
  }
}

// Best-effort IP geolocation — city-level approximation, NOT device GPS
// (desktops have no GPS hardware). A network error, rate limit, or offline
// agent just means this tick's row carries no geo data; it never blocks or
// fails the tick itself.
async function lookupIpGeolocation(): Promise<GeoLookup | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5_000);
    const res = await fetch('https://ipapi.co/json/', { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const json = (await res.json()) as {
      ip?: string; latitude?: number; longitude?: number; city?: string; region?: string; country_name?: string; error?: boolean;
    };
    if (json.error || typeof json.latitude !== 'number' || typeof json.longitude !== 'number') return null;
    return {
      ip: json.ip ?? null,
      lat: json.latitude,
      lon: json.longitude,
      city: json.city ?? null,
      region: json.region ?? null,
      country: json.country_name ?? null,
    };
  } catch {
    return null;
  }
}

function classify(appName: string, title: string): string | null {
  const now = Date.now();
  if (now - rulesLoadedAt > 60_000) return null; // stale cache, classify next tick once refreshed
  for (const r of rules) {
    const appMatch = r.app_name_contains && appName.toLowerCase().includes(r.app_name_contains.toLowerCase());
    const titleMatch = r.title_contains && title.toLowerCase().includes(r.title_contains.toLowerCase());
    if (appMatch || titleMatch) return r.category;
  }
  return 'neutral';
}

async function refreshRules(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from('time_productivity_rules')
    .select('app_name_contains, title_contains, category, priority')
    .order('priority', { ascending: true });
  if (!error && data) {
    rules = data as ProductivityRule[];
    rulesLoadedAt = Date.now();
  }
}

// Company-wide idle policy (time_agent_policy) is a singleton row admins edit
// on the Agent & Policy page. Re-fetched periodically like the rules cache,
// never blocking a tick — a stale/default policy is a safe fallback.
async function refreshIdlePolicy(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from('time_agent_policy')
    .select('away_time_after_minutes, stop_tracking_when_unused_minutes')
    .eq('id', true)
    .maybeSingle();
  if (!error && data) {
    idlePolicy = data as IdlePolicy;
    idlePolicyLoadedAt = Date.now();
  }
}

async function captureAndUploadScreenshot(supabase: SupabaseClient, employeeId: string, activityLogId: string, blur: boolean) {
  try {
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1280, height: 800 } });
    if (sources.length === 0) return;
    let image: Electron.NativeImage = sources[0].thumbnail;
    if (blur) {
      // Cheap, dependency-free "blur": downscale hard then scale back up.
      // Good enough to obscure readable text while still showing layout/activity.
      const small = image.resize({ width: 64 });
      image = small.resize({ width: 1280, height: 800 });
    }
    const buffer = image.toPNG();
    const path = `${employeeId}/${Date.now()}.png`;
    const { error: uploadError } = await supabase.storage.from('timetrack-screenshots').upload(path, buffer, {
      contentType: 'image/png',
    });
    if (uploadError) {
      console.error('[tracker] screenshot upload failed:', uploadError.message);
      return;
    }
    await supabase.from('time_screenshots').insert({ employee_id: employeeId, activity_log_id: activityLogId, storage_path: path });
  } catch (err) {
    console.error('[tracker] screenshot capture failed:', err);
  }
}

export function stopTracking() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}

export function startTracking(supabase: SupabaseClient, employeeId: string, settings: AgentSettings) {
  stopTracking();
  if (!settings.is_enabled) return;

  refreshRules(supabase);
  refreshIdlePolicy(supabase);
  refreshOfficeLocations(supabase);

  const tick = async () => {
    try {
      // System idle time (seconds since last keyboard/mouse input), checked
      // before touching active-win at all — cheap, cross-platform, and the
      // whole point of "away time": past stop_tracking_when_unused_minutes
      // the agent logs nothing (tracking is effectively paused, same as
      // TimeCamp's own behavior), and past the shorter
      // away_time_after_minutes it logs the tick but tags it 'idle' instead
      // of running it through the productivity rules, so idle time shows up
      // as its own honest category rather than silently vanishing or being
      // misclassified against whatever app happened to be focused.
      const idleSeconds = powerMonitor.getSystemIdleTime();
      const policy = idlePolicyLoadedAt > 0 ? idlePolicy : DEFAULT_IDLE_POLICY;
      if (idleSeconds >= policy.stop_tracking_when_unused_minutes * 60) return;
      const isAway = idleSeconds >= policy.away_time_after_minutes * 60;

      // Lazily required: active-win ships native bindings per OS; requiring
      // it at module load time would break `tsc` on an unsupported platform
      // during development. Requiring it here keeps that failure contained
      // to the tick itself.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const activeWindow = await (require('active-win') as typeof import('active-win'))();
      if (!activeWindow) return;

      const appName = activeWindow.owner?.name ?? 'unknown';
      const title = activeWindow.title ?? '';
      // Only populated on macOS (Chromium/Safari-family browsers) — active-win
      // has no OS-level way to get a browser's active tab URL on Windows or
      // Linux at all. Left null there; true cross-platform per-tab URL
      // capture needs a browser extension, which TimeCamp itself also
      // requires and which is out of scope for the native agent.
      const url = activeWindow.platform === 'macos' ? activeWindow.url ?? null : null;
      const category = isAway ? 'idle' : classify(appName, title);

      if (Date.now() - lastGeoLookupAt > GEO_LOOKUP_INTERVAL_MS) {
        lastGeoLookup = await lookupIpGeolocation();
        lastGeoLookupAt = Date.now();
      }
      let isOutsideGeofence: boolean | null = null;
      if (lastGeoLookup?.lat != null && lastGeoLookup?.lon != null && officeLocationsLoadedAt > 0 && officeLocations.length > 0) {
        isOutsideGeofence = !officeLocations.some(
          (o) => distanceMeters(lastGeoLookup!.lat!, lastGeoLookup!.lon!, o.lat, o.lon) <= o.radius_meters,
        );
      }

      const { data: inserted, error } = await supabase
        .from('time_activity_logs')
        .insert({
          employee_id: employeeId,
          window_title: title,
          app_name: appName,
          url,
          productivity_category: category,
          ip_address: lastGeoLookup?.ip ?? null,
          geo_lat: lastGeoLookup?.lat ?? null,
          geo_lon: lastGeoLookup?.lon ?? null,
          geo_city: lastGeoLookup?.city ?? null,
          geo_region: lastGeoLookup?.region ?? null,
          geo_country: lastGeoLookup?.country ?? null,
          is_outside_geofence: isOutsideGeofence,
        })
        .select('id')
        .single();

      if (error) {
        console.error('[tracker] activity log insert failed:', error.message);
        return;
      }

      if (settings.screenshots_enabled && inserted && !isAway) {
        await captureAndUploadScreenshot(supabase, employeeId, inserted.id, settings.blur_screenshots);
      }
    } catch (err) {
      console.error('[tracker] tick failed:', err);
    }
  };

  intervalHandle = setInterval(tick, settings.capture_interval_minutes * 60_000);
  tick(); // capture immediately on start, don't wait a full interval
}
