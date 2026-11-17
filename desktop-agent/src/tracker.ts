import type { SupabaseClient } from '@supabase/supabase-js';
import { app, desktopCapturer, nativeImage, powerMonitor, screen } from 'electron';
import { randomUUID } from 'crypto';
import { queueInsert, writeOrQueue } from './offlineQueue';
import { matchProductivityRule } from './productivityRules';

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
  /** 'pause' = pause and notify at the idle limit; 'track' = keep tracking and mark idle time as idle */
  idle_mode?: 'pause' | 'track';
  /** Admin policy: when true, nothing is recorded unless a task timer is running. */
  track_only_when_timer_running: boolean;
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

// track_only_when_timer_running defaults to TRUE: before the policy has been read (or
// when offline with nothing cached) the safe behaviour is to record nothing.
const DEFAULT_IDLE_POLICY: IdlePolicy = { away_time_after_minutes: 5, stop_tracking_when_unused_minutes: 5, track_only_when_timer_running: true };
// ipapi.co's free tier allows 1,000 lookups/day/IP with no key. A real IP
// rarely moves within a workday, so looking it up every 5 minutes (not every
// tick) is both honest-enough freshness and comfortably inside that limit
// even for a short capture_interval_minutes.
const GEO_LOOKUP_INTERVAL_MS = 5 * 60_000;

let intervalHandle: ReturnType<typeof setInterval> | null = null;
let runningKey = '';
let activeSettings: AgentSettings = { is_enabled: true, capture_interval_minutes: 10, screenshots_enabled: false, blur_screenshots: true };
let rules: ProductivityRule[] = [];
let rulesLoadedAt = 0;
let idlePolicy: IdlePolicy = DEFAULT_IDLE_POLICY;

// ---- Activity level ----------------------------------------------------------------------------
// Counts how busy the person is without any key hook: once a second we read how long the system
// has been idle. If that number dropped since the last look, there was input in between. If the
// pointer also moved it was mouse activity, otherwise it was typing / a click / a shortcut.
// Only totals are kept (never which key or where), reset after each capture.
let sampler: ReturnType<typeof setInterval> | null = null;
let lastIdleSec = 0;
let lastPointer = { x: 0, y: 0 };
let sample = { activeSeconds: 0, mouseEvents: 0, inputEvents: 0, since: Date.now() };

function startActivitySampler() {
  if (sampler) return;
  lastIdleSec = powerMonitor.getSystemIdleTime();
  lastPointer = screen.getCursorScreenPoint();
  sample = { activeSeconds: 0, mouseEvents: 0, inputEvents: 0, since: Date.now() };
  sampler = setInterval(() => {
    const idle = powerMonitor.getSystemIdleTime();
    const p = screen.getCursorScreenPoint();
    if (!timerRunning()) {
      // nothing is being tracked: keep the window fresh so the first capture after a start is not skewed
      sample = { activeSeconds: 0, mouseEvents: 0, inputEvents: 0, since: Date.now() };
      lastIdleSec = idle;
      lastPointer = p;
      return;
    }
    if (idle < 2) sample.activeSeconds += 1; // input within the last couple of seconds
    if (idle < lastIdleSec) {
      if (p.x !== lastPointer.x || p.y !== lastPointer.y) sample.mouseEvents += 1;
      else sample.inputEvents += 1;
    }
    lastIdleSec = idle;
    lastPointer = p;
  }, 1000);
}

function takeActivitySample() {
  const windowSeconds = Math.max(1, Math.round((Date.now() - sample.since) / 1000));
  const out = {
    active_seconds: Math.min(sample.activeSeconds, windowSeconds),
    window_seconds: windowSeconds,
    mouse_events: sample.mouseEvents,
    input_events: sample.inputEvents,
  };
  sample = { activeSeconds: 0, mouseEvents: 0, inputEvents: 0, since: Date.now() };
  return out;
}
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

