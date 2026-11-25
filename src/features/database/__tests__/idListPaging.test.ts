import { describe, expect, it } from 'vitest';
import { MAX_IDS_PER_REQUEST, chunkIds, compareRows, needsSplitting, pickPageIds } from '../lib/idListPaging';

describe('splitting a long list of ids', () => {
  it('keeps every id and no group is too long', () => {
    const ids = Array.from({ length: 1689 }, (_, i) => `id${i}`);
    const groups = chunkIds(ids);
    expect(groups.flat()).toEqual(ids);
    expect(Math.max(...groups.map((g) => g.length))).toBeLessThanOrEqual(MAX_IDS_PER_REQUEST);
    expect(groups).toHaveLength(Math.ceil(1689 / MAX_IDS_PER_REQUEST));
  });

  it('only splits when it has to', () => {
    expect(needsSplitting(null)).toBe(false);
    expect(needsSplitting(Array(MAX_IDS_PER_REQUEST).fill('x'))).toBe(false);
    expect(needsSplitting(Array(MAX_IDS_PER_REQUEST + 1).fill('x'))).toBe(true);
  });

  it('a 1,700-id request address would have been far too long', () => {
    const address = '/expenses?id=in.(' + Array.from({ length: 1700 }, () => '3f2b8a52-7c1e-4d19-9a0b-5e6d7c8f9a10').join(',') + ')';
    expect(address.length).toBeGreaterThan(60_000);
    const longest = Math.max(...chunkIds(Array.from({ length: 1700 }, () => '3f2b8a52-7c1e-4d19-9a0b-5e6d7c8f9a10')).map((g) => g.join(',').length));
    expect(longest).toBeLessThan(5_000);
  });
});

describe('putting the groups back in order', () => {
  const order = [
    { col: 'nc_order', ascending: true },
    { col: 'created_at', ascending: true },
    { col: 'id', ascending: true },
  ];

  it('sorts rows that came from different groups into one list and cuts the page', () => {
    const rows = [
      { id: 'c', nc_order: 3, created_at: '2026-01-03' },
      { id: 'a', nc_order: 1, created_at: '2026-01-01' },
      { id: 'd', nc_order: 4, created_at: '2026-01-04' },
      { id: 'b', nc_order: 2, created_at: '2026-01-02' },
    ];
    expect(pickPageIds(rows, order, 0, 1)).toEqual(['a', 'b']);
    expect(pickPageIds(rows, order, 2, 3)).toEqual(['c', 'd']);
  });

  it('ties fall back to the id, so pages never swap rows', () => {
    const rows = [
      { id: 'z', nc_order: 1, created_at: 'x' },
      { id: 'a', nc_order: 1, created_at: 'x' },
    ];
    expect(pickPageIds(rows, order, 0, 1)).toEqual(['a', 'z']);
  });

  it('empty values go last when ascending and first when descending, like the database', () => {
    const rows = [
      { id: '1', cost: null },
      { id: '2', cost: 5 },
      { id: '3', cost: 1 },
    ];
    expect(pickPageIds(rows, [{ col: 'cost', ascending: true }, { col: 'id', ascending: true }], 0, 2)).toEqual(['3', '2', '1']);
    expect(pickPageIds(rows, [{ col: 'cost', ascending: false }, { col: 'id', ascending: true }], 0, 2)).toEqual(['1', '2', '3']);
  });

  it('a row seen twice counts once', () => {
    const rows = [{ id: 'a', nc_order: 1 }, { id: 'a', nc_order: 1 }, { id: 'b', nc_order: 2 }];
    expect(pickPageIds(rows, [{ col: 'nc_order', ascending: true }], 0, 5)).toEqual(['a', 'b']);
  });

  it('compares numbers as numbers', () => {
    expect(compareRows({ id: 'a', n: 9 }, { id: 'b', n: 10 }, [{ col: 'n', ascending: true }])).toBeLessThan(0);
  });
});
