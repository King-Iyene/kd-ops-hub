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
  category: 'productive' | 'neutral' | 'unproductive';
  priority: number;
}

interface IdlePolicy {
  away_time_after_minutes: number;
  stop_tracking_when_unused_minutes: number;
}

const DEFAULT_IDLE_POLICY: IdlePolicy = { away_time_after_minutes: 5, stop_tracking_when_unused_minutes: 5 };

let intervalHandle: ReturnType<typeof setInterval> | null = null;
let rules: ProductivityRule[] = [];
let rulesLoadedAt = 0;
let idlePolicy: IdlePolicy = DEFAULT_IDLE_POLICY;
let idlePolicyLoadedAt = 0;

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

      const { data: inserted, error } = await supabase
        .from('time_activity_logs')
        .insert({ employee_id: employeeId, window_title: title, app_name: appName, url, productivity_category: category })
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
