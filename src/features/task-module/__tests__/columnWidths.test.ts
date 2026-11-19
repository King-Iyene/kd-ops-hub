import { describe, expect, it } from 'vitest';
import type { TableField, TableRecordRow } from '@/queries/useTaskModule';
import { MIN_COL, autoWidth, clampWidth, effectiveWidth, halfOf } from '../table/columnWidths';

const names = { personName: (id: string) => id, taskTitle: (id: string) => id };
const text = { id: 'f', name: 'Summary', type: 'text', config: {} } as TableField;
const rec = (v: string): TableRecordRow => ({ id: v, table_id: 't', data: { f: v }, position: 0, row_number: null, created_by: null, created_at: '', updated_at: '' });

describe('column widths', () => {
  it('half the table is the most a column takes on its own', () => {
    expect(halfOf(1200)).toBe(600);
    expect(halfOf(100)).toBe(240); // never below a readable minimum
  });
  it('long content takes half the table', () => {
    const long = 'x'.repeat(600);
    expect(autoWidth(text, [rec(long)], names, 1200)).toBe(600);
    expect(autoWidth(text, [rec(long)], names, 800)).toBe(400);
  });
  it('short content shows fully and does not stretch to half', () => {
    const w = autoWidth(text, [rec('Done')], names, 1200);
    expect(w).toBeLessThan(300);
    expect(w).toBeGreaterThanOrEqual(120);
  });
  it('a medium value is sized to the content', () => {
    const a = autoWidth(text, [rec('x'.repeat(30))], names, 1200);
    const b = autoWidth(text, [rec('x'.repeat(50))], names, 1200);
    expect(b).toBeGreaterThan(a);
    expect(b).toBeLessThan(600);
  });
  it('the header name is never cut off', () => {
    const f = { ...text, name: 'A fairly long field name' } as TableField;
    expect(autoWidth(f, [rec('1')], names, 1200)).toBeGreaterThanOrEqual(24 * 7.5);
  });
  it('an empty column still has a sensible width', () => {
    expect(autoWidth(text, [], names, 1200)).toBeGreaterThanOrEqual(120);
  });
  it('a dragged width wins over the automatic one, within limits', () => {
    expect(effectiveWidth(300, 500, 1200)).toBe(300);
    expect(effectiveWidth(undefined, 500, 1200)).toBe(500);
    expect(effectiveWidth(5, 500, 1200)).toBe(MIN_COL);
    expect(clampWidth(99999, 1200)).toBe(1200);
    expect(effectiveWidth(Number.NaN, 500, 1200)).toBe(500);
  });
  it('a dragged width may be wider than half (the cap only applies by default)', () => {
    expect(effectiveWidth(900, 400, 1200)).toBe(900);
  });
});

describe('row height', () => {
  it('has three fixed heights, default in the middle, and only the tall one shows two lines', async () => {
    const { ROW_HEIGHTS, asRowHeight, DEFAULT_ROW_HEIGHT } = await import('../table/columnWidths');
    expect(ROW_HEIGHTS.compact.px).toBeLessThan(ROW_HEIGHTS.default.px);
    expect(ROW_HEIGHTS.default.px).toBeLessThan(ROW_HEIGHTS.tall.px);
    expect([ROW_HEIGHTS.compact.lines, ROW_HEIGHTS.default.lines, ROW_HEIGHTS.tall.lines]).toEqual([1, 1, 2]);
    expect(DEFAULT_ROW_HEIGHT).toBe('default');
    expect(asRowHeight('tall')).toBe('tall');
    expect(asRowHeight('compact')).toBe('compact');
    expect(asRowHeight('huge')).toBe('default');
    expect(asRowHeight(undefined)).toBe('default');
  });
});
