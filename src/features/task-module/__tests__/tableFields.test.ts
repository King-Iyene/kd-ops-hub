import { describe, expect, it } from 'vitest';
import type { TableField, TableFieldType, TableRecordRow } from '@/queries/useTaskModule';
import { csvCell, displayText, parseImported } from '../table/fieldTypes';
import { rowMatches, rowSearch, sortRows, type RowFilter } from '../table/tableQuery';

const field = (id: string, type: TableFieldType, config: TableField['config'] = {}): TableField =>
  ({ id, table_id: 'T', name: id, type, config, position: 0, created_at: '' });
const row = (id: string, data: Record<string, unknown>, extra: Partial<TableRecordRow> = {}): TableRecordRow =>
  ({ id, table_id: 'T', data, position: 0, row_number: 1, created_by: 'p1', created_at: '2026-11-01T10:00:00Z', updated_at: '2026-11-02T10:00:00Z', ...extra });
const names = { personName: (id: string) => ({ p1: 'Ada', p2: 'Bayo' }[id] ?? '?'), taskTitle: (id: string) => ({ t1: 'Fix VPN' }[id] ?? '?') };
const lookups = { personByName: (s: string) => ({ ada: 'p1', 'b@x.com': 'p2' }[s.toLowerCase()]), taskByTitle: (s: string) => (s.toLowerCase() === 'fix vpn' ? 't1' : undefined) };

describe('importing CSV cells', () => {
  it('numbers, currency, rating, checkbox, dates', () => {
    expect(parseImported(field('n', 'number'), '1,250.5', lookups)).toBe(1250.5);
    expect(parseImported(field('c', 'currency'), '₦12,000', lookups)).toBe(12000);
    expect(parseImported(field('n', 'number'), 'abc', lookups)).toBeUndefined();
    expect(parseImported(field('r', 'rating', { rating_max: 5 }), '4/5', lookups)).toBe(4);
    expect(parseImported(field('r', 'rating', { rating_max: 5 }), '9', lookups)).toBeUndefined();
    expect(parseImported(field('b', 'checkbox'), 'Yes', lookups)).toBe(true);
    expect(parseImported(field('d', 'date'), '19/11/2026', lookups)).toBe('2026-11-19');
    expect(parseImported(field('d', 'date'), '2026-11-19', lookups)).toBe('2026-11-19');
  });
  it('options must match; people and tasks by name', () => {
    const s = field('s', 'single_select', { options: ['On track', 'Blocked'] });
    expect(parseImported(s, 'blocked', lookups)).toBe('Blocked');
    expect(parseImported(s, 'Maybe', lookups)).toBeUndefined();
    expect(parseImported(field('m', 'multi_select', { options: ['a', 'b', 'c'] }), 'A, c, z', lookups)).toEqual(['a', 'c']);
    expect(parseImported(field('p', 'person'), 'Ada', lookups)).toBe('p1');
    expect(parseImported(field('p', 'person', { multiple: true }), 'ada, b@x.com', lookups)).toEqual(['p1', 'p2']);
    expect(parseImported(field('t', 'task'), 'Fix VPN', lookups)).toBe('t1');
    expect(parseImported(field('t', 'task'), 'Nope', lookups)).toBeUndefined();
  });
  it('text is cut to the maximum length; computed fields are never imported', () => {
    expect(parseImported(field('x', 'text', { max_length: 3 }), 'abcdef', lookups)).toBe('abc');
    expect(parseImported(field('a', 'auto_number'), '7', lookups)).toBeUndefined();
  });
});

describe('export safety', () => {
  it('quotes commas and defuses formulas', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"');
  });
});

describe('display, search, filter, sort', () => {
  const fName = field('name', 'person');
  const fTask = field('task', 'task');
  const fHours = field('hours', 'currency', { currency: '₦', decimals: 0 });
  const fStatus = field('status', 'single_select', { options: ['On track', 'Blocked'] });
  const fNum = field('num', 'auto_number');
  const fields = [fName, fTask, fHours, fStatus, fNum];
  const r1 = row('r1', { name: 'p1', task: 't1', hours: 5000, status: 'Blocked' }, { row_number: 1 });
  const r2 = row('r2', { name: 'p2', hours: 200 }, { row_number: 2 });
  const r3 = row('r3', {}, { row_number: 3 });

  it('display text resolves people, tasks, money and auto numbers', () => {
    expect(displayText(fName, r1, names)).toBe('Ada');
    expect(displayText(fTask, r1, names)).toBe('Fix VPN');
    expect(displayText(fHours, r1, names)).toMatch(/^₦5,?000$/);
    expect(displayText(fNum, r2, names)).toBe('2');
  });
  it('search looks through display text', () => {
    expect([r1, r2, r3].filter((r) => rowSearch(r, fields, 'vpn', names)).map((r) => r.id)).toEqual(['r1']);
    expect([r1, r2, r3].filter((r) => rowSearch(r, fields, 'bayo', names)).map((r) => r.id)).toEqual(['r2']);
  });
  it('filters', () => {
    const f = (x: Partial<RowFilter>): RowFilter => ({ id: 'x', fieldId: 'status', op: 'any', text: '', values: [], ...x });
    const run = (flt: RowFilter[]) => [r1, r2, r3].filter((r) => rowMatches(r, fields, flt, names)).map((r) => r.id);
    expect(run([f({ values: ['Blocked'] })])).toEqual(['r1']);
    expect(run([f({ op: 'none', values: ['Blocked'] })])).toEqual(['r2', 'r3']);
    expect(run([f({ op: 'empty' })])).toEqual(['r2', 'r3']);
    expect(run([f({ fieldId: 'name', op: 'any', values: ['p2'] })])).toEqual(['r2']);
    expect(run([f({ fieldId: 'task', op: 'contains', text: 'vpn' })])).toEqual(['r1']);
    expect(run([f({ values: [] })])).toEqual(['r1', 'r2', 'r3']);
  });
  it('sorts numbers numerically, empty last either way', () => {
    expect(sortRows([r2, r3, r1], fields, { fieldId: 'hours', dir: 'asc' }, names).map((r) => r.id)).toEqual(['r2', 'r1', 'r3']);
    expect(sortRows([r2, r3, r1], fields, { fieldId: 'hours', dir: 'desc' }, names).map((r) => r.id)).toEqual(['r1', 'r2', 'r3']);
    expect(sortRows([r3, r1, r2], fields, { fieldId: 'num', dir: 'desc' }, names).map((r) => r.id)).toEqual(['r3', 'r2', 'r1']);
  });
});
