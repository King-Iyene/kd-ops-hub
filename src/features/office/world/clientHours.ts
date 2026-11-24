// Client hours: are our clients' offices open right now, and when do their working day and ours overlap?
// Pure (no React, no canvas) so it is unit tested. Clients work 9 to 5 on weekdays where they are; our team (Lagos) 8 to 6.
import { zoneParts } from './clock';

export interface Region { id: string; label: string; short: string; zone: string }

export const REGIONS: Region[] = [
  { id: 'na-e', label: 'North America (East)', short: 'NA', zone: 'America/New_York' },
  { id: 'na-w', label: 'North America (West)', short: 'US-W', zone: 'America/Los_Angeles' },
  { id: 'eu-w', label: 'United Kingdom', short: 'UK', zone: 'Europe/London' },
  { id: 'eu-c', label: 'Central Europe', short: 'EU', zone: 'Europe/Berlin' },
  { id: 'au-e', label: 'Australia (East)', short: 'AU', zone: 'Australia/Sydney' },
];
export const HOME_ZONE = 'Africa/Lagos';
const CLIENT = { from: 9, to: 17 };
const HOME = { from: 8, to: 18 };

const wk = new Map<string, Intl.DateTimeFormat>();
/** 0 = Sunday … 6 = Saturday, where that zone is. */
export function weekdayIn(zone: string, now: number): number {
  try {
    let f = wk.get(zone);
    if (!f) { f = new Intl.DateTimeFormat('en-US', { timeZone: zone, weekday: 'short' }); wk.set(zone, f); }
    return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(f.format(new Date(now)));
  } catch { return new Date(now).getUTCDay(); }
}

export type HoursState = 'open' | 'closing' | 'opening' | 'closed' | 'weekend';
export interface Hours { state: HoursState; h: number; m: number; /** minutes until it opens (when not open) or closes (when open) */ minutes: number | null }

function within(zone: string, now: number, win: { from: number; to: number }): boolean {
  const d = weekdayIn(zone, now);
  if (d === 0 || d === 6) return false;
  const { h } = zoneParts(zone, now);
  return h >= win.from && h < win.to;
}

/** Whether a client office in that zone is open, closing soon (last hour), opening soon (next hour) or closed. */
export function clientHours(zone: string, now: number): Hours {
  const { h, m } = zoneParts(zone, now);
  const d = weekdayIn(zone, now);
  if (d === 0 || d === 6) return { state: 'weekend', h, m, minutes: null };
  const mins = h * 60 + m;
  if (mins >= CLIENT.from * 60 && mins < CLIENT.to * 60) {
    const left = CLIENT.to * 60 - mins;
    return { state: left <= 60 ? 'closing' : 'open', h, m, minutes: left };
  }
  if (mins < CLIENT.from * 60) {
    const wait = CLIENT.from * 60 - mins;
    return { state: wait <= 60 ? 'opening' : 'closed', h, m, minutes: wait };
  }
  return { state: 'closed', h, m, minutes: null };
}

/** The first stretch in the next two days when our team and that client are both at work (times are real instants). */
export function sharedWindow(zone: string, now: number): { start: number; end: number } | null {
  const STEP = 30 * 60_000;
  let start = -1, end = -1;
  for (let k = 0; k < 96; k++) {
    const t = now + k * STEP;
    const both = within(HOME_ZONE, t, HOME) && within(zone, t, CLIENT);
    if (both && start < 0) start = t;
    if (both) end = t + STEP;
    if (!both && start >= 0) break;
  }
  return start < 0 ? null : { start, end };
}

/** "2 h 30 min", "45 min" */
export function spell(minutes: number): string {
  const h = Math.floor(minutes / 60), m = minutes % 60;
  return h ? (m ? `${h} h ${m} min` : `${h} h`) : `${m} min`;
}
