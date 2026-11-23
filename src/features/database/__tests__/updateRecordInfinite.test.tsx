import { renderHook, act, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.setConfig({ testTimeout: 30000 });

// Methods called on the stand-in query builder, so the tests can see that a save really went out.
const calls: string[] = [];

// Every call on the stand-in query builder returns the builder, and awaiting it gives one row back.
function chain(): any {
  const c: any = new Proxy(function () {}, {
    get(_t, prop) {
      if (prop === 'then') {
        return (resolve: (v: unknown) => unknown) => resolve({ data: { id: 'r1', cost: 2 }, error: null });
      }
      calls.push(String(prop));
      return () => c;
    },
    apply() {
      return c;
    },
  });
  return c;
}

vi.mock('@/lib/supabase', () => ({
  supabase: {
    schema: () => ({ from: () => chain() }),
    from: () => chain(),
    auth: { getUser: async () => ({ data: { user: { id: 'u1', email: 'a@b.c' } } }) },
    functions: { invoke: async () => ({ data: null, error: null }) },
  },
}));

vi.mock('../hooks/tableBootstrap', async (importOriginal) => {
  const real = await importOriginal<typeof import('../hooks/tableBootstrap')>();
  return { ...real, resolveTableContext: async () => ({ schemaName: 's', tableName: 't' }) };
});

import { useDeleteRecord, useUpdateRecord } from '../hooks/useRecords';
import { useUndoStore } from '../lib/undo';

const INFINITE_KEY = ['nc', 'records', 'b', 't', 'infinite', 100, undefined, undefined, undefined, undefined];

/** Two pages of the grid's infinite list; r9 is on the second page (the person scrolled down). */
const infiniteData = () => ({
  pages: [
    { records: [{ id: 'r1', cost: 1 }, { id: 'r2', cost: 5 }], totalCount: 3, page: 0 },
    { records: [{ id: 'r9', cost: 7 }], totalCount: 3, page: 1 },
  ],
  pageParams: [0, 1],
});

function setup<T>(hook: () => T) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  qc.setQueryData(INFINITE_KEY, infiniteData());
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { qc, ...renderHook(hook, { wrapper }) };
}

const cachedIds = (qc: QueryClient) =>
  (qc.getQueryData(INFINITE_KEY) as ReturnType<typeof infiniteData>).pages.flatMap((p) => p.records.map((r) => r.id));

describe('editing and deleting with the grid\'s infinite list in the cache', () => {
  beforeEach(() => {
    calls.length = 0;
    useUndoStore.getState().clear();
  });
  afterEach(cleanup);

  it('saves a cell edit, shows it straight away and records an undo step', async () => {
    const { result, qc } = setup(() => useUpdateRecord());
    act(() => {
      result.current.mutate({ baseId: 'b', tableId: 't', recordId: 'r1', fields: { cost: 2 } });
    });
    await waitFor(() => expect(result.current.isSuccess || result.current.isError).toBe(true));
    expect(result.current.error).toBeNull();
    expect(calls).toContain('update');

    const pages = (qc.getQueryData(INFINITE_KEY) as ReturnType<typeof infiniteData>).pages;
    expect(pages[0].records.find((r) => r.id === 'r1')?.cost).toBe(2);
    expect(useUndoStore.getState().stack).toHaveLength(1);
  });

  it('finds the old values of a row that is on a later page', async () => {
    const { result } = setup(() => useUpdateRecord());
    act(() => {
      result.current.mutate({ baseId: 'b', tableId: 't', recordId: 'r9', fields: { cost: 8 } });
    });
    await waitFor(() => expect(result.current.isSuccess || result.current.isError).toBe(true));
    expect(result.current.error).toBeNull();
    const entry = useUndoStore.getState().stack[0] as { payload?: { oldValues?: Record<string, unknown> } } | undefined;
    expect(entry?.payload?.oldValues).toEqual({ cost: 7 });
  });

  it('deletes a row from the list and records an undo step for a row on a later page', async () => {
    const { result, qc } = setup(() => useDeleteRecord());
    act(() => {
      result.current.mutate({ baseId: 'b', tableId: 't', recordId: 'r9' });
    });
    await waitFor(() => expect(result.current.isSuccess || result.current.isError).toBe(true));
    expect(result.current.error).toBeNull();
    expect(cachedIds(qc)).toEqual(['r1', 'r2']);
    expect(useUndoStore.getState().stack).toHaveLength(1);
  });
});
