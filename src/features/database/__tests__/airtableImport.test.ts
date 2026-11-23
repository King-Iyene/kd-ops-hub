import { describe, expect, it } from 'vitest';
import { linkOptionsFromAirtable, numberFromAirtable } from '../lib/airtableImport';

describe('numberFromAirtable', () => {
  it('turns a percent fraction into the number shown (0.25 becomes 25)', () => {
    expect(numberFromAirtable('Percent', 'NUMERIC', 0.25)).toBe(25);
    expect(numberFromAirtable('Percent', 'NUMERIC', 0.1)).toBe(10);
    expect(numberFromAirtable('Percent', 'NUMERIC', 1)).toBe(100);
    expect(numberFromAirtable('Percent', 'NUMERIC', 0)).toBe(0);
  });

  it('does not leave floating point noise (0.07 * 100 is 7.000000000000001)', () => {
    expect(numberFromAirtable('Percent', 'NUMERIC', 0.07)).toBe(7);
    expect(numberFromAirtable('Percent', 'NUMERIC', 0.29)).toBe(29);
    expect(numberFromAirtable('Percent', 'NUMERIC', 0.125)).toBe(12.5);
  });

  it('keeps small and negative percents', () => {
    expect(numberFromAirtable('Percent', 'NUMERIC', 0.0005)).toBe(0.05);
    expect(numberFromAirtable('Percent', 'NUMERIC', -0.15)).toBe(-15);
  });

  it('leaves other number types as they are', () => {
    expect(numberFromAirtable('Number', 'NUMERIC', 0.25)).toBe(0.25);
    expect(numberFromAirtable('Currency', 'NUMERIC', 1234.5)).toBe(1234.5);
  });

  it('rounds whole-number columns', () => {
    expect(numberFromAirtable('Duration', 'INTEGER', 90.4)).toBe(90);
    expect(numberFromAirtable('Rating', 'SMALLINT', 3.6)).toBe(4);
  });

  it('refuses what is not a number', () => {
    expect(numberFromAirtable('Number', 'NUMERIC', 'abc')).toBeUndefined();
    expect(numberFromAirtable('Number', 'NUMERIC', '')).toBeUndefined();
    expect(numberFromAirtable('Number', 'NUMERIC', null)).toBeUndefined();
    expect(numberFromAirtable('Percent', 'NUMERIC', Infinity)).toBeUndefined();
  });

  it('accepts a number sent as text', () => {
    expect(numberFromAirtable('Number', 'NUMERIC', '12.5')).toBe(12.5);
    expect(numberFromAirtable('Percent', 'NUMERIC', '0.5')).toBe(50);
  });
});

describe('linkOptionsFromAirtable', () => {
  it('a single-record link becomes allowMultiple: false, which the cell and the editor read', () => {
    const out = linkOptionsFromAirtable({ prefersSingleRecordLink: true });
    expect(out.allowMultiple).toBe(false);
    expect(out.prefersSingleRecordLink).toBe(true);
  });

  it('a normal link sets nothing about multiplicity', () => {
    const out = linkOptionsFromAirtable({ prefersSingleRecordLink: false });
    expect('allowMultiple' in out).toBe(false);
  });

  it('keeps the inverse link id, and copes with no options', () => {
    expect(linkOptionsFromAirtable({ inverseLinkFieldId: 'fldX' }).inverseLinkFieldId).toBe('fldX');
    expect(linkOptionsFromAirtable(undefined)).toEqual({});
  });
});
