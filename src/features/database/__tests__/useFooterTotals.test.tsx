import { renderHook, act, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider, useMutation } from '@tanstack/react-query';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.setConfig({ testTimeout: 30000 });

const fetchColumnValues = vi.fn();
vi.mock('../hooks/useRecords', () => ({
  FOOTER_ROW_CAP: 20000,
  fetchColumnValues: (...args: unknown[]) => fetchColumnValues(...args),
}));

import { useFooterTotals } from '../hooks/useFooterTotals';

const fields = [{ id: 'f1', ui_type: 'Currency', pg_column_name: 'cost' }] as never;

function setup(extra: Partial<Parameters<typeof useFooterTotals>[0]> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  const view = renderHook(
    () => {
      const totals = useFooterTotals({
        baseId: 'b',
        tableId: 't',
        fields,
        summaryFunctions: {},
        loadedCount: 100,
        totalCount: 3,
        enabled: true,
        ...extra,
      });
      const save = useMutation({ mutationKey: ['nc', 'user-save'], mutationFn: async (_v: unknown) => ({}) });
      return { totals, save };
    },
    { wrapper },
  );
  return { qc, ...view };
}

describe('useFooterTotals', () => {
  beforeEach(() => {
    fetchColumnValues.mockReset();
    fetchColumnValues.mockResolvedValue({
      rows: [{ id: 'a', cost: 1 }, { id: 'b', cost: 2 }, { id: 'c', cost: 3 }],
      truncated: false,
    });
  });
  afterEach(cleanup);

  it('does not read the table when everything is already loaded', async () => {
    const { result } = setup({ loadedCount: 3, totalCount: 3 });
    await new Promise((r) => setTimeout(r, 50));
    expect(fetchColumnValues).not.toHaveBeenCalled();
    expect(result.current.totals.rows).toBeUndefined();
  });

  it('does not read the table before the first rows are on screen', async () => {
    setup({ loadedCount: 100, totalCount: 500, enabled: false });
    await new Promise((r) => setTimeout(r, 50));
    expect(fetchColumnValues).not.toHaveBeenCalled();
  });

  it('reads the summarised column when there are more rows than loaded', async () => {
    const { result } = setup({ loadedCount: 2, totalCount: 3 });
    await waitFor(() => expect(result.current.totals.rows).toHaveLength(3));
    expect(fetchColumnValues.mock.calls[0][2]).toEqual(['cost']);
    expect([...result.current.totals.fieldIds]).toEqual(['f1']);
  });

  it('hands over nothing when the read was cut short at the cap', async () => {
    fetchColumnValues.mockResolvedValue({ rows: [], truncated: true });
    const { result } = setup({ loadedCount: 2, totalCount: 3 });
    await waitFor(() => expect(fetchColumnValues).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 50));
    expect(result.current.totals.rows).toBeUndefined();
  });

  it('moves the totals at once when a cell is edited, then reads again after the save settles', async () => {
    const { result } = setup({ loadedCount: 2, totalCount: 3 });
    await waitFor(() => expect(result.current.totals.rows).toHaveLength(3));
    expect(fetchColumnValues).toHaveBeenCalledTimes(1);

    fetchColumnValues.mockResolvedValue({
      rows: [{ id: 'a', cost: 1 }, { id: 'b', cost: 20 }, { id: 'c', cost: 3 }],
      truncated: false,
    });
    act(() => {
      result.current.save.mutate({ baseId: 'b', tableId: 't', recordId: 'b', field: 'cost', value: 20 });
    });
    // Immediately: the footer's own copy of the row is patched.
    await waitFor(() => expect(result.current.totals.rows?.find((r) => r.id === 'b')?.cost).toBe(20));
    // After the pause: one fresh read.
    await waitFor(() => expect(fetchColumnValues).toHaveBeenCalledTimes(2), { timeout: 4000 });
  });

  it('ignores saves in another table', async () => {
    const { result } = setup({ loadedCount: 2, totalCount: 3 });
    await waitFor(() => expect(result.current.totals.rows).toHaveLength(3));
    act(() => {
      result.current.save.mutate({ baseId: 'b', tableId: 'OTHER', recordId: 'b', field: 'cost', value: 99 });
    });
    await new Promise((r) => setTimeout(r, 1800));
    expect(result.current.totals.rows?.find((r) => r.id === 'b')?.cost).toBe(2);
    expect(fetchColumnValues).toHaveBeenCalledTimes(1);
  });
});
