import { describe, expect, it } from 'vitest';
import type { TableField, TableRecordRow } from '@/queries/useTaskModule';
import {
  dayLabel, groupByDay, inRange, lagosDay, missingReporters, monthBounds, monthsWithReports, newestFirst, rangeLabel,
  reporterIds, shiftMonth, weekBounds,
} from '../table/reportDays';

const rec = (id: string, created_at: string, data: Record<string, unknown> = {}, created_by: string | null = null): TableRecordRow => ({
  id, table_id: 't', data, position: 0, row_number: null, created_by, created_at, updated_at: created_at,
});
const person = { id: 'p', type: 'person' } as TableField;

describe('Lagos days', () => {
  it('uses the Lagos date, not UTC', () => {
    expect(lagosDay('2026-11-19T22:30:00Z')).toBe('2026-11-19'); // 23:30 in Lagos
    expect(lagosDay('2026-11-19T23:30:00Z')).toBe('2026-11-20'); // 00:30 in Lagos
    expect(lagosDay('2026-11-19T00:10:00Z')).toBe('2026-11-19');
  });
});

describe('ranges', () => {
  it('week runs Monday to Sunday', () => {
    expect(weekBounds('2026-11-19')).toEqual({ from: '2026-11-16', to: '2026-11-22' }); // Thursday
    expect(weekBounds('2026-11-16')).toEqual({ from: '2026-11-16', to: '2026-11-22' }); // Monday
    expect(weekBounds('2026-11-22')).toEqual({ from: '2026-11-16', to: '2026-11-22' }); // Sunday
    expect(weekBounds('2026-11-19', -1)).toEqual({ from: '2026-11-09', to: '2026-11-15' });
  });
  it('month bounds and shifting, across a year end', () => {
    expect(monthBounds('2026-02')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(monthBounds('2028-02').to).toBe('2028-02-29');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
  });
  it('inRange', () => {
    const today = '2026-11-19';
    expect(inRange('2026-11-16', { kind: 'week', offset: 0 }, today)).toBe(true);
    expect(inRange('2026-11-15', { kind: 'week', offset: 0 }, today)).toBe(false);
    expect(inRange('2026-11-23', { kind: 'week', offset: 0 }, today)).toBe(false);
    expect(inRange('2026-11-01', { kind: 'month', month: '2026-11' }, today)).toBe(true);
    expect(inRange('2026-10-31', { kind: 'month', month: '2026-11' }, today)).toBe(false);
    expect(inRange('2020-01-01', { kind: 'all' }, today)).toBe(true);
  });
  it('labels', () => {
    expect(rangeLabel({ kind: 'week', offset: 0 }, '2026-11-19')).toBe('This week · 16–22 Nov');
    expect(rangeLabel({ kind: 'week', offset: -1 }, '2026-11-19')).toBe('9–15 Nov');
    expect(rangeLabel({ kind: 'week', offset: 0 }, '2026-12-02')).toBe('This week · 30 Nov – 6 Dec');
    expect(rangeLabel({ kind: 'month', month: '2026-11' }, '2026-11-19')).toBe('November 2026');
    expect(rangeLabel({ kind: 'all' }, '2026-11-19')).toBe('All reports');
    expect(dayLabel('2026-11-19', '2026-11-19')).toBe('Today · Thu 19 Nov 2026');
    expect(dayLabel('2026-11-18', '2026-11-19')).toBe('Yesterday · Wed 18 Nov 2026');
    expect(dayLabel('2026-11-10', '2026-11-19')).toBe('Tue 10 Nov 2026');
  });
});

describe('grouping', () => {
  const rows = [
    rec('a', '2026-11-17T09:00:00Z'), rec('b', '2026-11-19T08:00:00Z'), rec('c', '2026-11-19T15:00:00Z'),
    rec('d', '2026-11-18T10:00:00Z'), rec('e', '2026-11-19T23:30:00Z'), // 00:30 on the 20th in Lagos
  ];
  it('newest first', () => expect(newestFirst(rows).map((r) => r.id)).toEqual(['e', 'c', 'b', 'd', 'a']));
  it('groups by Lagos day, latest day on top, newest report on top inside a day', () => {
    const g = groupByDay(newestFirst(rows));
    expect(g.map((x) => x.day)).toEqual(['2026-11-20', '2026-11-19', '2026-11-18', '2026-11-17']);
    expect(g[1].rows.map((r) => r.id)).toEqual(['c', 'b']);
  });
  it('months that have reports, plus this month', () => {
    expect(monthsWithReports([rec('x', '2026-09-03T10:00:00Z')], '2026-11-19')).toEqual(['2026-11', '2026-09']);
  });
});

describe('who has not reported', () => {
  const people = [{ id: 'u1' }, { id: 'u2' }, { id: 'u3' }];
  const day = '2026-11-19';
  it('leaves out anyone with a report that day, matched on the People question', () => {
    const recs = [rec('r1', '2026-11-19T09:00:00Z', { p: 'u1' }), rec('r2', '2026-11-18T09:00:00Z', { p: 'u2' })];
    expect(missingReporters(people, recs, [person], day).map((p) => p.id)).toEqual(['u2', 'u3']);
  });
  it('a person reporting later removes them; a report on another day does not', () => {
    const recs = [rec('r2', '2026-11-18T09:00:00Z', { p: 'u2' })];
    expect(missingReporters(people, recs, [person], day).map((p) => p.id)).toEqual(['u1', 'u2', 'u3']);
    recs.push(rec('r3', '2026-11-19T16:00:00Z', { p: 'u2' }));
    expect(missingReporters(people, recs, [person], day).map((p) => p.id)).toEqual(['u1', 'u3']);
  });
  it('a multi-person answer counts for each person', () => {
    expect(missingReporters(people, [rec('r', '2026-11-19T09:00:00Z', { p: ['u1', 'u3'] })], [person], day).map((p) => p.id)).toEqual(['u2']);
  });
  it('uses who added the row when the table has no People question', () => {
    expect(reporterIds(rec('r', '2026-11-19T09:00:00Z', {}, 'u2'), [])).toEqual(['u2']);
    expect(missingReporters(people, [rec('r', '2026-11-19T09:00:00Z', {}, 'u2')], [], day).map((p) => p.id)).toEqual(['u1', 'u3']);
  });
  it('a row with a People question left blank is not attributed to whoever added it', () => {
    expect(reporterIds(rec('r', '2026-11-19T09:00:00Z', {}, 'u2'), [person])).toEqual([]);
  });
  it('skipped people are not listed', () => {
    expect(missingReporters(people, [], [person], day, new Set(['u3'])).map((p) => p.id)).toEqual(['u1', 'u2']);
  });
  it('a report at 00:30 Lagos counts for the new day', () => {
    const recs = [rec('r', '2026-11-19T23:30:00Z', { p: 'u1' })];
    expect(missingReporters(people, recs, [person], '2026-11-19').map((p) => p.id)).toContain('u1');
    expect(missingReporters(people, recs, [person], '2026-11-20').map((p) => p.id)).not.toContain('u1');
  });
});
