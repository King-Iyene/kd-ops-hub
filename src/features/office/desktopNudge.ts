import { useEffect, useRef } from 'react';
import { feedDownload, feedOsFor, inDesktopApp, saveFromUrl } from './desktopApp';

/**
 * Moving people who already have an OLD desktop app onto the newest one.
 *
 * The KD Ops desktop app is a window around this website, and it tells the website which version it is (in the browser's user-agent
 * text, "KDOpsDesktop/0.3.8"). Updating from inside the app only works while the old app can reach its old update address. So this
 * does not rely on that: the website itself, which every old app loads fresh, compares that version with the newest one on our own
 * update feed and, if the app is behind, shows a "newer version" message with a Download button (the installer goes over the old app).
 */

/** "0.3.8" from the app's user-agent text, or null (a normal browser, or the old Office-only app). */
export function desktopVersionFromUa(ua: string): string | null {
  const m = /KDOpsDesktop\/(\d+\.\d+\.\d+)/.exec(ua);
  return m ? m[1] : null;
}

const parts = (v: string) => v.split('.').map((n) => parseInt(n, 10) || 0);
/** Is version a older than version b? ("0.3.8" is older than "0.3.10"; numbers, not letters.) */
export function isOlder(a: string, b: string): boolean {
  const x = parts(a), y = parts(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d !== 0) return d < 0;
  }
  return false;
}

const DAY_MS = 24 * 60 * 60 * 1000;
/**
 * Tell the person? Only when the app is behind the feed, the app has not already downloaded the update itself (that shows "restart to
 * update"), and they have not been told about this exact version in the last day (so it never nags).
 */
export function shouldNudge(o: { current: string | null; latest: string | null; updateWaiting: boolean; lastShownAt: number | null; now: number }): boolean {
  if (!o.current || !o.latest || o.updateWaiting) return false;
  if (!isOlder(o.current, o.latest)) return false;
  return o.lastShownAt === null || o.now - o.lastShownAt >= DAY_MS;
}

const KEY = (v: string) => `kd:desktop-nudge:${v}`;
const readShown = (v: string): number | null => { try { const n = Number(localStorage.getItem(KEY(v))); return Number.isFinite(n) && n > 0 ? n : null; } catch { return null; } };
const markShown = (v: string, now: number) => { try { localStorage.setItem(KEY(v), String(now)); } catch { /* fine */ } };

/** Inside the desktop app only: once when it opens and then every few hours, say so when a newer version is on the feed. */
export function useDesktopUpdateNudge(show: (p: { current: string; latest: string; download: () => void }) => void): void {
  const showRef = useRef(show);
  showRef.current = show;
  useEffect(() => {
    if (!inDesktopApp() || typeof navigator === 'undefined') return;
    const current = desktopVersionFromUa(navigator.userAgent);
    const os = feedOsFor();
    if (!current || !os) return;
    let waiting = false;
    const bridge = (window as unknown as { kdDesktop?: { onUpdate?: (cb: (v: string | null) => void) => (() => void) | void } }).kdDesktop;
    const off = bridge?.onUpdate?.((v) => { waiting = !!v; });
    let stop = false;
    const check = async () => {
      const d = await feedDownload('office', os);
      if (stop || !d?.version) return;
      const now = Date.now();
      if (!shouldNudge({ current, latest: d.version, updateWaiting: waiting, lastShownAt: readShown(d.version), now })) return;
      markShown(d.version, now);
      showRef.current({ current, latest: d.version, download: () => saveFromUrl(d.url, d.file) });
    };
    const first = window.setTimeout(() => void check(), 20_000); // let the app settle first
    const again = window.setInterval(() => void check(), 4 * 60 * 60 * 1000);
    return () => { stop = true; window.clearTimeout(first); window.clearInterval(again); if (typeof off === 'function') off(); };
  }, []);
}
