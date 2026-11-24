import { renderHook, act, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useActiveView } from '../hooks/useViews';
import { useDatabaseUI } from '../lib/store';

vi.setConfig({ testTimeout: 30000 });

const view = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  table_id: 't1',
  name: id,
  type: 'grid',
  is_default: false,
  filters: [],
  sorts: [],
  groups: [],
  field_visibility: {},
  field_widths: {},
  field_order: [],
  ...extra,
});

function setup(views: any[]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(['nc', 'views', 't1'], views);
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return renderHook(() => useActiveView('t1'), { wrapper });
}

describe('useActiveView', () => {
  beforeEach(() => {
    act(() => { useDatabaseUI.getState().setActiveView(null); });
  });
  afterEach(cleanup);

  it('picks the default view and loads its settings when none is chosen', () => {
    setup([
      view('a'),
      view('b', { is_default: true, filters: [{ id: 'f', field_id: 'x', operator: 'is', value: '1', conjunction: 'and' }] }),
    ]);
    const state = useDatabaseUI.getState();
    expect(state.activeViewId).toBe('b');
    expect(state.filters).toHaveLength(1);
  });

  it('loads the settings of a view named by the address, not the previous view\'s', () => {
    // The previous view left a filter in the store; the address then names view "b" with its own sort.
    act(() => {
      useDatabaseUI.getState().setActiveView('a', {
        filters: [{ id: 'old', field_id: 'x', operator: 'is', value: 'old', conjunction: 'and' }] as any,
      });
    });
    act(() => { useDatabaseUI.getState().setActiveView('b'); }); // what the address change does: id only
    setup([
      view('a'),
      view('b', { sorts: [{ id: 's', field_id: 'y', direction: 'desc' }] }),
    ]);
    const state = useDatabaseUI.getState();
    expect(state.activeViewId).toBe('b');
    expect(state.filters).toEqual([]);
    expect(state.sorts).toHaveLength(1);
  });

  it('does not reapply the settings over later changes in the same view', () => {
    setup([view('a', { is_default: true })]);
    act(() => { useDatabaseUI.getState().setSelectedCell(null); });
    expect(useDatabaseUI.getState().activeViewId).toBe('a');
    act(() => { useDatabaseUI.setState({ filters: [{ id: 'mine', field_id: 'x', operator: 'is', value: '1', conjunction: 'and' }] as any }); });
    // A later render with the same view must leave the person's filter in place.
    expect(useDatabaseUI.getState().filters).toHaveLength(1);
  });
});
