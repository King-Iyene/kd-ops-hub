import { renderHook, act, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.setConfig({ testTimeout: 30000 });

// Methods called on the stand-in query builder, so the tests can see that a save really went out.
const calls: string[] = [];
// What each update sent to the database, so the tests can see which columns it named.
const updatePayloads: Array<Record<string, unknown>> = [];
// When true the mock database has no updated_by column.
let tableLacksUpdatedBy = false;

// Every call on the stand-in query builder returns the builder, and awaiting it gives one row back.
function chain(): any {
  let lastPayload: Record<string, unknown> | null = null;
  const c: any = new Proxy(function () {}, {
    get(_t, prop) {
      if (prop === 'then') {
        return (resolve: (v: unknown) => unknown) => {
          // Like the real database: an update that names a column the table does not have is refused.
          if (tableLacksUpdatedBy && lastPayload && 'updated_by' in lastPayload) {
            return resolve({
              data: null,
              error: { code: 'PGRST204', message: "Could not find the 'updated_by' column of 't' in the schema cache" },
            });
          }
          return resolve({ data: { id: 'r1', cost: 2 }, error: null });
        };
      }
      if (prop === 'update') {
        return (payload: Record<string, unknown>) => {
          calls.push('update');
          updatePayloads.push(payload);
          lastPayload = payload;
          return c;
        };
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

import {
  useBulkCreateRecords,
  useBulkDeleteRecords,
  useBulkUpdateRecords,
  useCreateRecord,
  useDeleteRecord,
  useDuplicateRecord,
  useUpdateRecord,
  resetUpdatedByMemory,
} from '../hooks/useRecords';
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
    updatePayloads.length = 0;
    tableLacksUpdatedBy = false;
    resetUpdatedByMemory();
    useUndoStore.getState().clear();
  });
  afterEach(cleanup);

  it('imported tables list a "Last Modified By" field with no column: the edit is sent again without the stamp, and remembered', async () => {
    tableLacksUpdatedBy = true;
    const { result, qc } = setup(() => useUpdateRecord());
    // What an import leaves behind: metadata for updated_by, no such column in the table.
    qc.setQueryData(['nc', 'fields', 't'], [{ id: 'f1', pg_column_name: 'cost' }, { id: 'f2', pg_column_name: 'updated_by' }]);

    act(() => {
      result.current.mutate({ baseId: 'b', tableId: 't', recordId: 'r1', fields: { cost: 2 } });
    });
    await waitFor(() => expect(result.current.isSuccess || result.current.isError).toBe(true));
    expect(result.current.error).toBeNull();
    // First the refused attempt with the stamp, then the one that worked.
    expect(updatePayloads).toEqual([{ cost: 2, updated_by: 'u1' }, { cost: 2 }]);

    // The next edit in that table does not try the stamp at all.
    updatePayloads.length = 0;
    act(() => {
      result.current.reset();
      result.current.mutate({ baseId: 'b', tableId: 't', recordId: 'r2', fields: { cost: 9 } });
    });
    await waitFor(() => expect(result.current.isSuccess || result.current.isError).toBe(true));
    expect(result.current.error).toBeNull();
    expect(updatePayloads).toEqual([{ cost: 9 }]);
  });

  it('does not change the object the caller passed in (the undo step shares it)', async () => {
    const { result, qc } = setup(() => useUpdateRecord());
    qc.setQueryData(['nc', 'fields', 't'], [{ id: 'f2', pg_column_name: 'updated_by' }]);
    const fields = { cost: 2 };
    act(() => {
      result.current.mutate({ baseId: 'b', tableId: 't', recordId: 'r1', fields });
    });
    await waitFor(() => expect(result.current.isSuccess || result.current.isError).toBe(true));
    expect(fields).toEqual({ cost: 2 });
  });

  it('a real failure (not a missing column) still fails the edit', async () => {
    const { isMissingColumnError } = await import('../hooks/useRecords');
    expect(isMissingColumnError({ code: 'PGRST204', message: "Could not find the 'updated_by' column" }, 'updated_by')).toBe(true);
    expect(isMissingColumnError({ code: '42703', message: 'column "updated_by" of relation "t" does not exist' }, 'updated_by')).toBe(true);
    expect(isMissingColumnError({ code: '23505', message: 'duplicate key value violates unique constraint' }, 'updated_by')).toBe(false);
    expect(isMissingColumnError({ code: 'PGRST204', message: "Could not find the 'cost' column" }, 'updated_by')).toBe(false);
    expect(isMissingColumnError(null, 'updated_by')).toBe(false);
  });

  it('does not name updated_by on a table that has no such column (the database would reject the edit)', async () => {
    const { result, qc } = setup(() => useUpdateRecord());
    qc.setQueryData(['nc', 'fields', 't'], [{ id: 'f1', pg_column_name: 'cost' }]);
    act(() => {
      result.current.mutate({ baseId: 'b', tableId: 't', recordId: 'r1', fields: { cost: 2 } });
    });
    await waitFor(() => expect(result.current.isSuccess || result.current.isError).toBe(true));
    expect(result.current.error).toBeNull();
    expect(updatePayloads).toHaveLength(1);
    expect(updatePayloads[0]).toEqual({ cost: 2 });
  });

  it('does not name updated_by when the table\'s fields are not known yet', async () => {
    const { result } = setup(() => useUpdateRecord());
    act(() => {
      result.current.mutate({ baseId: 'b', tableId: 't', recordId: 'r1', fields: { cost: 2 } });
    });
    await waitFor(() => expect(result.current.isSuccess || result.current.isError).toBe(true));
    expect(updatePayloads[0]).toEqual({ cost: 2 });
  });

  it('stamps the current user on a table that has the Last Modified By column', async () => {
    const { result, qc } = setup(() => useUpdateRecord());
    qc.setQueryData(['nc', 'fields', 't'], [{ id: 'f1', pg_column_name: 'cost' }, { id: 'f2', pg_column_name: 'updated_by' }]);
    act(() => {
      result.current.mutate({ baseId: 'b', tableId: 't', recordId: 'r1', fields: { cost: 2 } });
    });
    await waitFor(() => expect(result.current.isSuccess || result.current.isError).toBe(true));
    expect(updatePayloads[0]).toEqual({ cost: 2, updated_by: 'u1' });
  });

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

  it('adds a new row to the list straight away', async () => {
    const { result, qc } = setup(() => useCreateRecord());
    act(() => {
      result.current.mutate({ baseId: 'b', tableId: 't', record: { cost: 3 } });
    });
    await waitFor(() => expect(result.current.isSuccess || result.current.isError).toBe(true));
    expect(result.current.error).toBeNull();
    // One new row, at the end: not one per loaded page.
    const ids = cachedIds(qc);
    expect(ids).toHaveLength(4);
    expect(ids.filter((id) => id.startsWith('temp-'))).toHaveLength(1);
    expect(ids[ids.length - 1].startsWith('temp-')).toBe(true);
  });

  it('adds several new rows once each', async () => {
    const { result, qc } = setup(() => useBulkCreateRecords());
    act(() => {
      result.current.mutate({ baseId: 'b', tableId: 't', records: [{ cost: 1 }, { cost: 2 }] });
    });
    await waitFor(() => expect(result.current.isSuccess || result.current.isError).toBe(true));
    expect(result.current.error).toBeNull();
    expect(cachedIds(qc).filter((id) => id.startsWith('temp-'))).toHaveLength(2);
  });

  it('bulk edits rows on both pages', async () => {
    const { result, qc } = setup(() => useBulkUpdateRecords());
    act(() => {
      result.current.mutate({
        baseId: 'b',
        tableId: 't',
        updates: [{ id: 'r1', fields: { cost: 10 } }, { id: 'r9', fields: { cost: 90 } }],
      });
    });
    await waitFor(() => expect(result.current.isSuccess || result.current.isError).toBe(true));
    expect(result.current.error).toBeNull();
    const rows = (qc.getQueryData(INFINITE_KEY) as ReturnType<typeof infiniteData>).pages.flatMap((p) => p.records);
    expect(rows.find((r) => r.id === 'r1')?.cost).toBe(10);
    expect(rows.find((r) => r.id === 'r9')?.cost).toBe(90);
  });

  it('bulk deletes rows from both pages', async () => {
    const { result, qc } = setup(() => useBulkDeleteRecords());
    act(() => {
      result.current.mutate({ baseId: 'b', tableId: 't', recordIds: ['r2', 'r9'] });
    });
    await waitFor(() => expect(result.current.isSuccess || result.current.isError).toBe(true));
    expect(result.current.error).toBeNull();
    expect(cachedIds(qc)).toEqual(['r1']);
  });

  it('duplicates a row', async () => {
    const { result } = setup(() => useDuplicateRecord());
    act(() => {
      result.current.mutate({ baseId: 'b', tableId: 't', record: { id: 'r1', cost: 1 } as never });
    });
    await waitFor(() => expect(result.current.isSuccess || result.current.isError).toBe(true));
    expect(result.current.error).toBeNull();
    expect(calls).toContain('insert');
  });
});
