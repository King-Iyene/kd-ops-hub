import type { SupabaseClient } from '@supabase/supabase-js';
import { desktopCapturer, nativeImage } from 'electron';

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

let intervalHandle: ReturnType<typeof setInterval> | null = null;
let rules: ProductivityRule[] = [];
let rulesLoadedAt = 0;

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

  const tick = async () => {
    try {
      // Lazily required: active-win ships native bindings per OS; requiring
      // it at module load time would break `tsc` on an unsupported platform
      // during development. Requiring it here keeps that failure contained
      // to the tick itself.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const activeWindow = await (require('active-win') as typeof import('active-win'))();
      if (!activeWindow) return;

      const appName = activeWindow.owner?.name ?? 'unknown';
      const title = activeWindow.title ?? '';
      const category = classify(appName, title);

      const { data: inserted, error } = await supabase
        .from('time_activity_logs')
        .insert({ employee_id: employeeId, window_title: title, app_name: appName, productivity_category: category })
        .select('id')
        .single();

      if (error) {
        console.error('[tracker] activity log insert failed:', error.message);
        return;
      }

      if (settings.screenshots_enabled && inserted) {
        await captureAndUploadScreenshot(supabase, employeeId, inserted.id, settings.blur_screenshots);
      }
    } catch (err) {
      console.error('[tracker] tick failed:', err);
    }
  };

  intervalHandle = setInterval(tick, settings.capture_interval_minutes * 60_000);
  tick(); // capture immediately on start, don't wait a full interval
}