function classify(appName: string, title: string, url: string | null): string | null {
  const now = Date.now();
  if (now - rulesLoadedAt > 60_000) return null; // stale cache, classify next tick once refreshed
  // site rule > title rule > app rule (see productivityRules.ts); no rule = neutral
  return matchProductivityRule(rules, appName, title, url) ?? 'neutral';
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
// "Track time in specific hours" (Agent & policy): one from/to window per weekday, 0 = Monday.
// Outside the window nothing is captured. No rows loaded yet = no restriction.
interface HoursRow { weekday: number; from_time: string; to_time: string }
let trackingHours: HoursRow[] = [];

export function getIdleMode(): 'pause' | 'track' {
  return (idlePolicyLoadedAt > 0 ? idlePolicy : DEFAULT_IDLE_POLICY).idle_mode ?? 'pause';
}

export function getAwayAfterMinutes(): number {
  return (idlePolicyLoadedAt > 0 ? idlePolicy : DEFAULT_IDLE_POLICY).away_time_after_minutes;
}

export function isWithinTrackingHours(now = new Date()): boolean {
  if (trackingHours.length === 0) return true;
  const row = trackingHours.find((r) => r.weekday === (now.getDay() + 6) % 7);
  if (!row) return true;
  const hhmmss = [now.getHours(), now.getMinutes(), now.getSeconds()].map((n) => String(n).padStart(2, '0')).join(':');
  return hhmmss >= row.from_time.slice(0, 8) && hhmmss <= row.to_time.slice(0, 8);
}

async function refreshIdlePolicy(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from('time_agent_policy')
    .select('away_time_after_minutes, stop_tracking_when_unused_minutes, track_only_when_timer_running, idle_mode')
    .eq('id', true)
    .maybeSingle();
  if (!error && data) {
    idlePolicy = data as IdlePolicy;
    idlePolicyLoadedAt = Date.now();
  }
  const hours = await supabase.from('time_agent_tracking_hours').select('weekday, from_time, to_time');
  if (!hours.error && hours.data) trackingHours = hours.data as HoursRow[];
}

// Every connected monitor goes into ONE wide image, left to right in their
// real desktop order (like TimeCamp). Each screen is captured at up to
// PER_SCREEN_WIDTH px so text stays readable and the viewer can zoom in; the
// result is JPEG (a 3-screen PNG would be several MB per capture).
const PER_SCREEN_WIDTH = 1600;
const JPEG_QUALITY = 78;

async function captureAllScreens(blur: boolean): Promise<Buffer | null> {
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: PER_SCREEN_WIDTH, height: PER_SCREEN_WIDTH },
  });
  if (sources.length === 0) return null;

  // Put the screens in left-to-right desktop order using the display bounds.
  const displays = screen.getAllDisplays();
  const xOf = (displayId: string, fallback: number) => {
    const d = displays.find((x) => String(x.id) === displayId);
    return d ? d.bounds.x : fallback;
  };
  const ordered = sources
    .map((src, i) => ({ src, x: xOf(src.display_id, i * 100000) }))
    .sort((a, b) => a.x - b.x)
    .map((o) => o.src.thumbnail)
    .filter((img) => !img.isEmpty());
  if (ordered.length === 0) return null;

  const sizes = ordered.map((img) => img.getSize());
  const totalW = sizes.reduce((sum, sz) => sum + sz.width, 0);
  const maxH = Math.max(...sizes.map((sz) => sz.height));

  // Compose raw BGRA bitmaps side by side (no native image library needed).
  const out = Buffer.alloc(totalW * maxH * 4);
  for (let i = 3; i < out.length; i += 4) out[i] = 255; // opaque black background
  let xOffset = 0;
  ordered.forEach((img, idx) => {
    const { width, height } = sizes[idx];
    const bmp = img.toBitmap();
    for (let row = 0; row < height; row++) {
      const srcStart = row * width * 4;
      const dstStart = (row * totalW + xOffset) * 4;
      bmp.copy(out, dstStart, srcStart, srcStart + width * 4);
    }
    xOffset += width;
  });

  let image = nativeImage.createFromBitmap(out, { width: totalW, height: maxH });
  if (blur) {
    // Optional privacy blur: downscale hard, scale back up.
    image = image.resize({ width: 96 }).resize({ width: totalW, height: maxH });
  }
  return image.toJPEG(JPEG_QUALITY);
}

