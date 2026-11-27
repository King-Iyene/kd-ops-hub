import { describe, expect, it } from 'vitest';
import { datePresets } from '@/components/ui-kit/DateRangeSelect';
import { groupByDay, rangeWords, shiftRange } from '../lib/screenshotRange';

// Friday 27 November 2026
const TODAY = new Date('2026-11-27T12:00:00');

describe('the quick choices for Screenshots', () => {
  const p = Object.fromEntries(datePresets(TODAY).map((x) => [x.key, x]));
  it('offers last 7 days, this week, last week, this month and last month', () => {
    expect(p.last7).toMatchObject({ label: 'Last 7 days', start: '2026-11-21', end: '2026-11-27' });
    expect(p.week).toMatchObject({ start: '2026-11-23', end: '2026-11-27' });
    expect(p.lastweek).toMatchObject({ start: '2026-11-16', end: '2026-11-22' });
    expect(p.month).toMatchObject({ start: '2026-11-01', end: '2026-11-27' });
    expect(p.lastmonth).toMatchObject({ start: '2026-10-01', end: '2026-10-31' });
  });
});

describe('the arrows step back and forward sensibly', () => {
  it('a single day moves by a day, and never goes past today', () => {
    expect(shiftRange('2026-11-27', '2026-11-27', -1, TODAY)).toEqual({ start: '2026-11-26', end: '2026-11-26' });
    expect(shiftRange('2026-11-26', '2026-11-26', 1, TODAY)).toEqual({ start: '2026-11-27', end: '2026-11-27' });
    expect(shiftRange('2026-11-27', '2026-11-27', 1, TODAY)).toEqual({ start: '2026-11-27', end: '2026-11-27' });
  });
  it('last 7 days moves by 7 days', () => {
    expect(shiftRange('2026-11-21', '2026-11-27', -1, TODAY)).toEqual({ start: '2026-11-14', end: '2026-11-20' });
  });
  it('this week and last week move by whole weeks (Monday to Sunday)', () => {
    expect(shiftRange('2026-11-23', '2026-11-27', -1, TODAY)).toEqual({ start: '2026-11-16', end: '2026-11-22' });
    expect(shiftRange('2026-11-16', '2026-11-22', -1, TODAY)).toEqual({ start: '2026-11-09', end: '2026-11-15' });
    // forward from last week to this week stops at today
    expect(shiftRange('2026-11-16', '2026-11-22', 1, TODAY)).toEqual({ start: '2026-11-23', end: '2026-11-27' });
  });
  it('this month and last month move by whole calendar months', () => {
    expect(shiftRange('2026-11-01', '2026-11-27', -1, TODAY)).toEqual({ start: '2026-10-01', end: '2026-10-31' });
    expect(shiftRange('2026-10-01', '2026-10-31', -1, TODAY)).toEqual({ start: '2026-09-01', end: '2026-09-30' });
    expect(shiftRange('2026-10-01', '2026-10-31', 1, TODAY)).toEqual({ start: '2026-11-01', end: '2026-11-27' });
  });
  it('a custom range moves by its own length', () => {
    expect(shiftRange('2026-11-10', '2026-11-12', -1, TODAY)).toEqual({ start: '2026-11-07', end: '2026-11-09' });
  });
});

describe('showing a range', () => {
  it('groups newest-first rows by the day they were taken, keeping the order', () => {
    const rows = [
      { id: 'a', captured_at: '2026-11-27T15:00:00' }, { id: 'b', captured_at: '2026-11-27T09:00:00' },
      { id: 'c', captured_at: '2026-11-26T18:00:00' }, { id: 'd', captured_at: '2026-11-25T10:00:00' },
    ];
    const g = groupByDay(rows);
    expect(g.map((x) => [x.day, x.rows.map((r) => r.id)])).toEqual([['2026-11-27', ['a', 'b']], ['2026-11-26', ['c']], ['2026-11-25', ['d']]]);
    expect(groupByDay([])).toEqual([]);
  });
  it('says the range in words', () => {
    expect(rangeWords('2026-11-27', '2026-11-27')).toBe('27 Nov 2026');
    expect(rangeWords('2026-11-21', '2026-11-27')).toBe('21 Nov to 27 Nov 2026');
    expect(rangeWords('2025-12-28', '2026-01-03')).toBe('28 Dec 2025 to 3 Jan 2026');
  });
});
