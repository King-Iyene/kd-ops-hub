import { describe, expect, it } from 'vitest';
import {
  HIDDEN_TABLE_PATTERN,
  countHiddenTables,
  filterVisibleTables,
  isHiddenByRule,
  isTableHidden,
  pickTabTables,
} from '../lib/tableVisibility';
import { isModShortcut } from '../lib/shortcuts';
import { parseFlag, parseIdList, pinnedFirst, toggleId } from '../lib/navStorage';

const t = (id: string, name: string) => ({ id, name });

describe('isHiddenByRule', () => {
  it('hides copies, outdated, wip and grid view tables', () => {
    for (const name of ['Expenses copy', 'Expenses (Copy)', 'Old Outdated list', 'Planner WIP', 'wip - taxes', 'All Grid View', 'Copy of Income']) {
      expect(isHiddenByRule(name), name).toBe(true);
    }
  });

  it('is case insensitive', () => {
    expect(isHiddenByRule('EXPENSES COPY')).toBe(true);
    expect(isHiddenByRule('outdated')).toBe(true);
    expect(isHiddenByRule('Wip')).toBe(true);
  });

  it('keeps ordinary tables visible', () => {
    for (const name of ['Expenses', 'Income', 'Budget 2025', 'Clients', 'Whipple', 'Wiped', 'Gridview']) {
      expect(isHiddenByRule(name), name).toBe(false);
    }
  });

  it('only treats wip as a whole word', () => {
    expect(isHiddenByRule('swipe')).toBe(false);
    expect(isHiddenByRule('Wip tracker')).toBe(true);
  });

  it('handles empty names', () => {
    expect(isHiddenByRule('')).toBe(false);
    expect(isHiddenByRule(null)).toBe(false);
    expect(isHiddenByRule(undefined)).toBe(false);
  });

  it('exposes the pattern as case insensitive', () => {
    expect(HIDDEN_TABLE_PATTERN.flags).toContain('i');
  });
});

describe('filterVisibleTables / countHiddenTables', () => {
  const tables = [t('1', 'Expenses'), t('2', 'Expenses copy'), t('3', 'Income'), t('4', 'Planner WIP')];

  it('hides rule matches by default', () => {
    expect(filterVisibleTables(tables, { showHidden: false }).map((x) => x.id)).toEqual(['1', '3']);
  });

  it('shows everything when asked', () => {
    expect(filterVisibleTables(tables, { showHidden: true }).map((x) => x.id)).toEqual(['1', '2', '3', '4']);
  });

  it('always keeps the open table, even if it is hidden by rule', () => {
    expect(filterVisibleTables(tables, { showHidden: false, activeTableId: '2' }).map((x) => x.id)).toEqual(['1', '2', '3']);
  });

  it('also hides tables hidden by hand, and keeps the open one', () => {
    const manual = new Set(['1']);
    expect(filterVisibleTables(tables, { showHidden: false, manualHidden: manual }).map((x) => x.id)).toEqual(['3']);
    expect(filterVisibleTables(tables, { showHidden: false, manualHidden: manual, activeTableId: '1' }).map((x) => x.id)).toEqual(['1', '3']);
  });

  it('counts what the toggle would reveal, not the open table', () => {
    expect(countHiddenTables(tables, {})).toBe(2);
    expect(countHiddenTables(tables, { activeTableId: '2' })).toBe(1);
    expect(countHiddenTables(tables, { manualHidden: new Set(['1', '2']) })).toBe(3);
    expect(countHiddenTables([t('1', 'Plain')], {})).toBe(0);
  });

  it('isTableHidden combines the rule and the manual set', () => {
    expect(isTableHidden(t('1', 'Plain'))).toBe(false);
    expect(isTableHidden(t('1', 'Plain'), new Set(['1']))).toBe(true);
    expect(isTableHidden(t('2', 'x copy'))).toBe(true);
  });
});

