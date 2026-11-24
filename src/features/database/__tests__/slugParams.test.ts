import { describe, expect, it } from 'vitest';
import { pickByParent, resolveParamsWithoutLookup, tryDecodeShortId } from '../lib/slugParams';
import { uuidToShort } from '../lib/shortId';

const BASE = '3f2b8c1e-5a4d-4b7e-9c1a-0d2e4f6a8b10';
const TABLE = '7a9e1c3d-2b4f-4d6a-8e0c-1f3a5b7d9e21';
const VIEW = 'c4d6e8f0-1a2b-4c3d-9e5f-6a7b8c9d0e32';

describe('tryDecodeShortId', () => {
  it('turns a short id back into the uuid', () => {
    expect(tryDecodeShortId(uuidToShort(BASE))).toBe(BASE);
  });
  it('returns null for a readable slug and for a uuid', () => {
    expect(tryDecodeShortId('my-expenses')).toBeNull();
    expect(tryDecodeShortId(BASE)).toBeNull();
  });
});

describe('resolveParamsWithoutLookup', () => {
  it('answers straight away when every part is a short id', () => {
    const r = resolveParamsWithoutLookup(uuidToShort(BASE), uuidToShort(TABLE), uuidToShort(VIEW));
    expect(r).toEqual({ baseId: BASE, tableId: TABLE, viewId: VIEW });
  });

  it('works with just a base, or a base and a table', () => {
    expect(resolveParamsWithoutLookup(uuidToShort(BASE))).toEqual({ baseId: BASE, tableId: undefined, viewId: undefined });
    expect(resolveParamsWithoutLookup(uuidToShort(BASE), uuidToShort(TABLE))).toEqual({ baseId: BASE, tableId: TABLE, viewId: undefined });
  });

  it('needs a lookup as soon as any part is a slug', () => {
    expect(resolveParamsWithoutLookup('main-finance', uuidToShort(TABLE))).toBeNull();
    expect(resolveParamsWithoutLookup(uuidToShort(BASE), 'all-expenses')).toBeNull();
    expect(resolveParamsWithoutLookup(uuidToShort(BASE), uuidToShort(TABLE), 'all-rows')).toBeNull();
  });

  it('has nothing to answer without a base', () => {
    expect(resolveParamsWithoutLookup(undefined)).toBeNull();
  });

  it('ignores a view when there is no table (same as the old lookup)', () => {
    expect(resolveParamsWithoutLookup(uuidToShort(BASE), undefined, uuidToShort(VIEW))).toEqual({
      baseId: BASE,
      tableId: undefined,
      viewId: undefined,
    });
  });
});

describe('pickByParent', () => {
  const rows = [
    { id: 't1', base_id: 'b1' },
    { id: 't2', base_id: 'b2' },
  ];
  it('picks the row that belongs to the parent', () => {
    expect(pickByParent(rows, 'base_id', 'b2')?.id).toBe('t2');
  });
  it('returns nothing when no row belongs to the parent, or the parent is unknown', () => {
    expect(pickByParent(rows, 'base_id', 'b9')).toBeUndefined();
    expect(pickByParent(rows, 'base_id', undefined)).toBeUndefined();
    expect(pickByParent(null, 'base_id', 'b1')).toBeUndefined();
  });
});
