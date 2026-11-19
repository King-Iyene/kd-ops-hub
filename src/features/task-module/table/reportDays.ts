import { addDays, addMonths, endOfMonth, format, parseISO, startOfMonth, startOfWeek } from 'date-fns';
import type { TableField, TableRecordRow } from '@/queries/useTaskModule';
import { asList } from './fieldTypes';

// Reports are table rows. A report belongs to the day in the table's Report
// Date field; a row with no date there (or a table with no such field) falls
// back to the day it was added, in Lagos time — the company's timezone — so a
// report added at 00:30 counts for that day and not the day before.
// Days are plain "yyyy-MM-dd" strings.

const LAGOS = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit' });

/** The Lagos calendar day of a timestamp. */
export function lagosDay(iso: string | Date): string {
  return LAGOS.format(typeof iso === 'string' ? new Date(iso) : iso);
}

export const todayLagos = (now: Date = new Date()) => lagosDay(now);

const ymd = (d: Date) => format(d, 'yyyy-MM-dd');

/** Which Date field a table's reports are dated by. `null` = the day the row was added. */
export type ReportDateField = Pick<TableField, 'id' | 'type'> | null;
export type DayOf = (r: TableRecordRow) => string;

/**
 * The table's Report Date field, from its saved setting:
 * unset → the first Date field (if any); 'created_at' → the day the row was
 * added; a field id → that field (back to automatic if it is gone or not a Date).
 */
export function resolveReportDateField(setting: string | null | undefined, fields: TableField[]): ReportDateField {
  const dates = fields.filter((f) => f.type === 'date');
  if (setting === 'created_at') return null;
  if (setting) {
    const chosen = dates.find((f) => f.id === setting);
    if (chosen) return chosen;
  }
  return dates[0] ?? null;
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}/;

/** The day a report is for. */
export function reportDay(record: TableRecordRow, field: ReportDateField): string {
  if (field) {
    const v = record.data[field.id];
    if (typeof v === 'string' && ISO_DAY.test(v)) return v.slice(0, 10);
  }
  return lagosDay(record.created_at);
}

export const dayOfFor = (field: ReportDateField): DayOf => (r) => reportDay(r, field);

export type ReportRange =
  | { kind: 'week'; offset: number }   // 0 = this week, -1 = last week …
  | { kind: 'month'; month: string }   // "yyyy-MM"
  | { kind: 'all' };

export const DEFAULT_RANGE: ReportRange = { kind: 'week', offset: 0 };

/** Monday to Sunday of the week `offset` weeks from the week containing `today`. */
export function weekBounds(today: string, offset = 0): { from: string; to: string } {
  const monday = addDays(startOfWeek(parseISO(today), { weekStartsOn: 1 }), offset * 7);
  return { from: ymd(monday), to: ymd(addDays(monday, 6)) };
}

export function monthBounds(month: string): { from: string; to: string } {
  const first = startOfMonth(parseISO(`${month}-01`));
  return { from: ymd(first), to: ymd(endOfMonth(first)) };
}

export const monthOf = (day: string) => day.slice(0, 7);
export const shiftMonth = (month: string, by: number) => format(addMonths(parseISO(`${month}-01`), by), 'yyyy-MM');

export function rangeBounds(range: ReportRange, today: string): { from: string; to: string } | null {
  if (range.kind === 'all') return null;
  return range.kind === 'week' ? weekBounds(today, range.offset) : monthBounds(range.month);
}

export function inRange(day: string, range: ReportRange, today: string): boolean {
  const b = rangeBounds(range, today);
  return !b || (day >= b.from && day <= b.to);
}

/** "Today", "Yesterday", or "Wed 18 Nov 2026". */
export function dayLabel(day: string, today: string): string {
  const long = format(parseISO(day), 'EEE d MMM yyyy');
  if (day === today) return `Today · ${long}`;
  if (day === ymd(addDays(parseISO(today), -1))) return `Yesterday · ${long}`;
  return long;
}

export function rangeLabel(range: ReportRange, today: string): string {
  const b = rangeBounds(range, today);
  if (!b) return 'All reports';
  if (range.kind === 'month') return format(parseISO(b.from), 'MMMM yyyy');
  const a = parseISO(b.from);
  const z = parseISO(b.to);
  const span = a.getMonth() === z.getMonth() ? `${format(a, 'd')}–${format(z, 'd MMM')}` : `${format(a, 'd MMM')} – ${format(z, 'd MMM')}`;
  return range.kind === 'week' && range.offset === 0 ? `This week · ${span}` : span;
}

/** Latest report day first; within a day, the report added last first. */
export function newestFirst(rows: TableRecordRow[], dayOf: DayOf): TableRecordRow[] {
  return [...rows].sort((a, b) => dayOf(b).localeCompare(dayOf(a)) || b.created_at.localeCompare(a.created_at));
}

/** Groups already-ordered rows by day, latest day first. Row order inside a day is kept. */
export function groupByDay(rows: TableRecordRow[], dayOf: DayOf): { day: string; rows: TableRecordRow[] }[] {
  const byDay = new Map<string, TableRecordRow[]>();
  for (const r of rows) {
    const d = dayOf(r);
    const list = byDay.get(d);
    if (list) list.push(r); else byDay.set(d, [r]);
  }
  return [...byDay.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([day, rs]) => ({ day, rows: rs }));
}

/** Months that have reports, plus the current one, latest first. */
export function monthsWithReports(rows: TableRecordRow[], today: string, dayOf: DayOf): string[] {
  const set = new Set<string>([monthOf(today)]);
  rows.forEach((r) => set.add(monthOf(dayOf(r))));
  return [...set].sort().reverse();
}

/** Who a report is from: the People question(s) on the row, or whoever added the row when the table has none. */
export function reporterIds(record: TableRecordRow, personFields: TableField[]): string[] {
  const ids = personFields.flatMap((f) => asList(record.data[f.id]));
  if (ids.length) return ids;
  return personFields.length === 0 && record.created_by ? [record.created_by] : [];
}

/** People who have not reported for `day`. Anyone with a report that day is left out. */
export function missingReporters<P extends { id: string }>(
  people: P[], records: TableRecordRow[], personFields: TableField[], day: string, dayOf: DayOf, skipped: ReadonlySet<string> = new Set(),
): P[] {
  const done = new Set<string>();
  for (const r of records) if (dayOf(r) === day) reporterIds(r, personFields).forEach((id) => done.add(id));
  return people.filter((p) => !done.has(p.id) && !skipped.has(p.id));
}