describe('pickTabTables', () => {
  const tables = Array.from({ length: 10 }, (_, i) => ({ id: `t${i}` }));
  const ids = (list: Array<{ id: string }>) => list.map((x) => x.id);

  it('shows the open table plus the most recent ones that fit, in table order', () => {
    const out = pickTabTables(tables, { activeId: 't5', recentIds: ['t5', 't2', 't8', 't1'], max: 3 });
    expect(ids(out)).toEqual(['t2', 't5', 't8']);
  });

  it('always includes the open table even when it is not in the recent list', () => {
    expect(ids(pickTabTables(tables, { activeId: 't9', recentIds: ['t1', 't2'], max: 2 }))).toEqual(['t1', 't9']);
  });

  it('allows at least one tab', () => {
    expect(ids(pickTabTables(tables, { activeId: 't4', recentIds: ['t1'], max: 0 }))).toEqual(['t4']);
  });

  it('ignores recent ids that no longer exist', () => {
    expect(ids(pickTabTables(tables, { activeId: 't0', recentIds: ['gone', 't3'], max: 3 }))).toEqual(['t0', 't3']);
  });

  it('falls back to the first table when nothing is open or recent', () => {
    expect(ids(pickTabTables(tables, { activeId: null, recentIds: [], max: 4 }))).toEqual(['t0']);
  });

  it('copes with no tables', () => {
    expect(pickTabTables([], { activeId: 'x', recentIds: [], max: 3 })).toEqual([]);
  });
});

describe('stored preference helpers', () => {
  it('reads id lists defensively', () => {
    expect(parseIdList('["a","b"]')).toEqual(['a', 'b']);
    expect(parseIdList('["a",3,null,""]')).toEqual(['a']);
    expect(parseIdList('nope')).toEqual([]);
    expect(parseIdList('{"a":1}')).toEqual([]);
    expect(parseIdList(null)).toEqual([]);
  });

  it('reads flags', () => {
    expect(parseFlag('1')).toBe(true);
    expect(parseFlag('true')).toBe(true);
    expect(parseFlag('0')).toBe(false);
    expect(parseFlag(null)).toBe(false);
  });

  it('toggles ids', () => {
    expect(toggleId(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggleId(['a', 'b'], 'a')).toEqual(['b']);
  });

  it('lists pinned tables first in pin order, skipping pins that no longer exist', () => {
    const tables = [t('1', 'A'), t('2', 'B'), t('3', 'C')];
    const out = pinnedFirst(tables, ['3', 'gone', '1']);
    expect(out.pinned.map((x) => x.id)).toEqual(['3', '1']);
    expect(out.rest.map((x) => x.id)).toEqual(['2']);
  });
});

describe('isModShortcut', () => {
  const ev = (over: Partial<Record<'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey', boolean | string>>) => ({
    key: 'k',
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    ...over,
  }) as Parameters<typeof isModShortcut>[0];

  it('accepts Ctrl or Cmd with the key, any letter case', () => {
    expect(isModShortcut(ev({ ctrlKey: true }), 'k')).toBe(true);
    expect(isModShortcut(ev({ metaKey: true }), 'k')).toBe(true);
    expect(isModShortcut(ev({ ctrlKey: true, key: 'K' }), 'k')).toBe(true);
  });

  it('rejects the bare key, other keys, Alt and an unexpected Shift', () => {
    expect(isModShortcut(ev({}), 'k')).toBe(false);
    expect(isModShortcut(ev({ ctrlKey: true, key: 'j' }), 'k')).toBe(false);
    expect(isModShortcut(ev({ ctrlKey: true, altKey: true }), 'k')).toBe(false);
    expect(isModShortcut(ev({ ctrlKey: true, shiftKey: true }), 'k')).toBe(false);
  });

  it('can require Shift', () => {
    expect(isModShortcut(ev({ ctrlKey: true, shiftKey: true }), 'k', { shift: true })).toBe(true);
    expect(isModShortcut(ev({ ctrlKey: true }), 'k', { shift: true })).toBe(false);
  });
});
