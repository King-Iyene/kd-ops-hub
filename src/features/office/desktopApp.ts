/** Where to get the KD Ops desktop app (the ops site and the Office in one window), and whether we are already inside it. */
export const DESKTOP_VERSION = '0.3.8';

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

/** The installer that fits this computer, and a short name for it ("Windows"). The url is empty on a phone or tablet. */
export function desktopDownload(platform: string = typeof navigator === 'undefined' ? '' : `${navigator.userAgent} ${navigator.platform}`): { label: string; url: string; file: string } {
  const p = platform.toLowerCase();
  // "?download=" makes the browser save the file under a proper name instead of leaving the page
  const at = (stored: string, saveAs: string) => ({ url: `${FILES()}/${stored}?download=${encodeURIComponent(saveAs)}`, file: saveAs });
  if (/android|iphone|ipad|ipod/.test(p)) return { label: 'computer', url: '', file: '' };
  if (/win/.test(p) && !/darwin/.test(p)) return { label: 'Windows', ...at('KD-Ops-Setup.exe', `KD-Ops-Setup-${DESKTOP_VERSION}.exe`) };
  if (/mac/.test(p)) return { label: 'Mac', ...at('KD-Ops.dmg', `KD-Ops-${DESKTOP_VERSION}.dmg`) };
  if (/linux|x11/.test(p)) return { label: 'Linux', ...at('KD-Ops.AppImage', `KD-Ops-${DESKTOP_VERSION}.AppImage`) };
  return { label: 'computer', url: '', file: '' };
}

/**
 * Start the download for this computer without leaving the page. Says what happened so the caller can tell the person:
 * 'started', 'phone' (the app is for computers), or 'not-ready' (the installer is not on our storage yet).
 */
export async function startDesktopDownload(platform?: string): Promise<'started' | 'phone' | 'not-ready'> {
  const d = desktopDownload(platform);
  if (!d.url) return 'phone';
  try {
    const r = await fetch(d.url, { method: 'HEAD' });
    if (!r.ok) return 'not-ready';
  } catch {
    return 'not-ready';
  }
  const a = document.createElement('a');
  a.href = d.url;
  a.download = d.file;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
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
