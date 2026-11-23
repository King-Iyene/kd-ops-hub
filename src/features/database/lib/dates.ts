/**
 * One date standard for the Database module.
 *
 * - Day first with a written month, so "6 Sep 2026" can never be read as 9 June.
 * - Date-only values never show a time or timezone.
 * - Date-time values show the time without seconds; the exact moment and the
 *   timezone are available in the tooltip (see `formatDbTooltip`).
 * - Recent moments read as "12 min ago" / "Yesterday, 4:30 pm"; older ones are absolute.
 *
 * Everything takes the timezone as an argument (the app passes the workspace
 * timezone) so the functions stay pure and easy to test.
 */

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function parts(date: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  });
  const out: Record<string, number> = {};
  for (const p of fmt.formatToParts(date)) {
    if (p.type !== 'literal') out[p.type] = Number(p.value);
  }
  if (out.hour === 24) out.hour = 0;
  return out as { year: number; month: number; day: number; hour: number; minute: number };
}

function toDate(value: string | Date | null | undefined): Date | null {
  if (value == null || value === '') return null;
  const d = value instanceof Date ? value : new Date(DATE_ONLY.test(value) ? `${value}T12:00:00Z` : value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "6 Sep 2026". A plain YYYY-MM-DD is shown as that calendar day in every timezone. */
export function formatDbDate(value: string | Date | null | undefined, timeZone = 'Africa/Lagos'): string {
  const d = toDate(value);
  if (!d) return '';
  if (typeof value === 'string' && DATE_ONLY.test(value)) {
    const [y, m, day] = value.split('-').map(Number);
    return `${day} ${MONTHS[m - 1]} ${y}`;
  }
  const p = parts(d, timeZone);
  return `${p.day} ${MONTHS[p.month - 1]} ${p.year}`;
}

/** "2:15 pm" */
export function formatDbTime(value: string | Date | null | undefined, timeZone = 'Africa/Lagos'): string {
  const d = toDate(value);
  if (!d) return '';
  const p = parts(d, timeZone);
  const suffix = p.hour >= 12 ? 'pm' : 'am';
  const hour12 = p.hour % 12 === 0 ? 12 : p.hour % 12;
  return `${hour12}:${String(p.minute).padStart(2, '0')} ${suffix}`;
}

/** "6 Sep 2026, 2:15 pm" (a date-only value drops the time). */
export function formatDbDateTime(value: string | Date | null | undefined, timeZone = 'Africa/Lagos'): string {
  const d = toDate(value);
  if (!d) return '';
  if (typeof value === 'string' && DATE_ONLY.test(value)) return formatDbDate(value, timeZone);
  return `${formatDbDate(d, timeZone)}, ${formatDbTime(d, timeZone)}`;
}

/** Calendar-day difference between two moments in the given timezone (later minus earlier). */
function dayDiff(later: Date, earlier: Date, timeZone: string): number {
  const a = parts(later, timeZone);
  const b = parts(earlier, timeZone);
  return Math.round((Date.UTC(a.year, a.month - 1, a.day) - Date.UTC(b.year, b.month - 1, b.day)) / 86_400_000);
}

/**
 * "Just now", "12 min ago", "3 h ago", "Yesterday, 4:30 pm", "3 days ago",
 * then the absolute date after a week. Future moments are shown absolute.
 */
export function formatRelative(
  value: string | Date | null | undefined,
  now: Date = new Date(),
  timeZone = 'Africa/Lagos',
): string {
  const d = toDate(value);
  if (!d) return '';
  const ms = now.getTime() - d.getTime();
  if (ms < -60_000) return formatDbDateTime(d, timeZone);
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  const days = dayDiff(now, d, timeZone);
  if (days === 0) return `${hours} h ago`;
  if (days === 1) return `Yesterday, ${formatDbTime(d, timeZone)}`;
  if (days < 7) return `${days} days ago`;
  return formatDbDate(d, timeZone);
}

/** Full detail for a tooltip: "Sunday 6 Sep 2026, 2:15 pm (Africa/Lagos)". */
export function formatDbTooltip(value: string | Date | null | undefined, timeZone = 'Africa/Lagos'): string {
  const d = toDate(value);
  if (!d) return '';
  const weekday = new Intl.DateTimeFormat('en-GB', { timeZone, weekday: 'long' }).format(
    typeof value === 'string' && DATE_ONLY.test(value) ? new Date(`${value}T12:00:00Z`) : d,
  );
  if (typeof value === 'string' && DATE_ONLY.test(value)) return `${weekday} ${formatDbDate(value, timeZone)}`;
  return `${weekday} ${formatDbDateTime(d, timeZone)} (${timeZone})`;
}
