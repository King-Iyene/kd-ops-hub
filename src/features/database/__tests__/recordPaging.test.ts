import { describe, expect, it } from 'vitest';
import { LATER_PAGE_MULTIPLIER, nextOffset, pageSizeAt, rangeFor } from '../lib/recordPaging';

describe('fetching rows as you scroll', () => {
  it('starts small and then asks for bigger pages', () => {
    expect(pageSizeAt(0, 100)).toBe(100);
    expect(pageSizeAt(100, 100)).toBe(100 * LATER_PAGE_MULTIPLIER);
    expect(rangeFor(0, 100)).toEqual({ from: 0, to: 99 });
    expect(rangeFor(100, 100)).toEqual({ from: 100, to: 399 });
  });

  it('the next page starts exactly where the last one ended', () => {
    expect(nextOffset(0, 100, 3405)).toBe(100);
    expect(nextOffset(100, 100, 3405)).toBe(400);
    expect(nextOffset(400, 100, 3405)).toBe(700);
  });

  it('stops when everything has been fetched', () => {
    expect(nextOffset(3400, 100, 3405)).toBeUndefined();
    expect(nextOffset(0, 100, 100)).toBeUndefined();
    expect(nextOffset(0, 100, 0)).toBeUndefined();
  });

  it('reaching the bottom of 3,405 rows takes far fewer requests than before', () => {
    let offset: number | undefined = 0;
    let requests = 0;
    const covered: Array<[number, number]> = [];
    while (offset !== undefined) {
      const { from, to } = rangeFor(offset, 100);
      covered.push([from, to]);
      requests++;
      offset = nextOffset(offset, 100, 3405);
    }
    expect(requests).toBe(13); // was 35 pages of 100
    // No gaps and no overlaps between pages.
    for (let i = 1; i < covered.length; i++) expect(covered[i][0]).toBe(covered[i - 1][1] + 1);
    expect(covered[covered.length - 1][1]).toBeGreaterThanOrEqual(3404);
  });
});
