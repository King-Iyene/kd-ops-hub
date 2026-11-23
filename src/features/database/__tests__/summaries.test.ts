import { describe, expect, it } from 'vitest';
import { countChecked, dateExtremes, isFilled, median, toNumbers, uniqueCount } from '../lib/summaries';

describe('column summaries', () => {
  it('knows what counts as filled', () => {
    expect(isFilled('x')).toBe(true);
    expect(isFilled(0)).toBe(true);
    expect(isFilled(false)).toBe(true);
    expect(isFilled('')).toBe(false);
    expect(isFilled(null)).toBe(false);
    expect(isFilled([])).toBe(false);
    expect(isFilled(['a'])).toBe(true);
  });
  it('reads numbers out of mixed values', () => {
    expect(toNumbers([1, '2.5', 'x', null, '', 3])).toEqual([1, 2.5, 3]);
  });
  it('finds the median', () => {
    expect(median([])).toBeNull();
    expect(median([5])).toBe(5);
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
  it('counts distinct values and ignores blanks', () => {
    expect(uniqueCount(['a', 'b', 'a', '', null])).toBe(2);
    expect(uniqueCount([['x', 'y'], ['x', 'y'], ['x']])).toBe(2);
    expect(uniqueCount([1, '1'])).toBe(1);
  });
  it('finds the earliest and latest date', () => {
    expect(dateExtremes(['2026-03-02', '2025-12-30', '2026-11-22', '', null, 'junk'])).toEqual({
      earliest: '2025-12-30',
      latest: '2026-11-22',
    });
    expect(dateExtremes([])).toEqual({ earliest: null, latest: null });
  });
  it('counts ticked boxes', () => {
    expect(countChecked([true, false, true, null, 'true', 1])).toBe(4);
  });
});
