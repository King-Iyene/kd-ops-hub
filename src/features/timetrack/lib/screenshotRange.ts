import { addDays, addMonths, differenceInCalendarDays, endOfMonth, format, isSameMonth, startOfMonth } from 'date-fns';

/** Helpers for the Screenshots page, which shows a day or a whole range (last 7 days, this week, last month ...). */

const ymd = (d: Date) => format(d, 'yyyy-MM-dd');
const parse = (s: string) => new Date(`${s}T00:00:00`);

/**
 * The range one step back or forward. A single day moves by a day; "this week" or "last week" (Monday to Sunday) moves by a whole week;
 * "this month" or "last month" moves by a whole calendar month; anything else (last 7 days, a custom range) moves by its own length.
 * Never goes past today: the end is cut back to today.
 */
export function shiftRange(start: string, end: string, dir: -1 | 1, today: Date = new Date()): { start: string; end: string } {
  const s = parse(start);
  const e = parse(end);
  const days = differenceInCalendarDays(e, s) + 1;
  const todayStr = ymd(today);
  let ns: Date;
  let ne: Date;
  const monthLike = s.getDate() === 1 && isSameMonth(s, e) && days >= 2 && (ymd(e) === ymd(endOfMonth(s)) || ymd(e) === todayStr);
  const weekLike = s.getDay() === 1 && days >= 2 && days <= 7 && (e.getDay() === 0 || ymd(e) === todayStr);
  if (monthLike) {
    const m = addMonths(s, dir);
    ns = startOfMonth(m);
    ne = endOfMonth(m);
  } else if (weekLike) {
    ns = addDays(s, 7 * dir);
    ne = addDays(ns, 6);
  } else {
    ns = addDays(s, days * dir);
    ne = addDays(e, days * dir);
  }
  if (ymd(ne) > todayStr) ne = parse(todayStr);
  if (ymd(ns) > todayStr) ns = parse(todayStr);
  return { start: ymd(ns), end: ymd(ne) };
}

/** Rows (already newest first) grouped by the day they were taken, keeping their order: [{ day: '2026-11-27', rows }]. */
export function groupByDay<T extends { captured_at: string }>(rows: T[]): { day: string; rows: T[] }[] {
  const out: { day: string; rows: T[] }[] = [];
  for (const r of rows) {
    const day = ymd(new Date(r.captured_at));
    const last = out[out.length - 1];
    if (last && last.day === day) last.rows.push(r);
    else out.push({ day, rows: [r] });
  }
  return out;
}

/** How the range reads in a sentence: "27 Nov 2026" for one day, "20 Nov to 27 Nov 2026" otherwise. */
export function rangeWords(start: string, end: string): string {
  const s = parse(start);
  const e = parse(end);
  if (start === end) return format(e, 'd MMM yyyy');
  return `${format(s, s.getFullYear() === e.getFullYear() ? 'd MMM' : 'd MMM yyyy')} to ${format(e, 'd MMM yyyy')}`;
}

/** How many screenshots are loaded at a time (more are fetched with "Show more"). */
export const SCREENSHOT_PAGE = 100;
