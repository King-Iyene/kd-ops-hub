import { beforeEach, describe, expect, it, vi } from 'vitest';

// A stand-in for the Supabase query builder that records each request, with `in` filters.
type Req = { table: string; select: string; inCol: string; inVals: string[] };
const requests: Req[] = [];
let respond: (req: Req) => { data: unknown; error: unknown } = () => ({ data: [], error: null });

function builder(table: string) {
  const req: Req = { table, select: '', inCol: '', inVals: [] };
  const chain: any = {
    select(cols: string) { req.select = cols; return chain; },
    in(col: string, vals: string[]) { req.inCol = col; req.inVals = vals; return chain; },
    then(resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) {
      requests.push(req);
      return Promise.resolve(respond(req)).then(resolve, reject);
    },
  };
  return chain;
}

vi.mock('@/lib/supabase', () => ({
  supabase: { schema: () => ({ from: (table: string) => builder(table) }) },
}));

import {
  createBatcher,
  getFieldColumn,
  getLinkJunctionTableId,
  getTableMeta,
  resetMetaLookups,
} from '../hooks/metaLookups';

const tableRow = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  pg_table_name: `tbl_${id}`,
  primary_field_id: `pf_${id}`,
  ...extra,
});

describe('metaLookups', () => {
  beforeEach(() => {
    requests.length = 0;
    resetMetaLookups();
    respond = (req) => {
      if (req.table === 'tables') return { data: req.inVals.filter((v) => v !== 'missing').map((id) => tableRow(id)), error: null };
      if (req.table === 'fields') return { data: req.inVals.map((id) => ({ id, pg_column_name: `col_${id}` })), error: null };
      if (req.table === 'links') return { data: req.inVals.map((id) => ({ field_id: id, junction_table_id: `jn_${id}` })), error: null };
      return { data: [], error: null };
    };
  });

  it('folds callers that arrive together into one request', async () => {
    const [a, b, c] = await Promise.all([getTableMeta('a'), getTableMeta('b'), getTableMeta('c')]);
    expect(requests).toHaveLength(1);
    expect(requests[0].table).toBe('tables');
    expect(requests[0].inCol).toBe('id');
    expect([...requests[0].inVals].sort()).toEqual(['a', 'b', 'c']);
    expect([a?.pg_table_name, b?.pg_table_name, c?.pg_table_name]).toEqual(['tbl_a', 'tbl_b', 'tbl_c']);
  });

  it('sends a repeated key once', async () => {
    const [x, y] = await Promise.all([getTableMeta('a'), getTableMeta('a')]);
    expect(requests).toHaveLength(1);
    expect(requests[0].inVals).toEqual(['a']);
    expect(x).toEqual(y);
  });

  it('answers a later repeat from memory', async () => {
    await getTableMeta('a');
    await getTableMeta('a');
    expect(requests).toHaveLength(1);
  });

  it('resolves a missing key to null and remembers that', async () => {
    expect(await getTableMeta('missing')).toBeNull();
    expect(await getTableMeta('missing')).toBeNull();
    expect(requests).toHaveLength(1);
  });

  it('rejects every waiting caller on a failure and tries again next time', async () => {
    respond = () => ({ data: null, error: new Error('network down') });
    const results = await Promise.allSettled([getTableMeta('a'), getTableMeta('b')]);
    expect(results.map((r) => r.status)).toEqual(['rejected', 'rejected']);

    respond = (req) => ({ data: req.inVals.map((id) => tableRow(id)), error: null });
    expect((await getTableMeta('a'))?.pg_table_name).toBe('tbl_a');
    expect(requests).toHaveLength(2);
  });

  it('looks up field columns and link junctions in their own batches', async () => {
    const [col1, col2, jn1, jn2] = await Promise.all([
      getFieldColumn('f1'),
      getFieldColumn('f2'),
      getLinkJunctionTableId('l1'),
      getLinkJunctionTableId('l2'),
    ]);
    expect([col1, col2]).toEqual(['col_f1', 'col_f2']);
    expect([jn1, jn2]).toEqual(['jn_l1', 'jn_l2']);
    const byTable = Object.fromEntries(requests.map((r) => [r.table, r]));
    expect(requests).toHaveLength(2);
    expect(byTable.fields.inCol).toBe('id');
    expect(byTable.links.inCol).toBe('field_id');
  });

  it('treats a link without a junction table as none', async () => {
    respond = (req) => ({ data: req.inVals.map((id) => ({ field_id: id, junction_table_id: null })), error: null });
    expect(await getLinkJunctionTableId('l1')).toBeNull();
  });

  it('splits a very large batch into several requests', async () => {
    const ids = Array.from({ length: 230 }, (_, i) => `t${i}`);
    const rows = await Promise.all(ids.map((id) => getTableMeta(id)));
    expect(rows.every((r) => r !== null)).toBe(true);
    expect(requests.map((r) => r.inVals.length)).toEqual([100, 100, 30]);
  });
});

describe('createBatcher', () => {
  it('does not call load at all when everything is cached', async () => {
    const load = vi.fn(async (keys: string[]) => new Map(keys.map((k) => [k, k.toUpperCase()])));
    const b = createBatcher(load);
    expect(await b.get('a')).toBe('A');
    expect(await b.get('a')).toBe('A');
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('clear() forgets cached answers', async () => {
    const load = vi.fn(async (keys: string[]) => new Map(keys.map((k) => [k, k])));
    const b = createBatcher(load);
    await b.get('a');
    b.clear();
    await b.get('a');
    expect(load).toHaveBeenCalledTimes(2);
  });
});
