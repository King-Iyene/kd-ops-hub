import { describe, expect, it } from 'vitest';
import {
  formatDbDate,
  formatDbDateTime,
  formatDbTime,
  formatDbTooltip,
  formatRelative,
} from '../lib/dates';

const LAGOS = 'Africa/Lagos'; // UTC+1, no daylight saving

describe('formatDbDate', () => {
  it('writes the month so day and month cannot be confused', () => {
    expect(formatDbDate('2026-09-06')).toBe('6 Sep 2026');
    expect(formatDbDate('2026-06-09')).toBe('9 Jun 2026');
  });
  it('keeps a plain date on the same calendar day in any timezone', () => {
    expect(formatDbDate('2026-11-22', 'America/Toronto')).toBe('22 Nov 2026');
    expect(formatDbDate('2026-11-22', 'Pacific/Kiritimati')).toBe('22 Nov 2026');
  });
  it('moves a timestamp into the requested timezone', () => {
    // 23:30 UTC on 5 Sep is already 6 Sep in Lagos.
    expect(formatDbDate('2026-09-05T23:30:00Z', LAGOS)).toBe('6 Sep 2026');
    expect(formatDbDate('2026-09-05T23:30:00Z', 'UTC')).toBe('5 Sep 2026');
  });
  it('is empty for missing or invalid values', () => {
    expect(formatDbDate(null)).toBe('');
    expect(formatDbDate('')).toBe('');
    expect(formatDbDate('not a date')).toBe('');
  });
});

describe('formatDbTime', () => {
  it('uses a 12 hour clock with am and pm', () => {
    expect(formatDbTime('2026-09-06T14:15:00Z', 'UTC')).toBe('2:15 pm');
    expect(formatDbTime('2026-09-06T00:05:00Z', 'UTC')).toBe('12:05 am');
    expect(formatDbTime('2026-09-06T12:00:00Z', 'UTC')).toBe('12:00 pm');
  });
});

describe('formatDbDateTime', () => {
  it('drops seconds and the timezone name', () => {
    expect(formatDbDateTime('2026-09-06T13:15:42Z', LAGOS)).toBe('6 Sep 2026, 2:15 pm');
  });
  it('never invents a time for a plain date', () => {
    expect(formatDbDateTime('2026-09-06', LAGOS)).toBe('6 Sep 2026');
  });
});

describe('formatRelative', () => {
  const now = new Date('2026-11-22T15:00:00Z'); // 4 pm in Lagos

  it('says just now inside the first minute', () => {
    expect(formatRelative('2026-11-22T14:59:40Z', now, LAGOS)).toBe('Just now');
  });
  it('counts minutes', () => {
    expect(formatRelative('2026-11-22T14:48:00Z', now, LAGOS)).toBe('12 min ago');
  });
  it('counts hours on the same day', () => {
    expect(formatRelative('2026-11-22T11:00:00Z', now, LAGOS)).toBe('4 h ago');
  });
  it('names yesterday with the time', () => {
    expect(formatRelative('2026-11-21T15:30:00Z', now, LAGOS)).toBe('Yesterday, 4:30 pm');
  });
  it('counts days up to a week', () => {
    expect(formatRelative('2026-11-19T10:00:00Z', now, LAGOS)).toBe('3 days ago');
  });
  it('switches to the absolute date after a week', () => {
    expect(formatRelative('2026-11-10T10:00:00Z', now, LAGOS)).toBe('10 Nov 2026');
  });
  it('decides yesterday by calendar day in the workspace timezone, not by 24 hours', () => {
    // 23:30 UTC on the 21st is 00:30 on the 22nd in Lagos: same day as "now".
    expect(formatRelative('2026-11-21T23:30:00Z', now, LAGOS)).toBe('15 h ago');
  });
  it('shows a future moment as an absolute date and time', () => {
    expect(formatRelative('2026-11-23T10:00:00Z', now, LAGOS)).toBe('23 Nov 2026, 11:00 am');
  });
});

describe('formatDbTooltip', () => {
  it('gives the weekday, the date, the time and the timezone', () => {
    expect(formatDbTooltip('2026-09-06T13:15:00Z', LAGOS)).toBe('Sunday 6 Sep 2026, 2:15 pm (Africa/Lagos)');
  });
  it('gives only the weekday and date for a plain date', () => {
    expect(formatDbTooltip('2026-09-06', LAGOS)).toBe('Sunday 6 Sep 2026');
  });
});

describe('24 hour clock', () => {
  it('writes the time without am or pm', () => {
    expect(formatDbTime('2026-09-06T14:15:00Z', 'UTC', false)).toBe('14:15');
    expect(formatDbTime('2026-09-06T00:05:00Z', 'UTC', false)).toBe('00:05');
    expect(formatDbDateTime('2026-09-06T13:15:00Z', LAGOS, false)).toBe('6 Sep 2026, 14:15');
  });
});
