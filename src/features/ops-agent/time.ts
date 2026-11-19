// Every time the Ops Agent shows a person is Eastern time (EST in winter, EDT in summer), whatever the browser's zone is.
// The business runs on it: report deadlines, work windows and "today" are all New York time.

export const AGENT_TZ = 'America/New_York';

type Input = string | number | Date | null | undefined;

function toDate(v: Input): Date | null {
  if (v === null || v === undefined || v === '') return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

const PARTS = new Intl.DateTimeFormat('en-US', {
  timeZone: AGENT_TZ, year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true, timeZoneName: 'short',
});

function parts(d: Date): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of PARTS.formatToParts(d)) out[p.type] = p.value;
  return out;
}

export interface FormatEstOptions {
  /** "1:07 PM EST" with no date. */
  timeOnly?: boolean;
  /** Add the year: "Nov 19, 2026, 1:07 PM EST". */
  year?: boolean;
  /** Add seconds: "1:07:42 PM". */
  seconds?: boolean;
  /** Text for a missing or invalid value. */
  fallback?: string;
}

/** "Nov 19, 1:07 PM EST" (or EDT) for an ISO timestamp. */
export function formatEst(iso: Input, opts: FormatEstOptions = {}): string {
  const d = toDate(iso);
  if (!d) return opts.fallback ?? '';
  const p = parts(d);
  const time = `${p.hour}:${p.minute}${opts.seconds ? `:${p.second}` : ''} ${(p.dayPeriod ?? '').toUpperCase()}`.trim();
  const clock = `${time} ${p.timeZoneName ?? 'ET'}`;
  if (opts.timeOnly) return clock;
  return `${p.month} ${p.day}${opts.year ? `, ${p.year}` : ''}, ${clock}`;
}

/** "40s ago", "5m ago", "3h ago", "2d ago"; older than a month falls back to the date. Future times read "in 5m". */
export function relativeTime(iso: Input, now: number = Date.now()): string {
  const d = toDate(iso);
  if (!d) return '';
  const diff = Math.round((now - d.getTime()) / 1000);
  const abs = Math.abs(diff);
  if (abs < 5) return 'just now';
  const unit = abs < 60 ? `${abs}s` : abs < 3600 ? `${Math.floor(abs / 60)}m` : abs < 86400 ? `${Math.floor(abs / 3600)}h` : abs < 86400 * 30 ? `${Math.floor(abs / 86400)}d` : null;
  if (unit === null) {
    const p = parts(d);
    return `${p.month} ${p.day}${new Date(now).getFullYear() !== d.getFullYear() ? `, ${p.year}` : ''}`;
  }
  return diff >= 0 ? `${unit} ago` : `in ${unit}`;
}

/** "2026-11-19" in Eastern time: the business day an instant falls on. */
export function estDayKey(iso: Input): string {
  const d = toDate(iso);
  if (!d) return '';
  return new Intl.DateTimeFormat('en-CA', { timeZone: AGENT_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

/** Hour 0 to 23 in Eastern time. */
export function estHour(now: Input = new Date()): number {
  const d = toDate(now) ?? new Date();
  const h = new Intl.DateTimeFormat('en-US', { timeZone: AGENT_TZ, hour: 'numeric', hourCycle: 'h23' }).format(d);
  return Number(h) % 24;
}

/** "Good morning", "Good afternoon" or "Good evening" by Eastern time. */
export function greeting(now: Input = new Date()): string {
  const h = estHour(now);
  return h < 5 ? 'Working late' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

/** Which Chat group a conversation belongs to: Today, or Earlier. */
export function dayGroup(iso: Input, now: Input = new Date()): 'Today' | 'Earlier' {
  return estDayKey(iso) === estDayKey(now) ? 'Today' : 'Earlier';
}

const DAY_ONLY = new Intl.DateTimeFormat('en-US', { timeZone: AGENT_TZ, month: 'short', day: 'numeric', year: 'numeric' });

/** "Nov 19" (or "Nov 19, 2026" with `year`) for the Eastern calendar day an instant falls on. */
export function formatEstDay(iso: Input, opts: { year?: boolean; fallback?: string } = {}): string {
  const d = toDate(iso);
  if (!d) return opts.fallback ?? '';
  const out: Record<string, string> = {};
  for (const p of DAY_ONLY.formatToParts(d)) out[p.type] = p.value;
  return `${out.month} ${out.day}${opts.year ? `, ${out.year}` : ''}`;
}
