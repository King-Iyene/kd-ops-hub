import { describe, expect, it } from 'vitest';
import { dayGroup, estDayKey, estHour, formatEst, greeting, relativeTime } from '../time';

describe('formatEst', () => {
  it('shows winter time as EST', () => {
    expect(formatEst('2026-11-19T18:07:00Z')).toBe('Nov 19, 1:07 PM EST');
  });
  it('shows summer time as EDT', () => {
    expect(formatEst('2026-07-04T18:07:00Z')).toBe('Jul 4, 2:07 PM EDT');
  });
  it('can show the time only, the year and seconds', () => {
    expect(formatEst('2026-11-19T18:07:42Z', { timeOnly: true })).toBe('1:07 PM EST');
    expect(formatEst('2026-11-19T18:07:42Z', { year: true })).toBe('Nov 19, 2026, 1:07 PM EST');
    expect(formatEst('2026-11-19T18:07:42Z', { timeOnly: true, seconds: true })).toBe('1:07:42 PM EST');
  });
  it('crosses midnight in New York, not in UTC', () => {
    expect(formatEst('2026-11-20T03:30:00Z')).toBe('Nov 19, 10:30 PM EST');
  });
  it('handles a missing or bad value', () => {
    expect(formatEst(null)).toBe('');
    expect(formatEst('nonsense', { fallback: 'never' })).toBe('never');
  });
});

describe('relativeTime', () => {
  const now = Date.parse('2026-11-19T18:00:00Z');
  it('reads seconds, minutes, hours and days', () => {
    expect(relativeTime('2026-11-19T17:59:20Z', now)).toBe('40s ago');
    expect(relativeTime('2026-11-19T17:55:00Z', now)).toBe('5m ago');
    expect(relativeTime('2026-11-19T15:00:00Z', now)).toBe('3h ago');
    expect(relativeTime('2026-11-17T18:00:00Z', now)).toBe('2d ago');
  });
  it('says just now for a moment ago and "in" for the future', () => {
    expect(relativeTime('2026-11-19T17:59:58Z', now)).toBe('just now');
    expect(relativeTime('2026-11-19T18:10:00Z', now)).toBe('in 10m');
  });
  it('falls back to the date after a month', () => {
    expect(relativeTime('2026-09-01T18:00:00Z', now)).toBe('Sep 1');
  });
  it('is empty for no value', () => { expect(relativeTime(null, now)).toBe(''); });
});

describe('Eastern day helpers', () => {
  it('finds the business day and hour in New York', () => {
    expect(estDayKey('2026-11-20T03:30:00Z')).toBe('2026-11-19');
    expect(estHour('2026-11-19T18:07:00Z')).toBe(13);
    expect(estHour('2026-11-19T05:00:00Z')).toBe(0);
  });
  it('greets by Eastern time', () => {
    expect(greeting('2026-11-19T14:00:00Z')).toBe('Good morning');
    expect(greeting('2026-11-19T18:00:00Z')).toBe('Good afternoon');
    expect(greeting('2026-11-19T23:30:00Z')).toBe('Good evening');
  });
  it('groups a conversation as Today or Earlier', () => {
    const now = '2026-11-19T18:00:00Z';
    expect(dayGroup('2026-11-19T14:00:00Z', now)).toBe('Today');
    expect(dayGroup('2026-11-18T14:00:00Z', now)).toBe('Earlier');
  });
});
