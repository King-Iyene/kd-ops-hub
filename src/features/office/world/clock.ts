/** Time zones for the wall clock. Pure (no React, no canvas), so it is unit tested. */

export interface ZonePreset { id: string; city: string; /** fixed short name; if absent it comes from the browser (EST or EDT, GMT or BST…) */ abbr?: string }

export const ZONE_PRESETS: ZonePreset[] = [
  { id: 'Africa/Lagos', city: 'Lagos', abbr: 'WAT' },
  { id: 'Africa/Accra', city: 'Accra', abbr: 'GMT' },
  { id: 'Africa/Nairobi', city: 'Nairobi', abbr: 'EAT' },
  { id: 'Africa/Johannesburg', city: 'Johannesburg', abbr: 'SAST' },
  { id: 'Europe/London', city: 'London' },
  { id: 'Asia/Dubai', city: 'Dubai', abbr: 'GST' },
  { id: 'Asia/Kolkata', city: 'Mumbai', abbr: 'IST' },
  { id: 'Asia/Singapore', city: 'Singapore', abbr: 'SGT' },
  { id: 'Asia/Shanghai', city: 'Shanghai', abbr: 'CST' },
  { id: 'Asia/Tokyo', city: 'Tokyo', abbr: 'JST' },
  { id: 'Australia/Sydney', city: 'Sydney' },
  { id: 'America/New_York', city: 'New York' },
  { id: 'America/Chicago', city: 'Chicago' },
  { id: 'America/Los_Angeles', city: 'Los Angeles' },
  { id: 'America/Toronto', city: 'Toronto' },
];

export const DEFAULT_ZONES = ['Africa/Lagos', 'America/New_York'];
export const MAX_ZONES = 3;

/** Keep only known zones, one to three of them, falling back to Lagos and New York. */
export function cleanZones(raw: unknown): string[] {
  if (!Array.isArray(raw)) return DEFAULT_ZONES;
  const known = new Set(ZONE_PRESETS.map((z) => z.id));
  const out: string[] = [];
  for (const z of raw) if (typeof z === 'string' && known.has(z) && !out.includes(z)) out.push(z);
  return out.length ? out.slice(0, MAX_ZONES) : DEFAULT_ZONES;
}

const fmts = new Map<string, Intl.DateTimeFormat>();
function fmt(zone: string): Intl.DateTimeFormat {
  let f = fmts.get(zone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23' });
    fmts.set(zone, f);
  }
  return f;
}

/** Hours, minutes and seconds on the wall in that zone. */
export function zoneParts(zone: string, now: number): { h: number; m: number; s: number } {
  try {
    const parts = fmt(zone).formatToParts(new Date(now));
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
    return { h: get('hour') % 24, m: get('minute'), s: get('second') };
  } catch {
    const d = new Date(now);
    return { h: d.getUTCHours(), m: d.getUTCMinutes(), s: d.getUTCSeconds() };
  }
}

const shortNames = new Map<string, Intl.DateTimeFormat>();
/** WAT, EST (or EDT in summer), GMT or BST… */
export function zoneAbbr(zone: string, now: number): string {
  const preset = ZONE_PRESETS.find((z) => z.id === zone);
  if (preset?.abbr) return preset.abbr;
  try {
    let f = shortNames.get(zone);
    if (!f) {
      f = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'short' });
      shortNames.set(zone, f);
    }
    const name = f.formatToParts(new Date(now)).find((p) => p.type === 'timeZoneName')?.value;
    if (name && !/^GMT[+-]/.test(name) && !/^UTC/.test(name)) return name;
  } catch { /* fall through */ }
  return (preset?.city ?? zone).slice(0, 4).toUpperCase();
}

/** 12-hour clock face: 14:05 becomes 2:05 PM. */
export function to12h(h: number): { h12: number; pm: boolean } {
  return { h12: h % 12 === 0 ? 12 : h % 12, pm: h >= 12 };
}

/** "2:05 PM" style time for a zone. */
export function zoneClock(zone: string, now: number): string {
  const { h, m } = zoneParts(zone, now);
  const t = to12h(h);
  return `${t.h12}:${String(m).padStart(2, '0')} ${t.pm ? 'PM' : 'AM'}`;
}
