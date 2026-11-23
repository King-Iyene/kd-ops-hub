import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';

// A tiny stand-in for the Supabase query builder: every chain ends in a promise,
// and the request that was made (table plus filters) is recorded so the tests can count them.
const requests: Array<{ table: string; select: string; filters: Record<string, unknown> }> = [];
let respond: (req: { table: string; select: string; filters: Record<string, unknown> }) => { data: unknown; error: unknown } = () => ({
  data: null,
  error: null,
});

function builder(table: string) {
  const req = { table, select: '', filters: {} as Record<string, unknown> };
  const chain: any = {
    select(cols: string) { req.select = cols; return chain; },
    eq(col: string, val: unknown) { req.filters[col] = val; return chain; },
    order() { return chain; },
    single() { return finish(); },
    maybeSingle() { return finish(); },
    then(resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) { return finish().then(resolve, reject); },
  };
  function finish() {
    requests.push(req);
    return Promise.resolve(respond(req));
  }
  return chain;
}

vi.mock('@/lib/supabase', () => ({
  supabase: { schema: () => ({ from: (table: string) => builder(table) }) },
}));

import {
  ensureTableBootstrap,
  fieldsKey,
  parseEmbeddedBootstrap,
  resetBootstrapCaches,
  resolveTableContext,
  resolveTableSchema,
  viewsKey,
} from '../hooks/tableBootstrap';

const FIELDS = [
  { id: 'f2', table_id: 't1', name: 'B', position: 2, pg_column_name: 'b', pg_type: 'TEXT', ui_type: 'SingleLineText' },
  { id: 'f1', table_id: 't1', name: 'A', position: 1, pg_column_name: 'a', pg_type: 'TEXT', ui_type: 'SingleLineText' },
];
const VIEWS = [{ id: 'v1', table_id: 't1', name: 'Grid', is_default: true, position: 0, filters: [], sorts: [] }];

function embeddedRow() {
  return { pg_table_name: 'expenses', base_id: 'b1', bases: { schema_name: 'nc_main' }, fields: FIELDS, views: VIEWS };
}

describe('parseEmbeddedBootstrap', () => {
  it('reads schema, table, fields and views, and puts fields in position order', () => {
    const parsed = parseEmbeddedBootstrap(embeddedRow());
    expect(parsed?.schemaName).toBe('nc_main');
    expect(parsed?.tableName).toBe('expenses');
    expect(parsed?.fields.map((f) => f.id)).toEqual(['f1', 'f2']);
    expect(parsed?.views).toHaveLength(1);
  });

  it('accepts the base as a one-item list', () => {
    const row = { ...embeddedRow(), bases: [{ schema_name: 'nc_main' }] };
    expect(parseEmbeddedBootstrap(row)?.schemaName).toBe('nc_main');
  });

  it('refuses a row that is missing the schema or the table name', () => {
    expect(parseEmbeddedBootstrap({ ...embeddedRow(), bases: null })).toBeNull();
    expect(parseEmbeddedBootstrap({ ...embeddedRow(), pg_table_name: undefined })).toBeNull();
    expect(parseEmbeddedBootstrap(null)).toBeNull();
    expect(parseEmbeddedBootstrap({ ...embeddedRow(), fields: null })).toBeNull();
  });
});

