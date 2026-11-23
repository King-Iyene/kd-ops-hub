import { describe, expect, it } from 'vitest';
import { computeRollupValue, ROLLUP_FUNCTIONS } from '../lib/computations';

const target = { id: 't', pg_column_name: 'v', ui_type: 'Number', name: 'V' } as any;
const rollup = (fn: string) => ({ ui_type: 'Rollup', options: { fn, rollupFieldId: 't' } }) as any;
const rows = (...values: unknown[]) => values.map((v) => ({ id: String(Math.random()), v })) as any[];
const run = (fn: string, values: unknown[]) => computeRollupValue({} as any, rollup(fn), [target], rows(...values));

describe('rollup functions', () => {
  it('lists the new functions', () => {
    for (const fn of ['AND', 'OR', 'XOR', 'ARRAYJOIN', 'ARRAYCOMPACT', 'MEDIAN']) expect(ROLLUP_FUNCTIONS).toContain(fn);
  });
  it('MEDIAN of linked values', () => {
    expect(run('MEDIAN', [3, 1, 2])).toBe(2);
    expect(run('MEDIAN', [4, 1, 3, 2])).toBe(2.5);
    expect(run('MEDIAN', [])).toBeNull();
  });
  it('AND, OR and XOR judge true and false values and ignore blanks', () => {
    expect(run('AND', [true, true])).toBe(true);
    expect(run('AND', [true, false])).toBe(false);
    expect(run('AND', [true, null, ''])).toBe(true);
    expect(run('OR', [false, true])).toBe(true);
    expect(run('OR', [false, false])).toBe(false);
    expect(run('XOR', [true, false, true])).toBe(false);
    expect(run('XOR', [true, false])).toBe(true);
    expect(run('AND', [])).toBeNull();
  });
  it('ARRAYJOIN joins and ARRAYCOMPACT drops blanks', () => {
    expect(run('ARRAYJOIN', ['a', 'b'])).toBe('a, b');
    expect(run('ARRAYCOMPACT', ['a', '', null, 'b'])).toEqual(['a', 'b']);
  });
});
