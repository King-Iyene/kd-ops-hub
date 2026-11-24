import { describe, expect, it } from 'vitest';
import { plainNumberString, sameCellValue } from '../lib/cellValue';

describe('sameCellValue', () => {
  it('treats every kind of empty as the same', () => {
    expect(sameCellValue(null, undefined)).toBe(true);
    expect(sameCellValue('', null)).toBe(true);
    expect(sameCellValue(undefined, '')).toBe(true);
  });
  it('does not treat zero or false as empty', () => {
    expect(sameCellValue(0, null)).toBe(false);
    expect(sameCellValue(false, null)).toBe(false);
    expect(sameCellValue('', 0)).toBe(false);
  });
  it('compares numbers and numeric text', () => {
    expect(sameCellValue(12, '12')).toBe(true);
    expect(sameCellValue('12.50', 12.5)).toBe(true);
    expect(sameCellValue(12, 13)).toBe(false);
    expect(sameCellValue(12, 'abc')).toBe(false);
  });
  it('compares lists and objects by content', () => {
    expect(sameCellValue(['a', 'b'], ['a', 'b'])).toBe(true);
    expect(sameCellValue(['a', 'b'], ['b', 'a'])).toBe(false);
    expect(sameCellValue([], null)).toBe(false);
    expect(sameCellValue({ x: 1 }, { x: 1 })).toBe(true);
  });
  it('compares text exactly', () => {
    expect(sameCellValue('Rent', 'Rent')).toBe(true);
    expect(sameCellValue('Rent', 'rent')).toBe(false);
  });
});

describe('plainNumberString', () => {
  it('keeps ordinary numbers as they are', () => {
    expect(plainNumberString(1234.5)).toBe('1234.5');
    expect(plainNumberString(-3)).toBe('-3');
  });
  it('never uses exponent form', () => {
    expect(plainNumberString(1e-7)).toBe('0.0000001');
    expect(plainNumberString(0.00000012)).toBe('0.00000012');
  });
  it('is empty for numbers that are not finite', () => {
    expect(plainNumberString(NaN)).toBe('');
  });
});
