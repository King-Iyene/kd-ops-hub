import { describe, expect, it } from 'vitest';
import { chipWidth, chipsThatFit, chunk, idsKey, linkLabel, mapJunctionRows } from '../lib/linkBatch';

describe('chunk', () => {
  it('splits into groups no larger than the size', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
  it('returns nothing for an empty list', () => {
    expect(chunk([], 3)).toEqual([]);
  });
  it('keeps everything together when the size is not positive', () => {
    expect(chunk([1, 2, 3], 0)).toEqual([[1, 2, 3]]);
  });
});

describe('mapJunctionRows', () => {
  const ids = new Set(['e1', 'e2']);

  it('reads a link stored once, with the requested record on the target side', () => {
    // Expenses.Month is stored as source = month row, target = expense row.
    const map = mapJunctionRows([{ source_id: 'm1', target_id: 'e1' }], ids);
    expect(map.get('e1')).toEqual(['m1']);
    expect(map.has('e2')).toBe(false);
  });

  it('reads a link stored once, with the requested record on the source side', () => {
    const map = mapJunctionRows([{ source_id: 'e2', target_id: 'p1' }], ids);
    expect(map.get('e2')).toEqual(['p1']);
  });

  it('does not double count a link stored in both directions', () => {
    const map = mapJunctionRows(
      [
        { source_id: 'e1', target_id: 'p1' },
        { source_id: 'p1', target_id: 'e1' },
      ],
      ids,
    );
    expect(map.get('e1')).toEqual(['p1']);
  });

  it('keeps several links in row order and ignores rows for other records', () => {
    const map = mapJunctionRows(
      [
        { source_id: 'e1', target_id: 'a' },
        { source_id: 'x', target_id: 'y' },
        { source_id: 'e1', target_id: 'b' },
      ],
      ids,
    );
    expect(map.get('e1')).toEqual(['a', 'b']);
  });

  it('handles a record linked to another requested record', () => {
    const map = mapJunctionRows([{ source_id: 'e1', target_id: 'e2' }], ids);
    expect(map.get('e1')).toEqual(['e2']);
    expect(map.get('e2')).toEqual(['e1']);
  });

  it('skips rows with a blank id', () => {
    const map = mapJunctionRows([{ source_id: 'e1', target_id: '' }], ids);
    expect(map.size).toBe(0);
  });
});

describe('linkLabel', () => {
  it('returns text as is', () => {
    expect(linkLabel('October 2026')).toBe('October 2026');
  });
  it('turns a number into text', () => {
    expect(linkLabel(42)).toBe('42');
  });
  it('is empty for null and undefined', () => {
    expect(linkLabel(null)).toBe('');
    expect(linkLabel(undefined)).toBe('');
  });
  it('reads the readable part of an imported JSON value', () => {
    expect(linkLabel({ value: 'Paid' })).toBe('Paid');
    expect(linkLabel({ title: 'Founders' })).toBe('Founders');
    expect(linkLabel({ other: 1 })).toBe('');
  });
});

describe('chipsThatFit', () => {
  it('shows nothing for an empty list', () => {
    expect(chipsThatFit([], 200)).toBe(0);
  });
  it('shows one chip even when the cell is tiny', () => {
    expect(chipsThatFit(['October 2026', 'November 2026'], 10)).toBe(1);
  });
  it('shows every chip when they all fit', () => {
    expect(chipsThatFit(['May', 'June'], 400)).toBe(2);
  });
  it('keeps room for the +N badge when some are hidden', () => {
    const labels = ['October 2026', 'November 2026', 'December 2026'];
    const fit = chipsThatFit(labels, 160);
    expect(fit).toBeGreaterThanOrEqual(1);
    expect(fit).toBeLessThan(labels.length);
    const used = labels.slice(0, fit).reduce((s, l, i) => s + chipWidth(l) + (i > 0 ? 4 : 0), 0);
    expect(used + 34).toBeLessThanOrEqual(160 + (fit === 1 ? chipWidth(labels[0]) : 0));
  });
  it('never gives a chip more than the maximum width', () => {
    expect(chipWidth('x'.repeat(500))).toBe(200);
  });
});

describe('idsKey', () => {
  it('changes when the list changes at either end or in length', () => {
    expect(idsKey(['a', 'b', 'c'])).not.toBe(idsKey(['a', 'b']));
    expect(idsKey(['a', 'b', 'c'])).not.toBe(idsKey(['x', 'b', 'c']));
    expect(idsKey([])).toBe('0');
  });
});
