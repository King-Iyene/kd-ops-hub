import { beforeEach, describe, expect, it, vi } from 'vitest';

// A stand-in query builder: it remembers the select and range of each request, and answers from `pageFor`.
const requests: Array<{ select: string; from: number; to: number; order: string[] }> = [];
let pageFor: (from: number, to: number) => unknown[] = () => [];

function chain() {
  const req = { select: '', from: 0, to: 0, order: [] as string[] };
  const c: any = new Proxy(function () {}, {
    get(_t, prop) {
      if (prop === 'then') {
        return (resolve: (v: unknown) => unknown) => {
          requests.push(req);
          return resolve({ data: pageFor(req.from, req.to), error: null });
        };
      }
      if (prop === 'select') return (cols: string) => { req.select = cols; return c; };
      if (prop === 'range') return (from: number, to: number) => { req.from = from; req.to = to; return c; };
      if (prop === 'order') return (col: string) => { req.order.push(col); return c; };
      return () => c;
    },
    apply() { return c; },
  });
  return c;
}

vi.mock('@/lib/supabase', () => ({
  supabase: {
    schema: () => ({ from: () => chain() }),
    functions: { invoke: async () => ({ data: { ids: [] }, error: null }) },
  },
}));

vi.mock('../hooks/tableBootstrap', async (importOriginal) => {
  const real = await importOriginal<typeof import('../hooks/tableBootstrap')>();
  return {
    ...real,
    resolveTableSchema: async () => ({
      schemaName: 's',
      tableName: 't',
      fieldsMeta: [],
      fieldMap: new Map(),
    }),
  };
});

import { QueryClient } from '@tanstack/react-query';
import { fetchColumnValues } from '../hooks/useRecords';
import { defaultSummary, footerPlan, patchFooterRows, summaryFor } from '../lib/footerColumns';

const rows = (n: number, offset = 0) => Array.from({ length: n }, (_, i) => ({ id: `r${offset + i}` }));

describe('fetchColumnValues', () => {
  beforeEach(() => {
    requests.length = 0;
    pageFor = () => [];
  });
  const params = { baseId: 'b', tableId: 't' };

  it('reads the table in pages of 1,000 until a short page', async () => {
    pageFor = (from) => (from === 0 ? rows(1000) : from === 1000 ? rows(1000, 1000) : rows(420, 2000));
    const out = await fetchColumnValues(new QueryClient(), params, ['cost']);
    expect(out.rows).toHaveLength(2420);
    expect(out.truncated).toBe(false);
    expect(requests.map((r) => [r.from, r.to])).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });

  it('asks only for the id and the named columns, each once, in a stable order', async () => {
    pageFor = () => rows(5);
    await fetchColumnValues(new QueryClient(), params, ['cost', 'qty', 'cost']);
    expect(requests).toHaveLength(1);
    expect(requests[0].select).toBe('id, cost, qty');
    expect(requests[0].order).toEqual(['id']);
  });

  it('stops at the cap and says the result was cut short', async () => {
    pageFor = (from) => rows(1000, from);
    const out = await fetchColumnValues(new QueryClient(), params, ['cost'], 2000);
    expect(out.rows).toHaveLength(2000);
    expect(out.truncated).toBe(true);
    expect(requests).toHaveLength(2);
  });

  it('a table that fits exactly in whole pages ends on the empty page', async () => {
    pageFor = (from) => (from === 0 ? rows(1000) : []);
    const out = await fetchColumnValues(new QueryClient(), params, []);
    expect(out.rows).toHaveLength(1000);
    expect(out.truncated).toBe(false);
    expect(requests).toHaveLength(2);
  });
});

describe('footerPlan', () => {
  const f = (id: string, ui_type: any, pg_column_name = id) => ({ id, ui_type, pg_column_name });

  it('defaults: numbers sum, checkboxes percent filled, selects count filled, text none', () => {
    expect(defaultSummary('Currency')).toBe('sum');
    expect(defaultSummary('Checkbox')).toBe('percentFilled');
    expect(defaultSummary('SingleSelect')).toBe('countFilled');
    expect(defaultSummary('SingleLineText')).toBe('none');
  });

  it('an explicit choice beats the default', () => {
    expect(summaryFor(f('a', 'Currency'), { a: 'max' })).toBe('max');
    expect(summaryFor(f('a', 'Currency'), {})).toBe('sum');
  });

  it('plans the stored columns that have a summary, sorted, once each', () => {
    const plan = footerPlan(
      [f('1', 'Currency', 'cost'), f('2', 'Number', 'qty'), f('3', 'SingleLineText', 'name'), f('4', 'Currency', 'cost')],
      {},
    );
    expect(plan.needed).toBe(true);
    expect(plan.columns).toEqual(['cost', 'qty']);
    expect([...plan.fieldIds].sort()).toEqual(['1', '2', '4']);
  });

  it('leaves out computed fields but still wants the rows (for a count)', () => {
    const plan = footerPlan([f('1', 'Formula', 'calc'), f('2', 'Links', '')], { '1': 'sum', '2': 'count' });
    expect(plan.needed).toBe(true);
    expect(plan.columns).toEqual([]);
    expect(plan.fieldIds.size).toBe(0);
  });

  it('is not needed when only a computed column has a sum: the read could not make it exact', () => {
    const plan = footerPlan([f('1', 'Formula', 'calc'), f('2', 'SingleLineText')], { '1': 'sum' });
    expect(plan.needed).toBe(false);
  });

  it('is not needed when every footer cell is none', () => {
    const plan = footerPlan([f('1', 'Currency'), f('2', 'SingleLineText')], { '1': 'none' });
    expect(plan.needed).toBe(false);
    expect(plan.columns).toEqual([]);
  });
});

describe('patchFooterRows', () => {
  const base = [
    { id: 'a', cost: 1 },
    { id: 'b', cost: 2 },
    { id: 'c', cost: 3 },
  ];

  it('applies a single-field edit', () => {
    expect(patchFooterRows(base, { recordId: 'b', field: 'cost', value: 20 })).toEqual([
      { id: 'a', cost: 1 }, { id: 'b', cost: 20 }, { id: 'c', cost: 3 },
    ]);
  });

  it('applies a multi-field edit', () => {
    expect(patchFooterRows(base, { recordId: 'a', fields: { cost: 9, qty: 4 } })[0]).toEqual({ id: 'a', cost: 9, qty: 4 });
  });

  it('applies a bulk edit', () => {
    const out = patchFooterRows(base, { updates: [{ id: 'a', fields: { cost: 10 } }, { id: 'c', fields: { cost: 30 } }] });
    expect(out.map((r) => r.cost)).toEqual([10, 2, 30]);
  });

  it('removes a deleted row, and several deleted rows', () => {
    expect(patchFooterRows(base, { recordId: 'b' }).map((r) => r.id)).toEqual(['a', 'c']);
    expect(patchFooterRows(base, { recordIds: ['a', 'c'] }).map((r) => r.id)).toEqual(['b']);
  });

  it('leaves the rows alone for a create (no id yet) or anything unknown, and never changes the input', () => {
    expect(patchFooterRows(base, { record: { cost: 5 } })).toEqual(base);
    expect(patchFooterRows(base, undefined)).toEqual(base);
    patchFooterRows(base, { recordId: 'a', field: 'cost', value: 99 });
    expect(base[0].cost).toBe(1);
  });
});
