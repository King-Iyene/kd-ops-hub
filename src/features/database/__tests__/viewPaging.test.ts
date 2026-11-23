import { describe, expect, it } from 'vitest';
import { ALL_ROWS_CAP, describeViewLoad, shouldLoadMoreForView } from '../lib/viewPaging';

const base = { loaded: 100, hasNextPage: true, isFetching: false };

describe('loading every row for board-style views', () => {
  it('keeps loading for board, calendar, timeline and gantt', () => {
    for (const viewType of ['kanban', 'calendar', 'timeline', 'gantt']) {
      expect(shouldLoadMoreForView({ ...base, viewType })).toBe(true);
    }
  });

  it('leaves the grid and gallery to their own paging', () => {
    expect(shouldLoadMoreForView({ ...base, viewType: 'grid' })).toBe(false);
    expect(shouldLoadMoreForView({ ...base, viewType: 'gallery' })).toBe(false);
  });

  it('waits for a page in flight, stops when nothing is left, and stops at the cap', () => {
    expect(shouldLoadMoreForView({ ...base, viewType: 'kanban', isFetching: true })).toBe(false);
    expect(shouldLoadMoreForView({ ...base, viewType: 'kanban', hasNextPage: false })).toBe(false);
    expect(shouldLoadMoreForView({ ...base, viewType: 'kanban', loaded: ALL_ROWS_CAP })).toBe(false);
  });
});

describe('what the screen says while loading', () => {
  it('shows progress, then a cap notice, then nothing', () => {
    expect(describeViewLoad({ viewType: 'calendar', loaded: 300, total: 3356, hasNextPage: true })?.kind).toBe('loading');
    const capped = describeViewLoad({ viewType: 'calendar', loaded: ALL_ROWS_CAP, total: 9000, hasNextPage: true });
    expect(capped?.kind).toBe('capped');
    expect(capped?.text).toContain('filter');
    expect(describeViewLoad({ viewType: 'calendar', loaded: 3356, total: 3356, hasNextPage: false })).toBeNull();
    expect(describeViewLoad({ viewType: 'grid', loaded: 100, total: 3356, hasNextPage: true })).toBeNull();
  });
});

import { addChoicesFromText, sortChoicesAZ } from '../lib/selectOptions';

describe('pasting a list into the options editor', () => {
  it('adds each new word with its own colour and skips ones that exist', () => {
    const out = addChoicesFromText([{ title: 'Design', color: 'a' }], 'design, Sales\nOps', ['a', 'b', 'c']);
    expect(out.map((c) => c.title)).toEqual(['Design', 'Sales', 'Ops']);
    expect(out.map((c) => c.color)).toEqual(['a', 'b', 'c']);
  });

  it('sorts A to Z once, ignoring capitals and reading numbers as numbers', () => {
    const out = sortChoicesAZ([{ title: 'b2', color: 'a' }, { title: 'B10', color: 'a' }, { title: 'a', color: 'a' }]);
    expect(out.map((c) => c.title)).toEqual(['a', 'b2', 'B10']);
  });
});
