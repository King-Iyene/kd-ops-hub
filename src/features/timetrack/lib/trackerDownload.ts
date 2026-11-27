import { FILES } from '@/features/office/desktopApp';

/**
 * The KD Ops Time Tracker installers, served from our own project's public storage (the "desktop-app" bucket), never from GitHub:
 * the repository is private, so a GitHub link would send people to a GitHub login or error page. The "Mirror Time Tracker installers"
 * workflow keeps the files there. If a file is not there yet, the person is told so in the app and nothing opens.
 */
export type TrackerOs = 'windows' | 'mac' | 'linux';

const STORED: Record<TrackerOs, { file: string; ext: string; label: string }> = {
  windows: { file: 'KD-Time-Tracker-Setup.exe', ext: 'exe', label: 'Windows (.exe)' },
  mac: { file: 'KD-Time-Tracker.dmg', ext: 'dmg', label: 'Mac, Apple chip (.dmg)' },
  linux: { file: 'KD-Time-Tracker.AppImage', ext: 'AppImage', label: 'Linux (.AppImage)' },
};

export const TRACKER_OSES: { os: TrackerOs; label: string }[] = (Object.keys(STORED) as TrackerOs[]).map((os) => ({ os, label: STORED[os].label }));

/** The address of the installer for a system; "?download=" makes the browser save it under a proper name instead of leaving the page. */
export function trackerUrl(os: TrackerOs, version: string | null): string {
  const f = STORED[os];
  const saveAs = `KD-Ops-Time-Tracker${version ? `-${version}` : ''}.${f.ext}`;
  return `${FILES()}/${f.file}?download=${encodeURIComponent(saveAs)}`;
}

/** Which version is on the storage (null when there is none yet). */
export async function fetchTrackerVersion(): Promise<string | null> {
  try {
    const r = await fetch(`${FILES()}/tracker-version.json`, { cache: 'no-store' });
    if (!r.ok) return null;
    const j = (await r.json()) as { version?: unknown };
    return typeof j.version === 'string' && /^[0-9][0-9A-Za-z.-]*$/.test(j.version) ? j.version : null;
  } catch {
    return null;
  }
}

/** The system this computer runs, or null on a phone or tablet (the tracker is for computers). */
export function trackerOsFor(platform: string = typeof navigator === 'undefined' ? '' : `${navigator.userAgent} ${navigator.platform}`): TrackerOs | null {
  const p = platform.toLowerCase();
  if (/android|iphone|ipad|ipod/.test(p)) return null;
  if (/win/.test(p) && !/darwin/.test(p)) return 'windows';
  if (/mac/.test(p)) return 'mac';
  if (/linux|x11/.test(p)) return 'linux';
  return null;
}

/** Start the download without leaving the page. 'not-ready' when the installer is not on our storage yet. */
export async function startTrackerDownload(os: TrackerOs, version: string | null): Promise<'started' | 'not-ready'> {
  const url = trackerUrl(os, version);
  try {
    const r = await fetch(url, { method: 'HEAD' });
    if (!r.ok) return 'not-ready';
  } catch {
    return 'not-ready';
  }
  const a = document.createElement('a');
  a.href = url;
  a.download = '';
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  return 'started';
}
