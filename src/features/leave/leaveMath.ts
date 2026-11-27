// Pure helpers for the Leave module: working days, earned annual leave,
// readable labels, grouping and CSV. No React, no network, so they are easy to test.
import type { AwayRow, BalanceRow, LeaveEvent, LeaveRow } from './types';

const WEEKEND = new Set([0, 6]);

export const isoDate = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** A 'YYYY-MM-DD' string as a UTC date, so time zones can never shift the day. */
const utc = (iso: string): Date => new Date(`${iso}T00:00:00Z`);

export const addDays = (iso: string, n: number): string => {
  const d = utc(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export const daysBetween = (a: string, b: string): number =>
  Math.round((utc(b).getTime() - utc(a).getTime()) / 86_400_000);

/** Monday-to-Friday days between two dates (inclusive), minus public holidays. */
export function countWorkingDays(start: string, end: string, holidays: Set<string>): number {
  if (!start || !end) return 0;
  const a = utc(start);
  const b = utc(end);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime()) || b < a) return 0;
  let n = 0;
  for (const d = new Date(a); d <= b; d.setUTCDate(d.getUTCDate() + 1)) {
    if (!WEEKEND.has(d.getUTCDay()) && !holidays.has(d.toISOString().slice(0, 10))) n += 1;
  }
  return n;
}

/** Days a request takes off the balance. A half day only exists for a single day. */
export function requestedDays(start: string, end: string, half: boolean, holidays: Set<string>): number {
  const days = countWorkingDays(start, end, holidays);
  return half && start === end && days > 0 ? 0.5 : days;
}

/** Days skipped inside a range because they are weekends or public holidays. */
export function skippedDays(start: string, end: string, holidays: Set<string>): { weekends: number; holidays: number } {
  let weekends = 0;
  let hol = 0;
  if (!start || !end || end < start) return { weekends, holidays: hol };
  for (const d = utc(start); d <= utc(end); d.setUTCDate(d.getUTCDate() + 1)) {
    if (WEEKEND.has(d.getUTCDay())) weekends += 1;
    else if (holidays.has(d.toISOString().slice(0, 10))) hol += 1;
  }
  return { weekends, holidays: hol };
}

/**
 * Annual days EARNED so far (quota / 12 per month from the start month, never
 * more than the quota). Earlier years are fully earned, later years nothing.
 * Mirrors leave_accrued_days() in the database, which is what actually enforces it.
 */
export function accruedAnnualDays(quota: number, year: number, startDate?: string | null, now: Date = new Date()): number {
  const curYear = now.getUTCFullYear();
  if (year < curYear) return quota;
  if (year > curYear) return 0;
  let startMonth = 0;
  if (startDate) {
    const d = utc(startDate);
    if (!Number.isNaN(d.getTime())) {
      if (d.getUTCFullYear() > year) return 0;
      if (d.getUTCFullYear() === year) startMonth = d.getUTCMonth();
    }
  }
  const elapsed = now.getUTCMonth() - startMonth + 1;
  if (elapsed <= 0) return 0;
  return Math.min(quota, Math.round((quota / 12) * elapsed));
}

export const USED_FIELD: Record<string, keyof BalanceRow | undefined> = {
  annual: 'annual_used',
  sick: 'sick_used',
  unpaid: 'unpaid_used',
  maternity: 'maternity_used',
  paternity: 'paternity_used',
  compassionate: 'compassionate_used',
  study: 'study_used',
};

export interface AnnualPosition {
  quota: number;
  earned: number;
  used: number;
  left: number; // earned - used, never below 0
  yearLeft: number; // quota - used (what is left of the whole year)
}

export function annualPosition(bal: BalanceRow | null | undefined, defaultQuota: number, year: number, startDate?: string | null, now: Date = new Date()): AnnualPosition {
  const quota = bal?.annual_quota ?? defaultQuota;
  const used = bal?.annual_used ?? 0;
  const earned = accruedAnnualDays(quota, year, startDate, now);
  return { quota, earned, used, left: Math.max(0, earned - used), yearLeft: Math.max(0, quota - used) };
}

export function usedFor(bal: BalanceRow | null | undefined, type: string): number {
  const f = USED_FIELD[type];
  return f ? Number((bal as unknown as Record<string, number | null> | null | undefined)?.[f] ?? 0) : 0;
}

