import { describe, expect, it, vi } from 'vitest';
import { createRecordDecorator, pickLookupSubset, type DecorateContext } from '../lib/recordDecorator';
import { evaluateFormula, parseFormula } from '../lib/formula';

type Ast = ReturnType<typeof parseFormula>;

function ctx(overrides: Partial<DecorateContext<Ast>> = {}): DecorateContext<Ast> {
  return {
    formulas: [],
    fieldMap: {},
    linkColumns: [],
    getLinkItems: () => undefined,
    lookup: undefined,
    evaluate: evaluateFormula,
    structure: ['s1'],
    ...overrides,
  };
}

const rec = (id: string, extra: Record<string, any> = {}) => ({ id, ...extra });

describe('createRecordDecorator', () => {
  it('passes rows straight through when there is nothing to add', () => {
    const d = createRecordDecorator();
    const raw = [rec('a'), rec('b')];
    expect(d.decorate(raw, ctx())).toBe(raw);
  });

  it('evaluates a formula once per row and not again when nothing about the row changed', () => {
    const d = createRecordDecorator();
    const evaluate = vi.fn(evaluateFormula);
    const formulas = [{ col: 'total', ast: parseFormula('{Price} * {Qty}') }];
    const base = ctx({ formulas, fieldMap: { Price: 'price', Qty: 'qty' }, evaluate });
    const raw = [rec('a', { price: 2, qty: 3 }), rec('b', { price: 5, qty: 4 })];

    const first = d.decorate(raw, base);
    expect(first.map((r) => r.total)).toEqual([6, 20]);
    expect(evaluate).toHaveBeenCalledTimes(2);

    // A new array holding the same row objects: same results, same identities, no formula work.
    const second = d.decorate([...raw], base);
    expect(evaluate).toHaveBeenCalledTimes(2);
    expect(second[0]).toBe(first[0]);
    expect(second[1]).toBe(first[1]);
  });

  it('rebuilds only the row that changed', () => {
    const d = createRecordDecorator();
    const evaluate = vi.fn(evaluateFormula);
    const base = ctx({
      formulas: [{ col: 'double', ast: parseFormula('{N} * 2') }],
      fieldMap: { N: 'n' },
      evaluate,
    });
    const a = rec('a', { n: 1 });
    const b = rec('b', { n: 2 });
    const first = d.decorate([a, b], base);

    const b2 = rec('b', { n: 10 });
    const second = d.decorate([a, b2], base);
    expect(second[0]).toBe(first[0]);
    expect(second[1]).not.toBe(first[1]);
    expect(second[1].double).toBe(20);
    expect(evaluate).toHaveBeenCalledTimes(3);
  });

  it('computes only the new rows when another page arrives', () => {
    const d = createRecordDecorator();
    const evaluate = vi.fn(evaluateFormula);
    const base = ctx({ formulas: [{ col: 'x', ast: parseFormula('{N} + 1') }], fieldMap: { N: 'n' }, evaluate });
    const page1 = [rec('a', { n: 1 }), rec('b', { n: 2 })];
    d.decorate(page1, base);
    evaluate.mockClear();
    const out = d.decorate([...page1, rec('c', { n: 3 })], base);
    expect(evaluate).toHaveBeenCalledTimes(1);
    expect(out.map((r) => r.x)).toEqual([2, 3, 4]);
  });

  it('rebuilds every row when the formulas or columns change', () => {
    const d = createRecordDecorator();
    const evaluate = vi.fn(evaluateFormula);
    const formulas = [{ col: 'x', ast: parseFormula('{N} + 1') }];
    const raw = [rec('a', { n: 1 })];
    d.decorate(raw, ctx({ formulas, fieldMap: { N: 'n' }, evaluate, structure: ['v1'] }));
    d.decorate(raw, ctx({ formulas, fieldMap: { N: 'n' }, evaluate, structure: ['v2'] }));
    expect(evaluate).toHaveBeenCalledTimes(2);
  });

  it('writes #ERROR for a formula that did not parse or that throws', () => {
    const d = createRecordDecorator();
    const out = d.decorate(
      [rec('a')],
      ctx({
        formulas: [
          { col: 'bad', ast: null },
          { col: 'boom', ast: parseFormula('1 + 1') },
        ],
        evaluate: () => {
          throw new Error('nope');
        },
      }),
    );
    expect(out[0].bad).toBe('#ERROR');
    expect(out[0].boom).toBe('#ERROR');
  });

  it('puts loaded link ids in the link column so formulas can read them', () => {
    const d = createRecordDecorator();
    const getLinkItems = (fieldId: string, recordId: string) =>
      fieldId === 'fMonth' && recordId === 'a' ? [{ id: 'm1', label: 'October' }] : undefined;
    const out = d.decorate(
      [rec('a', { category: 'Rent' }), rec('b', { category: 'Fuel', __link_month: ['old'] })],
      ctx({
        formulas: [{ col: 'label', ast: parseFormula('{Month} & " - " & {Category}') }],
        fieldMap: { Month: '__link_month', Category: 'category' },
        linkColumns: [{ fieldId: 'fMonth', column: '__link_month' }],
        getLinkItems,
        lookup: { m1: 'October 2026', old: 'Stale name' },
      }),
    );
    expect(out[0].__link_month).toEqual(['m1']);
    expect(out[0].label).toBe('October 2026 - Rent');
    // Record b's link data has not loaded: its stored ids stay and are named through the lookup.
    expect(out[1].__link_month).toEqual(['old']);
    expect(out[1].label).toBe('Stale name - Fuel');
  });

  it('keeps a row untouched when an unrelated name arrives in the lookup, and rebuilds the rows that refer to it', () => {
    const d = createRecordDecorator();
    const evaluate = vi.fn(evaluateFormula);
    const mk = (lookup: Record<string, string>) =>
      ctx({
        formulas: [{ col: 'shown', ast: parseFormula('{Link}') }],
        fieldMap: { Link: 'link' },
        lookup,
        evaluate,
      });
    const raw = [rec('a', { link: ['x1'] }), rec('b', { link: ['y1'] })];

    const first = d.decorate(raw, mk({ x1: 'Ex' }));
    expect(first[0].shown).toBe('Ex');
    expect(first[1].shown).toBe('y1');
    evaluate.mockClear();

    // y1 gets a name: only the row that refers to y1 changes.
    const second = d.decorate(raw, mk({ x1: 'Ex', y1: 'Why' }));
    expect(second[0]).toBe(first[0]);
    expect(second[1]).not.toBe(first[1]);
    expect(second[1].shown).toBe('Why');
    expect(evaluate).toHaveBeenCalledTimes(1);

    // A name nobody refers to arrives: nothing changes at all.
    evaluate.mockClear();
    const third = d.decorate(raw, mk({ x1: 'Ex', y1: 'Why', z9: 'Unused' }));
    expect(third[0]).toBe(second[0]);
    expect(third[1]).toBe(second[1]);
    expect(evaluate).not.toHaveBeenCalled();
  });

  it('gives the row only the names it refers to', () => {
    const d = createRecordDecorator();
    const out = d.decorate(
      [rec('a', { link: ['x1'], title: 'Hello' })],
      ctx({ lookup: { x1: 'Ex', other: 'Other' } }),
    );
    expect(out[0].__linkLookup).toEqual({ x1: 'Ex' });
    expect(out[0].title).toBe('Hello');
  });

  it('forgets rows that are no longer loaded', () => {
    const d = createRecordDecorator();
    const base = ctx({ formulas: [{ col: 'x', ast: parseFormula('1') }] });
    d.decorate([rec('a'), rec('b')], base);
    expect(d.size()).toBe(2);
    d.decorate([rec('a')], base);
    expect(d.size()).toBe(1);
  });
});

describe('pickLookupSubset', () => {
  it('reads text values, lists of text, and lists of numbers, and ignores the skipped columns', () => {
    const lookup = { a: 'A', b: 'B', '7': 'Seven', skipped: 'S' };
    const sub = pickLookupSubset(
      { one: 'a', many: ['b', 'zzz'], nums: [7], gone: 'skipped', plain: 'nothing' },
      lookup,
      new Set(['gone']),
      [],
    );
    expect(sub).toEqual({ a: 'A', b: 'B', '7': 'Seven' });
  });

  it('includes the ids of freshly loaded link items', () => {
    expect(pickLookupSubset({}, { m1: 'M' }, new Set(), ['m1', 'nope'])).toEqual({ m1: 'M' });
  });
});
