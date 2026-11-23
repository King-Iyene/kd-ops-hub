/**
 * Typing a date straight into the date picker.
 *
 * Accepts the ways people actually write dates in Nigeria and online:
 *   22 Nov 2026, 22 November, Nov 22 2026, 22/11/2026, 22-11-26, 22.11, 2026-11-22,
 *   today, tomorrow, yesterday, +3d, -2d
 * Numeric dates are day first (22/11/2026 is 22 November), matching the rest of
 * the app. A missing year means the current year. Anything that is not a real
 * calendar date returns null.
 */

export interface YMD {
  year: number;
  month: number; // 1 to 12
  day: number; // 1 to 31
}

const MONTHS: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

export function isRealDate({ year, month, day }: YMD): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (year < 1000 || year > 9999 || month < 1 || month > 12 || day < 1) return false;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day <= last;
}

export function addDays(date: YMD, days: number): YMD {
  const d = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

export function formatYMD({ year, month, day }: YMD): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function parseYMD(text: string): YMD | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (!m) return null;
  const ymd = { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
  return isRealDate(ymd) ? ymd : null;
}

function fullYear(raw: string, today: YMD): number {
  if (raw === '') return today.year;
  const n = Number(raw);
  return raw.length <= 2 ? 2000 + n : n;
}

function ok(ymd: YMD): YMD | null {
  return isRealDate(ymd) ? ymd : null;
}

export function parseTypedDate(input: string, today: YMD): YMD | null {
  const text = input.trim().toLowerCase().replace(/\s+/g, ' ').replace(/,/g, '');
  if (!text) return null;

  if (text === 'today' || text === 'now') return today;
  if (text === 'tomorrow') return addDays(today, 1);
  if (text === 'yesterday') return addDays(today, -1);

  const offset = /^([+-])\s?(\d{1,4})\s?d(?:ays?)?$/.exec(text);
  if (offset) return addDays(today, (offset[1] === '-' ? -1 : 1) * Number(offset[2]));

  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
  if (iso) return ok({ year: Number(iso[1]), month: Number(iso[2]), day: Number(iso[3]) });

  // 22/11/2026, 22-11-26, 22.11, 22/11
  const numeric = /^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2}|\d{4}))?$/.exec(text);
  if (numeric) {
    return ok({ year: fullYear(numeric[3] ?? '', today), month: Number(numeric[2]), day: Number(numeric[1]) });
  }

  // 22 nov 2026, 22 november, 22nov26
  const dayFirst = /^(\d{1,2})(?:st|nd|rd|th)? ?([a-z]{3,9})(?: ?(\d{2}|\d{4}))?$/.exec(text);
  if (dayFirst && MONTHS[dayFirst[2]]) {
    return ok({ year: fullYear(dayFirst[3] ?? '', today), month: MONTHS[dayFirst[2]], day: Number(dayFirst[1]) });
  }

  // nov 22 2026, november 22
  const monthFirst = /^([a-z]{3,9}) ?(\d{1,2})(?:st|nd|rd|th)?(?: ?(\d{2}|\d{4}))?$/.exec(text);
  if (monthFirst && MONTHS[monthFirst[1]]) {
    return ok({ year: fullYear(monthFirst[3] ?? '', today), month: MONTHS[monthFirst[1]], day: Number(monthFirst[2]) });
  }

  return null;
}

/** Split "2026-11-22T14:30" into its date and time parts. */
export function splitWallClock(wallClock: string): { date: YMD; hour24: number; minute: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(wallClock);
  if (!m) return null;
  const date = { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
  if (!isRealDate(date)) return null;
  return { date, hour24: Number(m[4]) % 24, minute: Number(m[5]) };
}

export function to12h(hour24: number): { hour: number; period: 'AM' | 'PM' } {
  const period = hour24 >= 12 ? 'PM' : 'AM';
  const hour = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return { hour, period };
}

export function to24h(hour12: number, period: 'AM' | 'PM'): number {
  const base = hour12 % 12;
  return period === 'PM' ? base + 12 : base;
}
