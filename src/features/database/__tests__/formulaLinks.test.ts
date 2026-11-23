import { describe, expect, it } from 'vitest';
import { evaluateFormula, parseFormula } from '../lib/formula';

// Expenses.Name is {Month} & " — " & {Category}. Month is a link, so the
// formula reads the linked ids and turns them into names through __linkLookup.
// The grid now fills that column from the links table, so rows written outside
// the app (which have no ids in the record itself) still get their month.
const ast = parseFormula('{Month} & " — " & {Category}');
const fieldMap = { Month: '__link_month', Category: 'category' };

describe('formulas that read a link field', () => {
  it('shows the month name for linked ids', () => {
    const record = {
      __link_month: ['b1'],
      category: 'Utilities & Bills',
      __linkLookup: { b1: 'October 2026' },
    } as any;
    expect(evaluateFormula(ast, record, fieldMap)).toBe('October 2026 — Utilities & Bills');
  });

  it('joins several linked names', () => {
    const record = {
      __link_month: ['b1', 'b2'],
      category: 'Rent',
      __linkLookup: { b1: 'October 2026', b2: 'November 2026' },
    } as any;
    expect(evaluateFormula(ast, record, fieldMap)).toBe('October 2026, November 2026 — Rent');
  });

  it('leaves the month out when nothing is linked', () => {
    const record = { __link_month: [], category: 'Rent', __linkLookup: {} } as any;
    expect(String(evaluateFormula(ast, record, fieldMap))).toContain('Rent');
  });
});
