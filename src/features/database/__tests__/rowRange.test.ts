import { describe, it, expect } from 'vitest';
import { rowIdsBetween } from '../lib/rowRange';

const ids = ['a', 'b', 'c', 'd', 'e'];

describe('rowIdsBetween', () => {
  it('includes both ends, going down', () => {
    expect(rowIdsBetween(ids, 'b', 'd')).toEqual(['b', 'c', 'd']);
  });
  it('works going up too', () => {
    expect(rowIdsBetween(ids, 'd', 'b')).toEqual(['b', 'c', 'd']);
  });
  it('is just the row when both clicks are the same', () => {
    expect(rowIdsBetween(ids, 'c', 'c')).toEqual(['c']);
  });
  it('is empty if a row is not in the list', () => {
    expect(rowIdsBetween(ids, 'a', 'zzz')).toEqual([]);
  });
});