async function captureAndUploadScreenshot(supabase: SupabaseClient, employeeId: string, activityLogId: string, blur: boolean) {
  try {
    const buffer = await captureAllScreens(blur);
    if (!buffer) return;
    const path = `${employeeId}/${Date.now()}.jpg`;
    const { error: uploadError } = await supabase.storage.from('timetrack-screenshots').upload(path, buffer, {
      contentType: 'image/jpeg',
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

/** Reduces a URL (or a bare "host/path" as Chrome shows it) to "https://host/". */
function toOrigin(raw: string | null): string | null {
  if (!raw) return null;
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const u = new URL(candidate);
    if (!u.hostname || !u.hostname.includes('.')) return null; // newtab, localhost, search text...
    return `${u.protocol}//${u.hostname}/`;
  } catch {
    return null;
  }
}

const BROWSER_RE = /chrome|msedge|edge|brave|opera|vivaldi|firefox|arc/i;

// UI Automation script: finds the foreground browser window's address bar and
// prints its value. Passed as -EncodedCommand so no script file has to exist
// inside the packaged (asar) app.
const UIA_SCRIPT = `
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type @"
using System; using System.Runtime.InteropServices;
public class Fg { [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow(); }
"@
$h = [Fg]::GetForegroundWindow()
$root = [System.Windows.Automation.AutomationElement]::FromHandle($h)
$cond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::Edit)
# Chromium browsers build their accessibility tree on demand, so the first look often finds nothing: look up to 4 times.
for ($try = 0; $try -lt 4; $try++) {
  foreach ($e in $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, $cond)) {
    if ($e.Current.Name -match 'Address|address bar|search or enter|search or type|URL') {
      $vp = $e.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
      $v = $vp.Current.Value
      if ($v) { Write-Output $v; exit }
    }
  }
  Start-Sleep -Milliseconds 450
}`;
const UIA_ENCODED = Buffer.from(UIA_SCRIPT, 'utf16le').toString('base64');

/** Windows only. Returns the browser tab's origin (e.g. "https://github.com/") or
 * null (not a browser, address bar not found, or PowerShell blocked/slow). */
let lastBrowserSite: { title: string; url: string; at: number } | null = null;

async function readWindowsBrowserHost(appName: string, title = ''): Promise<string | null> {
  if (!BROWSER_RE.test(appName)) return null;
  const url = await readAddressBar();
  if (url) {
    lastBrowserSite = { title, url, at: Date.now() };
    return url;
  }
  // The address bar could not be read this time. If the page (window title) has not changed since the last
  // successful read, it is still the same site.
  if (lastBrowserSite && title && lastBrowserSite.title === title && Date.now() - lastBrowserSite.at < 15 * 60_000) return lastBrowserSite.url;
  return null;
}

async function readAddressBar(): Promise<string | null> {
  try {
    const { execFile } = require('child_process') as typeof import('child_process');
    const out = await new Promise<string>((resolve) => {
      execFile(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', UIA_ENCODED],
        { timeout: 12000, windowsHide: true },
        (err, stdout) => resolve(err ? '' : String(stdout)),
      );
    });
    return toOrigin(out.trim().split(/\r?\n/)[0] ?? null);
  } catch {
    return null;
  }
}

/** Admin policy: stop the timer after the computer has been unused for this many minutes. */
export function getStopWhenUnusedMinutes(): number {
  return (idlePolicyLoadedAt > 0 ? idlePolicy : DEFAULT_IDLE_POLICY).stop_tracking_when_unused_minutes;
}

// main.ts tells the tracker whether a task timer is running right now.
let timerRunning: () => boolean = () => false;
export function setTimerRunningProvider(fn: () => boolean) {
  timerRunning = fn;
}

// Set by startTracking so a task start can trigger a capture straight away instead of
// waiting up to a full interval for the next scheduled one.
// ---- App icons ---------------------------------------------------------------------------------
// The first time an app is seen, read its real icon from the program file and save it (small PNG) so
// the reports can show the actual logo. Once per app name per run; the server ignores repeats.
const iconSeen = new Set<string>();
async function ensureAppIcon(supabase: SupabaseClient, appName: string, exePath: string | undefined) {
  if (!exePath || iconSeen.has(appName)) return;
  iconSeen.add(appName);
  try {
    const img = await app.getFileIcon(exePath, { size: 'large' });
    if (img.isEmpty()) return;
    const png = img.resize({ width: 64, height: 64, quality: 'best' }).toPNG();
    const icon = 'data:image/png;base64,' + png.toString('base64');
    if (icon.length >= 60000) return;
    await supabase.from('time_app_icons').upsert({ app_name: appName, icon }, { onConflict: 'app_name', ignoreDuplicates: true });
  } catch {
    // purely cosmetic: never let an icon problem affect tracking
  }
}

let captureTick: (() => Promise<void>) | null = null;
export function captureNow() {
  if (captureTick) void captureTick();
}

export function stopTracking() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}

export function startTracking(supabase: SupabaseClient, employeeId: string, newSettings: AgentSettings) {
  // main.ts re-reads settings every 60s and calls this each time. Restarting
  // on every call reset the timer and fired an immediate capture, so a 10-minute
  // capture_interval_minutes really captured about once a MINUTE. Only
  // (re)start when the schedule actually changed; otherwise just pick up the
  // latest screenshot/blur flags for the next tick.
  const key = `${employeeId}:${newSettings.capture_interval_minutes}`;
  if (intervalHandle && key === runningKey && newSettings.is_enabled) {
    activeSettings = newSettings;
    return;
  }
  stopTracking();
  if (!newSettings.is_enabled) return;
  runningKey = key;
  activeSettings = newSettings;

  startActivitySampler();
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
      // In 'pause' mode idle time past the limit is not tracked at all. In 'track' mode it keeps being
      // recorded (marked idle below) so it shows in the tracker and the summaries.
      if ((policy.idle_mode ?? 'pause') === 'pause' && idleSeconds >= policy.stop_tracking_when_unused_minutes * 60) return;
      const isAway = idleSeconds >= policy.away_time_after_minutes * 60;

      // Pick up admin policy / tracking-hours changes without needing a restart.
      if (Date.now() - idlePolicyLoadedAt > 5 * 60_000) void refreshIdlePolicy(supabase);
      // Outside the admin's tracking hours nothing is captured.
      if (!isWithinTrackingHours()) return;

      // Hubstaff / TimeCamp model: with the policy on, capture nothing (no activity row,
      // no screenshot, no site or app) unless a task timer is running right now.
      if (policy.track_only_when_timer_running && !timerRunning()) return;

      // Lazily required: active-win ships native bindings per OS; requiring
      // it at module load time would break `tsc` on an unsupported platform
      // during development. Requiring it here keeps that failure contained
      // to the tick itself.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const activeWindow = await (require('active-win') as typeof import('active-win'))();
      if (!activeWindow) return;
      // Never record this app's own windows (the widget, the task picker): clicking them is not work, and they
      // used to show up as "Electron" and drag productivity down.
      if (activeWindow.owner?.processId === process.pid || activeWindow.owner?.path === process.execPath) return;

      const appName = activeWindow.owner?.name ?? 'unknown';
      void ensureAppIcon(supabase, appName, activeWindow.owner?.path);
      const title = activeWindow.title ?? '';
      // macOS: active-win reads the tab URL itself. Windows: active-win can't,
      // so readWindowsBrowserHost() asks Windows UI Automation for the browser's
      // address bar (no extension needed, same outcome TimeCamp shows).
      // Linux: still null. Only the site's origin is ever stored, never paths or
      // query strings, which can carry tokens or private ids.
      let url: string | null = null;
      if (activeWindow.platform === 'macos') url = toOrigin(activeWindow.url ?? null);
      else if (activeWindow.platform === 'windows') url = await readWindowsBrowserHost(appName, title);
      const category = isAway ? 'idle' : classify(appName, title, url);

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

      // Generated client-side so a tick still has a stable id to hand to the
      // screenshot step (and so the row can be queued for later retry) even if
      // the network is down right now — this is the fix for "if network goes,
      // does tracking still save": a dropped connection no longer means a
      // dropped tick, it means a queued one.
      const logId = randomUUID();
      const payload = {
        id: logId,
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
        ...takeActivitySample(),
      };

      let wentOffline = false;
      await writeOrQueue(
        () => supabase.from('time_activity_logs').insert(payload),
        () => {
          wentOffline = true;
          queueInsert('time_activity_logs', payload);
        },
      );

      // Screenshots are tied to a specific already-stored row (storage_path
      // references activity_log_id via FK), so they can't be queued the same
      // way — skip the screenshot for this tick if we're offline rather than
      // uploading against a row the server doesn't have yet. The activity log
      // itself is never skipped.
      if (activeSettings.screenshots_enabled && !wentOffline && !isAway) {
        await captureAndUploadScreenshot(supabase, employeeId, logId, activeSettings.blur_screenshots);
      }
    } catch (err) {
      console.error('[tracker] tick failed:', err);
    }
  };

  captureTick = tick;
  intervalHandle = setInterval(tick, newSettings.capture_interval_minutes * 60_000);
  tick(); // capture immediately on start, don't wait a full interval
}
