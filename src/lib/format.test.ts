import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  currentYearMonth,
  orgWallClockToUtcIso,
  utcIsoToOrgWallClock,
  setTimezoneCache,
  maskAccountNumber,
  formatNaira,
} from './format';

// Regression coverage for the timezone-handling bugs found live this session:
//   - orgWallClockToUtcIso silently using the BROWSER's timezone instead of
//     the org's (via a naive toLocaleString()+new Date(string) round-trip)
//   - currentYearMonth not existing at all, so a display-label string
//     ("Mar 2026") was written into a column that needed 'YYYY-MM', which
//     made a payroll query's .lte('YYYY-MM') comparison silently never match

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('currentYearMonth', () => {
  it('returns YYYY-MM in a fixed-offset zone (Africa/Lagos, UTC+1)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-12T23:30:00Z')); // 12:30am Lagos, next day
    expect(currentYearMonth('Africa/Lagos')).toBe('2026-09');
  });

  it('rolls over to the next month when the org timezone is ahead of UTC', () => {
    vi.useFakeTimers();
    // 23:30 UTC on the 30th is already past midnight (00:30) in Lagos (UTC+1) on the 1st.
    vi.setSystemTime(new Date('2026-09-30T23:30:00Z'));
    expect(currentYearMonth('Africa/Lagos')).toBe('2026-10');
  });

  it('respects DST in a zone that observes it (America/New_York)', () => {
    vi.useFakeTimers();
    // Jan 2026 — EST (UTC-5), no DST.
    vi.setSystemTime(new Date('2026-01-15T12:00:00Z'));
    expect(currentYearMonth('America/New_York')).toBe('2026-01');
    // Jul 2026 — EDT (UTC-4), DST active. Same function, different offset.
    vi.setSystemTime(new Date('2026-07-15T12:00:00Z'));
    expect(currentYearMonth('America/New_York')).toBe('2026-07');
  });

  it('defaults to the org timezone from localStorage when no argument is given', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-01T00:30:00Z')); // 01:30 Lagos
    setTimezoneCache('Africa/Lagos');
    expect(currentYearMonth()).toBe('2026-06');
  });

  it('always produces a plain YYYY-MM string, never a human display label', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-01T00:00:00Z'));
    const result = currentYearMonth('Africa/Lagos');
    expect(result).toMatch(/^\d{4}-\d{2}$/);
    // The specific bug this guards against: a free-text label like "Mar 2026"
    // sorts AFTER any 'YYYY-MM' string lexicographically, so a
    // .lte('start_period', run.period) comparison against it is never true.
    expect(result < '9999-99').toBe(true);
  });
});

describe('orgWallClockToUtcIso / utcIsoToOrgWallClock round-trip', () => {
  it('round-trips through a fixed-offset zone (Africa/Lagos, UTC+1)', () => {
    setTimezoneCache('Africa/Lagos');
    const wallClock = '2026-09-12T06:47';
    const iso = orgWallClockToUtcIso(wallClock);
    expect(iso).toBe('2026-09-12T05:47:00.000Z');
    expect(utcIsoToOrgWallClock(iso)).toBe(wallClock);
  });

  it('round-trips through a DST-observing zone (America/New_York, summer/EDT)', () => {
    setTimezoneCache('America/New_York');
    const wallClock = '2026-07-04T09:00';
    const iso = orgWallClockToUtcIso(wallClock);
    // EDT is UTC-4 in July.
    expect(iso).toBe('2026-07-04T13:00:00.000Z');
    expect(utcIsoToOrgWallClock(iso)).toBe(wallClock);
  });

  it('round-trips through a DST-observing zone in winter (EST, no DST)', () => {
    setTimezoneCache('America/New_York');
    const wallClock = '2026-01-04T09:00';
    const iso = orgWallClockToUtcIso(wallClock);
    // EST is UTC-5 in January.
    expect(iso).toBe('2026-01-04T14:00:00.000Z');
    expect(utcIsoToOrgWallClock(iso)).toBe(wallClock);
  });

  it('does not depend on the browser/test-runner\'s own local timezone', () => {
    // Regression guard for the original bug: an earlier implementation used
    // toLocaleString() + new Date(string), which silently re-parses using
    // the *runtime's* local timezone rather than the org's configured one.
    // This assertion is the same regardless of what TZ the test process runs
    // under, which is exactly the property that was previously violated.
    setTimezoneCache('Africa/Lagos');
    expect(orgWallClockToUtcIso('2026-09-12T04:51')).toBe('2026-09-12T03:51:00.000Z');
  });
});

describe('maskAccountNumber', () => {
  it('shows only the last 4 digits', () => {
    expect(maskAccountNumber('0123456789')).toBe('******6789');
  });
  it('passes through already-masked or empty values', () => {
    expect(maskAccountNumber('****1234')).toBe('****1234');
    expect(maskAccountNumber(null)).toBe('—');
  });
});

describe('formatNaira', () => {
  it('formats with the naira glyph and 2 decimals', () => {
    expect(formatNaira(1500)).toBe('₦1,500.00');
    expect(formatNaira(0)).toBe('₦0.00');
    expect(formatNaira(null)).toBe('₦0.00');
  });
});
