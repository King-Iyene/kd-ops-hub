import { describe, expect, it } from 'vitest';
import { defaultForNewRow, normalizeDefault, supportsDefault } from '../lib/fieldDefaults';

const base = { is_system: false, pg_column_name: 'col', options: {}, default_value: null as string | null };
const f = (ui_type: string, extra: Record<string, unknown> = {}) => ({ ...base, ui_type, ...extra }) as any;
const TODAY = '2026-11-22';
const NOW = '2026-11-22T10:00:00.000Z';

describe('defaultForNewRow', () => {
  it('has no default when nothing is set', () => {
    expect(defaultForNewRow(f('SingleLineText'), TODAY, NOW)).toBeUndefined();
    expect(defaultForNewRow(f('Number', { default_value: '' }), TODAY, NOW)).toBeUndefined();
    expect(defaultForNewRow(f('Number', { default_value: '   ' }), TODAY, NOW)).toBeUndefined();
  });
  it('uses text as it is', () => {
    expect(defaultForNewRow(f('SingleLineText', { default_value: 'Pending' }), TODAY, NOW)).toBe('Pending');
  });
  it('turns numbers into numbers and ignores junk', () => {
    expect(defaultForNewRow(f('Currency', { default_value: '2500.5' }), TODAY, NOW)).toBe(2500.5);
    expect(defaultForNewRow(f('Rating', { default_value: '3' }), TODAY, NOW)).toBe(3);
    expect(defaultForNewRow(f('Number', { default_value: 'abc' }), TODAY, NOW)).toBeUndefined();
  });
  it('turns checkbox text into a boolean', () => {
    expect(defaultForNewRow(f('Checkbox', { default_value: 'true' }), TODAY, NOW)).toBe(true);
    expect(defaultForNewRow(f('Checkbox', { default_value: 'false' }), TODAY, NOW)).toBe(false);
  });
  it('uses a select default only while that option exists', () => {
    const options = { choices: [{ title: 'Utilities & Bills' }, { title: 'Rent' }] };
    expect(defaultForNewRow(f('SingleSelect', { options, default_value: 'Utilities & Bills' }), TODAY, NOW)).toBe('Utilities & Bills');
    expect(defaultForNewRow(f('MultiSelect', { options, default_value: 'Rent' }), TODAY, NOW)).toEqual(['Rent']);
    expect(defaultForNewRow(f('SingleSelect', { options, default_value: 'Gone' }), TODAY, NOW)).toBeUndefined();
  });
  it('fills dates from the "default to today" switch', () => {
    expect(defaultForNewRow(f('Date', { options: { defaultToCurrentDate: true } }), TODAY, NOW)).toBe(TODAY);
    expect(defaultForNewRow(f('DateTime', { options: { defaultToCurrentDate: true } }), TODAY, NOW)).toBe(NOW);
    expect(defaultForNewRow(f('Date'), TODAY, NOW)).toBeUndefined();
  });
  it('never fills system or virtual columns', () => {
    expect(defaultForNewRow(f('SingleLineText', { is_system: true, default_value: 'x' }), TODAY, NOW)).toBeUndefined();
    expect(defaultForNewRow(f('SingleLineText', { pg_column_name: '', default_value: 'x' }), TODAY, NOW)).toBeUndefined();
  });
});

describe('normalizeDefault', () => {
  it('clears blanks', () => {
    expect(normalizeDefault('SingleLineText', '   ')).toBeNull();
  });
  it('keeps valid numbers and drops invalid ones', () => {
    expect(normalizeDefault('Number', ' 12.50 ')).toBe('12.5');
    expect(normalizeDefault('Number', 'twelve')).toBeNull();
  });
  it('stores a checkbox default only when it is on', () => {
    expect(normalizeDefault('Checkbox', 'true')).toBe('true');
    expect(normalizeDefault('Checkbox', 'false')).toBeNull();
  });
});

describe('supportsDefault', () => {
  it('covers editable types only', () => {
    expect(supportsDefault('SingleSelect')).toBe(true);
    expect(supportsDefault('Formula')).toBe(false);
    expect(supportsDefault('Links')).toBe(false);
  });
});
