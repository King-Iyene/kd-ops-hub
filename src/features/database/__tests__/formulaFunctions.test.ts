import { describe, expect, it } from 'vitest';
import { evaluateFormula, parseFormula, validateFormula, FORMULA_FUNCTIONS } from '../lib/formula';

const run = (expr: string, record: Record<string, any> = {}, fieldMap: Record<string, string> = {}) =>
  evaluateFormula(parseFormula(expr), record, fieldMap);

describe('math functions', () => {
  it('AVERAGE ignores blanks', () => {
    expect(run('AVERAGE(2, 4, 6)')).toBe(4);
    expect(run('AVERAGE(2, "", 4)')).toBe(3);
    expect(run('AVERAGE("", "")')).toBeNull();
  });
  it('ROUNDUP goes away from zero and ROUNDDOWN toward zero', () => {
    expect(run('ROUNDUP(2.11, 1)')).toBe(2.2);
    expect(run('ROUNDUP(-2.11, 1)')).toBe(-2.2);
    expect(run('ROUNDDOWN(2.99, 1)')).toBe(2.9);
    expect(run('ROUNDDOWN(-2.99, 1)')).toBe(-2.9);
    expect(run('ROUNDUP(2.1)')).toBe(3);
  });
  it('INT floors and SIGN gives the sign', () => {
    expect(run('INT(-2.5)')).toBe(-3);
    expect(run('INT(2.9)')).toBe(2);
    expect(run('SIGN(-4)')).toBe(-1);
    expect(run('SIGN(0)')).toBe(0);
  });
  it('VALUE turns text into a number', () => {
    expect(run('VALUE("1,234.50")')).toBe(1234.5);
    expect(run('VALUE("₦2,000")')).toBe(2000);
    expect(run('VALUE("12%")')).toBe(12);
    expect(run('VALUE("abc")')).toBeNull();
    expect(run('VALUE("")')).toBeNull();
  });
});

describe('text functions', () => {
  it('FIND is case sensitive and returns 0 when missing', () => {
    expect(run('FIND("b", "abcb")')).toBe(2);
    expect(run('FIND("B", "abcb")')).toBe(0);
    expect(run('FIND("b", "abcb", 3)')).toBe(4);
  });
  it('REGEX functions work and never throw on a bad pattern', () => {
    expect(run('REGEX_MATCH("ref-123", "[0-9]+")')).toBe(true);
    expect(run('REGEX_MATCH("abc", "[0-9]+")')).toBe(false);
    expect(run('REGEX_EXTRACT("ref-123-x", "([0-9]+)")')).toBe('123');
    expect(run('REGEX_EXTRACT("abc", "[0-9]+")')).toBeNull();
    expect(run('REGEX_REPLACE("a1b22", "[0-9]+", "#")')).toBe('a#b#');
    expect(run('REGEX_MATCH("abc", "(")')).toBe(false);
    expect(run('REGEX_REPLACE("abc", "(", "x")')).toBe('abc');
  });
  it('ENCODE_URL_COMPONENT and T', () => {
    expect(run('ENCODE_URL_COMPONENT("a b&c")')).toBe('a%20b%26c');
    expect(run('T("text")')).toBe('text');
    expect(run('T(5)')).toBe('');
  });
  it('ARRAYJOIN swaps the separator of a list that arrives joined', () => {
    expect(run('ARRAYJOIN({Months}, " / ")', { m: ['x', 'y'] }, { Months: 'm' })).toBe('x / y');
    expect(run('ARRAYJOIN("one")')).toBe('one');
  });
});

describe('logic functions', () => {
  it('XOR is true for an odd number of true values', () => {
    expect(run('XOR(TRUE(), FALSE())')).toBe(true);
    expect(run('XOR(TRUE(), TRUE())')).toBe(false);
    expect(run('XOR(TRUE(), TRUE(), TRUE())')).toBe(true);
  });
});

describe('date functions', () => {
  it('IS_AFTER and IS_BEFORE compare moments and return null for bad dates', () => {
    expect(run('IS_AFTER("2026-11-22", "2026-11-21")')).toBe(true);
    expect(run('IS_AFTER("2026-11-21", "2026-11-22")')).toBe(false);
    expect(run('IS_BEFORE("2026-11-21", "2026-11-22")')).toBe(true);
    expect(run('IS_AFTER("nope", "2026-11-22")')).toBeNull();
  });
  it('IS_SAME compares by unit', () => {
    expect(run('IS_SAME("2026-11-22", "2026-11-05", "month")')).toBe(true);
    expect(run('IS_SAME("2026-11-22", "2026-12-22", "month")')).toBe(false);
    expect(run('IS_SAME("2026-11-22", "2025-11-22", "year")')).toBe(false);
    expect(run('IS_SAME("2026-11-22", "2026-11-22", "day")')).toBe(true);
  });
  it('DATETIME_DIFF is the first date minus the second', () => {
    expect(run('DATETIME_DIFF("2026-11-22", "2026-11-20", "days")')).toBe(2);
    expect(run('DATETIME_DIFF("2026-11-20", "2026-11-22", "days")')).toBe(-2);
  });
  it('reads parts of a time', () => {
    expect(run('HOUR("2026-11-22T14:30:45")')).toBe(14);
    expect(run('MINUTE("2026-11-22T14:30:45")')).toBe(30);
    expect(run('SECOND("2026-11-22T14:30:45")')).toBe(45);
    expect(run('DATESTR("2026-11-22T14:30:45")')).toBe('2026-11-22');
    expect(run('TIMESTR("2026-11-22T14:30:45")')).toBe('14:30:45');
  });
  it('WEEKNUM follows ISO weeks', () => {
    expect(run('WEEKNUM("2026-01-01")')).toBe(1);
    expect(run('WEEKNUM("2026-11-22")')).toBe(47);
    expect(run('WEEKNUM("2021-01-03")')).toBe(53);
  });
  it('WORKDAY skips weekends in both directions', () => {
    // Friday 20 Nov 2026 plus 1 working day is Monday 23 Nov.
    expect(run('WORKDAY("2026-11-20", 1)')).toBe('2026-11-23');
    expect(run('WORKDAY("2026-11-23", -1)')).toBe('2026-11-20');
    expect(run('WORKDAY("2026-11-20", 5)')).toBe('2026-11-27');
    expect(run('WORKDAY("2026-11-20", 0)')).toBe('2026-11-20');
  });
  it('WORKDAY_DIFF counts working days, both ends included', () => {
    expect(run('WORKDAY_DIFF("2026-11-16", "2026-11-20")')).toBe(5);
    expect(run('WORKDAY_DIFF("2026-11-20", "2026-11-23")')).toBe(2);
    expect(run('WORKDAY_DIFF("2026-11-23", "2026-11-20")')).toBe(-2);
    expect(run('WORKDAY_DIFF("2026-11-21", "2026-11-22")')).toBe(0);
  });
});

describe('function list', () => {
  it('offers the new functions to the editor and accepts them as valid', () => {
    for (const name of ['AVERAGE', 'ROUNDUP', 'REGEX_MATCH', 'IS_AFTER', 'DATETIME_DIFF', 'WORKDAY', 'WEEKNUM']) {
      expect(FORMULA_FUNCTIONS).toContain(name);
    }
    expect(validateFormula('AVERAGE(1, 2)').valid).toBe(true);
  });
});
