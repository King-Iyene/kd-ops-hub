import { describe, expect, it } from 'vitest';
import {
  MAX_RECENTS,
  addRecent,
  addRecentId,
  parseRecents,
  pruneRecents,
  recentsEqual,
  serializeRecents,
  type RecentItem,
} from '../lib/recents';

const base = (id: string): RecentItem => ({ kind: 'base', id, label: `Base ${id}`, baseId: id });
const table = (id: string, baseId = 'b1'): RecentItem => ({ kind: 'table', id, label: `Table ${id}`, baseId, tableId: id });
const view = (id: string, tableId = 't1', baseId = 'b1'): RecentItem => ({ kind: 'view', id, label: `View ${id}`, baseId, tableId });

describe('addRecent', () => {
  it('puts the newest first', () => {
    expect(addRecent([base('b1')], table('t1')).map((r) => r.id)).toEqual(['t1', 'b1']);
  });

  it('moves a repeat visit to the front without duplicating it', () => {
    const list = addRecent(addRecent([], base('b1')), table('t1'));
    expect(addRecent(list, base('b1')).map((r) => r.id)).toEqual(['b1', 't1']);
  });

  it('treats a base and a table with the same id as different items', () => {
    expect(addRecent([base('x')], table('x'))).toHaveLength(2);
  });

  it('updates the label of an item that was renamed', () => {
    const out = addRecent([table('t1')], { ...table('t1'), label: 'Renamed' });
    expect(out).toHaveLength(1);
    expect(out[0].label).toBe('Renamed');
  });

  it('keeps only the last 8 by default', () => {
    let list: RecentItem[] = [];
    for (let i = 0; i < 12; i++) list = addRecent(list, table(`t${i}`));
    expect(list).toHaveLength(MAX_RECENTS);
    expect(list[0].id).toBe('t11');
    expect(list[MAX_RECENTS - 1].id).toBe('t4');
  });
});

describe('recentsEqual', () => {
  it('compares order, label and ids', () => {
    expect(recentsEqual([base('a'), table('t')], [base('a'), table('t')])).toBe(true);
    expect(recentsEqual([base('a'), table('t')], [table('t'), base('a')])).toBe(false);
    expect(recentsEqual([table('t')], [{ ...table('t'), label: 'x' }])).toBe(false);
    expect(recentsEqual([], [base('a')])).toBe(false);
  });
});

describe('parseRecents / serializeRecents', () => {
  it('round trips', () => {
    const list = [view('v1'), table('t1'), base('b1')];
    expect(parseRecents(serializeRecents(list))).toEqual(list);
  });

  it('reads garbage as an empty list', () => {
    expect(parseRecents(null)).toEqual([]);
    expect(parseRecents('')).toEqual([]);
    expect(parseRecents('not json')).toEqual([]);
    expect(parseRecents('{"a":1}')).toEqual([]);
  });

  it('skips malformed entries and duplicates, and caps the length', () => {
    const raw = JSON.stringify([
      { kind: 'table', id: 't1', label: 'A', baseId: 'b1' },
      { kind: 'table', id: 't1', label: 'A again', baseId: 'b1' },
      { kind: 'oops', id: 'x', label: 'B', baseId: 'b1' },
      { kind: 'base', id: '', label: 'C', baseId: 'b1' },
      { kind: 'base', id: 'b2', label: 'D' },
      42,
      null,
    ]);
    expect(parseRecents(raw).map((r) => r.id)).toEqual(['t1']);

    const many = JSON.stringify(Array.from({ length: 20 }, (_, i) => table(`t${i}`)));
    expect(parseRecents(many)).toHaveLength(MAX_RECENTS);
  });
});

describe('pruneRecents', () => {
  const ctx = {
    baseIds: new Set(['b1', 'b2']),
    activeBaseId: 'b1',
    tableIds: new Set(['t1', 't2']),
    activeTableId: 't1',
    viewIds: new Set(['v1']),
  };

  it('drops entries of bases that no longer exist', () => {
    expect(pruneRecents([base('gone'), table('t9', 'gone')], ctx)).toEqual([]);
  });

  it('drops tables of the open base that were deleted, keeps tables of other bases', () => {
    const out = pruneRecents([table('t1'), table('deleted'), table('other', 'b2')], ctx).map((r) => r.id);
    expect(out).toEqual(['t1', 'other']);
  });

  it('checks views only of the open table', () => {
    const out = pruneRecents([view('v1'), view('v-deleted'), view('v-elsewhere', 't2')], ctx).map((r) => r.id);
    expect(out).toEqual(['v1', 'v-elsewhere']);
  });

  it('drops a view whose table was deleted', () => {
    expect(pruneRecents([view('v1', 'deleted-table')], ctx)).toEqual([]);
  });
});

describe('addRecentId', () => {
  it('keeps the newest first without repeats and caps the length', () => {
    expect(addRecentId(['a', 'b', 'c'], 'b')).toEqual(['b', 'a', 'c']);
    expect(addRecentId(['a'], 'z', 2)).toEqual(['z', 'a']);
    expect(addRecentId(['a', 'b'], 'z', 2)).toEqual(['z', 'a']);
  });
});
