/** Where to get the KD Ops desktop app (the ops site and the Office in one window), and whether we are already inside it. The newest version is whatever the update feed says; nothing here needs changing for a new version. */

/** Inside the KD Ops desktop app: which tab this page is in ('ops' or 'office'); null in a browser or the old Office-only app. */
export function desktopTab(): 'ops' | 'office' | null {
  const t = typeof window === 'undefined' ? undefined : (window as unknown as { kdDesktop?: { tab?: unknown } }).kdDesktop?.tab;
  return t === 'ops' || t === 'office' ? t : null;
}

export function inDesktopApp(): boolean {
  return typeof window !== 'undefined' && !!(window as unknown as { kdDesktop?: unknown }).kdDesktop;
}

/**
 * Where the installers are served from: our own project's public storage (the repository is private, so a GitHub link only
 * works for people with a GitHub login to it). The "Mirror desktop installers" workflow keeps the files there.
 */
/** The public folder the installers are served from (our own project's storage). */
export const FILES = () => `${(import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? ''}/storage/v1/object/public/desktop-app`;

/** A short name for this computer's system ("Windows", "Mac", "Linux"), or "computer" when it is not known. */
export function desktopLabel(platform?: string): string {
  const os = feedOsFor(platform);
  return os === 'windows' ? 'Windows' : os === 'mac' ? 'Mac' : os === 'linux' ? 'Linux' : 'computer';
}

/**
 * The update feed: ONE place per app (our own public storage, never GitHub) that holds the newest build. The installed apps read it to
 * update themselves, and the Download buttons read the same small file to learn which installer is the newest, so what people download
 * and what the apps update to can never disagree. "latest*.yml" is written by the build tool and lists the files of the newest version.
 */
export type FeedApp = 'office' | 'tracker';
export type FeedOs = 'windows' | 'mac' | 'linux';
export const feedUrl = (app: FeedApp) => `${FILES()}/updates/${app}`;
const FEED_YML: Record<FeedOs, string> = { windows: 'latest.yml', mac: 'latest-mac.yml', linux: 'latest-linux.yml' };
const FEED_EXT: Record<FeedOs, RegExp> = { windows: /\.exe$/i, mac: /\.dmg$/i, linux: /\.AppImage$/i };

/** What a feed file says: the version, and the file names it lists (the quotes and "- " the tool writes are ignored). */
export function readFeed(yml: string): { version: string | null; files: string[] } {
  const v = /^version:\s*['"]?([0-9][0-9A-Za-z.+-]*)['"]?\s*$/m.exec(yml);
  const files = [...yml.matchAll(/^\s*(?:-\s+)?(?:url|path):\s*['"]?([^'"\s]+)['"]?\s*$/gm)].map((m) => m[1]);
  return { version: v ? v[1] : null, files: [...new Set(files)] };
}

/** The newest installer for a system, as the feed names it: its address, the name to save it under and its version; null when the feed has nothing. */
export async function feedDownload(app: FeedApp, os: FeedOs): Promise<{ url: string; file: string; version: string | null } | null> {
  try {
    const r = await fetch(`${feedUrl(app)}/${FEED_YML[os]}`, { cache: 'no-store' });
    if (!r.ok) return null;
    const feed = readFeed(await r.text());
    const file = feed.files.find((f) => FEED_EXT[os].test(f) && !/[\\/]/.test(f));
    if (!file) return null;
    return { url: `${feedUrl(app)}/${encodeURIComponent(file)}?download=${encodeURIComponent(file)}`, file, version: feed.version };
  } catch {
    return null;
  }
}

/** The system this computer runs (null on a phone, a tablet or something unknown). */
export function feedOsFor(platform: string = typeof navigator === 'undefined' ? '' : `${navigator.userAgent} ${navigator.platform}`): FeedOs | null {
  const p = platform.toLowerCase();
  if (/android|iphone|ipad|ipod/.test(p)) return null;
  if (/win/.test(p) && !/darwin/.test(p)) return 'windows';
  if (/mac/.test(p)) return 'mac';
  if (/linux|x11/.test(p)) return 'linux';
  return null;
}

/** Save a file from this address without leaving the page. */
export function saveFromUrl(url: string, file: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.download = file;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/**
 * Start the download for this computer without leaving the page. Says what happened so the caller can tell the person:
 * 'started', 'phone' (the app is for computers), or 'not-ready' (the feed has no installer yet).
 */
export async function startDesktopDownload(platform?: string): Promise<'started' | 'phone' | 'not-ready'> {
  const os = feedOsFor(platform);
  if (!os) return 'phone';
  const d = await feedDownload('office', os);
  if (!d) return 'not-ready';
  saveFromUrl(d.url, d.file);
  return 'started';
}

type DesktopBridge = {
  onUpdate?: (cb: (version: string | null) => void) => (() => void) | void;
  installUpdate?: () => void;
};
const bridge = (): DesktopBridge | undefined =>
  typeof window === 'undefined' ? undefined : (window as unknown as { kdDesktop?: DesktopBridge }).kdDesktop;

/** Inside the desktop app (0.3.7 and newer): hears when a newer version of the app itself has been downloaded and is ready to install (null when there is none). Returns a way to stop listening. */
export function onDesktopUpdate(cb: (version: string | null) => void): () => void {
  const b = bridge();
  if (!b?.onUpdate) return () => undefined;
  const off = b.onUpdate((v) => cb(typeof v === 'string' && v ? v : null));
  return typeof off === 'function' ? off : () => undefined;
}

/** Restart the desktop app now so the downloaded version installs. */
export function installDesktopUpdate(): void {
  try { bridge()?.installUpdate?.(); } catch { /* the app keeps running; it also installs when it is quit */ }
}
