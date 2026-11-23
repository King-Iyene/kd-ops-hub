import { describe, expect, it } from 'vitest';
import {
  currencySymbol,
  formatCurrency,
  formatNumber,
  formatPercent,
  parseNumberInput,
  resolveCurrencyCode,
} from '../lib/numberFormat';

describe('currency codes and symbols', () => {
  it('resolves codes, symbols and junk', () => {
    expect(resolveCurrencyCode('NGN')).toBe('NGN');
    expect(resolveCurrencyCode('ngn')).toBe('NGN');
    expect(resolveCurrencyCode('₦')).toBe('NGN');
    expect(resolveCurrencyCode('$')).toBe('USD');
    expect(resolveCurrencyCode(undefined)).toBe('USD');
    expect(resolveCurrencyCode('what')).toBe('USD');
  });
  it('gives one symbol per currency', () => {
    expect(currencySymbol('NGN')).toBe('₦');
    expect(currencySymbol('USD')).toBe('$');
    expect(currencySymbol('EUR')).toBe('€');
    expect(currencySymbol('GBP')).toBe('£');
    expect(currencySymbol('CAD')).toBe('CA$');
  });
});

describe('formatCurrency', () => {
  it('shows the symbol, grouping and two decimals by default', () => {
    expect(formatCurrency(8500000, { currencyCode: 'NGN' })).toBe('₦8,500,000.00');
    expect(formatCurrency(482539.27, { currencyCode: 'NGN' })).toBe('₦482,539.27');
    expect(formatCurrency(97.7, { currencyCode: 'USD' })).toBe('$97.70');
  });
  it('honours precision and thousands', () => {
    expect(formatCurrency(1234.5, { currencyCode: 'USD', precision: 0 })).toBe('$1,235');
    expect(formatCurrency(1234.5, { currencyCode: 'USD', thousands: false })).toBe('$1234.50');
  });
  it('writes negatives with a minus or with brackets', () => {
    expect(formatCurrency(-1234.5, { currencyCode: 'NGN' })).toBe('-₦1,234.50');
    expect(formatCurrency(-1234.5, { currencyCode: 'NGN', negativeStyle: 'parentheses' })).toBe('(₦1,234.50)');
  });
  it('never shows a negative zero', () => {
    expect(formatCurrency(-0.001, { currencyCode: 'USD' })).toBe('$0.00');
  });
  it('abbreviates when asked', () => {
    expect(formatCurrency(1200000, { currencyCode: 'NGN', abbreviate: true })).toBe('₦1.2M');
  });
});

describe('formatNumber', () => {
  it('drops trailing zeros and keeps up to three decimals without a precision', () => {
    expect(formatNumber(1234567)).toBe('1,234,567');
    expect(formatNumber(603123.664)).toBe('603,123.664');
    expect(formatNumber(2.5)).toBe('2.5');
  });
  it('uses a fixed precision when set', () => {
    expect(formatNumber(2.5, { precision: 2 })).toBe('2.50');
    expect(formatNumber(2.567, { precision: 1 })).toBe('2.6');
    expect(formatNumber(1500, { precision: 0 })).toBe('1,500');
  });
  it('uses the default precision of the field type when none is set', () => {
    expect(formatNumber(2, { defaultPrecision: 2 })).toBe('2.00');
    expect(formatNumber(2, { precision: 0, defaultPrecision: 2 })).toBe('2');
  });
  it('supports prefix, suffix and abbreviation', () => {
    expect(formatNumber(12, { prefix: '#' })).toBe('#12');
    expect(formatNumber(12.5, { suffix: ' kg', precision: 1 })).toBe('12.5 kg');
    expect(formatNumber(3400000, { abbreviate: true })).toBe('3.4M');
  });
  it('writes negatives', () => {
    expect(formatNumber(-1234)).toBe('-1,234');
    expect(formatNumber(-1234, { negativeStyle: 'parentheses' })).toBe('(1,234)');
  });
  it('passes through values that are not finite', () => {
    expect(formatNumber(NaN)).toBe('NaN');
  });
});

describe('formatPercent', () => {
  it('shows whole numbers as percentages', () => {
    expect(formatPercent(50)).toBe('50%');
    expect(formatPercent(12.345)).toBe('12.35%');
    expect(formatPercent(12.3, { precision: 1 })).toBe('12.3%');
    expect(formatPercent(7, { precision: 2 })).toBe('7.00%');
  });
});

describe('parseNumberInput', () => {
  it('reads plain and formatted numbers', () => {
    expect(parseNumberInput('1234.5')).toBe(1234.5);
    expect(parseNumberInput('₦1,234.50')).toBe(1234.5);
    expect(parseNumberInput(' 42 ')).toBe(42);
    expect(parseNumberInput('50%')).toBe(50);
  });
  it('reads negatives in both styles', () => {
    expect(parseNumberInput('-12')).toBe(-12);
    expect(parseNumberInput('(500)')).toBe(-500);
    expect(parseNumberInput('-$3.5')).toBe(-3.5);
  });
  it('reads k, m and b suffixes', () => {
    expect(parseNumberInput('1.2M')).toBe(1200000);
    expect(parseNumberInput('15k')).toBe(15000);
    expect(parseNumberInput('2b')).toBe(2e9);
  });
  it('rejects text and blanks', () => {
    expect(parseNumberInput('abc')).toBeNull();
    expect(parseNumberInput('')).toBeNull();
    expect(parseNumberInput('1.2.3')).toBeNull();
    expect(parseNumberInput('--5')).toBeNull();
  });
});
