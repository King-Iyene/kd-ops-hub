import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createHoverPrefetcher, predictInitialRecordParams, viewGateOpen } from '../lib/prefetch';

describe('predictInitialRecordParams', () => {
  const filter = { id: 'x', field_id: 'f1', operator: 'is', value: 'a' } as any;
  const sort = { field_id: 'f1', direction: 'asc' } as any;

  it('uses the default view\'s filters and sorts', () => {
    const views = [
      { id: 'v1', is_default: false, filters: [], sorts: [] },
      { id: 'v2', is_default: true, filters: [filter], sorts: [sort] },
    ];
    expect(predictInitialRecordParams(views)).toEqual({ filters: [filter], sorts: [sort] });
  });

  it('falls back to the first view when none is marked default', () => {
    const views = [{ id: 'v1', filters: [filter], sorts: [] }, { id: 'v2', filters: [], sorts: [sort] }];
    expect(predictInitialRecordParams(views)).toEqual({ filters: [filter], sorts: undefined });
  });

  it('passes an empty list as undefined, the way the grid does, so the query key matches', () => {
    const views = [{ id: 'v1', is_default: true, filters: [], sorts: [] }];
    expect(predictInitialRecordParams(views)).toEqual({ filters: undefined, sorts: undefined });
  });

  it('asks for unfiltered rows when the address names a view (the grid does not load that view\'s settings)', () => {
    const views = [{ id: 'v1', is_default: true, filters: [filter], sorts: [sort] }];
    expect(predictInitialRecordParams(views, 'v1')).toEqual({ filters: undefined, sorts: undefined });
  });

  it('handles a table with no views', () => {
    expect(predictInitialRecordParams(undefined)).toEqual({ filters: undefined, sorts: undefined });
    expect(predictInitialRecordParams([])).toEqual({ filters: undefined, sorts: undefined });
  });
});

describe('viewGateOpen', () => {
  const views = [{ id: 'v1' }, { id: 'v2' }];

  it('waits while the views are still loading or belong to the previous table', () => {
    expect(viewGateOpen({ views: undefined, viewsArePlaceholder: false, viewsFailed: false, activeViewId: null })).toBe(false);
    expect(viewGateOpen({ views, viewsArePlaceholder: true, viewsFailed: false, activeViewId: 'v1' })).toBe(false);
  });

  it('waits until a view of this table is the active one', () => {
    expect(viewGateOpen({ views, viewsArePlaceholder: false, viewsFailed: false, activeViewId: null })).toBe(false);
    expect(viewGateOpen({ views, viewsArePlaceholder: false, viewsFailed: false, activeViewId: 'other-table-view' })).toBe(false);
    expect(viewGateOpen({ views, viewsArePlaceholder: false, viewsFailed: false, activeViewId: 'v2' })).toBe(true);
  });

  it('does not wait for a table that has no views', () => {
    expect(viewGateOpen({ views: [], viewsArePlaceholder: false, viewsFailed: false, activeViewId: null })).toBe(true);
  });

  it('never waits on a views request that is failing', () => {
    expect(viewGateOpen({ views: undefined, viewsArePlaceholder: false, viewsFailed: true, activeViewId: null })).toBe(true);
  });
});

describe('createHoverPrefetcher', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('runs after the delay', () => {
    const run = vi.fn();
    const p = createHoverPrefetcher({ delayMs: 120, run });
    p.schedule('t1');
    vi.advanceTimersByTime(119);
    expect(run).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(run).toHaveBeenCalledWith('t1');
    expect(p.pending()).toEqual([]);
  });

  it('does nothing when the pointer leaves before the delay ends', () => {
    const run = vi.fn();
    const p = createHoverPrefetcher({ delayMs: 120, run });
    p.schedule('t1');
    vi.advanceTimersByTime(60);
    p.cancel('t1');
    vi.advanceTimersByTime(500);
    expect(run).not.toHaveBeenCalled();
  });

  it('keeps the countdown already running when the same table is scheduled again', () => {
    const run = vi.fn();
    const p = createHoverPrefetcher({ delayMs: 100, run });
    p.schedule('t1');
    vi.advanceTimersByTime(80);
    p.schedule('t1'); // focus after hover: must not restart the clock
    vi.advanceTimersByTime(20);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('sweeping across a list loads only the table the pointer rests on', () => {
    const run = vi.fn();
    const p = createHoverPrefetcher({ delayMs: 120, run });
    for (const key of ['a', 'b', 'c']) {
      p.schedule(key);
      vi.advanceTimersByTime(30);
      p.cancel(key);
    }
    p.schedule('d');
    vi.advanceTimersByTime(200);
    expect(run.mock.calls).toEqual([['d']]);
  });

  it('cancelAll clears every countdown', () => {
    const run = vi.fn();
    const p = createHoverPrefetcher({ delayMs: 50, run });
    p.schedule('a');
    p.schedule('b');
    expect(p.pending().sort()).toEqual(['a', 'b']);
    p.cancelAll();
    vi.advanceTimersByTime(100);
    expect(run).not.toHaveBeenCalled();
    expect(p.pending()).toEqual([]);
  });

  it('can run the same table again after it has run once', () => {
    const run = vi.fn();
    const p = createHoverPrefetcher({ delayMs: 10, run });
    p.schedule('a');
    vi.advanceTimersByTime(10);
    p.schedule('a');
    vi.advanceTimersByTime(10);
    expect(run).toHaveBeenCalledTimes(2);
  });
});
