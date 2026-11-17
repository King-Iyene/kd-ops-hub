// Pure helpers for naming sites and apps in Time Tracking reports. No React, no network: unit tested.

interface CaptureLike { url?: string | null; app_name?: string | null; window_title?: string | null }

const BROWSER_APP = /chrome|msedge|edge|brave|opera|vivaldi|firefox|arc|safari/i;

/** The site's bare hostname from a captured URL ("https://www.github.com/x" -> "github.com"), or null. */
export function captureDomain(log: Pick<CaptureLike, 'url'>): string | null {
  if (!log.url) return null;
  try {
    return new URL(log.url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

/**
 * What to call a capture in site/app lists. A site when the address was read; otherwise, for a browser (or a
 * web app window with no address bar, like WhatsApp Web), the page's own title, so it shows as "WhatsApp Web"
 * and not just "Brave Browser". Anything else is the application name.
 */
export function siteOrAppKey(log: CaptureLike): { key: string; isSite: boolean } {
  const d = captureDomain(log);
  if (d) return { key: d, isSite: true };
  const app = log.app_name ?? 'Unknown';
  if (BROWSER_APP.test(app) && log.window_title) {
    const t = log.window_title
      .replace(/\s[-–—]\s(Google Chrome|Brave( Browser)?( Beta)?|Microsoft ?Edge|Mozilla Firefox|Opera|Vivaldi|Arc)(\s[-–—].*)?$/i, '')
      .trim();
    if (t && t.length <= 60) return { key: t, isSite: true };
  }
  return { key: app, isSite: false };
}

/** "https://www.Facebook.com/groups/x?y=1" -> "facebook.com"; apps are kept as typed. Null when it is not usable. */
export function normaliseEntry(raw: string, kind: 'site' | 'app'): string | null {
  const v = raw.trim();
  if (!v) return null;
  if (kind === 'app') return v;
  const host = v.toLowerCase().replace(/^[a-z]+:\/\//, '').replace(/^www\./, '').split(/[/?#:\s]/)[0];
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) ? host : null;
}

/** A pasted list (one per line, or separated by commas or semicolons) -> unique usable entries and the rejected ones. */
export function parseEntryList(text: string, kind: 'site' | 'app'): { ok: string[]; bad: string[] } {
  const seen = new Set<string>();
  const ok: string[] = [];
  const bad: string[] = [];
  for (const line of text.split(/[\n,;]+/)) {
    if (!line.trim()) continue;
    const n = normaliseEntry(line, kind);
    if (!n) { bad.push(line.trim()); continue; }
    if (!seen.has(n.toLowerCase())) { seen.add(n.toLowerCase()); ok.push(n); }
  }
  return { ok, bad };
}
