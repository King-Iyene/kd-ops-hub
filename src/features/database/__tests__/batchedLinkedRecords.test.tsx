import { renderHook, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.setConfig({ testTimeout: 30000 });

// A stand-in database. It records every request so the tests can count them.
interface Req { table: string; inCol: string; inVals: string[] }
const requests: Req[] = [];

function respond(req: Req): { data: unknown; error: unknown } {
  const ids = req.inVals;
  switch (req.table) {
    case 'bases':
      return { data: { schema_name: 's' }, error: null };
    case 'links':
      return { data: ids.map((id) => ({ field_id: id, junction_table_id: 'J' })), error: null };
    case 'tables':
      return {
        data: ids.map((id) => ({
          id,
          pg_table_name: id === 'SRC' ? 'src' : id === 'TGT' ? 'tgt' : 'jn',
          primary_field_id: id === 'TGT' ? 'PF' : null,
        })),
        error: null,
      };
    case 'fields':
      return { data: ids.map((id) => ({ id, pg_column_name: 'name' })), error: null };
    case 'jn': {
      // r1 -> t1; r2 -> t1 and t2; r3 has none. Only the "source_id" direction has rows.
      const all = [{ source_id: 'r1', target_id: 't1' }, { source_id: 'r2', target_id: 't1' }, { source_id: 'r2', target_id: 't2' }];
      return { data: req.inCol === 'source_id' ? all.filter((r) => ids.includes(r.source_id)) : [], error: null };
    }
    case 'tgt':
      return { data: [{ id: 't1', name: 'Alpha' }, { id: 't2', name: 'Beta' }].filter((r) => ids.includes(r.id)), error: null };
    default:
      return { data: null, error: null };
  }
}

function builder(table: string) {
  const req: Req = { table, inCol: '', inVals: [] };
  const c: any = new Proxy(function () {}, {
    get(_t, prop) {
      if (prop === 'then') {
        return (resolve: (v: unknown) => unknown) => {
          requests.push(req);
          return resolve(respond(req));
        };
      }
      if (prop === 'in') return (col: string, vals: string[]) => { req.inCol = col; req.inVals = vals; return c; };
      // .single() / .maybeSingle() on the base lookup: a plain object is expected, not a list
      if (prop === 'single' || prop === 'maybeSingle') {
        return () => ({
          then: (resolve: (v: unknown) => unknown) => {
            requests.push(req);
            return resolve(respond(req));
          },
        });
      }
      return () => c;
    },
    apply() { return c; },
  });
  return c;
}

vi.mock('@/lib/supabase', () => ({
  supabase: { schema: () => ({ from: (table: string) => builder(table) }) },
}));

import { loadLinkedRows, resetLinkedRecordBatchers, useBatchedLinkedRecords } from '../hooks/useBatchedLinkedRecords';
import { resetMetaLookups } from '../hooks/metaLookups';
import { resetBootstrapCaches } from '../hooks/tableBootstrap';

const linkField = { id: 'F', table_id: 'SRC', ui_type: 'Links', options: { relatedTableId: 'TGT', type: 'mm' } } as never;

describe('lookup and rollup cells load their linked rows in batches', () => {
  beforeEach(() => {
    requests.length = 0;
    resetLinkedRecordBatchers();
    resetMetaLookups();
    resetBootstrapCaches();
  });
  afterEach(cleanup);

  function mount(recordIds: string[], enabled = true) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
    return renderHook(
      () => recordIds.map((id) => useBatchedLinkedRecords({ baseId: 'b', linkField, recordId: id, enabled })),
      { wrapper },
    );
  }

  it('three cells at once cost two junction reads and one read of the linked rows, not two requests each', async () => {
    const { result } = mount(['r1', 'r2', 'r3']);
    await waitFor(() => expect(result.current.every((q) => q.isSuccess)).toBe(true));
    expect(requests.filter((r) => r.table === 'jn')).toHaveLength(2); // links in each direction, for all three rows together
    expect(requests.filter((r) => r.table === 'tgt')).toHaveLength(1); // every linked row at once
    expect(requests.filter((r) => r.table === 'jn')[0].inVals.sort()).toEqual(['r1', 'r2', 'r3']);
  });

  it('each cell gets its own linked rows', async () => {
    const { result } = mount(['r1', 'r2', 'r3']);
    await waitFor(() => expect(result.current.every((q) => q.isSuccess)).toBe(true));
    const names = result.current.map((q) => (q.data ?? []).map((r) => r.name));
    expect(names).toEqual([['Alpha'], ['Alpha', 'Beta'], []]);
  });

  it('a shared linked row is fetched once however many cells link to it', async () => {
    const { result } = mount(['r1', 'r2']);
    await waitFor(() => expect(result.current.every((q) => q.isSuccess)).toBe(true));
    const rowRequest = requests.find((r) => r.table === 'tgt')!;
    expect(rowRequest.inVals.sort()).toEqual(['t1', 't2']);
  });

  it('does nothing while disabled', async () => {
    mount(['r1'], false);
    await new Promise((r) => setTimeout(r, 50));
    expect(requests).toHaveLength(0);
  });

  it('a cell with no links gets an empty list, not a missing one', async () => {
    const { result } = mount(['r3']);
    await waitFor(() => expect(result.current[0].isSuccess).toBe(true));
    expect(result.current[0].data).toEqual([]);
  });
});

describe('loadLinkedRows', () => {
  beforeEach(() => {
    requests.length = 0;
  });

  it('gives every asked-for record an entry, and drops links to rows that no longer exist', async () => {
    const meta = { schema: 's', junctionTable: 'jn', srcTable: 'src', tgtTable: 'tgt', primaryColumn: 'name', linkType: 'mm', fkColumn: undefined };
    const out = await loadLinkedRows(meta, ['r1', 'r2', 'r3']);
    expect([...out.keys()]).toEqual(['r1', 'r2', 'r3']);
    expect(out.get('r3')).toEqual([]);
    expect(out.get('r2')?.map((r) => r.id)).toEqual(['t1', 't2']);
  });
});
