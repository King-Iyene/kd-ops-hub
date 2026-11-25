/**
 * Dates that move with the calendar: "today", "yesterday", "this month", "next week". A saved view such as
 * "Tasks due this month" must show a different set of rows next month without anyone editing it, so the filter
 * stores the name and the name is turned into real dates each time the rows are asked for.
 *
 * Pure (the current time is passed in) so it can be tested.
 */

export const DATE_TOKENS = ['today', 'yesterday', 'tomorrow'] as const;
export type DateToken = (typeof DATE_TOKENS)[number];

/** Ranges for "is within". The first group already existed; the calendar ranges are new. */
export const WITHIN_RANGES = [
  { value: 'pastWeek', label: 'the past week' },
  { value: 'pastMonth', label: 'the past month' },
  { value: 'pastYear', label: 'the past year' },
  { value: 'nextWeek', label: 'the next week' },
  { value: 'nextMonth', label: 'the next month' },
  { value: 'nextYear', label: 'the next year' },
  { value: 'thisCalendarWeek', label: 'this week' },
  { value: 'thisCalendarMonth', label: 'this month' },
  { value: 'thisCalendarQuarter', label: 'this quarter' },
  { value: 'thisCalendarYear', label: 'this year' },
  { value: 'lastCalendarWeek', label: 'last week' },
  { value: 'lastCalendarMonth', label: 'last month' },
  { value: 'lastCalendarQuarter', label: 'last quarter' },
  { value: 'lastCalendarYear', label: 'last year' },
  { value: 'nextCalendarWeek', label: 'next week' },
  { value: 'nextCalendarMonth', label: 'next month' },
  { value: 'nextCalendarQuarter', label: 'next quarter' },
  { value: 'nextCalendarYear', label: 'next year' },
] as const;

const CALENDAR_RANGE = /^(this|last|next)Calendar(Week|Month|Quarter|Year)$/;

export function isDateToken(value: unknown): value is DateToken {
  return typeof value === 'string' && (DATE_TOKENS as readonly string[]).includes(value);
}

export function isCalendarRange(value: unknown): boolean {
  return typeof value === 'string' && CALENDAR_RANGE.test(value);
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** A date as YYYY-MM-DD in the viewer's own calendar (not UTC, which can be yesterday or tomorrow). */
export function toDateString(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  return out;
}

export function resolveDateToken(token: DateToken, now: Date): string {
  const offset = token === 'yesterday' ? -1 : token === 'tomorrow' ? 1 : 0;
  return toDateString(addDays(now, offset));
}

/** The first and last day of a named calendar range (weeks start on Monday), or null when the name is unknown. */
export function resolveCalendarRange(name: string, now: Date): { from: string; to: string } | null {
  const m = CALENDAR_RANGE.exec(name);
  if (!m) return null;
  const shift = m[1] === 'last' ? -1 : m[1] === 'next' ? 1 : 0;
  const unit = m[2];
  const y = now.getFullYear();
  const mo = now.getMonth();

  if (unit === 'Week') {
    const sinceMonday = (now.getDay() + 6) % 7;
    const start = addDays(now, -sinceMonday + shift * 7);
    return { from: toDateString(start), to: toDateString(addDays(start, 6)) };
  }
  if (unit === 'Month') {
    const start = new Date(y, mo + shift, 1);
    const end = new Date(y, mo + shift + 1, 0);
    return { from: toDateString(start), to: toDateString(end) };
  }
  if (unit === 'Quarter') {
    const q = Math.floor(mo / 3) + shift;
    const start = new Date(y, q * 3, 1);
    const end = new Date(y, q * 3 + 3, 0);
    return { from: toDateString(start), to: toDateString(end) };
  }
  const start = new Date(y + shift, 0, 1);
  const end = new Date(y + shift, 11, 31);
  return { from: toDateString(start), to: toDateString(end) };
}

const DATE_TYPE = /^(date|timestamp)/i;
const TIMESTAMP_TYPE = /^timestamp/i;

export function isDateColumn(pgType: string | undefined): boolean {
  return DATE_TYPE.test(pgType ?? '');
}

/**
 * Turns a filter that uses a moving date into one the database understands. Anything else comes back unchanged.
 * Only date and timestamp columns are touched, so a text column that happens to contain "today" is left alone.
 */
export function normalizeDateFilter(
  operator: string,
  value: unknown,
  pgType: string | undefined,
  now: Date = new Date(),
): { operator: string; value: unknown } {
  if (!isDateColumn(pgType)) return { operator, value };
  const timestamp = TIMESTAMP_TYPE.test(pgType ?? '');
  const startOf = (d: string) => (timestamp ? `${d}T00:00:00` : d);
  const endOf = (d: string) => (timestamp ? `${d}T23:59:59.999` : d);

  if (operator === 'isWithin' && isCalendarRange(value)) {
    const range = resolveCalendarRange(String(value), now);
    if (range) return { operator: 'isBetween', value: [startOf(range.from), endOf(range.to)] };
  }

  if (isDateToken(value)) {
    const day = resolveDateToken(value, now);
    switch (operator) {
      case 'is':
      case 'eq':
        return timestamp ? { operator: 'isBetween', value: [startOf(day), endOf(day)] } : { operator: 'eq', value: day };
      case 'gt':
      case 'isAfter':
        return { operator: 'gt', value: endOf(day) };
      case 'gte':
      case 'isOnOrAfter':
        return { operator: 'gte', value: startOf(day) };
      case 'lt':
      case 'isBefore':
        return { operator: 'lt', value: startOf(day) };
      case 'lte':
      case 'isOnOrBefore':
        return { operator: 'lte', value: endOf(day) };
      default:
        return { operator, value: day };
    }
  }
  return { operator, value };
}
