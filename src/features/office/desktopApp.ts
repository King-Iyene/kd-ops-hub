/** Where to get the KD Ops desktop app (the ops site and the Office in one window), and whether we are already inside it. */
export const DESKTOP_VERSION = '0.3.7';
const REPO = 'https://github.com/King-Iyene/kd-ops-hub/releases';
export const DESKTOP_RELEASE_PAGE = `${REPO}/tag/office-desktop-v${DESKTOP_VERSION}`;

/** Inside the KD Ops desktop app: which tab this page is in ('ops' or 'office'); null in a browser or the old Office-only app. */
export function desktopTab(): 'ops' | 'office' | null {
  const t = typeof window === 'undefined' ? undefined : (window as unknown as { kdDesktop?: { tab?: unknown } }).kdDesktop?.tab;
  return t === 'ops' || t === 'office' ? t : null;
}

export function inDesktopApp(): boolean {
  return typeof window !== 'undefined' && !!(window as unknown as { kdDesktop?: unknown }).kdDesktop;
}

/** The installer that fits this computer, and a short name for it ("Windows"); the release page when we cannot tell. */
export function desktopDownload(platform: string = typeof navigator === 'undefined' ? '' : `${navigator.userAgent} ${navigator.platform}`): { label: string; url: string } {
  const base = `${REPO}/download/office-desktop-v${DESKTOP_VERSION}`;
  const p = platform.toLowerCase();
  if (/android|iphone|ipad|ipod/.test(p)) return { label: 'computer', url: DESKTOP_RELEASE_PAGE };
  if (/win/.test(p) && !/darwin/.test(p)) return { label: 'Windows', url: `${base}/KD-Ops-Setup-${DESKTOP_VERSION}.exe` };
  if (/mac/.test(p)) return { label: 'Mac', url: `${base}/KD-Ops-${DESKTOP_VERSION}.dmg` };
  if (/linux|x11/.test(p)) return { label: 'Linux', url: `${base}/KD-Ops-${DESKTOP_VERSION}.AppImage` };
  return { label: 'computer', url: DESKTOP_RELEASE_PAGE };
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