describe('ensureTableBootstrap', () => {
  beforeEach(() => {
    requests.length = 0;
    resetBootstrapCaches();
    respond = (req) => (req.table === 'tables' ? { data: embeddedRow(), error: null } : { data: null, error: null });
  });

  it('loads schema, fields and views with one request and fills the caches', async () => {
    const qc = new QueryClient();
    const boot = await ensureTableBootstrap(qc, 'b1', 't1');
    expect(requests).toHaveLength(1);
    expect(requests[0].table).toBe('tables');
    expect(boot.tableName).toBe('expenses');
    expect(qc.getQueryData(fieldsKey('t1'))).toHaveLength(2);
    expect(qc.getQueryData(viewsKey('t1'))).toHaveLength(1);
  });

  it('shares one request between callers that ask at the same time', async () => {
    const qc = new QueryClient();
    const results = await Promise.all([
      ensureTableBootstrap(qc, 'b1', 't1'),
      ensureTableBootstrap(qc, 'b1', 't1'),
      resolveTableContext('b1', 't1'),
      resolveTableSchema(qc, 'b1', 't1'),
    ]);
    expect(requests).toHaveLength(1);
    expect(results[2]).toEqual({ schemaName: 'nc_main', tableName: 'expenses' });
    expect((results[3] as { fieldsMeta: unknown[] }).fieldsMeta).toHaveLength(2);
  });

  it('sends nothing the second time while the cache is fresh', async () => {
    const qc = new QueryClient();
    await ensureTableBootstrap(qc, 'b1', 't1');
    requests.length = 0;
    await ensureTableBootstrap(qc, 'b1', 't1');
    await resolveTableContext('b1', 't1');
    expect(requests).toHaveLength(0);
  });

  it('asks again once the cached fields have been marked out of date', async () => {
    const qc = new QueryClient();
    await ensureTableBootstrap(qc, 'b1', 't1');
    await qc.invalidateQueries({ queryKey: fieldsKey('t1'), refetchType: 'none' });
    requests.length = 0;
    await ensureTableBootstrap(qc, 'b1', 't1');
    expect(requests).toHaveLength(1);
  });

  it('falls back to the separate requests, run together, when the embed is refused', async () => {
    respond = (req) => {
      if (req.table === 'tables' && req.select.includes('bases(')) return { data: null, error: { code: 'PGRST201', message: 'ambiguous' } };
      if (req.table === 'tables') return { data: { pg_table_name: 'expenses' }, error: null };
      if (req.table === 'bases') return { data: { schema_name: 'nc_main' }, error: null };
      if (req.table === 'fields') return { data: FIELDS, error: null };
      if (req.table === 'views') return { data: VIEWS, error: null };
      return { data: null, error: null };
    };
    const qc = new QueryClient();
    const boot = await ensureTableBootstrap(qc, 'b1', 't1');
    expect(boot.schemaName).toBe('nc_main');
    expect(boot.fields).toHaveLength(2);
    expect(boot.views).toHaveLength(1);
    // embed attempt + base + table + fields + views
    expect(requests.map((r) => r.table).sort()).toEqual(['bases', 'fields', 'tables', 'tables', 'views']);
  });

  it('stops trying the embed after the server has refused it', async () => {
    respond = (req) => {
      if (req.table === 'tables' && req.select.includes('bases(')) return { data: null, error: { code: 'PGRST201', message: 'ambiguous' } };
      if (req.table === 'tables') return { data: { pg_table_name: 'expenses' }, error: null };
      if (req.table === 'bases') return { data: { schema_name: 'nc_main' }, error: null };
      if (req.table === 'fields') return { data: FIELDS, error: null };
      return { data: VIEWS, error: null };
    };
    const qc = new QueryClient();
    await ensureTableBootstrap(qc, 'b1', 't1');
    requests.length = 0;
    await ensureTableBootstrap(qc, 'b1', 't2');
    expect(requests.some((r) => r.select.includes('bases('))).toBe(false);
  });
});

describe('resolveTableContext', () => {
  beforeEach(() => {
    requests.length = 0;
    resetBootstrapCaches();
    respond = (req) => {
      if (req.table === 'bases') return { data: { schema_name: 'nc_main' }, error: null };
      if (req.table === 'tables') return { data: { pg_table_name: 'expenses' }, error: null };
      return { data: null, error: null };
    };
  });

  it('turns three simultaneous callers into one pair of requests', async () => {
    const [a, b, c] = await Promise.all([
      resolveTableContext('b1', 't1'),
      resolveTableContext('b1', 't1'),
      resolveTableContext('b1', 't1'),
    ]);
    expect(a).toEqual({ schemaName: 'nc_main', tableName: 'expenses' });
    expect(b).toEqual(a);
    expect(c).toEqual(a);
    expect(requests.map((r) => r.table).sort()).toEqual(['bases', 'tables']);
  });
});
