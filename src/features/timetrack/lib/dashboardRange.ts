import { differenceInCalendarDays, format, parseISO } from 'date-fns';

/** The quick ranges the Real-time Dashboard offers, in this order. */
export const DASHBOARD_RANGES = ['month', 'lastmonth', 'week', 'lastweek', 'year', 'lastyear'] as const;

/** A short range is shown day by day; a long one (a year, say) month by month, so the chart stays readable. */
export const MONTHLY_AFTER_DAYS = 92;

export function bucketKind(start: string, end: string): 'day' | 'month' {
  return differenceInCalendarDays(parseISO(end), parseISO(start)) + 1 > MONTHLY_AFTER_DAYS ? 'month' : 'day';
}

/** Sortable key for the day or month an entry belongs to. */
export function bucketKey(iso: string, kind: 'day' | 'month'): string {
  return format(new Date(iso), kind === 'day' ? 'yyyy-MM-dd' : 'yyyy-MM');
}

export function bucketLabel(key: string, kind: 'day' | 'month'): string {
  return kind === 'day' ? format(parseISO(key), 'd MMM') : format(parseISO(`${key}-01`), 'MMM yyyy');
}

/** The hours per day (or month) in time order, only for the days that have time. */
export function bucketHours(rows: { start_time: string; duration_minutes: number }[], kind: 'day' | 'month'): { label: string; hours: number }[] {
  const by = new Map<string, number>();
  for (const r of rows) {
    const k = bucketKey(r.start_time, kind);
    by.set(k, (by.get(k) ?? 0) + r.duration_minutes / 60);
  }
  return [...by.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([k, hours]) => ({ label: bucketLabel(k, kind), hours }));
}

/** "21 Nov 2026 to 23 Nov 2026" style label for the header. */
export function rangeText(start: string, end: string): string {
  const f = (d: string) => format(parseISO(d), 'd MMM yyyy');
  return start === end ? f(start) : `${f(start)} to ${f(end)}`;
}