export const daysLabel = (n: number): string => {
  const v = Number.isInteger(n) ? String(n) : String(Number(n.toFixed(1)));
  return `${v} day${n === 1 ? '' : 's'}`;
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const niceDate = (iso: string, withYear = true): string => {
  const d = utc(iso);
  return `${DOW[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}${withYear ? ` ${d.getUTCFullYear()}` : ''}`;
};

export const shortDate = (iso: string): string => {
  const d = utc(iso);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
};

/** "Mon 7 Dec to Fri 11 Dec 2026", or one date when it is a single day. */
export function rangeLabel(start: string, end: string): string {
  if (start === end) return niceDate(start);
  const sameYear = start.slice(0, 4) === end.slice(0, 4);
  return `${niceDate(start, !sameYear)} to ${niceDate(end)}`;
}

export type Timing = 'now' | 'soon' | 'later' | 'past';

/** Where a leave sits relative to today. */
export function timingOf(start: string, end: string, today: string): Timing {
  if (end < today) return 'past';
  if (start <= today) return 'now';
  return daysBetween(today, start) <= 14 ? 'soon' : 'later';
}

export function relativeStart(start: string, end: string, today: string): string {
  if (end < today) return 'Finished';
  if (start <= today) return end === today ? 'Last day today' : `Back ${niceDate(nextWorkday(end), false)}`;
  const n = daysBetween(today, start);
  if (n === 1) return 'Starts tomorrow';
  return `Starts in ${n} days`;
}

export function nextWorkday(iso: string): string {
  let d = addDays(iso, 1);
  while (WEEKEND.has(utc(d).getUTCDay())) d = addDays(d, 1);
  return d;
}

export const overlaps = (a: { start_date: string; end_date: string }, b: { start_date: string; end_date: string }): boolean =>
  a.start_date <= b.end_date && a.end_date >= b.start_date;

/** Who is away today, later this week, and in the next 30 days. */
export function groupAway(rows: AwayRow[], today: string) {
  const weekEnd = addDays(today, 6 - ((utc(today).getUTCDay() + 6) % 7)); // coming Sunday
  const approved = rows.filter((r) => r.status === 'approved');
  const awayNow = approved.filter((r) => r.start_date <= today && r.end_date >= today);
  const thisWeek = approved.filter((r) => r.start_date > today && r.start_date <= weekEnd);
  const soon = approved.filter((r) => r.start_date > weekEnd && r.start_date <= addDays(today, 30));
  return { awayNow, thisWeek, soon, weekEnd };
}

export function initials(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return ((parts[0][0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] ?? '' : '')).toUpperCase();
}

export const titleCase = (code: string): string =>
  code.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

/** One plain sentence for a timeline entry. */
export function eventSentence(e: LeaveEvent, actorName: string): string {
  const who = actorName || 'Someone';
  switch (e.kind) {
    case 'submitted': return `${who} asked for this leave`;
    case 'recorded': return `${who} added this leave`;
    case 'approved': return `${who} approved it`;
    case 'rejected': return `${who} did not approve it`;
    case 'cancelled': return `${who} cancelled it`;
    case 'reverted': return `${who} moved it back to pending`;
    case 'deleted': return `${who} deleted it`;
    case 'noted': return `${who} added a note`;
    case 'edited': {
      const d = e.details as { before?: Record<string, unknown>; after?: Record<string, unknown> } | null;
      if (d?.before && d?.after) {
        const bits: string[] = [];
        if (d.before.type !== d.after.type) bits.push(`type ${titleCase(String(d.before.type))} to ${titleCase(String(d.after.type))}`);
        if (d.before.start !== d.after.start || d.before.end !== d.after.end) {
          bits.push(`dates ${rangeLabel(String(d.before.start), String(d.before.end))} to ${rangeLabel(String(d.after.start), String(d.after.end))}`);
        }
        if (d.before.days !== d.after.days) bits.push(`${daysLabel(Number(d.before.days))} to ${daysLabel(Number(d.after.days))}`);
        if (bits.length) return `${who} changed ${bits.join(', ')}`;
      }
      return `${who} edited it`;
    }
    case 'status_changed': return `${who} changed it to ${e.to_status ?? 'a new status'}`;
    default: return `${who} updated it`;
  }
}

const csvCell = (v: unknown): string => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function leaveToCsv(rows: LeaveRow[], nameOf: (id: string) => string): string {
  const head = ['Person', 'Type', 'Status', 'From', 'To', 'Working days', 'Half day', 'Reason', 'Decision note', 'Asked on'];
  const lines = rows.map((r) => [
    nameOf(r.employee_id), titleCase(r.leave_type), r.status, r.start_date, r.end_date, r.days_requested,
    r.is_half_day ? 'yes' : 'no', r.reason ?? '', r.review_note ?? r.rejection_reason ?? r.cancel_reason ?? '', r.created_at.slice(0, 10),
  ].map(csvCell).join(','));
  return [head.join(','), ...lines].join('\n');
}

/** The message the database sends when an annual request is more than earned so far. */
export const isOverBalanceError = (msg: string): boolean => msg.includes('OVER_BALANCE');
export const cleanDbMessage = (msg: string): string => msg.replace(/^OVER_BALANCE:\s*/, '').replace(/^Error:\s*/, '');
