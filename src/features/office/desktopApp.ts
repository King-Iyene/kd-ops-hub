/** Where to get the KD Ops desktop app (the ops site and the Office in one window), and whether we are already inside it. */
export const DESKTOP_VERSION = '0.2.3';
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
