import { describe, expect, it } from 'vitest';
import { formatDuration, normalizeDurationFormat, parseDuration } from '../lib/duration';

describe('formatDuration', () => {
  it('shows hours and minutes', () => {
    expect(formatDuration(5400)).toBe('1:30');
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(3600 * 26 + 60 * 5)).toBe('26:05');
  });
  it('rounds to the nearest minute in h:mm', () => {
    expect(formatDuration(3599)).toBe('1:00');
    expect(formatDuration(29)).toBe('0:00');
    expect(formatDuration(31)).toBe('0:01');
  });
  it('shows seconds and fractions', () => {
    expect(formatDuration(5415, 'h:mm:ss')).toBe('1:30:15');
    expect(formatDuration(5415.5, 'h:mm:ss.s')).toBe('1:30:15.5');
    expect(formatDuration(5415.25, 'h:mm:ss.ss')).toBe('1:30:15.25');
    expect(formatDuration(5415.125, 'h:mm:ss.sss')).toBe('1:30:15.125');
  });
  it('carries rounding into the next unit', () => {
    expect(formatDuration(59.96, 'h:mm:ss.s')).toBe('0:01:00.0');
  });
  it('keeps the sign of a negative duration', () => {
    expect(formatDuration(-5400)).toBe('-1:30');
  });
  it('is empty for values that are not numbers', () => {
    expect(formatDuration(NaN)).toBe('');
  });
});

describe('parseDuration', () => {
  it('reads colon forms by the field format', () => {
    expect(parseDuration('1:30', 'h:mm')).toBe(5400);
    expect(parseDuration('1:30', 'h:mm:ss')).toBe(90);
    expect(parseDuration('1:30:15', 'h:mm')).toBe(5415);
  });
  it('reads unit forms', () => {
    expect(parseDuration('1h 30m')).toBe(5400);
    expect(parseDuration('1h30m')).toBe(5400);
    expect(parseDuration('90m')).toBe(5400);
    expect(parseDuration('1.5h')).toBe(5400);
    expect(parseDuration('45s')).toBe(45);
    expect(parseDuration('2 hours 5 minutes')).toBe(7500);
    expect(parseDuration('1h 30')).toBe(5400);
  });
  it('reads a plain number as minutes in h:mm and seconds otherwise', () => {
    expect(parseDuration('90', 'h:mm')).toBe(5400);
    expect(parseDuration('90', 'h:mm:ss')).toBe(90);
  });
  it('reads negatives', () => {
    expect(parseDuration('-1:30')).toBe(-5400);
  });
  it('treats blank text as no value and junk as invalid', () => {
    expect(parseDuration('')).toBeNull();
    expect(parseDuration('   ')).toBeNull();
    expect(parseDuration('abc')).toBeNull();
    expect(parseDuration('1:2:3:4')).toBeNull();
    expect(parseDuration('1:xx')).toBeNull();
  });
  it('round trips what it displays', () => {
    for (const s of [0, 60, 5400, 5415, 86399]) {
      expect(parseDuration(formatDuration(s, 'h:mm:ss'), 'h:mm:ss')).toBe(s);
    }
  });
});

describe('normalizeDurationFormat', () => {
  it('falls back to h:mm', () => {
    expect(normalizeDurationFormat(undefined)).toBe('h:mm');
    expect(normalizeDurationFormat('nonsense')).toBe('h:mm');
    expect(normalizeDurationFormat('h:mm:ss')).toBe('h:mm:ss');
  });
});
