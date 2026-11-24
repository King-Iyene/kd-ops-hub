import { describe, expect, it } from 'vitest';
import {
  addDays,
  formatYMD,
  isRealDate,
  parseTypedDate,
  parseYMD,
  splitWallClock,
  to12h,
  to24h,
} from '../lib/dateInput';

const today = { year: 2026, month: 11, day: 22 };
const p = (s: string) => parseTypedDate(s, today);

describe('parseTypedDate', () => {
  it('reads written months', () => {
    expect(p('22 Nov 2026')).toEqual({ year: 2026, month: 11, day: 22 });
    expect(p('22 november 2026')).toEqual({ year: 2026, month: 11, day: 22 });
    expect(p('Nov 22, 2026')).toEqual({ year: 2026, month: 11, day: 22 });
    expect(p('22nd Nov')).toEqual({ year: 2026, month: 11, day: 22 });
    expect(p('Sept 5 2025')).toEqual({ year: 2025, month: 9, day: 5 });
  });
  it('reads numeric dates day first', () => {
    expect(p('22/11/2026')).toEqual({ year: 2026, month: 11, day: 22 });
    expect(p('05/06/2026')).toEqual({ year: 2026, month: 6, day: 5 });
    expect(p('22-11-26')).toEqual({ year: 2026, month: 11, day: 22 });
    expect(p('22.11')).toEqual({ year: 2026, month: 11, day: 22 });
  });
  it('reads ISO dates', () => {
    expect(p('2026-11-22')).toEqual({ year: 2026, month: 11, day: 22 });
    expect(p('2026-1-5')).toEqual({ year: 2026, month: 1, day: 5 });
  });
  it('reads words and offsets', () => {
    expect(p('today')).toEqual(today);
    expect(p('Tomorrow')).toEqual({ year: 2026, month: 11, day: 23 });
    expect(p('yesterday')).toEqual({ year: 2026, month: 11, day: 21 });
    expect(p('+10d')).toEqual({ year: 2026, month: 12, day: 2 });
    expect(p('-22 days')).toEqual({ year: 2026, month: 10, day: 31 });
  });
  it('uses the current year when none is typed', () => {
    expect(p('1 Jan')).toEqual({ year: 2026, month: 1, day: 1 });
  });
  it('rejects things that are not real dates', () => {
    expect(p('31 Nov 2026')).toBeNull();
    expect(p('29/02/2026')).toBeNull();
    expect(p('32/01/2026')).toBeNull();
    expect(p('13/13/2026')).toBeNull();
    expect(p('hello')).toBeNull();
    expect(p('')).toBeNull();
    expect(p('   ')).toBeNull();
  });
  it('accepts 29 February in a leap year', () => {
    expect(p('29/02/2028')).toEqual({ year: 2028, month: 2, day: 29 });
  });
});

describe('date helpers', () => {
  it('knows real dates', () => {
    expect(isRealDate({ year: 2026, month: 2, day: 28 })).toBe(true);
    expect(isRealDate({ year: 2026, month: 2, day: 29 })).toBe(false);
    expect(isRealDate({ year: 2026, month: 0, day: 1 })).toBe(false);
  });
  it('adds days across month and year ends', () => {
    expect(addDays({ year: 2026, month: 12, day: 31 }, 1)).toEqual({ year: 2027, month: 1, day: 1 });
    expect(addDays({ year: 2026, month: 3, day: 1 }, -1)).toEqual({ year: 2026, month: 2, day: 28 });
  });
  it('formats and parses the stored form', () => {
    expect(formatYMD({ year: 2026, month: 1, day: 5 })).toBe('2026-01-05');
    expect(parseYMD('2026-01-05')).toEqual({ year: 2026, month: 1, day: 5 });
    expect(parseYMD('2026-01-05T10:00:00Z')).toEqual({ year: 2026, month: 1, day: 5 });
    expect(parseYMD('nope')).toBeNull();
    expect(parseYMD('2026-02-30')).toBeNull();
  });
  it('splits a wall clock time', () => {
    expect(splitWallClock('2026-11-22T14:30')).toEqual({ date: { year: 2026, month: 11, day: 22 }, hour24: 14, minute: 30 });
    expect(splitWallClock('2026-11-22')).toBeNull();
  });
  it('converts between 12 and 24 hour clocks', () => {
    expect(to12h(0)).toEqual({ hour: 12, period: 'AM' });
    expect(to12h(12)).toEqual({ hour: 12, period: 'PM' });
    expect(to12h(15)).toEqual({ hour: 3, period: 'PM' });
    expect(to24h(12, 'AM')).toBe(0);
    expect(to24h(12, 'PM')).toBe(12);
    expect(to24h(3, 'PM')).toBe(15);
    for (let h = 0; h < 24; h++) {
      const { hour, period } = to12h(h);
      expect(to24h(hour, period)).toBe(h);
    }
  });
});
