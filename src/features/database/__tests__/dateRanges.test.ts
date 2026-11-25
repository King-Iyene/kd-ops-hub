import { describe, expect, it } from 'vitest';
import { normalizeDateFilter, resolveCalendarRange, resolveDateToken, toDateString } from '../lib/dateRanges';

// Wednesday 25 November 2026, mid-day.
const NOW = new Date(2026, 10, 25, 12, 0, 0);

describe('moving dates', () => {
  it('today, yesterday and tomorrow in the viewer\'s own calendar', () => {
    expect(resolveDateToken('today', NOW)).toBe('2026-11-25');
    expect(resolveDateToken('yesterday', NOW)).toBe('2026-11-24');
    expect(resolveDateToken('tomorrow', NOW)).toBe('2026-11-26');
    expect(toDateString(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('calendar months, including across a year end', () => {
    expect(resolveCalendarRange('thisCalendarMonth', NOW)).toEqual({ from: '2026-11-01', to: '2026-11-30' });
    expect(resolveCalendarRange('lastCalendarMonth', NOW)).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(resolveCalendarRange('nextCalendarMonth', NOW)).toEqual({ from: '2026-12-01', to: '2026-12-31' });
    expect(resolveCalendarRange('nextCalendarMonth', new Date(2026, 11, 15))).toEqual({ from: '2027-01-01', to: '2027-01-31' });
    expect(resolveCalendarRange('lastCalendarMonth', new Date(2026, 0, 15))).toEqual({ from: '2025-12-01', to: '2025-12-31' });
  });

  it('weeks start on Monday', () => {
    expect(resolveCalendarRange('thisCalendarWeek', NOW)).toEqual({ from: '2026-11-23', to: '2026-11-29' });
    expect(resolveCalendarRange('lastCalendarWeek', NOW)).toEqual({ from: '2026-11-16', to: '2026-11-22' });
    expect(resolveCalendarRange('thisCalendarWeek', new Date(2026, 10, 29))).toEqual({ from: '2026-11-23', to: '2026-11-29' });
  });

  it('quarters and years', () => {
    expect(resolveCalendarRange('thisCalendarQuarter', NOW)).toEqual({ from: '2026-10-01', to: '2026-12-31' });
    expect(resolveCalendarRange('nextCalendarQuarter', NOW)).toEqual({ from: '2027-01-01', to: '2027-03-31' });
    expect(resolveCalendarRange('thisCalendarYear', NOW)).toEqual({ from: '2026-01-01', to: '2026-12-31' });
    expect(resolveCalendarRange('lastCalendarYear', NOW)).toEqual({ from: '2025-01-01', to: '2025-12-31' });
    expect(resolveCalendarRange('pastWeek', NOW)).toBeNull();
  });

  it('turns a filter on a date column into one the database understands', () => {
    expect(normalizeDateFilter('isWithin', 'thisCalendarMonth', 'DATE', NOW)).toEqual({ operator: 'isBetween', value: ['2026-11-01', '2026-11-30'] });
    expect(normalizeDateFilter('eq', 'today', 'DATE', NOW)).toEqual({ operator: 'eq', value: '2026-11-25' });
    expect(normalizeDateFilter('gt', 'yesterday', 'DATE', NOW)).toEqual({ operator: 'gt', value: '2026-11-24' });
    expect(normalizeDateFilter('lt', 'tomorrow', 'DATE', NOW)).toEqual({ operator: 'lt', value: '2026-11-26' });
  });

  it('a timestamp column gets the whole day, not just midnight', () => {
    expect(normalizeDateFilter('eq', 'today', 'TIMESTAMPTZ', NOW)).toEqual({ operator: 'isBetween', value: ['2026-11-25T00:00:00', '2026-11-25T23:59:59.999'] });
    expect(normalizeDateFilter('gt', 'today', 'TIMESTAMPTZ', NOW)).toEqual({ operator: 'gt', value: '2026-11-25T23:59:59.999' });
    expect(normalizeDateFilter('isWithin', 'thisCalendarMonth', 'TIMESTAMPTZ', NOW).value).toEqual(['2026-11-01T00:00:00', '2026-11-30T23:59:59.999']);
  });

  it('never touches text columns or ordinary values', () => {
    expect(normalizeDateFilter('eq', 'today', 'TEXT', NOW)).toEqual({ operator: 'eq', value: 'today' });
    expect(normalizeDateFilter('contains', 'today', 'TEXT', NOW)).toEqual({ operator: 'contains', value: 'today' });
    expect(normalizeDateFilter('eq', '2026-01-01', 'DATE', NOW)).toEqual({ operator: 'eq', value: '2026-01-01' });
    expect(normalizeDateFilter('isWithin', 'pastWeek', 'DATE', NOW)).toEqual({ operator: 'isWithin', value: 'pastWeek' });
  });
});
